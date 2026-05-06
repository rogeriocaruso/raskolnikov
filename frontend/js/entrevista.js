'use strict';

// ── Estado ──────────────────────────────────────────────────────────────────
let entrevistaAtual = null;
let paginaAtual     = 1;
let totalPaginas    = 1;
let filtroAtual     = { resultado: '', arquivado: false, search: '' };

const usuario = Api.getUsuario();
const perfil  = usuario?.perfil || '';
const podeEscrever = ['edot_coord', 'edot_membro'].includes(perfil);

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!Api.getToken()) { window.location.href = '/'; return; }

  // sidebar
  const sn = document.getElementById('sidebar-nome');
  const sp = document.getElementById('sidebar-perfil');
  if (sn) sn.textContent = usuario?.nome || '—';
  if (sp) sp.textContent = perfil;

  const navStats = document.getElementById('nav-stats');
  const navAdmin = document.getElementById('nav-admin');
  if (navStats && ['cet_admin','opo_auditor'].includes(perfil)) navStats.style.display = '';
  if (navAdmin && perfil === 'cet_admin') navAdmin.style.display = '';

  // botão novo
  const btnNovo = document.getElementById('btn-nova-entrevista');
  if (btnNovo) {
    if (podeEscrever) btnNovo.addEventListener('click', abrirFormNovo);
    else btnNovo.style.display = 'none';
  }

  document.getElementById('btn-voltar')?.addEventListener('click', voltarLista);
  document.getElementById('btn-cancelar-form')?.addEventListener('click', voltarLista);
  document.getElementById('btn-buscar')?.addEventListener('click', () => buscar(1));
  document.getElementById('btn-anterior')?.addEventListener('click', () => buscar(paginaAtual - 1));
  document.getElementById('btn-proximo')?.addEventListener('click',  () => buscar(paginaAtual + 1));
  document.getElementById('filtro-arquivado')?.addEventListener('change', () => buscar(1));
  document.getElementById('filtro-resultado')?.addEventListener('change', () => buscar(1));
  document.getElementById('form-entrevista')?.addEventListener('submit', salvar);
  document.getElementById('btn-arquivar')?.addEventListener('click', abrirModalArquivar);
  document.getElementById('btn-confirmar-arquivar')?.addEventListener('click', confirmarArquivar);

  carregarStats();
  buscar(1);
});

// ── Estatísticas ─────────────────────────────────────────────────────────────
async function carregarStats() {
  try {
    const d = await Api.request('/entrevistas/stats?dias=30');
    setText('s-total',        d.total);
    setText('s-autorizacoes', d.autorizacoes);
    setText('s-nafs',         d.nafs);
    const taxa = d.total > 0 ? Math.round((d.autorizacoes / d.total) * 100) + '%' : '—';
    setText('s-taxa',         taxa);
  } catch (_) {}
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '—';
}

// ── Lista ────────────────────────────────────────────────────────────────────
async function buscar(pagina = 1) {
  paginaAtual = pagina;
  filtroAtual.resultado  = document.getElementById('filtro-resultado')?.value || '';
  filtroAtual.arquivado  = document.getElementById('filtro-arquivado')?.value === 'true';
  filtroAtual.search     = document.getElementById('busca')?.value.trim() || '';

  mostrarView('lista');
  const loading  = document.getElementById('loading-entrevistas');
  const wrapper  = document.getElementById('wrapper-entrevistas');
  const semEl    = document.getElementById('sem-entrevistas');
  const pagEl    = document.getElementById('paginacao');
  if (loading)  loading.style.display  = '';
  if (wrapper)  wrapper.style.display  = 'none';
  if (semEl)    semEl.style.display    = 'none';
  if (pagEl)    pagEl.style.display    = 'none';

  try {
    const params = new URLSearchParams({
      page: pagina,
      per_page: 20,
      resultado: filtroAtual.resultado,
      arquivado: filtroAtual.arquivado,
      search: filtroAtual.search,
    });
    const d = await Api.request(`/entrevistas/?${params}`);
    totalPaginas = d.pages || 1;
    if (loading) loading.style.display = 'none';

    if (!d.entrevistas?.length) {
      if (semEl) semEl.style.display = '';
      return;
    }

    const tbody = document.getElementById('tbody-entrevistas');
    if (!tbody) return;
    tbody.innerHTML = '';
    d.entrevistas.forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${e.iniciais}</td>
        <td>${e.prontuario}</td>
        <td>${e.idade ?? '—'}</td>
        <td>${fmtDt(e.data_obito)}</td>
        <td>${e.diagnostico || '—'}</td>
        <td>${badgeResultado(e.resultado)}</td>
        <td>${e.arquivado ? '<span style="color:var(--texto-leve);font-size:.8rem">Arquivado</span>' : ''}</td>
        <td><button class="btn btn-secundario btn-sm" onclick="abrirDetalhe(${e.id})">Ver</button></td>
      `;
      tbody.appendChild(tr);
    });

    if (wrapper) wrapper.style.display = '';
    renderPaginacao(pagina, totalPaginas, d.total);
  } catch (err) {
    if (loading) loading.textContent = 'Erro ao carregar.';
    console.error(err);
  }
}

function renderPaginacao(pagina, total, count) {
  const pagEl   = document.getElementById('paginacao');
  const infoEl  = document.getElementById('info-pagina');
  const btnAnt  = document.getElementById('btn-anterior');
  const btnProx = document.getElementById('btn-proximo');
  if (!pagEl) return;
  pagEl.style.display = total > 1 ? 'flex' : 'none';
  if (infoEl)  infoEl.textContent  = `Página ${pagina} de ${total} (${count} registros)`;
  if (btnAnt)  btnAnt.disabled     = pagina <= 1;
  if (btnProx) btnProx.disabled    = pagina >= total;
}

// ── Formulário ───────────────────────────────────────────────────────────────
function abrirFormNovo() {
  entrevistaAtual = null;
  document.getElementById('form-titulo').textContent = 'Nova Entrevista';
  document.getElementById('form-entrevista').reset();
  document.getElementById('e-id').value = '';

  // pré-preencher edot_id
  document.getElementById('e-edot-id').value = usuario?.edot_id || '';

  // data/hora entrevista = agora
  const agora = new Date();
  const local = agora.toISOString().slice(0, 16);
  document.getElementById('e-data-entrevista').value = local;

  document.getElementById('btn-arquivar-form').style.display = 'none';
  document.getElementById('alerta-form').className = 'alerta';
  document.getElementById('alerta-form').textContent = '';
  mostrarView('form');
}

async function abrirDetalhe(id) {
  try {
    const d = await Api.request(`/entrevistas/${id}`);
    const e = d.entrevista;
    entrevistaAtual = e;

    document.getElementById('form-titulo').textContent = 'Editar Entrevista';
    document.getElementById('e-id').value = e.id;
    document.getElementById('e-edot-id').value = e.edot_id;
    document.getElementById('e-iniciais').value = e.iniciais || '';
    document.getElementById('e-prontuario').value = e.prontuario || '';
    document.getElementById('e-idade').value = e.idade ?? '';
    document.getElementById('e-diagnostico').value = e.diagnostico || '';
    document.getElementById('e-local-obito').value = e.local_obito || '';
    document.getElementById('e-data-obito').value = e.data_obito ? e.data_obito.slice(0, 16) : '';
    document.getElementById('e-data-entrevista').value = e.data_entrevista ? e.data_entrevista.slice(0, 16) : '';
    document.getElementById('e-resultado').value = e.resultado || '';
    document.getElementById('e-tecidos').value = e.tecidos || '';
    document.getElementById('e-obs').value = e.observacoes || '';

    const btnArq = document.getElementById('btn-arquivar-form');
    btnArq.style.display = (!e.arquivado && podeEscrever) ? '' : 'none';

    // campos editáveis somente se pode escrever e não arquivado
    const soLeitura = !podeEscrever || e.arquivado;
    ['e-iniciais','e-prontuario','e-idade','e-diagnostico','e-local-obito',
     'e-data-obito','e-data-entrevista','e-resultado','e-tecidos','e-obs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = soLeitura;
    });
    const submitBtn = document.querySelector('#form-entrevista [type=submit]');
    if (submitBtn) submitBtn.style.display = soLeitura ? 'none' : '';

    document.getElementById('alerta-form').className = 'alerta';
    document.getElementById('alerta-form').textContent = '';
    mostrarView('form');
  } catch (err) {
    console.error(err);
  }
}

async function salvar(ev) {
  ev.preventDefault();
  const alertEl = document.getElementById('alerta-form');
  const spinner = document.getElementById('spinner-form');
  const btnTxt  = document.getElementById('btn-form-texto');
  alertEl.className = 'alerta';
  alertEl.textContent = '';
  if (spinner) spinner.style.display = '';
  if (btnTxt)  btnTxt.textContent = 'Salvando...';

  const id = document.getElementById('e-id').value;
  const payload = {
    edot_id:        parseInt(document.getElementById('e-edot-id').value),
    iniciais:       document.getElementById('e-iniciais').value.trim(),
    prontuario:     document.getElementById('e-prontuario').value.trim(),
    idade:          parseInt(document.getElementById('e-idade').value) || null,
    diagnostico:    document.getElementById('e-diagnostico').value.trim(),
    local_obito:    document.getElementById('e-local-obito').value.trim(),
    data_obito:     document.getElementById('e-data-obito').value || null,
    data_entrevista:document.getElementById('e-data-entrevista').value || null,
    resultado:      document.getElementById('e-resultado').value,
    tecidos:        document.getElementById('e-tecidos').value.trim(),
    observacoes:    document.getElementById('e-obs').value.trim(),
  };

  try {
    if (id) {
      await Api.request(`/entrevistas/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await Api.request('/entrevistas/', { method: 'POST', body: JSON.stringify(payload) });
    }
    carregarStats();
    buscar(paginaAtual);
  } catch (err) {
    alertEl.className = 'alerta alerta-erro';
    alertEl.textContent = err.message || 'Erro ao salvar.';
  } finally {
    if (spinner) spinner.style.display = 'none';
    if (btnTxt)  btnTxt.textContent = 'Salvar';
  }
}

// ── Arquivar ──────────────────────────────────────────────────────────────────
function abrirModalArquivar() {
  document.getElementById('alerta-arquivar').className = 'alerta';
  document.getElementById('alerta-arquivar').textContent = '';
  document.getElementById('modal-arquivar').style.display = 'flex';
}

function fecharModalArquivar() {
  document.getElementById('modal-arquivar').style.display = 'none';
}
window.fecharModalArquivar = fecharModalArquivar;

async function confirmarArquivar() {
  const alertEl = document.getElementById('alerta-arquivar');
  try {
    await Api.request(`/entrevistas/${entrevistaAtual.id}/arquivar`, { method: 'POST' });
    fecharModalArquivar();
    carregarStats();
    buscar(paginaAtual);
  } catch (err) {
    alertEl.className = 'alerta alerta-erro';
    alertEl.textContent = err.message || 'Erro ao arquivar.';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mostrarView(view) {
  document.getElementById('view-lista').style.display = view === 'lista' ? '' : 'none';
  document.getElementById('view-form').style.display  = view === 'form'  ? '' : 'none';
}

function voltarLista() {
  entrevistaAtual = null;
  mostrarView('lista');
}

function badgeResultado(resultado) {
  if (resultado === 'autorizacao')
    return '<span class="badge badge-me-com-doacao">Autorização</span>';
  if (resultado === 'naf')
    return '<span class="badge badge-me-sem-doacao">NAF</span>';
  return resultado;
}

function fmtDt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

window.abrirDetalhe = abrirDetalhe;
window.abrirFormNovo = abrirFormNovo;
