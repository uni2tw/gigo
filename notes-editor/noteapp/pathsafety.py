import os


class PathSecurityError(Exception):
    """Raised when a requested path would resolve outside the notes root."""


def resolve_safe_path(root, relative_path):
    """Resolve `relative_path` against `root` and ensure the result stays
    inside `root` (after normalizing `..`, symlinks, and absolute paths).

    Raises PathSecurityError if the resolved path escapes `root`.
    """
    root_real = os.path.realpath(root)
    candidate = os.path.join(root_real, relative_path or '')
    candidate_real = os.path.realpath(candidate)

    if candidate_real != root_real and not candidate_real.startswith(root_real + os.sep):
        raise PathSecurityError('Path escapes notes root: %r' % (relative_path,))

    return candidate_real
