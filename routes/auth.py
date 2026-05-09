from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt
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


@auth_bp.route('/alterar-senha', methods=['POST'])
@jwt_required()
def alterar_senha():
    claims = get_jwt()
    user_id = claims.get('user_id')

    data = request.get_json(silent=True) or {}
    senha_atual = data.get('senha_atual', '')
    nova_senha  = data.get('nova_senha', '')

    if not senha_atual or not nova_senha:
        return jsonify(erro='Campos obrigatórios'), 400
    if len(nova_senha) < 6:
        return jsonify(erro='Nova senha deve ter no mínimo 6 caracteres'), 400

    usuario = Usuario.query.get(user_id)
    if not usuario:
        return jsonify(erro='Usuário não encontrado'), 404
    if not usuario.check_senha(senha_atual):
        return jsonify(erro='Senha atual incorreta'), 403

    usuario.set_senha(nova_senha)
    db.session.commit()
    return jsonify(mensagem='Senha alterada com sucesso'), 200

