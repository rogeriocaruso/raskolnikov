import os
from flask import Flask
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from config import config_map
from models import db


def create_app(env=None):
    app = Flask(__name__)
    env = env or os.environ.get('FLASK_ENV', 'default')
    app.config.from_object(config_map[env])

    if env == 'production':
        if not app.config.get('SQLALCHEMY_DATABASE_URI'):
            raise RuntimeError('DATABASE_URL environment variable is required in production')
        if app.config.get('SECRET_KEY') == 'dev-secret-change-me':
            raise RuntimeError('SECRET_KEY must be set via environment variable in production')
        if app.config.get('JWT_SECRET_KEY') == 'jwt-secret-change-me':
            raise RuntimeError('JWT_SECRET_KEY must be set via environment variable in production')

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
