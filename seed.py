"""
Script de seed: cria todas as OPOs do RS com seus hospitais e um usuário cet_admin padrão.

Uso:
    python seed.py
"""
import re
from app import create_app
from models import db, OPO, EDOT, Usuario

OPOS = [
    {
        'nome': 'OPO 1 - Rio Grande do Sul',
        'sigla': 'OPO1',
        'estado': 'RS',
        'hospitais': [
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
            'Hospital Sapiranga',
            'Hospital Getúlio Vargas de Sapucaia do Sul',
            'Hospital Bom Jesus',
        ],
    },
    {
        'nome': 'OPO 2 - Rio Grande do Sul',
        'sigla': 'OPO2',
        'estado': 'RS',
        'hospitais': [
            'Hospital Cristo Redentor',
            'Hospital da Brigada Militar de Porto Alegre',
            'Hospital de Clínicas de Porto Alegre',
            'Hospital Ernesto Dornelles',
            'Hospital Humaniza',
            'Hospital Moinhos de Vento',
            'Hospital Petrópolis',
            'Hospital Porto Alegre',
            'Hospital da Restinga / Extremo Sul',
            'Hospital Sanatório Partenon',
            'Hospital Militar de Porto Alegre',
            'Hospital Vila Nova',
            'Instituto de Cardiologia',
            'Hospital Nossa Senhora dos Navegantes',
            'Hospital Tramandaí',
            'Hospital Santa Luzia',
            'Hospital São Lucas da PUCRS',
            'Hospital São Vicente de Paulo',
            'Hospital de Camaqua',
            'Hospital Unimed de Guaíba',
            'Hospital Regional Nelson Cornetet / Hospital Padre Jeremias',
            'Hospital de Viamão',
        ],
    },
    {
        'nome': 'OPO 3 - Rio Grande do Sul',
        'sigla': 'OPO3',
        'estado': 'RS',
        'hospitais': [
            'Hospital Tacchini',
            'Hospital do Círculo',
            'Hospital Geral',
            'Hospital Pompéia',
            'Hospital Saúde',
            'Hospital Unimed',
            'Hospital Virvi Ramos',
            'Hospital São Carlos',
            'Hospital Arcanjo São Miguel - Gramado',
            'Hospital de Vacaria',
        ],
    },
    {
        'nome': 'OPO 4 - Rio Grande do Sul',
        'sigla': 'OPO4',
        'estado': 'RS',
        'hospitais': [
            'Hospital Clinicas de Carazinho',
            'Hospital Santa Lúcia Ltda',
            'Hospital São Vicente de Paulo - Cruz Alta',
            'Hospital de Caridade de Erechim',
            'Hospitalar Santa Terezinha de Erechim',
            'Hospital Bom Pastor',
            'Hospital de Clinicas de Ijuí',
            'Hospital Unimed de Ijuí',
            'Hospital das Clinicas de Passo Fundo',
            'Hospital São Vicente de Paulo de Passo Fundo',
            'Pronto Clínica Passo Fundo Abosco',
            'Hospital Vida Saúde',
            'Hospital Santo Ângelo',
            'Hospital Unimed - Santo Ângelo',
            'Hospital Infantil de São Borja',
            'Hospital Santo Antônio',
            'Hospital São Vicente de Paulo',
            'Hospital Caridade Três Passos',
        ],
    },
    {
        'nome': 'OPO 5 - Rio Grande do Sul',
        'sigla': 'OPO5',
        'estado': 'RS',
        'hospitais': [
            'Hospital Universitário de Bagé',
            'Santa Casa de Caridade de Bagé',
            'Hospital de Caridade de Canguçu',
            'Hospital São Luiz - Dom Pedrito',
            'Hospital Escola',
            'Hospital Miguel Piltcher',
            'Hospital Universitário São Francisco de Paula',
            'Santa Casa de Misericórdia de Pelotas',
            'Sociedade Portuguesa de Beneficência',
            'Hospital Universitário Dr. Miguel Riet Correa Jr.',
            'Santa Casa do Rio Grande',
        ],
    },
    {
        'nome': 'OPO 6 - Rio Grande do Sul',
        'sigla': 'OPO6',
        'estado': 'RS',
        'hospitais': [
            'Santa Casa de Alegrete',
            'Hospital de Cachoeira do Sul',
            'Hospital Estrela',
            'Hospital Bruno Born',
            'Hospital Auxiliadora de Rosário do Sul',
            'Hospital Ana Nery',
            'Hospital Santa Cruz',
            'Hospital de Caridade Dr. Astrogildo de Azevedo',
            'Hospital São Francisco de Assis',
            'Hospital Regional de Santa Maria',
            'Hospital Universitário de Santa Maria',
            'Prontomed - Santana do Livramento',
            'Santa Casa de Misericórdia de Santana do Livramento',
            'Hospital de Caridade de Santiago',
            'Santa Casa de São Gabriel',
            'Hospital Geral Santa Casa de Uruguaiana',
            'Hospital São José',
            'Hospital São Sebastião Mártir',
        ],
    },
]


def _gerar_sigla(nome, existentes):
    """Gera sigla a partir das iniciais das palavras relevantes do nome."""
    stop = {'de', 'da', 'do', 'dos', 'das', 'e', 'em', 'a', 'o', 'ltda', 'dr', 'dr.'}
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

        siglas_usadas = set()
        total_edots = 0

        for opo_data in OPOS:
            opo = OPO(
                nome=opo_data['nome'],
                sigla=opo_data['sigla'],
                estado=opo_data['estado'],
            )
            db.session.add(opo)
            db.session.flush()

            for hospital_nome in opo_data['hospitais']:
                sigla = _gerar_sigla(hospital_nome, siglas_usadas)
                siglas_usadas.add(sigla)
                edot = EDOT(
                    nome=f'EDOT {hospital_nome}',
                    sigla=sigla,
                    hospital_nome=hospital_nome,
                    opo_id=opo.id,
                )
                db.session.add(edot)
                total_edots += 1

            print(f'OPO criada: {opo.nome} ({len(opo_data["hospitais"])} hospitais)')

        admin = Usuario(
            nome='Administrador CET',
            email='admin@cet.gov.br',
            perfil='cet_admin',
        )
        admin.set_senha('senha123')
        db.session.add(admin)

        db.session.commit()
        print(f'\nTotal: {len(OPOS)} OPOs, {total_edots} EDOTs criadas.')
        print('Usuário admin: admin@cet.gov.br / senha123')


if __name__ == '__main__':
    seed()
