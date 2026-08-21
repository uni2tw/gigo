import os
import shutil

from .pathsafety import resolve_safe_path

NOTE_EXT = '.md'


class NodeConflictError(Exception):
    """Raised when a create/rename/move target already exists."""


class NodeNotFoundError(Exception):
    """Raised when a referenced node or its parent folder does not exist."""


def _rel(root, abs_path):
    rel = os.path.relpath(abs_path, root)
    return '' if rel == '.' else rel.replace(os.sep, '/')


def build_tree(root):
    """Scan the notes root and return a nested list of folder/note nodes.

    Folders are always listed before notes within the same directory; each
    group is sorted alphabetically among themselves.
    """

    def walk(dir_abs):
        folder_entries = []
        note_entries = []
        for name in sorted(os.listdir(dir_abs)):
            full = os.path.join(dir_abs, name)
            if os.path.isdir(full):
                folder_entries.append({
                    'name': name,
                    'type': 'folder',
                    'path': _rel(root, full),
                    'children': walk(full),
                })
            elif name.lower().endswith(NOTE_EXT):
                note_entries.append({
                    'name': name[: -len(NOTE_EXT)],
                    'type': 'note',
                    'path': _rel(root, full),
                    'children': [],
                })
        return folder_entries + note_entries

    return walk(root)


def create_node(root, parent_path, name, node_type):
    """Create a folder or an empty note under `parent_path`.

    Returns the new node's relative path. Raises NodeNotFoundError if the
    parent folder does not exist, or NodeConflictError if a node with the
    same name already exists there.
    """
    parent_abs = resolve_safe_path(root, parent_path)
    if not os.path.isdir(parent_abs):
        raise NodeNotFoundError('Parent folder not found: %r' % (parent_path,))

    filename = name if node_type == 'folder' else name + NOTE_EXT
    target_rel = _rel(root, os.path.join(parent_abs, filename))
    target_abs = resolve_safe_path(root, target_rel)

    if os.path.exists(target_abs):
        raise NodeConflictError('Node already exists: %r' % (name,))

    if node_type == 'folder':
        os.makedirs(target_abs)
    else:
        with open(target_abs, 'w', encoding='utf-8') as f:
            f.write('')

    return _rel(root, target_abs)


def delete_node(root, rel_path):
    """Delete a note file, or recursively delete a folder and its contents."""
    target_abs = resolve_safe_path(root, rel_path)
    if os.path.isdir(target_abs):
        shutil.rmtree(target_abs)
    elif os.path.isfile(target_abs):
        os.remove(target_abs)
    else:
        raise NodeNotFoundError('Node not found: %r' % (rel_path,))


def move_or_rename_node(root, rel_path, new_rel_path):
    """Rename or move a node to `new_rel_path`.

    Returns the resulting relative path. Raises NodeNotFoundError if the
    source node or the destination's parent folder does not exist, or
    NodeConflictError if the destination already exists.
    """
    source_abs = resolve_safe_path(root, rel_path)
    if not os.path.exists(source_abs):
        raise NodeNotFoundError('Node not found: %r' % (rel_path,))

    dest_abs = resolve_safe_path(root, new_rel_path)
    if os.path.exists(dest_abs):
        raise NodeConflictError('Target already exists: %r' % (new_rel_path,))

    if os.path.isdir(source_abs) and dest_abs.startswith(source_abs + os.sep):
        raise NodeConflictError('Cannot move a folder into one of its own subfolders')

    dest_parent = os.path.dirname(dest_abs)
    if not os.path.isdir(dest_parent):
        raise NodeNotFoundError('Target folder not found for: %r' % (new_rel_path,))

    shutil.move(source_abs, dest_abs)
    return _rel(root, dest_abs)
