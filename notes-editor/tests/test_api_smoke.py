import os
import shutil
import tempfile
import unittest


class ApiSmokeTests(unittest.TestCase):
    def setUp(self):
        self.notes_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.notes_root, ignore_errors=True)
        os.environ['NOTES_ROOT'] = self.notes_root

        from noteapp import create_app
        self.app = create_app()
        self.client = self.app.test_client()

    def tearDown(self):
        del os.environ['NOTES_ROOT']

    def test_create_read_save_note_round_trip(self):
        resp = self.client.post('/api/nodes', json={'parent': '', 'name': 'note1', 'type': 'note'})
        self.assertEqual(resp.status_code, 201)
        path = resp.get_json()['path']
        self.assertEqual(path, 'note1.md')

        resp = self.client.get('/api/notes/' + path)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()['blocks'], [])

        blocks = [{'type': 'heading', 'level': 1, 'text': 'Hello', 'children': []}]
        resp = self.client.put('/api/notes/' + path, json={'blocks': blocks})
        self.assertEqual(resp.status_code, 200)

        resp = self.client.get('/api/notes/' + path)
        self.assertEqual(resp.get_json()['blocks'][0]['text'], 'Hello')

    def test_delete_and_rename_reflect_in_tree(self):
        self.client.post('/api/nodes', json={'parent': '', 'name': 'folderA', 'type': 'folder'})
        self.client.post('/api/nodes', json={'parent': 'folderA', 'name': 'note1', 'type': 'note'})

        resp = self.client.patch('/api/nodes/folderA/note1.md', json={'target': 'folderA/note1renamed.md'})
        self.assertEqual(resp.status_code, 200)

        resp = self.client.get('/api/tree')
        tree_data = resp.get_json()['tree']
        self.assertEqual(tree_data[0]['children'][0]['name'], 'note1renamed')

        resp = self.client.delete('/api/nodes/folderA')
        self.assertEqual(resp.status_code, 204)

        resp = self.client.get('/api/tree')
        self.assertEqual(resp.get_json()['tree'], [])

    def test_path_escape_rejected(self):
        resp = self.client.get('/api/notes/../outside.md')
        self.assertIn(resp.status_code, (400, 404))

    def test_read_missing_note_returns_404(self):
        resp = self.client.get('/api/notes/missing.md')
        self.assertEqual(resp.status_code, 404)


if __name__ == '__main__':
    unittest.main()
