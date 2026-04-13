import os
from flask import Flask, jsonify, send_from_directory, request
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from flask_cors import CORS
from config import config_map
from models import db

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), 'frontend')


def _migrar_colunas(db):
    """Adiciona colunas novas a tabelas já existentes (idempotente)."""
    from sqlalchemy import inspect, text
    try:
        inspector = inspect(db.engine)
        novas = {
            'ronda': [
                ('geo_lat_inicio',    'FLOAT'),
                ('geo_lng_inicio',    'FLOAT'),
                ('geo_precisao_inicio', 'FLOAT'),
                ('geo_lat_fim',       'FLOAT'),
                ('geo_lng_fim',       'FLOAT'),
                ('geo_precisao_fim',  'FLOAT'),
            ],
        }
        with db.engine.begin() as conn:
            for tabela, colunas in novas.items():
                try:
                    existentes = {c['name'] for c in inspector.get_columns(tabela)}
                except Exception:
                    continue
                for col, tipo in colunas:
                    if col not in existentes:
                        conn.execute(text(f'ALTER TABLE {tabela} ADD COLUMN {col} {tipo}'))
                        print(f'[migração] {tabela}.{col} adicionada')
    except Exception as e:
        print(f'[migração] erro (ignorado): {e}')


def create_app(env=None):
    app = Flask(__name__)
    env = env or os.environ.get('FLASK_ENV', 'default')
    app.config.from_object(config_map[env])

    db.init_app(app)
    JWTManager(app)
    Migrate(app, db)
    CORS(app)

    # Cria tabelas que ainda não existem e adiciona colunas novas
    with app.app_context():
        try:
            db.create_all()
            _migrar_colunas(db)
        except Exception as e:
            print(f'[startup] db setup erro (ignorado): {e}')

    from routes.auth import auth_bp
    from routes.patients import patients_bp
    from routes.rounds import rounds_bp
    from routes.stats import stats_bp
    from routes.admin import admin_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(patients_bp, url_prefix='/patients')
    app.register_blueprint(rounds_bp, url_prefix='/rounds')
    app.register_blueprint(stats_bp, url_prefix='/stats')
    app.register_blueprint(admin_bp, url_prefix='/admin')

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

    # ── Frontend estático ──────────────────────────────────────────────────
    @app.route('/')
    def index():
        return send_from_directory(FRONTEND_DIR, 'index.html')

    @app.route('/dashboard')
    @app.route('/ronda')
    @app.route('/paciente')
    @app.route('/stats')
    @app.route('/admin')
    def frontend_pages():
        page = request.path.lstrip('/') or 'dashboard'
        return send_from_directory(FRONTEND_DIR, f'{page}.html')

    @app.route('/static/css/<path:filename>')
    def static_css(filename):
        return send_from_directory(os.path.join(FRONTEND_DIR, 'css'), filename)

    @app.route('/static/js/<path:filename>')
    def static_js(filename):
        return send_from_directory(os.path.join(FRONTEND_DIR, 'js'), filename)

    @app.route('/rodar-seed')
    def rodar_seed():
        try:
            from seed import seed, seed_setores
            seed()
            setores_criados = seed_setores()
            from models import OPO, EDOT
            total_opos  = OPO.query.count()
            total_edots = EDOT.query.count()
            return jsonify(
                mensagem=f'Seed concluído! {total_opos} OPOs, {total_edots} EDOTs, {setores_criados} setores criados.'
            ), 200
        except Exception as e:
            return jsonify(erro=str(e)), 500

    return app
