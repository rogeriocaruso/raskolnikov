"""
Script de seed: cria OPO 1 (RS) com os hospitais e um usuário cet_admin padrão.

Uso:
    python seed.py
"""
import re
from app import create_app
from models import db, OPO, EDOT, Usuario

HOSPITAIS_OPO1 = [
    'Hospital Lauro Réus',
    'Hospital da Aeronáutica',
    'Hospital de Pronto Socorro (HPS)',
    'Hospital Nossa Senhora das Graças',
    'Hospital Universitário',
    'Hospital São Camilo',
    'Hospital Dom João Becker',
    'Hospital Bom Pastor',
    'Hospital Montenegro SUS',
    'Hospital Unimed Vale do Caí',
    'Hospital Municipal de Novo Hamburgo',
    'Hospital Regina',
    'Hospital Unimed Vale dos Sinos',
    'Hospital São Francisco de Assis',
    'Hospital Beneficência Portuguesa',
    'Hospital de Pronto Socorro de Porto Alegre (HPS)',
    'Hospital Divina Providência',
    'Hospital Independência',
    'Hospital Mãe de Deus',
    'Hospital Materno Infantil Presidente Vargas',
    'Hospital Santa Ana',
    'Santa Casa de Misericórdia de Porto Alegre',
    'Hospital de Caridade São Jerônimo',
    'Hospital Centenário',
]


def _gerar_sigla(nome, existentes):
    """Gera sigla a partir das iniciais das palavras relevantes do nome."""
    stop = {'de', 'da', 'do', 'dos', 'das', 'e', 'em', 'a', 'o'}
    palavras = re.sub(r'[^a-zA-ZÀ-ú\s]', '', nome).split()
    iniciais = ''.join(
        p[0].upper() for p in palavras if p.lower() not in stop
    )
    sigla = iniciais[:8]
    base = sigla
    i = 2
    while sigla in existentes:
        sigla = f'{base}{i}'
        i += 1
    return sigla


def seed():
    app = create_app('development')
    with app.app_context():
        if OPO.query.first():
            print('Seed já executado. Abortando para não duplicar dados.')
            return

        opo = OPO(nome='OPO 1 - Rio Grande do Sul', sigla='OPO1', estado='RS')
        db.session.add(opo)
        db.session.flush()

        siglas_usadas = set()
        for hospital_nome in HOSPITAIS_OPO1:
            sigla = _gerar_sigla(hospital_nome, siglas_usadas)
            siglas_usadas.add(sigla)
            edot = EDOT(
                nome=f'EDOT {hospital_nome}',
                sigla=sigla,
                hospital_nome=hospital_nome,
                opo_id=opo.id,
            )
            db.session.add(edot)

        admin = Usuario(
            nome='Administrador CET',
            email='admin@cet.gov.br',
            perfil='cet_admin',
        )
        admin.set_senha('senha123')
        db.session.add(admin)

        db.session.commit()
        print(f'OPO criada: {opo.nome} (id={opo.id})')
        print(f'{len(HOSPITAIS_OPO1)} EDOTs criadas.')
        print('Usuário admin: admin@cet.gov.br / senha123')


if __name__ == '__main__':
    seed()
