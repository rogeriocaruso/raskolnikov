from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

db = SQLAlchemy()

PERFIS = ('cet_admin', 'opo_auditor', 'edot_coord', 'edot_membro')
STATUS_PACIENTE = (
    'potencial_doador',
    'em_avaliacao',
    'doador_confirmado',
    'nao_doador',
    'arquivado',
)
TURNOS = ('manha', 'tarde', 'noite', 'plantao')


class OPO(db.Model):
    __tablename__ = 'opo'

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    sigla = db.Column(db.String(20), nullable=False, unique=True)
    estado = db.Column(db.String(2), nullable=False)
    ativo = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    edots = db.relationship('EDOT', back_populates='opo', lazy='dynamic')

    def to_dict(self):
        return dict(
            id=self.id,
            nome=self.nome,
            sigla=self.sigla,
            estado=self.estado,
            ativo=self.ativo,
        )


class EDOT(db.Model):
    __tablename__ = 'edot'

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    sigla = db.Column(db.String(20), nullable=False)
    hospital_nome = db.Column(db.String(200), nullable=False)
    opo_id = db.Column(db.Integer, db.ForeignKey('opo.id'), nullable=False)
    ativo = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    opo = db.relationship('OPO', back_populates='edots')
    pacientes = db.relationship('Paciente', back_populates='edot', lazy='dynamic')
    setores = db.relationship('Setor', back_populates='edot', lazy='dynamic')

    def to_dict(self):
        return dict(
            id=self.id,
            nome=self.nome,
            sigla=self.sigla,
            hospital_nome=self.hospital_nome,
            opo_id=self.opo_id,
            ativo=self.ativo,
        )


class Setor(db.Model):
    __tablename__ = 'setor'

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    descricao = db.Column(db.Text, nullable=True)
    edot_id = db.Column(db.Integer, db.ForeignKey('edot.id'), nullable=False)
    ativo = db.Column(db.Boolean, default=True, nullable=False)

    edot = db.relationship('EDOT', back_populates='setores')

    def to_dict(self):
        return dict(
            id=self.id,
            nome=self.nome,
            descricao=self.descricao,
            edot_id=self.edot_id,
            ativo=self.ativo,
        )


class Usuario(db.Model):
    __tablename__ = 'usuario'

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), nullable=False, unique=True)
    senha_hash = db.Column(db.String(256), nullable=False)
    perfil = db.Column(db.String(30), nullable=False)
    edot_id = db.Column(db.Integer, db.ForeignKey('edot.id'), nullable=True)
    opo_id = db.Column(db.Integer, db.ForeignKey('opo.id'), nullable=True)
    ativo = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_senha(self, senha):
        self.senha_hash = generate_password_hash(senha)

    def check_senha(self, senha):
        return check_password_hash(self.senha_hash, senha)

    def to_dict(self):
        return dict(
            id=self.id,
            nome=self.nome,
            email=self.email,
            perfil=self.perfil,
            edot_id=self.edot_id,
            opo_id=self.opo_id,
            ativo=self.ativo,
        )


class Paciente(db.Model):
    __tablename__ = 'paciente'

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(200), nullable=False)
    data_nascimento = db.Column(db.Date, nullable=True)
    prontuario = db.Column(db.String(50), nullable=False)
    edot_id = db.Column(db.Integer, db.ForeignKey('edot.id'), nullable=False)
    setor_id = db.Column(db.Integer, db.ForeignKey('setor.id'), nullable=True)
    causa_morte = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(30), nullable=False, default='potencial_doador')
    data_internacao = db.Column(db.DateTime, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=False)
    updated_by = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    arquivado = db.Column(db.Boolean, default=False, nullable=False)
    observacoes = db.Column(db.Text, nullable=True)

    edot = db.relationship('EDOT', back_populates='pacientes')
    setor = db.relationship('Setor')
    historico = db.relationship(
        'PacienteHistorico',
        back_populates='paciente',
        order_by='PacienteHistorico.created_at',
    )

    __table_args__ = (
        db.UniqueConstraint('prontuario', 'edot_id', name='uq_prontuario_edot'),
    )

    def to_dict(self, include_historico=False):
        d = dict(
            id=self.id,
            nome=self.nome,
            data_nascimento=self.data_nascimento.isoformat() if self.data_nascimento else None,
            prontuario=self.prontuario,
            edot_id=self.edot_id,
            setor_id=self.setor_id,
            causa_morte=self.causa_morte,
            status=self.status,
            data_internacao=self.data_internacao.isoformat() if self.data_internacao else None,
            created_by=self.created_by,
            updated_by=self.updated_by,
            created_at=self.created_at.isoformat(),
            updated_at=self.updated_at.isoformat() if self.updated_at else None,
            arquivado=self.arquivado,
            observacoes=self.observacoes,
        )
        if include_historico:
            d['historico'] = [h.to_dict() for h in self.historico]
        return d


class PacienteHistorico(db.Model):
    __tablename__ = 'paciente_historico'

    id = db.Column(db.Integer, primary_key=True)
    paciente_id = db.Column(db.Integer, db.ForeignKey('paciente.id'), nullable=False)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=False)
    campo_alterado = db.Column(db.String(60), nullable=False)
    valor_anterior = db.Column(db.Text, nullable=True)
    valor_novo = db.Column(db.Text, nullable=True)
    observacao = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    paciente = db.relationship('Paciente', back_populates='historico')
    usuario = db.relationship('Usuario')

    def to_dict(self):
        return dict(
            id=self.id,
            paciente_id=self.paciente_id,
            usuario_id=self.usuario_id,
            campo_alterado=self.campo_alterado,
            valor_anterior=self.valor_anterior,
            valor_novo=self.valor_novo,
            observacao=self.observacao,
            created_at=self.created_at.isoformat(),
        )


class Ronda(db.Model):
    __tablename__ = 'ronda'

    id = db.Column(db.Integer, primary_key=True)
    edot_id = db.Column(db.Integer, db.ForeignKey('edot.id'), nullable=False)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=False)
    setor_id = db.Column(db.Integer, db.ForeignKey('setor.id'), nullable=True)
    turno = db.Column(db.String(20), nullable=False, default='plantao')
    data_inicio = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    data_fim = db.Column(db.DateTime, nullable=True)
    observacoes = db.Column(db.Text, nullable=True)
    leitos_visitados = db.Column(db.Integer, nullable=True)
    potenciais_encontrados = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    edot = db.relationship('EDOT')
    usuario = db.relationship('Usuario')
    setor = db.relationship('Setor')

    def to_dict(self):
        return dict(
            id=self.id,
            edot_id=self.edot_id,
            usuario_id=self.usuario_id,
            setor_id=self.setor_id,
            turno=self.turno,
            data_inicio=self.data_inicio.isoformat(),
            data_fim=self.data_fim.isoformat() if self.data_fim else None,
            observacoes=self.observacoes,
            leitos_visitados=self.leitos_visitados,
            potenciais_encontrados=self.potenciais_encontrados,
            created_at=self.created_at.isoformat(),
        )
