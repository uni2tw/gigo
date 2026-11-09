import os
import shutil
import tempfile
import unittest


class VersionApiTests(unittest.TestCase):
    def setUp(self):
        self.notes_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.notes_root, ignore_errors=True)
        os.environ['NOTES_ROOT'] = self.notes_root

        from noteapp import create_app
        self.client = create_app().test_client()
        self.client.post('/api/nodes', json={'parent': '', 'name': 'book', 'type': 'note'})

    def tearDown(self):
        del os.environ['NOTES_ROOT']

    def _save(self, text):
        blocks = [{'type': 'paragraph', 'text': text, 'children': []}]
        self.client.put('/api/notes/book.md', json={'blocks': blocks})

    def _note_text(self):
        with open(os.path.join(self.notes_root, 'book.md'), encoding='utf-8') as f:
            return f.read()

    def _create(self, label, **extra):
        resp = self.client.post('/api/notes/book.md/versions', json=dict({'label': label}, **extra))
        self.assertEqual(resp.status_code, 201)
        return resp.get_json()['version']

    def test_version_file_is_not_a_note_in_tree(self):
        self._save('v1')
        version = self._create('first')
        files = os.listdir(self.notes_root)
        self.assertIn('book.%s.ver' % version['id'], files)
        tree = self.client.get('/api/tree').get_json()['tree']
        self.assertEqual([n['name'] for n in tree], ['book'])

    def test_create_list_read_version(self):
        self._save('v1')
        version = self._create('first')
        self._save('v2')
        listed = self.client.get('/api/notes/book.md/versions').get_json()['versions']
        self.assertEqual([v['label'] for v in listed], ['first'])
        got = self.client.get('/api/notes/book.md/versions/' + version['id']).get_json()
        self.assertEqual(got['blocks'][0]['text'], 'v1')

    def test_create_uses_editor_blocks_when_given(self):
        self._save('on disk')
        version = self._create('unsaved', blocks=[{'type': 'paragraph', 'text': 'in editor', 'children': []}])
        got = self.client.get('/api/notes/book.md/versions/' + version['id']).get_json()
        self.assertEqual(got['blocks'][0]['text'], 'in editor')

    def test_two_versions_in_one_second_get_distinct_ids(self):
        self._save('v1')
        a = self._create('a')
        b = self._create('b')
        self.assertNotEqual(a['id'], b['id'])
        self.assertEqual(len(self.client.get('/api/notes/book.md/versions').get_json()['versions']), 2)

    def test_restore_overwrites_note_and_backs_up_current(self):
        self._save('v1')
        version = self._create('first')
        self._save('v2')
        resp = self.client.post('/api/notes/book.md/versions/%s/restore' % version['id'], json={})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._note_text().strip(), 'v1')
        listed = self.client.get('/api/notes/book.md/versions').get_json()['versions']
        backups = [v for v in listed if v['kind'] == 'backup']
        self.assertEqual(len(backups), 1)
        got = self.client.get('/api/notes/book.md/versions/' + backups[0]['id']).get_json()
        self.assertEqual(got['blocks'][0]['text'], 'v2')

    def test_delete_version(self):
        self._save('v1')
        version = self._create('first')
        self.assertEqual(self.client.delete('/api/notes/book.md/versions/' + version['id']).status_code, 204)
        self.assertEqual(self.client.get('/api/notes/book.md/versions').get_json()['versions'], [])
        self.assertEqual(self.client.get('/api/notes/book.md/versions/' + version['id']).status_code, 404)

    def test_bad_version_id_is_rejected(self):
        self.assertEqual(self.client.get('/api/notes/book.md/versions/..%2Fsecret').status_code, 404)

    def test_deleting_note_deletes_its_versions(self):
        self._save('v1')
        self._create('first')
        self.client.delete('/api/nodes/book.md')
        self.assertEqual(os.listdir(self.notes_root), [])

    def test_renaming_note_moves_its_versions(self):
        self._save('v1')
        version = self._create('first')
        resp = self.client.patch('/api/nodes/book.md', json={'target': 'novel.md'})
        self.assertEqual(resp.status_code, 200)
        files = sorted(os.listdir(self.notes_root))
        self.assertEqual(files, ['novel.%s.ver' % version['id'], 'novel.md'])
        listed = self.client.get('/api/notes/novel.md/versions').get_json()['versions']
        self.assertEqual([v['label'] for v in listed], ['first'])

    def test_note_with_dots_does_not_claim_sibling_versions(self):
        self.client.post('/api/nodes', json={'parent': '', 'name': 'book.v2', 'type': 'note'})
        self._save('v1')
        self._create('of book')
        listed = self.client.get('/api/notes/book.v2.md/versions').get_json()['versions']
        self.assertEqual(listed, [])


if __name__ == '__main__':
    unittest.main()
