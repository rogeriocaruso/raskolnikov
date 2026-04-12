import os
from datetime import timedelta


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
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'sqlite:///raskolnikov.db')
    SQLALCHEMY_ECHO = True


class ProductionConfig(Config):
    DEBUG = False
    # Railway fornece DATABASE_URL com prefixo "postgres://" (sem ql),
    # mas SQLAlchemy exige "postgresql://". Corrige automaticamente.
    _db_url = os.environ.get('DATABASE_URL', 'sqlite:///raskolnikov.db')
    SQLALCHEMY_DATABASE_URI = _db_url.replace('postgres://', 'postgresql://', 1)


config_map = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig,
}
