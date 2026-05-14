import os
from flask import Flask
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from sqlalchemy import event
from sqlalchemy.engine import Engine
import sqlite3
from config import config_map
from models import db


@event.listens_for(Engine, 'connect')
def _set_sqlite_pragma(dbapi_conn, _connection_record):
    if isinstance(dbapi_conn, sqlite3.Connection):
        dbapi_conn.execute('PRAGMA foreign_keys = ON')


def create_app(env=None):
    app = Flask(__name__)
    env = env or os.environ.get('FLASK_ENV', 'default')
    cfg = config_map[env]

    missing = [v for v in getattr(cfg, 'REQUIRED_ENV_VARS', ()) if not os.environ.get(v)]
    if missing:
        raise RuntimeError(f'Variáveis de ambiente obrigatórias não definidas: {", ".join(missing)}')

    app.config.from_object(cfg)

    db.init_app(app)
    JWTManager(app)
    Migrate(app, db)

    from routes.auth import auth_bp
    from routes.patients import patients_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(patients_bp, url_prefix='/patients')

    with app.app_context():
        db.create_all()

    return app
