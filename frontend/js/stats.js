/**
 * stats.js — Página de estatísticas
 */

exigirLogin();

const usuario = Api.getUsuario();
const perfil  = usuario?.perfil || '';

document.getElementById('sidebar-nome').textContent  = usuario?.nome  || '—';
document.getElementById('sidebar-perfil').textContent = labelPerfil(perfil);

if (perfil === 'cet_admin') {
  document.getElementById('nav-admin').style.display = '';
}

// Redirecionar se não tiver acesso
if (!['cet_admin','opo_auditor'].includes(perfil)) {
  window.location.href = '/dashboard';
}

function labelPerfil(p) {
  const m = { cet_admin:'CET Admin', opo_auditor:'OPO Auditor', edot_coord:'Coordenador EDOT', edot_membro:'Membro EDOT' };
  return m[p] || p;
}

// ── Carregar stats gerais ───────────────────────────────────────────────────
async function carregarStats(dias) {
  try {
    const d = await Api.dashboardStats(dias);
    const por = d.pacientes_por_status || {};

    const total = Object.values(por).reduce((a, b) => a + b, 0);
    document.getElementById('s-total').textContent       = d.total_pacientes_ativos ?? total;
    document.getElementById('s-confirmados').textContent = por.me_com_doacao ?? 0;
    document.getElementById('s-rondas').textContent      = d.rondas_no_periodo      ?? 0;
    document.getElementById('s-leitos').textContent      = d.total_leitos_visitados  ?? 0;

    // Taxa de conversão: M.E. Com Doação / total de M.E. confirmados (com ou sem doação)
    const totalMe = (por.me_confirmado ?? 0) + (por.me_com_doacao ?? 0) + (por.me_sem_doacao ?? 0);
    const conv = totalMe > 0
      ? (((por.me_com_doacao ?? 0) / totalMe) * 100).toFixed(1) + '%'
      : '—';
    document.getElementById('s-conv').textContent = conv;

    // Barras por status
    const statusList = [
      { key: 'sedacao_continua',   label: 'Sedação Contínua',          cor: '#1a6fa3' },
      { key: 'sedacao_pausada',    label: 'Sedação Pausada',            cor: '#b26a00' },
      { key: 'protocolo_me',       label: 'Protocolo M.E. em Andamento',cor: '#7b2fa8' },
      { key: 'me_sem_confirmacao', label: 'M.E. Sem Confirmação',       cor: '#5d6d7e' },
      { key: 'me_confirmado',      label: 'M.E. Confirmado',            cor: '#9a5c00' },
      { key: 'me_com_doacao',      label: 'M.E. Com Doação',            cor: '#1a6b3c' },
      { key: 'me_sem_doacao',      label: 'M.E. Sem Doação',            cor: '#c0392b' },
    ];
    const maxVal = Math.max(1, ...statusList.map(s => por[s.key] ?? 0));
    const barras = document.getElementById('status-bars');
    barras.innerHTML = statusList.map(s => {
      const val = por[s.key] ?? 0;
      const pct = ((val / maxVal) * 100).toFixed(1);
      return `
        <div class="barra-status">
          <div class="barra-status-label">${s.label}</div>
          <div class="barra-status-trilho">
            <div class="barra-status-fill" style="width:${pct}%;background:${s.cor}"></div>
          </div>
          <div class="barra-status-valor">${val}</div>
        </div>`;
    }).join('');
  } catch(e) {
    console.error('Erro stats', e);
  }
}

// ── Tabela comparativa por EDOT ─────────────────────────────────────────────
async function carregarEdots() {
  const loading = document.getElementById('loading-edots');
  const wrapper = document.getElementById('wrapper-edots');
  try {
    const dados = await Api.statsEdots();
    const itens = dados.edots || dados || [];
    loading.style.display = 'none';
    if (!itens.length) { loading.textContent = 'Sem dados.'; loading.style.display = ''; return; }
    wrapper.style.display = '';
    const tbody = document.getElementById('tbody-edots');
    tbody.innerHTML = itens.map(e => `
      <tr>
        <td>${esc(e.edot?.nome || '—')}</td>
        <td>${esc(e.edot?.opo_sigla || e.edot?.opo_nome || '—')}</td>
        <td>${e.pacientes_ativos ?? 0}</td>
        <td>${e.doadores_confirmados ?? 0}</td>
        <td>${e.total_rondas ?? 0}</td>
        <td>${e.total_leitos ?? 0}</td>
      </tr>`).join('');
  } catch(e) {
    loading.textContent = 'Erro ao carregar dados por EDOT.';
  }
}

function esc(str) {
  if (!str) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Filtro de período ───────────────────────────────────────────────────────
const selDias = document.getElementById('sel-dias');
selDias.addEventListener('change', () => carregarStats(+selDias.value));

// ── Init ────────────────────────────────────────────────────────────────────
carregarStats(30);
carregarEdots();
