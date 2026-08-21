import os

from flask import Flask, render_template

from .config import get_notes_root
from .routes import api_bp


def create_app():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(base_dir)

    app = Flask(
        __name__,
        static_folder=os.path.join(project_dir, 'static'),
        template_folder=os.path.join(project_dir, 'templates'),
    )
    app.config['NOTES_ROOT'] = get_notes_root()
    app.register_blueprint(api_bp)

    @app.route('/')
    def index():
        return render_template('index.html')

    return app
