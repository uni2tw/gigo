import os

DEFAULT_NOTES_DIRNAME = 'notes'


def get_notes_root():
    """Resolve the notes root directory.

    Uses the NOTES_ROOT environment variable when set; otherwise defaults to
    a `notes/` folder next to this project. Creates the directory if it does
    not exist yet.
    """
    configured = os.environ.get('NOTES_ROOT')
    if configured:
        root = os.path.abspath(configured)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        project_dir = os.path.dirname(base_dir)
        root = os.path.join(project_dir, DEFAULT_NOTES_DIRNAME)

    os.makedirs(root, exist_ok=True)
    return root
