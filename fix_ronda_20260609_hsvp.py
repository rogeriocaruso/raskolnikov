"""
Correção pontual: Ronda do Hospital São Vicente de Paulo (Passo Fundo)
Data: 09/06/2026, turno manhã
Erro: leitos_visitados=0, potenciais_encontrados=10
Correto: leitos_visitados=10, potenciais_encontrados=0

Uso:
    DATABASE_URL=<url> python fix_ronda_20260609_hsvp.py
"""
import os, sys
from datetime import date

os.environ.setdefault('FLASK_ENV', 'production')

from app import create_app
from models import db, Ronda, EDOT

app = create_app()

with app.app_context():
    # Localiza a EDOT pelo nome do hospital
    edot = EDOT.query.filter(
        EDOT.hospital_nome.ilike('%São Vicente de Paulo%')
    ).first()

    if not edot:
        sys.exit('ERRO: EDOT "São Vicente de Paulo" não encontrada.')

    print(f'EDOT encontrada: {edot.hospital_nome} (id={edot.id})')

    # Busca rondas da EDOT no dia 09/06/2026, turno manhã
    alvo = date(2026, 6, 9)
    candidatas = (
        Ronda.query
        .filter_by(edot_id=edot.id, turno='manha')
        .filter(db.func.date(Ronda.data_inicio) == alvo)
        .all()
    )

    if not candidatas:
        sys.exit(f'ERRO: nenhuma ronda de turno manhã em {alvo} para esta EDOT.')

    if len(candidatas) > 1:
        print('Mais de uma ronda encontrada:')
        for r in candidatas:
            print(f'  id={r.id}  início={r.data_inicio}  '
                  f'leitos={r.leitos_visitados}  potenciais={r.potenciais_encontrados}')
        sys.exit('Identifique manualmente o id correto e ajuste o script.')

    ronda = candidatas[0]
    print(f'\nRonda id={ronda.id}')
    print(f'  Antes:  leitos={ronda.leitos_visitados}  potenciais={ronda.potenciais_encontrados}')

    # Verifica que o estado é exatamente o errado antes de corrigir
    if ronda.leitos_visitados != 0 or ronda.potenciais_encontrados != 10:
        print('AVISO: valores diferentes do esperado (0 leitos / 10 potenciais).')
        resp = input('Deseja aplicar a correção mesmo assim? [s/N] ').strip().lower()
        if resp != 's':
            sys.exit('Correção cancelada.')

    ronda.leitos_visitados = 10
    ronda.potenciais_encontrados = 0
    db.session.commit()

    print(f'  Depois: leitos={ronda.leitos_visitados}  potenciais={ronda.potenciais_encontrados}')
    print('\nCorreção aplicada com sucesso.')
