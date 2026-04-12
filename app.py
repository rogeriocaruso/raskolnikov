import os
from flask import Flask, jsonify
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from flask_cors import CORS
from config import config_map
from models import db


def create_app(env=None):
    app = Flask(__name__)
    env = env or os.environ.get('FLASK_ENV', 'default')
    app.config.from_object(config_map[env])

    db.init_app(app)
    JWTManager(app)
    Migrate(app, db)
    CORS(app)

    from routes.auth import auth_bp
    from routes.patients import patients_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(patients_bp, url_prefix='/patients')

    @app.route('/health')
    def health():
        return jsonify(status='ok'), 200

    with app.app_context():
        try:
            db.create_all()
            _criar_admin_inicial()
        except Exception as e:
            app.logger.error(f'Erro ao inicializar banco: {e}')

    return app


def _criar_admin_inicial():
    from models import Usuario
    if not Usuario.query.filter_by(email='admin@cet.gov.br').first():
        admin = Usuario(
            nome='Administrador CET',
            email='admin@cet.gov.br',
            perfil='cet_admin',
        )
        admin.set_senha('senha123')
        from models import db
        db.session.add(admin)
        db.session.commit()
        import logging
        logging.getLogger(__name__).info('Usuário admin criado automaticamente.')
