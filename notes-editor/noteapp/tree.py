import os
import shutil

from .pathsafety import PathSecurityError, resolve_safe_path

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


def delete_node(root, rel_path, images=None):
    """Delete a note file, or recursively delete a folder and its contents.

    `images` is an optional list of bare filenames (no directory components)
    to also remove from the note's own directory -- images are stored
    alongside their note, not in a separate assets folder, so deleting a
    note never implies deleting them; the caller passes exactly which ones
    the user chose to also remove.
    """
    target_abs = resolve_safe_path(root, rel_path)
    if os.path.isdir(target_abs):
        shutil.rmtree(target_abs)
        return
    if not os.path.isfile(target_abs):
        raise NodeNotFoundError('Node not found: %r' % (rel_path,))

    os.remove(target_abs)

    if not images:
        return
    note_dir = os.path.dirname(rel_path)
    for filename in images:
        # Only a bare filename is ever valid here (that's all an image src
        # is ever written as) -- anything else is silently skipped rather
        # than trusted, since this list ultimately comes from a request body.
        if not filename or os.path.basename(filename) != filename:
            continue
        image_rel = (note_dir + '/' + filename) if note_dir else filename
        try:
            image_abs = resolve_safe_path(root, image_rel)
        except PathSecurityError:
            continue
        if os.path.isfile(image_abs):
            os.remove(image_abs)


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
