from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt
from models import db, EntrevistaFamiliar, EDOT, RESULTADO_ENTREVISTA
from datetime import datetime, timedelta

entrevistas_bp = Blueprint('entrevistas', __name__)

PERFIS_ESCRITA = ('edot_coord', 'edot_membro')


def _claims():
    return get_jwt()


def _check_acesso(claims, edot_id):
    perfil = claims.get('perfil')
    if perfil == 'cet_admin':
        return True
    if perfil == 'opo':
        edot = EDOT.query.get(edot_id)
        return edot and edot.opo_id == claims.get('opo_id')
    return claims.get('edot_id') == edot_id


def _parse_dt(value):
    if not value:
        return None
    for fmt in ('%Y-%m-%dT%H:%M', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            pass
    return None


# ── Listagem ────────────────────────────────────────────────────────────────
@entrevistas_bp.route('/', methods=['GET'])
@jwt_required()
def listar():
    claims  = _claims()
    perfil  = claims.get('perfil')
    page    = int(request.args.get('page', 1))
    per_page = min(int(request.args.get('per_page', 20)), 100)
    resultado = request.args.get('resultado', '')
    arquivado = request.args.get('arquivado', 'false').lower() == 'true'
    search  = request.args.get('search', '').strip()

    from routes.report_utils import resolver_edot_ids, resolver_periodo

    opo_id  = request.args.get('opo_id', type=int)
    edot_id = request.args.get('edot_id', type=int)
    edot_ids = resolver_edot_ids(claims, opo_id=opo_id, edot_id=edot_id)
    if not edot_ids:
        edot_ids = [-1]

    q = EntrevistaFamiliar.query.filter_by(arquivado=arquivado)
    q = q.filter(EntrevistaFamiliar.edot_id.in_(edot_ids))

    desde, ate, _ = resolver_periodo(request.args)
    if desde:
        q = q.filter(EntrevistaFamiliar.created_at >= desde)
    if ate:
        q = q.filter(EntrevistaFamiliar.created_at <= ate)

    if resultado:
        q = q.filter_by(resultado=resultado)
    if search:
        like = f'%{search}%'
        q = q.filter(
            db.or_(
                EntrevistaFamiliar.iniciais.ilike(like),
                EntrevistaFamiliar.prontuario.ilike(like),
            )
        )

    q = q.order_by(EntrevistaFamiliar.created_at.desc())
    pag = q.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify(
        entrevistas=[e.to_dict() for e in pag.items],
        total=pag.total,
        page=pag.page,
        pages=pag.pages,
        per_page=per_page,
    ), 200


# ── Criar ───────────────────────────────────────────────────────────────────
@entrevistas_bp.route('/', methods=['POST'])
@jwt_required()
def criar():
    claims = _claims()
    if claims.get('perfil') not in PERFIS_ESCRITA:
        return jsonify(erro='Sem permissão para registrar entrevistas'), 403

    dados = request.get_json() or {}
    obrig = ('iniciais', 'prontuario', 'edot_id')
    falt  = [c for c in obrig if not dados.get(c)]
    if falt:
        return jsonify(erro=f'Campos obrigatórios: {", ".join(falt)}'), 400
    if not _check_acesso(claims, dados['edot_id']):
        return jsonify(erro='Sem acesso a este EDOT'), 403

    cim_absoluta = bool(dados.get('cim_absoluta'))
    cim_motivo = (dados.get('cim_motivo') or '').strip() or None
    if cim_absoluta:
        # CIM absoluta encerra o processo: sem entrevista familiar.
        if not cim_motivo:
            return jsonify(erro='Informe o motivo da CIM absoluta'), 400
        resultado = 'cim'
        data_entrevista = None
        tecidos = None
    else:
        resultado = dados.get('resultado')
        if resultado not in ('autorizacao', 'naf'):
            return jsonify(erro='resultado inválido: use autorizacao ou naf'), 400
        cim_motivo = None
        data_entrevista = _parse_dt(dados.get('data_entrevista'))
        tecidos = dados.get('tecidos', '').strip() or None

    e = EntrevistaFamiliar(
        edot_id=dados['edot_id'],
        iniciais=dados['iniciais'].strip().upper(),
        prontuario=dados['prontuario'].strip(),
        idade=dados.get('idade'),
        diagnostico=dados.get('diagnostico', '').strip() or None,
        local_obito=dados.get('local_obito', '').strip() or None,
        data_obito=_parse_dt(dados.get('data_obito')),
        data_entrevista=data_entrevista,
        resultado=resultado,
        cim_absoluta=cim_absoluta,
        cim_motivo=cim_motivo,
        tecidos=tecidos,
        observacoes=dados.get('observacoes', '').strip() or None,
        created_by=claims.get('user_id'),
    )
    db.session.add(e)
    db.session.commit()
    return jsonify(entrevista=e.to_dict()), 201


# ── Detalhe ─────────────────────────────────────────────────────────────────
@entrevistas_bp.route('/<int:eid>', methods=['GET'])
@jwt_required()
def detalhe(eid):
    claims = _claims()
    e = EntrevistaFamiliar.query.get_or_404(eid)
    if not _check_acesso(claims, e.edot_id):
        return jsonify(erro='Sem acesso'), 403
    return jsonify(entrevista=e.to_dict()), 200


# ── Atualizar ───────────────────────────────────────────────────────────────
@entrevistas_bp.route('/<int:eid>', methods=['PUT'])
@jwt_required()
def atualizar(eid):
    claims = _claims()
    if claims.get('perfil') not in PERFIS_ESCRITA:
        return jsonify(erro='Sem permissão'), 403
    e = EntrevistaFamiliar.query.get_or_404(eid)
    if not _check_acesso(claims, e.edot_id):
        return jsonify(erro='Sem acesso'), 403
    if e.arquivado:
        return jsonify(erro='Registro arquivado não pode ser editado'), 409

    dados = request.get_json() or {}
    campos = ('iniciais', 'prontuario', 'idade', 'diagnostico', 'local_obito',
              'observacoes')
    for campo in campos:
        if campo in dados:
            val = dados[campo]
            if isinstance(val, str):
                val = val.strip() or None
            setattr(e, campo, val)
    if 'data_obito' in dados:
        e.data_obito = _parse_dt(dados['data_obito'])

    # CIM absoluta / resultado / entrevista
    if 'cim_absoluta' in dados:
        cim_absoluta = bool(dados.get('cim_absoluta'))
        e.cim_absoluta = cim_absoluta
        if cim_absoluta:
            cim_motivo = (dados.get('cim_motivo') or '').strip() or None
            if not cim_motivo:
                return jsonify(erro='Informe o motivo da CIM absoluta'), 400
            e.cim_motivo = cim_motivo
            e.resultado = 'cim'
            e.data_entrevista = None
            e.tecidos = None
        else:
            e.cim_motivo = None
            resultado = dados.get('resultado')
            if resultado not in ('autorizacao', 'naf'):
                return jsonify(erro='resultado inválido: use autorizacao ou naf'), 400
            e.resultado = resultado
            if 'data_entrevista' in dados:
                e.data_entrevista = _parse_dt(dados['data_entrevista'])
            if 'tecidos' in dados:
                e.tecidos = (dados.get('tecidos') or '').strip() or None
    else:
        # Compatibilidade com payloads sem a etapa de CIM
        if 'resultado' in dados:
            if dados['resultado'] not in RESULTADO_ENTREVISTA:
                return jsonify(erro='resultado inválido'), 400
            e.resultado = dados['resultado']
        if 'data_entrevista' in dados:
            e.data_entrevista = _parse_dt(dados['data_entrevista'])
        if 'tecidos' in dados:
            e.tecidos = (dados.get('tecidos') or '').strip() or None

    e.updated_by = claims.get('user_id')
    e.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(entrevista=e.to_dict()), 200


# ── Arquivar ─────────────────────────────────────────────────────────────────
@entrevistas_bp.route('/<int:eid>/arquivar', methods=['POST'])
@jwt_required()
def arquivar(eid):
    claims = _claims()
    if claims.get('perfil') not in PERFIS_ESCRITA:
        return jsonify(erro='Sem permissão'), 403
    e = EntrevistaFamiliar.query.get_or_404(eid)
    if not _check_acesso(claims, e.edot_id):
        return jsonify(erro='Sem acesso'), 403
    if e.arquivado:
        return jsonify(erro='Já arquivado'), 409

    e.arquivado  = True
    e.updated_by = claims.get('user_id')
    e.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(mensagem='Arquivado com sucesso'), 200


# ── Estatísticas ─────────────────────────────────────────────────────────────
@entrevistas_bp.route('/stats', methods=['GET'])
@jwt_required()
def stats():
    claims  = _claims()
    perfil  = claims.get('perfil')
    dias    = int(request.args.get('dias', 30))
    desde   = datetime.utcnow() - timedelta(days=dias)

    q = EntrevistaFamiliar.query.filter(EntrevistaFamiliar.created_at >= desde)

    if perfil in ('edot_coord', 'edot_membro'):
        q = q.filter_by(edot_id=claims.get('edot_id'))
    elif perfil == 'opo':
        edot_ids = [e.id for e in EDOT.query.filter_by(opo_id=claims.get('opo_id')).all()]
        q = q.filter(EntrevistaFamiliar.edot_id.in_(edot_ids))

    todas       = q.all()
    total       = len(todas)
    autorizacoes = sum(1 for e in todas if e.resultado == 'autorizacao')
    nafs        = sum(1 for e in todas if e.resultado == 'naf')

    return jsonify(
        total=total,
        autorizacoes=autorizacoes,
        nafs=nafs,
        dias=dias,
    ), 200
