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

    q = EntrevistaFamiliar.query.filter_by(arquivado=arquivado)

    if perfil == 'edot_coord' or perfil == 'edot_membro':
        q = q.filter_by(edot_id=claims.get('edot_id'))
    elif perfil == 'opo':
        edot_ids = [e.id for e in EDOT.query.filter_by(opo_id=claims.get('opo_id')).all()]
        q = q.filter(EntrevistaFamiliar.edot_id.in_(edot_ids))

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
    obrig = ('iniciais', 'prontuario', 'resultado', 'edot_id')
    falt  = [c for c in obrig if not dados.get(c)]
    if falt:
        return jsonify(erro=f'Campos obrigatórios: {", ".join(falt)}'), 400
    if dados['resultado'] not in RESULTADO_ENTREVISTA:
        return jsonify(erro='resultado inválido: use autorizacao ou naf'), 400
    if not _check_acesso(claims, dados['edot_id']):
        return jsonify(erro='Sem acesso a este EDOT'), 403

    e = EntrevistaFamiliar(
        edot_id=dados['edot_id'],
        iniciais=dados['iniciais'].strip().upper(),
        prontuario=dados['prontuario'].strip(),
        idade=dados.get('idade'),
        diagnostico=dados.get('diagnostico', '').strip() or None,
        local_obito=dados.get('local_obito', '').strip() or None,
        data_obito=_parse_dt(dados.get('data_obito')),
        data_entrevista=_parse_dt(dados.get('data_entrevista')),
        resultado=dados['resultado'],
        tecidos=dados.get('tecidos', '').strip() or None,
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
              'resultado', 'tecidos', 'observacoes')
    for campo in campos:
        if campo in dados:
            val = dados[campo]
            if isinstance(val, str):
                val = val.strip() or None
            setattr(e, campo, val)
    if 'data_obito' in dados:
        e.data_obito = _parse_dt(dados['data_obito'])
    if 'data_entrevista' in dados:
        e.data_entrevista = _parse_dt(dados['data_entrevista'])
    if 'resultado' in dados and dados['resultado'] not in RESULTADO_ENTREVISTA:
        return jsonify(erro='resultado inválido'), 400

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
