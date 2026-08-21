import os

from flask import Blueprint, current_app, jsonify, request

from . import markdown_blocks, tree
from .pathsafety import PathSecurityError, resolve_safe_path

api_bp = Blueprint('api', __name__, url_prefix='/api')


def _notes_root():
    return current_app.config['NOTES_ROOT']


@api_bp.errorhandler(PathSecurityError)
def handle_path_security_error(err):
    return jsonify({'error': str(err)}), 400


@api_bp.errorhandler(tree.NodeConflictError)
def handle_conflict(err):
    return jsonify({'error': str(err)}), 409


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
    tree.delete_node(_notes_root(), node_path)
    return '', 204


@api_bp.route('/notes/<path:note_path>', methods=['GET'])
def get_note_route(note_path):
    abs_path = resolve_safe_path(_notes_root(), note_path)
    if not os.path.isfile(abs_path):
        return jsonify({'error': 'Note not found: %r' % (note_path,)}), 404

    with open(abs_path, 'r', encoding='utf-8') as f:
        text = f.read()

    blocks = markdown_blocks.parse_markdown_to_blocks(text)
    return jsonify({'blocks': [b.to_dict() for b in blocks]})


@api_bp.route('/notes/<path:note_path>', methods=['PUT'])
def save_note_route(note_path):
    abs_path = resolve_safe_path(_notes_root(), note_path)
    if not os.path.isfile(abs_path):
        return jsonify({'error': 'Note not found: %r' % (note_path,)}), 404

    data = request.get_json(force=True, silent=True) or {}
    blocks = [markdown_blocks.Block.from_dict(b) for b in data.get('blocks', [])]
    text = markdown_blocks.blocks_to_markdown(blocks)

    try:
        with open(abs_path, 'w', encoding='utf-8') as f:
            f.write(text)
    except OSError as e:
        return jsonify({'error': 'Failed to save note: %s' % (e,)}), 500

    return jsonify({'ok': True})
