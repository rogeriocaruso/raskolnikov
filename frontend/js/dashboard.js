/**
 * dashboard.js — Página principal com indicadores escalados por perfil
 */

exigirLogin();

const usuario = Api.getUsuario();
const perfil  = usuario?.perfil || '';

document.getElementById('sidebar-nome').textContent  = usuario?.nome  || '—';
document.getElementById('sidebar-perfil').textContent = labelPerfil(perfil);

if (['cet_admin','opo_auditor'].includes(perfil)) {
  document.getElementById('nav-stats').style.display = '';
}
if (['cet_admin','opo_auditor'].includes(perfil)) {
  document.getElementById('nav-admin').style.display = '';
}

function labelPerfil(p) {
  const m = { cet_admin:'CET Admin', opo_auditor:'OPO Auditor', edot_coord:'Coordenador EDOT', edot_membro:'Membro EDOT' };
  return m[p] || p;
}

// ── Helpers de formatação ───────────────────────────────────────────────────
function fmtTaxa(val) {
  return val != null ? val + '%' : '—';
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '—';
}

// ── Indicadores ─────────────────────────────────────────────────────────────
async function carregarStats(dias) {
  try {
    const d = await Api.dashboardStats(dias);

    // Captação de Órgãos
    set('s-possiveis',    d.possiveis_doadores);
    set('s-notif-me',     d.notificacoes_me);
    set('s-me-doacao',    d.me_com_doacao);
    set('s-taxa-efetiv',  fmtTaxa(d.taxa_efetivacao));

    // Desfechos sem Doação
    set('s-pcr',       d.total_pcr);
    set('s-taxa-pcr',  fmtTaxa(d.taxa_pcr));
    set('s-naf',       d.total_naf);
    set('s-taxa-naf',  fmtTaxa(d.taxa_naf));
    set('s-cim',       d.total_cim);
    set('s-taxa-cim',  fmtTaxa(d.taxa_cim));

    // Tecidos — BTOH
    set('s-entrev-total',  d.total_entrevistas);
    set('s-entrev-autor',  d.autorizacoes_btoh);
    set('s-taxa-btoh',     fmtTaxa(d.taxa_btoh));

    // Operacional (período)
    set('s-rondas',  d.rondas_no_periodo);
    set('s-leitos',  d.total_leitos_visitados);
  } catch(e) {
    console.error('Erro ao carregar stats', e);
  }
}

// ── Carregar pacientes ativos ───────────────────────────────────────────────
async function carregarPacientes() {
  const loading = document.getElementById('loading-pacientes');
  const wrapper = document.getElementById('wrapper-pacientes');
  const vazio   = document.getElementById('sem-pacientes');
  try {
    const d = await Api.listarPacientes({ per_page: 10 });
    const itens = d.pacientes || d.items || d || [];
    loading.style.display = 'none';
    if (!itens.length) { vazio.style.display = ''; return; }
    wrapper.style.display = '';
    const tbody = document.getElementById('tbody-pacientes');
    tbody.innerHTML = itens.map(p => `
      <tr>
        <td>${esc(p.nome)}</td>
        <td>${esc(p.prontuario)}</td>
        <td>${badgeStatus(p.status)}</td>
        <td>${esc(p.edot_sigla || p.edot_nome || '—')}</td>
        <td>${dataFmt(p.data_internacao)}</td>
        <td><a href="/paciente?id=${p.id}" class="btn btn-secundario btn-sm">Ver</a></td>
      </tr>`).join('');
  } catch(e) {
    loading.textContent = 'Erro ao carregar pacientes.';
  }
}

// ── Carregar rondas recentes ────────────────────────────────────────────────
async function carregarRondas() {
  const loading = document.getElementById('loading-rondas');
  const wrapper = document.getElementById('wrapper-rondas');
  const vazio   = document.getElementById('sem-rondas');
  try {
    const d = await Api.listarRondas({ per_page: 10 });
    const itens = d.rondas || d.items || d || [];
    loading.style.display = 'none';
    if (!itens.length) { vazio.style.display = ''; return; }
    wrapper.style.display = '';
    const tbody = document.getElementById('tbody-rondas');
    tbody.innerHTML = itens.map(r => `
      <tr>
        <td>${esc(r.edot_nome || r.edot_sigla || '—')}</td>
        <td>${labelTurno(r.turno)}</td>
        <td>${dataHoraFmt(r.data_inicio)}</td>
        <td>${r.leitos_visitados ?? '—'}</td>
        <td>${r.potenciais_encontrados ?? '—'}</td>
        <td>${r.data_fim
          ? '<span class="badge badge-arquivado">Encerrada</span>'
          : '<span class="badge badge-avaliacao">Em andamento</span>'}</td>
      </tr>`).join('');
  } catch(e) {
    loading.style.display = 'none';
    vazio.style.display = '';
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function badgeStatus(s) {
  const m = {
    sedacao_continua:   ['badge-sedacao-continua', 'Sedação Contínua'],
    sedacao_pausada:    ['badge-sedacao-pausada',  'Sedação Pausada'],
    acompanhamento:     ['badge-acompanhamento',   'Acompanhamento'],
    protocolo_me:       ['badge-protocolo-me',     'Protocolo M.E.'],
    me_sem_confirmacao: ['badge-me-sem-conf',      'M.E. Sem Confirmação'],
    me_confirmado:      ['badge-me-confirmado',    'M.E. Confirmado'],
    me_com_doacao:      ['badge-me-com-doacao',    'M.E. Com Doação'],
    me_cim:             ['badge-me-cim',           'M.E. — C.I.M.'],
    me_naf:             ['badge-me-naf',           'M.E. — N.A.F.'],
    pcr_antes_doacao:   ['badge-pcr-antes-doacao', 'PCR antes da Doação'],
    arquivado:          ['badge-arquivado',         'Arquivado'],
  };
  const [cls, txt] = m[s] || ['badge-arquivado', s];
  return `<span class="badge ${cls}">${txt}</span>`;
}

function labelTurno(t) {
  return { manha:'Manhã', tarde:'Tarde', noite:'Noite', plantao:'Plantão' }[t] || t;
}

function esc(str) {
  if (!str) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Filtro de período (afeta apenas métricas operacionais) ─────────────────
const selDias = document.getElementById('sel-dias');
selDias.addEventListener('change', () => carregarStats(+selDias.value));

// ── Init ────────────────────────────────────────────────────────────────────
carregarStats(30);
carregarPacientes();
carregarRondas();
