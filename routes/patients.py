from datetime import date, datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from sqlalchemy import or_

from models import db, Paciente, PacienteHistorico, Setor, Usuario, EDOT, STATUS_PACIENTE

patients_bp = Blueprint('patients', __name__)

MUTABLE_FIELDS = (
    'nome',
    'setor_id',
    'causa_morte',
    'status',
    'data_nascimento',
    'data_internacao',
    'observacoes',
)


def _get_claims():
    return get_jwt()


def _check_edot_access(claims, edot_id):
    """True if the requesting user may access patients in edot_id."""
    perfil = claims.get('perfil')
    if perfil == 'cet_admin':
        return True
    if perfil == 'opo_auditor':
        edot = EDOT.query.get(edot_id)
        return edot is not None and edot.opo_id == claims.get('opo_id')
    return claims.get('edot_id') == edot_id


def _write_historico(paciente_id, usuario_id, campo, anterior, novo, obs=None):
    h = PacienteHistorico(
        paciente_id=paciente_id,
        usuario_id=usuario_id,
        campo_alterado=campo,
        valor_anterior=str(anterior) if anterior is not None else None,
        valor_novo=str(novo) if novo is not None else None,
        observacao=obs,
    )
    db.session.add(h)


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def _parse_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None


@patients_bp.route('/', methods=['GET'])
@jwt_required()
def listar_pacientes():
    """Lista pacientes ativos do dashboard, filtrado por perfil do usuário."""
    claims = _get_claims()
    perfil = claims.get('perfil')

    query = Paciente.query.filter_by(arquivado=False)

    if perfil in ('edot_membro', 'edot_coord'):
        query = query.filter_by(edot_id=claims.get('edot_id'))
    elif perfil == 'opo_auditor':
        edot_ids = [
            e.id for e in EDOT.query.filter_by(opo_id=claims.get('opo_id')).all()
        ]
        query = query.filter(Paciente.edot_id.in_(edot_ids))

    edot_filter = request.args.get('edot_id', type=int)
    if edot_filter:
        query = query.filter_by(edot_id=edot_filter)

    search = request.args.get('search', '').strip()
    if search:
        like = f'%{search}%'
        query = query.filter(
            or_(Paciente.nome.ilike(like), Paciente.prontuario.ilike(like))
        )

    status_filter = request.args.get('status')
    if status_filter:
        query = query.filter_by(status=status_filter)

    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    pagination = query.order_by(Paciente.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    return jsonify(
        pacientes=[p.to_dict() for p in pagination.items],
        total=pagination.total,
        pages=pagination.pages,
        page=pagination.page,
    ), 200


@patients_bp.route('/', methods=['POST'])
@jwt_required()
def criar_paciente():
    """Cria um novo paciente. Apenas edot_coord, edot_membro e cet_admin."""
    claims = _get_claims()
    if claims.get('perfil') not in ('cet_admin', 'edot_coord', 'edot_membro'):
        return jsonify(erro='Sem permissão'), 403

    data = request.get_json(silent=True) or {}
    required = ('nome', 'prontuario', 'edot_id')
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify(erro=f'Campos obrigatórios: {", ".join(missing)}'), 400

    edot_id = data['edot_id']
    if not _check_edot_access(claims, edot_id):
        return jsonify(erro='Sem acesso a esta EDOT'), 403

    prontuario = data['prontuario'].upper().strip()
    if Paciente.query.filter_by(prontuario=prontuario, edot_id=edot_id).first():
        return jsonify(erro='Prontuário já cadastrado nesta EDOT'), 409

    status = data.get('status', 'potencial_doador')
    if status not in STATUS_PACIENTE:
        return jsonify(erro=f'Status inválido: {status}'), 400

    paciente = Paciente(
        nome=data['nome'],
        prontuario=prontuario,
        edot_id=edot_id,
        setor_id=data.get('setor_id'),
        causa_morte=data.get('causa_morte'),
        status=status,
        data_nascimento=_parse_date(data.get('data_nascimento')),
        data_internacao=_parse_datetime(data.get('data_internacao')),
        observacoes=data.get('observacoes'),
        created_by=claims['user_id'],
    )
    db.session.add(paciente)
    db.session.flush()
    _write_historico(paciente.id, claims['user_id'], 'criacao', None, paciente.status)
    db.session.commit()
    return jsonify(paciente=paciente.to_dict()), 201


@patients_bp.route('/<int:paciente_id>', methods=['GET'])
@jwt_required()
def obter_paciente(paciente_id):
    """Retorna um paciente com histórico completo."""
    claims = _get_claims()
    paciente = Paciente.query.get_or_404(paciente_id)
    if not _check_edot_access(claims, paciente.edot_id):
        return jsonify(erro='Sem acesso'), 403
    return jsonify(paciente=paciente.to_dict(include_historico=True)), 200


@patients_bp.route('/<int:paciente_id>', methods=['PUT'])
@jwt_required()
def atualizar_paciente(paciente_id):
    """Atualiza campos do paciente e registra histórico por campo alterado."""
    claims = _get_claims()
    if claims.get('perfil') not in ('cet_admin', 'edot_coord', 'edot_membro'):
        return jsonify(erro='Sem permissão'), 403

    paciente = Paciente.query.get_or_404(paciente_id)
    if not _check_edot_access(claims, paciente.edot_id):
        return jsonify(erro='Sem acesso'), 403
    if paciente.arquivado:
        return jsonify(erro='Paciente arquivado não pode ser editado'), 409

    data = request.get_json(silent=True) or {}

    for campo in MUTABLE_FIELDS:
        if campo not in data:
            continue

        valor_novo = data[campo]

        if campo == 'status' and valor_novo not in STATUS_PACIENTE:
            return jsonify(erro=f'Status inválido: {valor_novo}'), 400

        if campo == 'data_nascimento':
            valor_novo = _parse_date(valor_novo)
        elif campo == 'data_internacao':
            valor_novo = _parse_datetime(valor_novo)

        valor_anterior = getattr(paciente, campo)
        if str(valor_anterior) != str(valor_novo):
            _write_historico(
                paciente.id, claims['user_id'], campo, valor_anterior, valor_novo
            )
            setattr(paciente, campo, valor_novo)

    paciente.updated_by = claims['user_id']
    db.session.commit()
    return jsonify(paciente=paciente.to_dict()), 200


@patients_bp.route('/<int:paciente_id>/arquivar', methods=['POST'])
@jwt_required()
def arquivar_paciente(paciente_id):
    """Arquiva (soft delete) um paciente."""
    claims = _get_claims()
    if claims.get('perfil') not in ('cet_admin', 'edot_coord', 'edot_membro'):
        return jsonify(erro='Sem permissão'), 403

    paciente = Paciente.query.get_or_404(paciente_id)
    if not _check_edot_access(claims, paciente.edot_id):
        return jsonify(erro='Sem acesso'), 403
    if paciente.arquivado:
        return jsonify(erro='Paciente já arquivado'), 409

    data = request.get_json(silent=True) or {}
    _write_historico(
        paciente.id, claims['user_id'], 'arquivado',
        False, True, obs=data.get('motivo'),
    )
    paciente.arquivado = True
    paciente.status = 'arquivado'
    paciente.updated_by = claims['user_id']
    db.session.commit()
    return jsonify(mensagem='Paciente arquivado com sucesso'), 200


@patients_bp.route('/<int:paciente_id>/historico', methods=['GET'])
@jwt_required()
def historico_paciente(paciente_id):
    """Retorna o histórico de alterações de um paciente."""
    claims = _get_claims()
    paciente = Paciente.query.get_or_404(paciente_id)
    if not _check_edot_access(claims, paciente.edot_id):
        return jsonify(erro='Sem acesso'), 403

    historico = (
        PacienteHistorico.query
        .filter_by(paciente_id=paciente_id)
        .order_by(PacienteHistorico.created_at.desc())
        .all()
    )
    return jsonify(historico=[h.to_dict() for h in historico]), 200
