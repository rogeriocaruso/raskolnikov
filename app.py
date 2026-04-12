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
        return jsonify(status='ok', version='v2'), 200

    @app.route('/debug')
    def debug():
        try:
            from models import Usuario
            total_usuarios = Usuario.query.count()
            db_url = app.config.get('SQLALCHEMY_DATABASE_URI', '')
            tipo_banco = 'postgresql' if 'postgresql' in db_url else 'sqlite'
            admin_existe = Usuario.query.filter_by(email='admin@cet.gov.br').first() is not None
            return jsonify(
                banco=tipo_banco,
                flask_env=os.environ.get('FLASK_ENV', 'nao definido'),
                total_usuarios=total_usuarios,
                admin_existe=admin_existe,
            ), 200
        except Exception as e:
            return jsonify(erro=str(e)), 500

    @app.route('/criar-admin')
    def criar_admin():
        try:
            from models import Usuario
            if Usuario.query.filter_by(email='admin@cet.gov.br').first():
                return jsonify(mensagem='Admin já existe'), 200
            admin = Usuario(
                nome='Administrador CET',
                email='admin@cet.gov.br',
                perfil='cet_admin',
            )
            admin.set_senha('senha123')
            db.session.add(admin)
            db.session.commit()
            return jsonify(mensagem='Admin criado com sucesso!'), 201
        except Exception as e:
            return jsonify(erro=str(e)), 500

    @app.route('/rodar-seed')
    def rodar_seed():
        try:
            from seed import seed
            seed()
            from models import OPO
            total = OPO.query.count()
            return jsonify(mensagem=f'Seed concluído! {total} OPOs no banco.'), 200
        except Exception as e:
            return jsonify(erro=str(e)), 500

    return app
