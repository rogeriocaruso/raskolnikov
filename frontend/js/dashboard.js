/**
 * dashboard.js — Página principal com estatísticas e listagens rápidas
 */

exigirLogin();

const usuario = Api.getUsuario();
const perfil  = usuario?.perfil || '';

document.getElementById('sidebar-nome').textContent  = usuario?.nome  || '—';
document.getElementById('sidebar-perfil').textContent = labelPerfil(perfil);

// Mostrar links conforme perfil
if (['cet_admin','opo_auditor'].includes(perfil)) {
  document.getElementById('nav-stats').style.display = '';
}
if (perfil === 'cet_admin') {
  document.getElementById('nav-admin').style.display = '';
}

function labelPerfil(p) {
  const m = { cet_admin:'CET Admin', opo_auditor:'OPO Auditor', edot_coord:'Coordenador EDOT', edot_membro:'Membro EDOT' };
  return m[p] || p;
}

// ── Carregar stats ──────────────────────────────────────────────────────────
async function carregarStats(dias) {
  try {
    const d = await Api.dashboardStats(dias);
    const por = d.por_status || {};
    document.getElementById('s-potencial').textContent  = por.potencial_doador  ?? 0;
    document.getElementById('s-confirmado').textContent = por.doador_confirmado  ?? 0;
    document.getElementById('s-avaliacao').textContent  = por.em_avaliacao       ?? 0;
    document.getElementById('s-nao-doador').textContent = por.nao_doador         ?? 0;
    document.getElementById('s-rondas').textContent     = d.total_rondas         ?? 0;
    document.getElementById('s-leitos').textContent     = d.total_leitos_visitados ?? 0;
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
    potencial_doador: ['badge-potencial','Potencial Doador'],
    em_avaliacao:     ['badge-avaliacao','Em Avaliação'],
    doador_confirmado:['badge-confirmado','Confirmado'],
    nao_doador:       ['badge-nao-doador','Não Doador'],
    arquivado:        ['badge-arquivado','Arquivado'],
  };
  const [cls, txt] = m[s] || ['badge-arquivado', s];
  return `<span class="badge ${cls}">${txt}</span>`;
}

function labelTurno(t) {
  return { manha:'Manhã', tarde:'Tarde', noite:'Noite' }[t] || t;
}

// dataFmt e dataHoraFmt definidas globalmente em api.js (fuso América/São_Paulo)

function esc(str) {
  if (!str) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Filtro de período ───────────────────────────────────────────────────────
const selDias = document.getElementById('sel-dias');
selDias.addEventListener('change', () => carregarStats(+selDias.value));

// ── Init ────────────────────────────────────────────────────────────────────
carregarStats(30);
carregarPacientes();
carregarRondas();
