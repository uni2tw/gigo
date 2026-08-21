import os
import shutil
import tempfile
import unittest

from noteapp.pathsafety import PathSecurityError, resolve_safe_path


class ResolveSafePathTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp_dir, ignore_errors=True)

    def test_relative_path_inside_root(self):
        result = resolve_safe_path(self.tmp_dir, 'a/b.md')
        self.assertTrue(result.startswith(os.path.realpath(self.tmp_dir)))

    def test_empty_path_returns_root(self):
        result = resolve_safe_path(self.tmp_dir, '')
        self.assertEqual(result, os.path.realpath(self.tmp_dir))

    def test_parent_traversal_rejected(self):
        with self.assertRaises(PathSecurityError):
            resolve_safe_path(self.tmp_dir, '../outside.md')

    def test_nested_parent_traversal_rejected(self):
        with self.assertRaises(PathSecurityError):
            resolve_safe_path(self.tmp_dir, 'a/../../outside.md')

    def test_absolute_path_escape_rejected(self):
        other_dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, other_dir, ignore_errors=True)
        with self.assertRaises(PathSecurityError):
            resolve_safe_path(self.tmp_dir, other_dir)


if __name__ == '__main__':
    unittest.main()
