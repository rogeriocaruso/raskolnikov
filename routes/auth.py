from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from models import db, Usuario

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    email = data.get('email', '').strip().lower()
    senha = data.get('senha', '')

    if not email or not senha:
        return jsonify(erro='email e senha são obrigatórios'), 400

    usuario = Usuario.query.filter_by(email=email, ativo=True).first()
    if not usuario or not usuario.check_senha(senha):
        return jsonify(erro='Credenciais inválidas', v='v3'), 401

    additional_claims = {
        'perfil': usuario.perfil,
        'edot_id': usuario.edot_id,
        'opo_id': usuario.opo_id,
        'user_id': usuario.id,
    }
    token = create_access_token(
        identity=str(usuario.id),
        additional_claims=additional_claims,
    )
    return jsonify(access_token=token, usuario=usuario.to_dict()), 200
