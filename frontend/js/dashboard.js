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
if (['cet_admin','opo_auditor'].includes(perfil)) {
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
    const por = d.pacientes_por_status || {};
    document.getElementById('s-sedacao').textContent     = (por.sedacao_continua ?? 0) + (por.sedacao_pausada ?? 0);
    document.getElementById('s-protocolo').textContent   = por.protocolo_me        ?? 0;
    document.getElementById('s-me-confirmado').textContent = por.me_confirmado     ?? 0;
    document.getElementById('s-com-doacao').textContent  = por.me_com_doacao       ?? 0;
    document.getElementById('s-rondas').textContent      = d.rondas_no_periodo     ?? 0;
    document.getElementById('s-leitos').textContent      = d.total_leitos_visitados ?? 0;
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
    me_sem_doacao:      ['badge-me-sem-doacao',    'M.E. Sem Doação'],
    arquivado:          ['badge-arquivado',         'Arquivado'],
  };
  const [cls, txt] = m[s] || ['badge-arquivado', s];
  return `<span class="badge ${cls}">${txt}</span>`;
}

function labelTurno(t) {
  return { manha:'Manhã', tarde:'Tarde', noite:'Noite', plantao:'Plantão' }[t] || t;
}

// dataFmt e dataHoraFmt definidas globalmente em api.js (fuso América/São_Paulo)

function esc(str) {
  if (!str) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Carregar entrevistas (resumo) ───────────────────────────────────────────
async function carregarStatsEntrevistas(dias) {
  try {
    const d = await Api.request(`/entrevistas/stats?dias=${dias}`);
    const el = document.getElementById('resumo-entrevistas');
    if (!el) return;
    el.innerHTML = `
      <div class="card-titulo">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        Entrevistas Familiares — Tecidos <span style="font-size:.75rem;font-weight:400;color:var(--texto-leve)">(${dias} dias)</span>
      </div>
      <div style="display:flex;gap:2rem;flex-wrap:wrap;margin-top:.5rem">
        <div><span style="font-size:1.6rem;font-weight:700;color:var(--texto)">${d.total}</span><br><span style="font-size:.8rem;color:var(--texto-leve)">Total</span></div>
        <div><span style="font-size:1.6rem;font-weight:700;color:var(--verde)">${d.autorizacoes}</span><br><span style="font-size:.8rem;color:var(--texto-leve)">Autorizações</span></div>
        <div><span style="font-size:1.6rem;font-weight:700;color:var(--perigo)">${d.nafs}</span><br><span style="font-size:.8rem;color:var(--texto-leve)">NAF</span></div>
      </div>
      <div style="margin-top:.75rem">
        <a href="/entrevista" class="btn btn-secundario btn-sm">Ver registros →</a>
      </div>`;
  } catch (_) {}
}

// ── Filtro de período ───────────────────────────────────────────────────────
const selDias = document.getElementById('sel-dias');
selDias.addEventListener('change', () => {
  carregarStats(+selDias.value);
  carregarStatsEntrevistas(+selDias.value);
});

// ── Init ────────────────────────────────────────────────────────────────────
carregarStats(30);
carregarPacientes();
carregarRondas();
carregarStatsEntrevistas(30);
