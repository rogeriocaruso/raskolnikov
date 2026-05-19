import os
from flask import Flask
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from config import config_map
from models import db


def create_app(env=None):
    app = Flask(__name__)
    env = env or os.environ.get('FLASK_ENV', 'default')
    cfg = config_map[env]

    if hasattr(cfg, 'validate'):
        cfg.validate()

    app.config.from_object(cfg)

    db.init_app(app)
    JWTManager(app)
    Migrate(app, db)

    from routes.auth import auth_bp
    from routes.patients import patients_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(patients_bp, url_prefix='/patients')

    return app
