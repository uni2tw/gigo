import io
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
        self.assertIn('updated_at', resp.get_json())
        self.assertIsInstance(resp.get_json()['updated_at'], float)

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

    def test_upload_image_saved_next_to_note_and_served_back(self):
        self.client.post('/api/nodes', json={'parent': '', 'name': 'note1', 'type': 'note'})

        resp = self.client.post(
            '/api/notes/note1.md/images',
            data={'file': (io.BytesIO(b'\x89PNG fake bytes'), 'photo.png')},
            content_type='multipart/form-data',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.get_json()['filename'], 'photo.png')
        self.assertTrue(os.path.isfile(os.path.join(self.notes_root, 'photo.png')))

        resp = self.client.get('/api/files/photo.png')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, b'\x89PNG fake bytes')
        resp.close()

    def test_upload_image_into_subfolder_note(self):
        self.client.post('/api/nodes', json={'parent': '', 'name': 'folderA', 'type': 'folder'})
        self.client.post('/api/nodes', json={'parent': 'folderA', 'name': 'note1', 'type': 'note'})

        resp = self.client.post(
            '/api/notes/folderA/note1.md/images',
            data={'file': (io.BytesIO(b'data'), 'photo.png')},
            content_type='multipart/form-data',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(os.path.isfile(os.path.join(self.notes_root, 'folderA', 'photo.png')))

        resp = self.client.get('/api/files/folderA/photo.png')
        self.assertEqual(resp.status_code, 200)
        resp.close()

    def test_upload_image_rejects_unsupported_extension(self):
        self.client.post('/api/nodes', json={'parent': '', 'name': 'note1', 'type': 'note'})
        resp = self.client.post(
            '/api/notes/note1.md/images',
            data={'file': (io.BytesIO(b'not an image'), 'notes.txt')},
            content_type='multipart/form-data',
        )
        self.assertEqual(resp.status_code, 400)

    def test_upload_image_rejects_oversized_file(self):
        self.client.post('/api/nodes', json={'parent': '', 'name': 'note1', 'type': 'note'})
        oversized = b'x' * (10 * 1024 * 1024 + 1)
        resp = self.client.post(
            '/api/notes/note1.md/images',
            data={'file': (io.BytesIO(oversized), 'big.png')},
            content_type='multipart/form-data',
        )
        self.assertEqual(resp.status_code, 400)

    def test_upload_image_overwrites_same_filename(self):
        self.client.post('/api/nodes', json={'parent': '', 'name': 'note1', 'type': 'note'})
        self.client.post(
            '/api/notes/note1.md/images',
            data={'file': (io.BytesIO(b'first'), 'photo.png')},
            content_type='multipart/form-data',
        )
        self.client.post(
            '/api/notes/note1.md/images',
            data={'file': (io.BytesIO(b'second'), 'photo.png')},
            content_type='multipart/form-data',
        )
        with open(os.path.join(self.notes_root, 'photo.png'), 'rb') as f:
            self.assertEqual(f.read(), b'second')

    def test_upload_image_filename_path_traversal_is_stripped(self):
        self.client.post('/api/nodes', json={'parent': '', 'name': 'note1', 'type': 'note'})
        resp = self.client.post(
            '/api/notes/note1.md/images',
            data={'file': (io.BytesIO(b'data'), '../../evil.png')},
            content_type='multipart/form-data',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.get_json()['filename'], 'evil.png')
        self.assertTrue(os.path.isfile(os.path.join(self.notes_root, 'evil.png')))
        self.assertFalse(os.path.exists(os.path.join(os.path.dirname(self.notes_root), 'evil.png')))

    def test_get_file_path_escape_rejected(self):
        resp = self.client.get('/api/files/../outside.png')
        self.assertIn(resp.status_code, (400, 404))


if __name__ == '__main__':
    unittest.main()
