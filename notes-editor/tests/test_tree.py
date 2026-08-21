import shutil
import tempfile
import unittest

from noteapp import tree
from noteapp.pathsafety import PathSecurityError


class TreeOpsTests(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)

    def test_create_and_list_note_and_folder(self):
        tree.create_node(self.root, '', 'folder1', 'folder')
        tree.create_node(self.root, 'folder1', 'note1', 'note')

        result = tree.build_tree(self.root)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['type'], 'folder')
        self.assertEqual(result[0]['children'][0]['type'], 'note')
        self.assertEqual(result[0]['children'][0]['path'], 'folder1/note1.md')

    def test_folders_listed_before_notes_regardless_of_alphabetical_order(self):
        tree.create_node(self.root, '', 'aaa', 'note')
        tree.create_node(self.root, '', 'zzz', 'folder')

        result = tree.build_tree(self.root)
        self.assertEqual([n['type'] for n in result], ['folder', 'note'])
        self.assertEqual(result[0]['name'], 'zzz')
        self.assertEqual(result[1]['name'], 'aaa')

    def test_create_duplicate_name_conflicts(self):
        tree.create_node(self.root, '', 'note1', 'note')
        with self.assertRaises(tree.NodeConflictError):
            tree.create_node(self.root, '', 'note1', 'note')

    def test_create_under_missing_parent_not_found(self):
        with self.assertRaises(tree.NodeNotFoundError):
            tree.create_node(self.root, 'missing', 'note1', 'note')

    def test_delete_note_and_folder_recursively(self):
        tree.create_node(self.root, '', 'folder1', 'folder')
        tree.create_node(self.root, 'folder1', 'note1', 'note')

        tree.delete_node(self.root, 'folder1')
        self.assertEqual(tree.build_tree(self.root), [])

    def test_delete_missing_node_not_found(self):
        with self.assertRaises(tree.NodeNotFoundError):
            tree.delete_node(self.root, 'missing.md')

    def test_rename_note(self):
        tree.create_node(self.root, '', 'note1', 'note')
        new_path = tree.move_or_rename_node(self.root, 'note1.md', 'note2.md')
        self.assertEqual(new_path, 'note2.md')

    def test_move_conflict_when_target_exists(self):
        tree.create_node(self.root, '', 'note1', 'note')
        tree.create_node(self.root, '', 'note2', 'note')
        with self.assertRaises(tree.NodeConflictError):
            tree.move_or_rename_node(self.root, 'note1.md', 'note2.md')

    def test_escape_root_rejected(self):
        with self.assertRaises(PathSecurityError):
            tree.delete_node(self.root, '../outside.md')

    def test_move_folder_into_own_subfolder_rejected(self):
        tree.create_node(self.root, '', 'parent', 'folder')
        tree.create_node(self.root, 'parent', 'child', 'folder')
        with self.assertRaises(tree.NodeConflictError):
            tree.move_or_rename_node(self.root, 'parent', 'parent/child/parent')

    def test_move_note_into_folder(self):
        tree.create_node(self.root, '', 'note1', 'note')
        tree.create_node(self.root, '', 'target', 'folder')
        new_path = tree.move_or_rename_node(self.root, 'note1.md', 'target/note1.md')
        self.assertEqual(new_path, 'target/note1.md')


if __name__ == '__main__':
    unittest.main()
