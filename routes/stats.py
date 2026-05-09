from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from sqlalchemy import func, distinct

from models import db, Paciente, PacienteHistorico, Ronda, EDOT, EntrevistaFamiliar

stats_bp = Blueprint('stats', __name__)


def _get_claims():
    return get_jwt()


def _edot_ids_for_claims(claims):
    perfil = claims.get('perfil')
    if perfil == 'cet_admin':
        return [e.id for e in EDOT.query.filter_by(ativo=True).all()]
    if perfil == 'opo':
        return [e.id for e in EDOT.query.filter_by(opo_id=claims.get('opo_id'), ativo=True).all()]
    return [claims.get('edot_id')]


def _contar_status_historico(edot_ids, status):
    """Conta pacientes distintos que já atingiram este status (via histórico)."""
    return (
        db.session.query(func.count(distinct(PacienteHistorico.paciente_id)))
        .join(Paciente, Paciente.id == PacienteHistorico.paciente_id)
        .filter(
            Paciente.edot_id.in_(edot_ids),
            PacienteHistorico.campo_alterado == 'status',
            PacienteHistorico.valor_novo == status,
        )
        .scalar() or 0
    )


def _taxa(num, den):
    return round(num / den * 100, 1) if den > 0 else None


@stats_bp.route('/', methods=['GET'])
@jwt_required()
def dashboard_stats():
    """Estatísticas do dashboard escaladas por perfil do usuário."""
    claims = _get_claims()
    edot_ids = _edot_ids_for_claims(claims)

    dias = request.args.get('dias', 30, type=int)
    desde = datetime.utcnow() - timedelta(days=dias)

    # ── Indicadores clínicos — acumulado (sem filtro de período) ──────────────
    possiveis_doadores = Paciente.query.filter(
        Paciente.edot_id.in_(edot_ids)
    ).count()

    notificacoes_me = _contar_status_historico(edot_ids, 'protocolo_me')
    me_com_doacao   = _contar_status_historico(edot_ids, 'me_com_doacao')
    total_pcr       = _contar_status_historico(edot_ids, 'pcr_antes_doacao')
    total_cim       = _contar_status_historico(edot_ids, 'me_cim')
    total_naf       = _contar_status_historico(edot_ids, 'me_naf')

    # ── Tecidos / BTOH — acumulado ─────────────────────────────────────────────
    total_entrevistas = EntrevistaFamiliar.query.filter(
        EntrevistaFamiliar.edot_id.in_(edot_ids),
    ).count()
    autorizacoes_btoh = EntrevistaFamiliar.query.filter(
        EntrevistaFamiliar.edot_id.in_(edot_ids),
        EntrevistaFamiliar.resultado == 'autorizacao',
    ).count()

    # ── Métricas operacionais — filtradas pelo período selecionado ─────────────
    rondas_periodo = (
        Ronda.query
        .filter(Ronda.edot_id.in_(edot_ids), Ronda.data_inicio >= desde)
        .count()
    )
    total_leitos = (
        db.session.query(func.sum(Ronda.leitos_visitados))
        .filter(Ronda.edot_id.in_(edot_ids), Ronda.data_inicio >= desde)
        .scalar() or 0
    )

    por_status = (
        db.session.query(Paciente.status, func.count(Paciente.id))
        .filter(Paciente.edot_id.in_(edot_ids), Paciente.arquivado == False)
        .group_by(Paciente.status)
        .all()
    )

    return jsonify(
        periodo_dias=dias,
        # Clínicos — captação de órgãos
        possiveis_doadores=possiveis_doadores,
        notificacoes_me=notificacoes_me,
        me_com_doacao=me_com_doacao,
        total_pcr=total_pcr,
        total_cim=total_cim,
        total_naf=total_naf,
        taxa_efetivacao=_taxa(me_com_doacao, notificacoes_me),
        taxa_pcr=_taxa(total_pcr, notificacoes_me),
        taxa_cim=_taxa(total_cim, notificacoes_me),
        taxa_naf=_taxa(total_naf, notificacoes_me),
        # Tecidos
        total_entrevistas=total_entrevistas,
        autorizacoes_btoh=autorizacoes_btoh,
        taxa_btoh=_taxa(autorizacoes_btoh, total_entrevistas),
        # Operacional
        rondas_no_periodo=rondas_periodo,
        total_leitos_visitados=int(total_leitos),
        pacientes_por_status={s: c for s, c in por_status},
    ), 200


@stats_bp.route('/edots', methods=['GET'])
@jwt_required()
def stats_por_edot():
    """Comparativo de estatísticas entre EDOTs (opo, cet_admin)."""
    claims = _get_claims()
    perfil = claims.get('perfil')
    if perfil not in ('cet_admin', 'opo'):
        return jsonify(erro='Sem permissão'), 403

    edot_ids = _edot_ids_for_claims(claims)

    resultado = []
    for edot_id in edot_ids:
        edot = EDOT.query.get(edot_id)
        if not edot:
            continue
        ativos   = Paciente.query.filter_by(edot_id=edot_id, arquivado=False).count()
        doadores = _contar_status_historico([edot_id], 'me_com_doacao')
        rondas   = Ronda.query.filter_by(edot_id=edot_id).count()
        leitos   = (
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
