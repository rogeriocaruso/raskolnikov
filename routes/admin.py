from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt

from models import db, Usuario, OPO, EDOT, Setor, PERFIS

admin_bp = Blueprint('admin', __name__)


def _get_claims():
    return get_jwt()


def _require_admin(claims):
    return claims.get('perfil') == 'cet_admin'


def _require_coord_or_above(claims):
    return claims.get('perfil') in ('cet_admin', 'edot_coord', 'opo_auditor')


# ── Usuários ──────────────────────────────────────────────────────────────────

@admin_bp.route('/usuarios', methods=['GET'])
@jwt_required()
def listar_usuarios():
    claims = _get_claims()
    perfil = claims.get('perfil')

    query = Usuario.query
    if perfil == 'edot_coord':
        query = query.filter_by(edot_id=claims.get('edot_id'))
    elif perfil == 'opo_auditor':
        edot_ids = [e.id for e in EDOT.query.filter_by(opo_id=claims.get('opo_id')).all()]
        query = query.filter(Usuario.edot_id.in_(edot_ids))
    elif perfil not in ('cet_admin',):
        return jsonify(erro='Sem permissão'), 403

    usuarios = query.order_by(Usuario.nome).all()
    return jsonify(usuarios=[u.to_dict() for u in usuarios]), 200


@admin_bp.route('/usuarios', methods=['POST'])
@jwt_required()
def criar_usuario():
    claims = _get_claims()
    if not _require_coord_or_above(claims):
        return jsonify(erro='Sem permissão'), 403

    data = request.get_json(silent=True) or {}
    required = ('nome', 'email', 'senha', 'perfil')
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify(erro=f'Campos obrigatórios: {", ".join(missing)}'), 400

    if data['perfil'] not in PERFIS:
        return jsonify(erro=f'Perfil inválido. Opções: {", ".join(PERFIS)}'), 400

    if Usuario.query.filter_by(email=data['email'].lower().strip()).first():
        return jsonify(erro='Email já cadastrado'), 409

    # edot_coord só pode criar membros da sua EDOT
    if claims.get('perfil') == 'edot_coord':
        if data['perfil'] not in ('edot_membro', 'edot_coord'):
            return jsonify(erro='Você só pode criar membros ou coordenadores'), 403
        data['edot_id'] = claims.get('edot_id')

    usuario = Usuario(
        nome=data['nome'],
        email=data['email'].lower().strip(),
        perfil=data['perfil'],
        edot_id=data.get('edot_id'),
        opo_id=data.get('opo_id'),
    )
    usuario.set_senha(data['senha'])
    db.session.add(usuario)
    db.session.commit()
    return jsonify(usuario=usuario.to_dict()), 201


@admin_bp.route('/usuarios/<int:usuario_id>', methods=['PUT'])
@jwt_required()
def atualizar_usuario(usuario_id):
    claims = _get_claims()
    if not _require_coord_or_above(claims):
        return jsonify(erro='Sem permissão'), 403

    usuario = Usuario.query.get_or_404(usuario_id)
    data = request.get_json(silent=True) or {}

    if 'nome' in data:
        usuario.nome = data['nome']
    if 'ativo' in data:
        usuario.ativo = bool(data['ativo'])
    if 'senha' in data and data['senha']:
        usuario.set_senha(data['senha'])
    if 'perfil' in data and _require_admin(claims):
        if data['perfil'] not in PERFIS:
            return jsonify(erro='Perfil inválido'), 400
        usuario.perfil = data['perfil']
    if 'edot_id' in data and _require_admin(claims):
        usuario.edot_id = data['edot_id']
    if 'opo_id' in data and _require_admin(claims):
        usuario.opo_id = data['opo_id']

    db.session.commit()
    return jsonify(usuario=usuario.to_dict()), 200


@admin_bp.route('/usuarios/<int:usuario_id>/desativar', methods=['POST'])
@jwt_required()
def desativar_usuario(usuario_id):
    claims = _get_claims()
    if not _require_coord_or_above(claims):
        return jsonify(erro='Sem permissão'), 403

    usuario = Usuario.query.get_or_404(usuario_id)
    usuario.ativo = False
    db.session.commit()
    return jsonify(mensagem='Usuário desativado'), 200


# ── EDOTs ─────────────────────────────────────────────────────────────────────

@admin_bp.route('/edots', methods=['GET'])
@jwt_required()
def listar_edots():
    claims = _get_claims()
    perfil = claims.get('perfil')

    if perfil == 'cet_admin':
        edots = EDOT.query.order_by(EDOT.nome).all()
    elif perfil == 'opo_auditor':
        edots = EDOT.query.filter_by(opo_id=claims.get('opo_id')).order_by(EDOT.nome).all()
    else:
        edot = EDOT.query.get(claims.get('edot_id'))
        edots = [edot] if edot else []

    return jsonify(edots=[e.to_dict() for e in edots]), 200


@admin_bp.route('/edots', methods=['POST'])
@jwt_required()
def criar_edot():
    claims = _get_claims()
    if not _require_admin(claims):
        return jsonify(erro='Apenas cet_admin pode criar EDOTs'), 403

    data = request.get_json(silent=True) or {}
    required = ('nome', 'sigla', 'hospital_nome', 'opo_id')
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify(erro=f'Campos obrigatórios: {", ".join(missing)}'), 400

    edot = EDOT(
        nome=data['nome'],
        sigla=data['sigla'].upper(),
        hospital_nome=data['hospital_nome'],
        opo_id=data['opo_id'],
    )
    db.session.add(edot)
    db.session.commit()
    return jsonify(edot=edot.to_dict()), 201


# ── OPOs ──────────────────────────────────────────────────────────────────────

@admin_bp.route('/opos', methods=['GET'])
@jwt_required()
def listar_opos():
    claims = _get_claims()
    if claims.get('perfil') not in ('cet_admin', 'opo_auditor'):
        return jsonify(erro='Sem permissão'), 403

    opos = OPO.query.order_by(OPO.nome).all()
    return jsonify(opos=[o.to_dict() for o in opos]), 200


# ── Setores ───────────────────────────────────────────────────────────────────

@admin_bp.route('/setores', methods=['GET'])
@jwt_required()
def listar_setores():
    claims = _get_claims()
    edot_id = request.args.get('edot_id', type=int) or claims.get('edot_id')
    setores = Setor.query.filter_by(edot_id=edot_id, ativo=True).order_by(Setor.nome).all()
    return jsonify(setores=[s.to_dict() for s in setores]), 200


@admin_bp.route('/setores', methods=['POST'])
@jwt_required()
def criar_setor():
    claims = _get_claims()
    if claims.get('perfil') not in ('cet_admin', 'edot_coord'):
        return jsonify(erro='Sem permissão'), 403

    data = request.get_json(silent=True) or {}
    required = ('nome', 'edot_id')
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify(erro=f'Campos obrigatórios: {", ".join(missing)}'), 400

    setor = Setor(
        nome=data['nome'],
        descricao=data.get('descricao'),
        edot_id=data['edot_id'],
    )
    db.session.add(setor)
    db.session.commit()
    return jsonify(setor=setor.to_dict()), 201
