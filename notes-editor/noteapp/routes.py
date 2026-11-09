import os

from flask import Blueprint, current_app, jsonify, request, send_file

from . import markdown_blocks, tree, versions
from .pathsafety import PathSecurityError, resolve_safe_path

api_bp = Blueprint('api', __name__, url_prefix='/api')

ALLOWED_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB


def _safe_upload_filename(original_name):
    """Strip any directory components, keeping Unicode names intact
    (unlike werkzeug's secure_filename, which mangles non-ASCII names)."""
    name = os.path.basename(original_name or '').strip()
    if not name or name in ('.', '..') or '\x00' in name:
        return None
    return name


def _notes_root():
    return current_app.config['NOTES_ROOT']


@api_bp.errorhandler(PathSecurityError)
def handle_path_security_error(err):
    return jsonify({'error': str(err)}), 400


@api_bp.errorhandler(tree.NodeConflictError)
def handle_conflict(err):
    return jsonify({'error': str(err)}), 409


@api_bp.errorhandler(versions.VersionNotFoundError)
def handle_version_not_found(err):
    return jsonify({'error': str(err)}), 404


@api_bp.errorhandler(tree.NodeNotFoundError)
def handle_not_found(err):
    return jsonify({'error': str(err)}), 404


@api_bp.route('/tree', methods=['GET'])
def get_tree():
    return jsonify({'tree': tree.build_tree(_notes_root())})


@api_bp.route('/nodes', methods=['POST'])
def create_node_route():
    data = request.get_json(force=True, silent=True) or {}
    parent_path = data.get('parent', '') or ''
    name = (data.get('name') or '').strip()
    node_type = data.get('type')

    if not name or node_type not in ('folder', 'note'):
        return jsonify({'error': 'name and type (folder|note) are required'}), 400

    new_path = tree.create_node(_notes_root(), parent_path, name, node_type)
    return jsonify({'path': new_path}), 201


@api_bp.route('/nodes/<path:node_path>', methods=['PATCH'])
def update_node_route(node_path):
    data = request.get_json(force=True, silent=True) or {}
    target_path = data.get('target')
    if not target_path:
        return jsonify({'error': 'target is required'}), 400

    new_path = tree.move_or_rename_node(_notes_root(), node_path, target_path)
    return jsonify({'path': new_path})


@api_bp.route('/nodes/<path:node_path>', methods=['DELETE'])
def delete_node_route(node_path):
    data = request.get_json(force=True, silent=True) or {}
    images = data.get('images')
    tree.delete_node(_notes_root(), node_path, images=images)
    return '', 204


@api_bp.route('/notes/<path:note_path>', methods=['GET'])
def get_note_route(note_path):
    abs_path = resolve_safe_path(_notes_root(), note_path)
    if not os.path.isfile(abs_path):
        return jsonify({'error': 'Note not found: %r' % (note_path,)}), 404

    with open(abs_path, 'r', encoding='utf-8') as f:
        text = f.read()

    blocks = markdown_blocks.parse_markdown_to_blocks(text)
    return jsonify({
        'blocks': [b.to_dict() for b in blocks],
        'updated_at': os.path.getmtime(abs_path),
    })


@api_bp.route('/notes/<path:note_path>/meta', methods=['GET'])
def get_note_meta_route(note_path):
    """Lightweight endpoint for polling whether a note changed on disk,
    without re-reading/parsing the full content on every check."""
    abs_path = resolve_safe_path(_notes_root(), note_path)
    if not os.path.isfile(abs_path):
        return jsonify({'error': 'Note not found: %r' % (note_path,)}), 404

    return jsonify({'updated_at': os.path.getmtime(abs_path)})


@api_bp.route('/notes/<path:note_path>', methods=['PUT'])
def save_note_route(note_path):
    abs_path = resolve_safe_path(_notes_root(), note_path)
    if not os.path.isfile(abs_path):
        return jsonify({'error': 'Note not found: %r' % (note_path,)}), 404

    data = request.get_json(force=True, silent=True) or {}

    expected_updated_at = data.get('expected_updated_at')
    if expected_updated_at is not None:
        current_mtime = os.path.getmtime(abs_path)
        if current_mtime != expected_updated_at:
            return jsonify({'error': 'conflict', 'updated_at': current_mtime}), 409

    blocks = [markdown_blocks.Block.from_dict(b) for b in data.get('blocks', [])]
    text = markdown_blocks.blocks_to_markdown(blocks)

    try:
        with open(abs_path, 'w', encoding='utf-8') as f:
            f.write(text)
    except OSError as e:
        return jsonify({'error': 'Failed to save note: %s' % (e,)}), 500

    return jsonify({'ok': True, 'updated_at': os.path.getmtime(abs_path)})


@api_bp.route('/notes/<path:note_path>/images', methods=['POST'])
def upload_image_route(note_path):
    note_abs = resolve_safe_path(_notes_root(), note_path)
    if not os.path.isfile(note_abs):
        return jsonify({'error': 'Note not found: %r' % (note_path,)}), 404

    file = request.files.get('file')
    if file is None or not file.filename:
        return jsonify({'error': 'file is required'}), 400

    filename = _safe_upload_filename(file.filename)
    ext = os.path.splitext(filename or '')[1].lower()
    if not filename or ext not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({'error': 'Unsupported image type: %r' % (file.filename,)}), 400

    file.stream.seek(0, os.SEEK_END)
    size = file.stream.tell()
    file.stream.seek(0)
    if size > MAX_IMAGE_SIZE:
        return jsonify({'error': 'Image exceeds the 10MB limit'}), 400

    note_dir = os.path.dirname(note_path)
    dest_rel = (note_dir + '/' + filename) if note_dir else filename
    dest_abs = resolve_safe_path(_notes_root(), dest_rel)

    file.save(dest_abs)
    return jsonify({'filename': filename}), 201


@api_bp.route('/files/<path:rel_path>', methods=['GET'])
def get_file_route(rel_path):
    abs_path = resolve_safe_path(_notes_root(), rel_path)
    if not os.path.isfile(abs_path):
        return jsonify({'error': 'File not found: %r' % (rel_path,)}), 404
    return send_file(abs_path)


def _existing_note_abs(note_path):
    abs_path = resolve_safe_path(_notes_root(), note_path)
    if not os.path.isfile(abs_path):
        raise tree.NodeNotFoundError('Note not found: %r' % (note_path,))
    return abs_path


def _read_note_text(abs_path):
    with open(abs_path, 'r', encoding='utf-8') as f:
        return f.read()


def _text_from_blocks(raw_blocks):
    blocks = [markdown_blocks.Block.from_dict(b) for b in raw_blocks]
    return markdown_blocks.blocks_to_markdown(blocks)


@api_bp.route('/notes/<path:note_path>/versions', methods=['GET'])
def list_versions_route(note_path):
    _existing_note_abs(note_path)
    return jsonify({'versions': versions.list_versions(_notes_root(), note_path)})


@api_bp.route('/notes/<path:note_path>/versions', methods=['POST'])
def create_version_route(note_path):
    """Freeze the note as a manual version. `blocks` (the editor's current,
    possibly not yet autosaved content) wins over the file on disk."""
    abs_path = _existing_note_abs(note_path)
    data = request.get_json(force=True, silent=True) or {}
    label = (data.get('label') or '').strip()
    if 'blocks' in data:
        text = _text_from_blocks(data['blocks'])
    else:
        text = _read_note_text(abs_path)
    version = versions.create_version(_notes_root(), note_path, text, label=label)
    return jsonify({'version': version}), 201


@api_bp.route('/notes/<path:note_path>/versions/<version_id>', methods=['GET'])
def get_version_route(note_path, version_id):
    _existing_note_abs(note_path)
    version = versions.read_version(_notes_root(), note_path, version_id)
    parsed = markdown_blocks.parse_markdown_to_blocks(version.pop('text'))
    version['blocks'] = [b.to_dict() for b in parsed]
    return jsonify(version)


@api_bp.route('/notes/<path:note_path>/versions/<version_id>', methods=['DELETE'])
def delete_version_route(note_path, version_id):
    _existing_note_abs(note_path)
    versions.delete_version(_notes_root(), note_path, version_id)
    return '', 204


@api_bp.route('/notes/<path:note_path>/versions/<version_id>/restore', methods=['POST'])
def restore_version_route(note_path, version_id):
    """Overwrite the note with a version. The note's current content (the
    editor's `blocks` if sent, else the file on disk) is first saved as a
    "backup" version so the restore can itself be undone."""
    abs_path = _existing_note_abs(note_path)
    root = _notes_root()
    version = versions.read_version(root, note_path, version_id)
    data = request.get_json(force=True, silent=True) or {}
    if 'blocks' in data:
        current_text = _text_from_blocks(data['blocks'])
    else:
        current_text = _read_note_text(abs_path)
    backup = versions.create_version(
        root, note_path, current_text,
        label='還原前自動備份', kind=versions.KIND_BACKUP)
    try:
        with open(abs_path, 'w', encoding='utf-8') as f:
            f.write(version['text'])
    except OSError as e:
        return jsonify({'error': 'Failed to restore note: %s' % (e,)}), 500
    return jsonify({'ok': True, 'backup': backup, 'updated_at': os.path.getmtime(abs_path)})
