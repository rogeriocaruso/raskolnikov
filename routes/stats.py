from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from sqlalchemy import func

from models import db, Paciente, Ronda, EDOT, OPO, Usuario

stats_bp = Blueprint('stats', __name__)


def _get_claims():
    return get_jwt()


def _edot_ids_for_claims(claims):
    perfil = claims.get('perfil')
    if perfil == 'cet_admin':
        return [e.id for e in EDOT.query.filter_by(ativo=True).all()]
    if perfil == 'opo_auditor':
        return [e.id for e in EDOT.query.filter_by(opo_id=claims.get('opo_id'), ativo=True).all()]
    return [claims.get('edot_id')]


@stats_bp.route('/', methods=['GET'])
@jwt_required()
def dashboard_stats():
    """Estatísticas do dashboard filtradas por escopo do usuário."""
    claims = _get_claims()
    edot_ids = _edot_ids_for_claims(claims)

    # Período: últimos 30 dias por padrão
    dias = request.args.get('dias', 30, type=int)
    desde = datetime.utcnow() - timedelta(days=dias)

    total_pacientes = (
        Paciente.query
        .filter(Paciente.edot_id.in_(edot_ids), Paciente.arquivado == False)
        .count()
    )

    por_status = (
        db.session.query(Paciente.status, func.count(Paciente.id))
        .filter(Paciente.edot_id.in_(edot_ids), Paciente.arquivado == False)
        .group_by(Paciente.status)
        .all()
    )

    rondas_periodo = (
        Ronda.query
        .filter(Ronda.edot_id.in_(edot_ids), Ronda.data_inicio >= desde)
        .count()
    )

    potenciais_periodo = (
        db.session.query(func.sum(Ronda.potenciais_encontrados))
        .filter(Ronda.edot_id.in_(edot_ids), Ronda.data_inicio >= desde)
        .scalar() or 0
    )

    novos_pacientes_periodo = (
        Paciente.query
        .filter(
            Paciente.edot_id.in_(edot_ids),
            Paciente.created_at >= desde,
        )
        .count()
    )

    doadores_confirmados = (
        Paciente.query
        .filter(
            Paciente.edot_id.in_(edot_ids),
            Paciente.status == 'me_com_doacao',
        )
        .count()
    )

    total_leitos = (
        db.session.query(func.sum(Ronda.leitos_visitados))
        .filter(Ronda.edot_id.in_(edot_ids), Ronda.data_inicio >= desde)
        .scalar() or 0
    )

    return jsonify(
        periodo_dias=dias,
        total_pacientes_ativos=total_pacientes,
        pacientes_por_status={s: c for s, c in por_status},
        rondas_no_periodo=rondas_periodo,
        total_leitos_visitados=int(total_leitos),
        potenciais_encontrados_periodo=int(potenciais_periodo),
        novos_pacientes_periodo=novos_pacientes_periodo,
        doadores_confirmados=doadores_confirmados,
    ), 200


@stats_bp.route('/edots', methods=['GET'])
@jwt_required()
def stats_por_edot():
    """Comparativo de estatísticas entre EDOTs (opo_auditor, cet_admin)."""
    claims = _get_claims()
    perfil = claims.get('perfil')
    if perfil not in ('cet_admin', 'opo_auditor'):
        return jsonify(erro='Sem permissão'), 403

    edot_ids = _edot_ids_for_claims(claims)

    resultado = []
    for edot_id in edot_ids:
        edot = EDOT.query.get(edot_id)
        if not edot:
            continue
        ativos = Paciente.query.filter_by(edot_id=edot_id, arquivado=False).count()
        doadores = Paciente.query.filter_by(edot_id=edot_id, status='me_com_doacao').count()
        rondas = Ronda.query.filter_by(edot_id=edot_id).count()
        leitos = (
            db.session.query(func.sum(Ronda.leitos_visitados))
            .filter(Ronda.edot_id == edot_id)
            .scalar() or 0
        )
        resultado.append(dict(
            edot=edot.to_dict(),
            pacientes_ativos=ativos,
            doadores_confirmados=doadores,
            total_rondas=rondas,
            total_leitos=int(leitos),
        ))

    return jsonify(edots=resultado), 200
