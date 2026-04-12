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
    const por = d.por_status || {};

    const total = Object.values(por).reduce((a, b) => a + b, 0);
    document.getElementById('s-total').textContent      = total;
    document.getElementById('s-confirmados').textContent = por.doador_confirmado ?? 0;
    document.getElementById('s-rondas').textContent     = d.total_rondas ?? 0;
    document.getElementById('s-leitos').textContent     = d.total_leitos_visitados ?? 0;

    const confirmados = por.doador_confirmado ?? 0;
    const potenciais  = (por.potencial_doador ?? 0) + (por.em_avaliacao ?? 0) + confirmados + (por.nao_doador ?? 0);
    const conv = potenciais > 0 ? ((confirmados / potenciais) * 100).toFixed(1) + '%' : '—';
    document.getElementById('s-conv').textContent = conv;

    // Barras por status
    const statusList = [
      { key: 'potencial_doador',  label: 'Potencial Doador',  cor: '#2980b9' },
      { key: 'em_avaliacao',      label: 'Em Avaliação',      cor: '#f39c12' },
      { key: 'doador_confirmado', label: 'Doador Confirmado', cor: '#17a589' },
      { key: 'nao_doador',        label: 'Não Doador',        cor: '#e74c3c' },
      { key: 'arquivado',         label: 'Arquivado',         cor: '#95a5a6' },
    ];
    const maxVal = Math.max(1, ...statusList.map(s => por[s.key] ?? 0));
    const barras = document.getElementById('status-bars');
    barras.innerHTML = statusList.map(s => {
      const val  = por[s.key] ?? 0;
      const pct  = ((val / maxVal) * 100).toFixed(1);
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
        <td>${esc(e.edot_nome || e.nome || '—')}</td>
        <td>${esc(e.opo_sigla || e.opo_nome || '—')}</td>
        <td>${e.ativos ?? 0}</td>
        <td>${e.doadores_confirmados ?? e.confirmados ?? 0}</td>
        <td>${e.total_rondas ?? e.rondas ?? 0}</td>
        <td>${e.total_leitos ?? e.leitos ?? 0}</td>
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
