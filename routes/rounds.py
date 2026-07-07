from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt

from models import db, Ronda, Paciente, EDOT, TURNOS

rounds_bp = Blueprint('rounds', __name__)


def _get_claims():
    return get_jwt()


def _check_edot_access(claims, edot_id):
    perfil = claims.get('perfil')
    if perfil == 'cet_admin':
        return True
    if perfil == 'opo':
        edot = EDOT.query.get(edot_id)
        return edot is not None and edot.opo_id == claims.get('opo_id')
    return claims.get('edot_id') == edot_id


@rounds_bp.route('/', methods=['GET'])
@jwt_required()
def listar_rondas():
    """Lista rondas filtradas por perfil, OPO, Hospital e período."""
    from routes.report_utils import resolver_edot_ids, resolver_periodo

    claims = _get_claims()
    opo_id  = request.args.get('opo_id', type=int)
    edot_id = request.args.get('edot_id', type=int)
    edot_ids = resolver_edot_ids(claims, opo_id=opo_id, edot_id=edot_id)
    if not edot_ids:
        edot_ids = [-1]

    query = Ronda.query.filter(Ronda.edot_id.in_(edot_ids))

    desde, ate, _ = resolver_periodo(request.args)
    if desde:
        query = query.filter(Ronda.data_inicio >= desde)
    if ate:
        query = query.filter(Ronda.data_inicio <= ate)

    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    pagination = query.order_by(Ronda.data_inicio.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    return jsonify(
        rondas=[r.to_dict() for r in pagination.items],
        total=pagination.total,
        pages=pagination.pages,
        page=pagination.page,
    ), 200


@rounds_bp.route('/', methods=['POST'])
@jwt_required()
def iniciar_ronda():
    """Inicia uma nova ronda."""
    claims = _get_claims()
    if claims.get('perfil') not in ('cet_admin', 'edot_coord', 'edot_membro'):
        return jsonify(erro='Sem permissão'), 403

    data = request.get_json(silent=True) or {}
    edot_id = data.get('edot_id') or claims.get('edot_id')
    if not edot_id:
        return jsonify(erro='edot_id é obrigatório'), 400
    if not _check_edot_access(claims, edot_id):
        return jsonify(erro='Sem acesso a esta EDOT'), 403

    turno = data.get('turno', 'plantao')
    if turno not in TURNOS:
        return jsonify(erro=f'Turno inválido. Opções: {", ".join(TURNOS)}'), 400

    ronda = Ronda(
        edot_id=edot_id,
        usuario_id=claims['user_id'],
        setor_id=data.get('setor_id'),
        turno=turno,
        data_inicio=datetime.utcnow(),
        observacoes=data.get('observacoes'),
        geo_lat_inicio=data.get('geo_lat'),
        geo_lng_inicio=data.get('geo_lng'),
        geo_precisao_inicio=data.get('geo_precisao'),
    )
    db.session.add(ronda)
    db.session.commit()
    return jsonify(ronda=ronda.to_dict()), 201


@rounds_bp.route('/<int:ronda_id>', methods=['GET'])
@jwt_required()
def obter_ronda(ronda_id):
    """Retorna uma ronda com seus pacientes registrados."""
    claims = _get_claims()
    ronda = Ronda.query.get_or_404(ronda_id)
    if not _check_edot_access(claims, ronda.edot_id):
        return jsonify(erro='Sem acesso'), 403

    pacientes = Paciente.query.filter_by(edot_id=ronda.edot_id, arquivado=False).all()
    return jsonify(
        ronda=ronda.to_dict(),
        pacientes_edot=[p.to_dict() for p in pacientes],
    ), 200


@rounds_bp.route('/<int:ronda_id>/encerrar', methods=['POST'])
@jwt_required()
def encerrar_ronda(ronda_id):
    """Encerra uma ronda registrando o resultado."""
    claims = _get_claims()
    ronda = Ronda.query.get_or_404(ronda_id)
    if not _check_edot_access(claims, ronda.edot_id):
        return jsonify(erro='Sem acesso'), 403
    if ronda.data_fim:
        return jsonify(erro='Ronda já encerrada'), 409

    data = request.get_json(silent=True) or {}
    ronda.data_fim = datetime.utcnow()
    ronda.leitos_visitados = data.get('leitos_visitados')
    ronda.potenciais_encontrados = data.get('potenciais_encontrados', 0)
    ronda.observacoes = data.get('observacoes', ronda.observacoes)
    ronda.geo_lat_fim = data.get('geo_lat')
    ronda.geo_lng_fim = data.get('geo_lng')
    ronda.geo_precisao_fim = data.get('geo_precisao')
    db.session.commit()
    return jsonify(ronda=ronda.to_dict()), 200


@rounds_bp.route('/<int:ronda_id>', methods=['PUT'])
@jwt_required()
def corrigir_ronda(ronda_id):
    """Corrige campos de uma ronda encerrada. Restrito a cet_admin e opo."""
    claims = _get_claims()
    if claims.get('perfil') not in ('cet_admin', 'opo'):
        return jsonify(erro='Sem permissão'), 403

    ronda = Ronda.query.get_or_404(ronda_id)
    if not _check_edot_access(claims, ronda.edot_id):
        return jsonify(erro='Sem acesso'), 403

    data = request.get_json(silent=True) or {}
    campos_editaveis = ('leitos_visitados', 'potenciais_encontrados', 'observacoes', 'turno')
    for campo in campos_editaveis:
        if campo in data:
            setattr(ronda, campo, data[campo])

    db.session.commit()
    return jsonify(ronda=ronda.to_dict()), 200
