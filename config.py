import os
from datetime import timedelta


def _normalizar_db_url(url):
    """Fixa o driver psycopg2 na URL do PostgreSQL.

    Railway/Heroku fornecem 'postgres://'; além de normalizar para
    'postgresql://', fixamos o driver psycopg2 (instalado via psycopg2-binary),
    evitando que o SQLAlchemy tente carregar o dialeto psycopg v3 (ausente no
    ambiente) e falhe com ModuleNotFoundError. URLs SQLite passam intactas.
    """
    for prefixo in ('postgresql://', 'postgres://'):
        if url.startswith(prefixo):
            return 'postgresql+psycopg2://' + url[len(prefixo):]
    return url


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-me')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-change-me')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {'connect_timeout': 5},
        'pool_pre_ping': True,
        'pool_timeout': 5,
    }


class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = _normalizar_db_url(
        os.environ.get('DATABASE_URL', 'sqlite:///raskolnikov.db')
    )
    SQLALCHEMY_ECHO = True


class ProductionConfig(Config):
    DEBUG = False
    # Railway fornece DATABASE_URL com prefixo "postgres://"; normalizamos para
    # "postgresql+psycopg2://" (ver _normalizar_db_url) para fixar o driver.
    SQLALCHEMY_DATABASE_URI = _normalizar_db_url(
        os.environ.get('DATABASE_URL', 'sqlite:///raskolnikov.db')
    )


config_map = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig,
}
