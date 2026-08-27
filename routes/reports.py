"""
reports.py — emissão de relatórios (CSV, XLSX, PDF).

Endpoints:
  GET /reports/pacientes.<fmt>
  GET /reports/rondas.<fmt>
  GET /reports/tecidos.<fmt>
  GET /reports/dashboard.<fmt>

Filtros aceitos em todos: opo_id, edot_id, data_inicio, data_fim (ou dias).
Escopo sempre respeita o perfil do usuário.
"""
from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from sqlalchemy import func

from models import (
    db, Paciente, Ronda, EDOT, EntrevistaFamiliar,
)
from routes.report_utils import (
    resolver_edot_ids, resolver_periodo, rotulo_escopo, gerar_relatorio,
    contar_pacientes_status, ME_STAGE_STATUSES,
)

reports_bp = Blueprint('reports', __name__)

FORMATOS = ('csv', 'xlsx', 'pdf')

STATUS_LABEL = {
    'sedacao_continua':   'Sedação Contínua',
    'sedacao_pausada':    'Sedação Pausada',
    'acompanhamento':     'Acompanhamento',
    'protocolo_me':       'Protocolo M.E.',
    'me_sem_confirmacao': 'M.E. Sem Confirmação',
    'me_confirmado':      'M.E. Confirmado',
    'me_com_doacao':      'M.E. Com Doação',
    'me_cim':             'M.E. — C.I.M.',
    'me_naf':             'M.E. — N.A.F.',
    'pcr_antes_doacao':   'PCR antes da Doação',
    'arquivado':          'Arquivado',
    'potencial_doador':   'Potencial Doador',
}
TURNO_LABEL = {'manha': 'Manhã', 'tarde': 'Tarde', 'noite': 'Noite', 'plantao': 'Plantão'}
RESULTADO_LABEL = {'autorizacao': 'Autorização', 'naf': 'Não Autorização Familiar'}


def _fmt_data(dt, com_hora=False):
    if not dt:
        return ''
    if isinstance(dt, str):
        return dt
    return dt.strftime('%d/%m/%Y %H:%M' if com_hora else '%d/%m/%Y')


def _args_filtro():
    """Extrai filtros comuns dos query params."""
    return dict(
        opo_id=request.args.get('opo_id', type=int),
        edot_id=request.args.get('edot_id', type=int),
    )


def _validar_formato(fmt):
    return fmt in FORMATOS


# ─────────────────────────────────────────────────────────────────────────────
# Pacientes
# ─────────────────────────────────────────────────────────────────────────────
@reports_bp.route('/pacientes.<fmt>', methods=['GET'])
@jwt_required()
def relatorio_pacientes(fmt):
    if not _validar_formato(fmt):
        return jsonify(erro='Formato inválido'), 400
    claims = get_jwt()
    filtros = _args_filtro()
    edot_ids = resolver_edot_ids(claims, **filtros)
    desde, ate, rot_periodo = resolver_periodo(request.args)

    q = Paciente.query.filter(Paciente.edot_id.in_(edot_ids))
    if desde:
        q = q.filter(Paciente.created_at >= desde)
    if ate:
        q = q.filter(Paciente.created_at <= ate)
    pacientes = q.order_by(Paciente.created_at.desc()).all()

    colunas = [
        ('iniciais', 'Iniciais'), ('prontuario', 'Prontuário'),
        ('hospital', 'Hospital'), ('setor', 'Setor'),
        ('status', 'Status'), ('nascimento', 'Nascimento'),
        ('internacao', 'Internação'), ('cadastro', 'Cadastro'),
    ]
    linhas = [dict(
        iniciais=p.nome,
        prontuario=p.prontuario,
        hospital=p.edot.hospital_nome if p.edot else '',
        setor=p.setor.nome if p.setor else '',
        status=STATUS_LABEL.get(p.status, p.status),
        nascimento=_fmt_data(p.data_nascimento),
        internacao=_fmt_data(p.data_internacao, com_hora=True),
        cadastro=_fmt_data(p.created_at),
    ) for p in pacientes]

    subtitulo = ' · '.join(filter(None, [rotulo_escopo(claims, **filtros), rot_periodo]))
    return gerar_relatorio(
        fmt, 'relatorio_pacientes', 'Relatório de Pacientes', subtitulo, colunas, linhas
    )


# ─────────────────────────────────────────────────────────────────────────────
# Rondas
# ─────────────────────────────────────────────────────────────────────────────
@reports_bp.route('/rondas.<fmt>', methods=['GET'])
@jwt_required()
def relatorio_rondas(fmt):
    if not _validar_formato(fmt):
        return jsonify(erro='Formato inválido'), 400
    claims = get_jwt()
    filtros = _args_filtro()
    edot_ids = resolver_edot_ids(claims, **filtros)
    desde, ate, rot_periodo = resolver_periodo(request.args)

    q = Ronda.query.filter(Ronda.edot_id.in_(edot_ids))
    if desde:
        q = q.filter(Ronda.data_inicio >= desde)
    if ate:
        q = q.filter(Ronda.data_inicio <= ate)
    rondas = q.order_by(Ronda.data_inicio.desc()).all()

    colunas = [
        ('hospital', 'Hospital'), ('turno', 'Turno'),
        ('inicio', 'Início'), ('fim', 'Término'),
        ('leitos', 'Leitos'), ('potenciais', 'Potenciais'),
        ('responsavel', 'Responsável'), ('observacoes', 'Observações'),
    ]
    linhas = [dict(
        hospital=r.edot.hospital_nome if r.edot else '',
        turno=TURNO_LABEL.get(r.turno, r.turno),
        inicio=_fmt_data(r.data_inicio, com_hora=True),
        fim=_fmt_data(r.data_fim, com_hora=True) if r.data_fim else 'Em andamento',
        leitos=r.leitos_visitados if r.leitos_visitados is not None else '',
        potenciais=r.potenciais_encontrados,
        responsavel=r.usuario.nome if r.usuario else '',
        observacoes=r.observacoes or '',
    ) for r in rondas]

    subtitulo = ' · '.join(filter(None, [rotulo_escopo(claims, **filtros), rot_periodo]))
    return gerar_relatorio(
        fmt, 'relatorio_rondas', 'Relatório de Rondas', subtitulo, colunas, linhas
    )


# ─────────────────────────────────────────────────────────────────────────────
# Tecidos (entrevistas familiares)
# ─────────────────────────────────────────────────────────────────────────────
@reports_bp.route('/tecidos.<fmt>', methods=['GET'])
@jwt_required()
def relatorio_tecidos(fmt):
    if not _validar_formato(fmt):
        return jsonify(erro='Formato inválido'), 400
    claims = get_jwt()
    filtros = _args_filtro()
    edot_ids = resolver_edot_ids(claims, **filtros)
    desde, ate, rot_periodo = resolver_periodo(request.args)

    q = EntrevistaFamiliar.query.filter(EntrevistaFamiliar.edot_id.in_(edot_ids))
    if desde:
        q = q.filter(EntrevistaFamiliar.created_at >= desde)
    if ate:
        q = q.filter(EntrevistaFamiliar.created_at <= ate)
    entrevistas = q.order_by(EntrevistaFamiliar.created_at.desc()).all()

    colunas = [
        ('hospital', 'Hospital'), ('iniciais', 'Iniciais'),
        ('prontuario', 'Prontuário'), ('idade', 'Idade'),
        ('diagnostico', 'Diagnóstico'), ('obito', 'Óbito'),
        ('entrevista', 'Entrevista'), ('resultado', 'Resultado'),
        ('tecidos', 'Tecidos'),
    ]
    linhas = [dict(
        hospital=e.edot.hospital_nome if e.edot else '',
        iniciais=e.iniciais,
        prontuario=e.prontuario,
        idade=e.idade if e.idade is not None else '',
        diagnostico=e.diagnostico or '',
        obito=_fmt_data(e.data_obito, com_hora=True) if e.data_obito else '',
        entrevista=_fmt_data(e.data_entrevista, com_hora=True) if e.data_entrevista else '',
        resultado=RESULTADO_LABEL.get(e.resultado, e.resultado),
        tecidos=e.tecidos or '',
    ) for e in entrevistas]

    subtitulo = ' · '.join(filter(None, [rotulo_escopo(claims, **filtros), rot_periodo]))
    return gerar_relatorio(
        fmt, 'relatorio_tecidos', 'Relatório de Tecidos — Entrevistas Familiares',
        subtitulo, colunas, linhas
    )


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard (resumo de indicadores)
# ─────────────────────────────────────────────────────────────────────────────
def _taxa(num, den):
    return f'{round(num / den * 100, 1)}%' if den > 0 else '—'


@reports_bp.route('/dashboard.<fmt>', methods=['GET'])
@jwt_required()
def relatorio_dashboard(fmt):
    if not _validar_formato(fmt):
        return jsonify(erro='Formato inválido'), 400
    claims = get_jwt()
    filtros = _args_filtro()
    edot_ids = resolver_edot_ids(claims, **filtros)
    desde, ate, rot_periodo = resolver_periodo(request.args)

    # Possíveis doadores
    qp = Paciente.query.filter(Paciente.edot_id.in_(edot_ids))
    if desde:
        qp = qp.filter(Paciente.created_at >= desde)
    if ate:
        qp = qp.filter(Paciente.created_at <= ate)
    possiveis = qp.count()

    notif_me = contar_pacientes_status(edot_ids, ME_STAGE_STATUSES, desde, ate)
    doacao   = contar_pacientes_status(edot_ids, 'me_com_doacao', desde, ate)
    pcr      = contar_pacientes_status(edot_ids, 'pcr_antes_doacao', desde, ate)
    cim      = contar_pacientes_status(edot_ids, 'me_cim', desde, ate)
    naf      = contar_pacientes_status(edot_ids, 'me_naf', desde, ate)

    qe = EntrevistaFamiliar.query.filter(EntrevistaFamiliar.edot_id.in_(edot_ids))
    if desde:
        qe = qe.filter(EntrevistaFamiliar.created_at >= desde)
    if ate:
        qe = qe.filter(EntrevistaFamiliar.created_at <= ate)
    total_entrev = qe.count()
    autoriz = qe.filter(EntrevistaFamiliar.resultado == 'autorizacao').count()

    qr = Ronda.query.filter(Ronda.edot_id.in_(edot_ids))
    if desde:
        qr = qr.filter(Ronda.data_inicio >= desde)
    if ate:
        qr = qr.filter(Ronda.data_inicio <= ate)
    total_rondas = qr.count()
    total_leitos = (
        qr.with_entities(func.sum(Ronda.leitos_visitados)).scalar() or 0
    )

    colunas = [('indicador', 'Indicador'), ('valor', 'Valor')]
    linhas = [
        dict(indicador='— CAPTAÇÃO DE ÓRGÃOS —', valor=''),
        dict(indicador='Possíveis Doadores', valor=possiveis),
        dict(indicador='Notificações de M.E.', valor=notif_me),
        dict(indicador='M.E. com Doação', valor=doacao),
        dict(indicador='Taxa de Efetivação', valor=_taxa(doacao, notif_me)),
        dict(indicador='— DESFECHOS SEM DOAÇÃO —', valor=''),
        dict(indicador='PCR antes da Doação', valor=pcr),
        dict(indicador='Taxa de PCR', valor=_taxa(pcr, notif_me)),
        dict(indicador='N.A.F. (Não Autorização Familiar)', valor=naf),
        dict(indicador='Taxa de N.A.F.', valor=_taxa(naf, notif_me)),
        dict(indicador='C.I.M. (Contraindicação Médica)', valor=cim),
        dict(indicador='Taxa de C.I.M.', valor=_taxa(cim, notif_me)),
        dict(indicador='— TECIDOS / BTOH —', valor=''),
        dict(indicador='Entrevistas Familiares', valor=total_entrev),
        dict(indicador='Autorizações', valor=autoriz),
        dict(indicador='Taxa de Notificação ao BTOH', valor=_taxa(autoriz, total_entrev)),
        dict(indicador='— OPERACIONAL —', valor=''),
        dict(indicador='Rondas Realizadas', valor=total_rondas),
        dict(indicador='Leitos Visitados', valor=int(total_leitos)),
    ]

    subtitulo = ' · '.join(filter(None, [rotulo_escopo(claims, **filtros), rot_periodo]))
    return gerar_relatorio(
        fmt, 'relatorio_dashboard', 'Relatório de Indicadores', subtitulo, colunas, linhas
    )
