"""Manual note versions.

A version is a frozen copy of one note, stored next to it as
`<note name>.<YYYYMMDD-HHMMSS>.ver` (for `mybook.md`: `mybook.20261109-153012.ver`).
The extension is not `.md`, so versions never show up in the note tree. Each
file is JSON: {"label", "kind", "created_at", "text"}.

kind is "manual" (saved by the user) or "backup" (taken automatically right
before a restore overwrites the note).
"""
import json
import os
import re
import time

from .pathsafety import resolve_safe_path

VERSION_EXT = '.ver'
KIND_MANUAL = 'manual'
KIND_BACKUP = 'backup'

_ID_RE = re.compile(r'^\d{8}-\d{6}(?:-\d+)?$')


class VersionNotFoundError(Exception):
    """Raised when the requested version does not exist."""


def _split_note(root, note_rel):
    note_abs = resolve_safe_path(root, note_rel)
    directory, base = os.path.split(note_abs)
    stem = base[:-3] if base.lower().endswith('.md') else base
    return directory, stem


def _version_re(stem):
    return re.compile(r'^' + re.escape(stem) + r'\.(\d{8}-\d{6}(?:-\d+)?)' + re.escape(VERSION_EXT) + r'$')


def _version_path(directory, stem, version_id):
    return os.path.join(directory, stem + '.' + version_id + VERSION_EXT)


def _check_id(version_id):
    if not _ID_RE.match(version_id or ''):
        raise VersionNotFoundError('Version not found: %r' % (version_id,))


def _load(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def list_versions(root, note_rel):
    """All versions of a note, newest first (metadata only, without text)."""
    directory, stem = _split_note(root, note_rel)
    pattern = _version_re(stem)
    result = []
    for name in os.listdir(directory):
        match = pattern.match(name)
        if not match:
            continue
        path = os.path.join(directory, name)
        try:
            data = _load(path)
        except (OSError, ValueError):
            continue
        result.append({
            'id': match.group(1),
            'label': data.get('label', ''),
            'kind': data.get('kind', KIND_MANUAL),
            'created_at': data.get('created_at', os.path.getmtime(path)),
            'size': len(data.get('text', '')),
        })
    result.sort(key=lambda v: (v['created_at'], v['id']), reverse=True)
    return result


def create_version(root, note_rel, text, label='', kind=KIND_MANUAL):
    directory, stem = _split_note(root, note_rel)
    now = time.time()
    base_id = time.strftime('%Y%m%d-%H%M%S', time.localtime(now))
    version_id = base_id
    counter = 1
    while os.path.exists(_version_path(directory, stem, version_id)):
        counter += 1
        version_id = '%s-%d' % (base_id, counter)
    data = {'label': label, 'kind': kind, 'created_at': now, 'text': text}
    with open(_version_path(directory, stem, version_id), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    return {'id': version_id, 'label': label, 'kind': kind, 'created_at': now, 'size': len(text)}


def read_version(root, note_rel, version_id):
    _check_id(version_id)
    directory, stem = _split_note(root, note_rel)
    path = _version_path(directory, stem, version_id)
    if not os.path.isfile(path):
        raise VersionNotFoundError('Version not found: %r' % (version_id,))
    data = _load(path)
    return {
        'id': version_id,
        'label': data.get('label', ''),
        'kind': data.get('kind', KIND_MANUAL),
        'created_at': data.get('created_at', os.path.getmtime(path)),
        'text': data.get('text', ''),
    }


def delete_version(root, note_rel, version_id):
    _check_id(version_id)
    directory, stem = _split_note(root, note_rel)
    path = _version_path(directory, stem, version_id)
    if not os.path.isfile(path):
        raise VersionNotFoundError('Version not found: %r' % (version_id,))
    os.remove(path)


def _version_files(directory, stem):
    pattern = _version_re(stem)
    return [(m.group(1), os.path.join(directory, name))
            for name in os.listdir(directory)
            for m in [pattern.match(name)] if m]


def delete_note_versions(root, note_rel):
    """Remove every version of a note (used when the note itself is deleted)."""
    directory, stem = _split_note(root, note_rel)
    for _version_id, path in _version_files(directory, stem):
        os.remove(path)


def move_note_versions(root, old_rel, new_rel):
    """Carry a note's versions along when the note is renamed or moved."""
    old_dir, old_stem = _split_note(root, old_rel)
    new_dir, new_stem = _split_note(root, new_rel)
    for version_id, path in _version_files(old_dir, old_stem):
        os.replace(path, _version_path(new_dir, new_stem, version_id))
