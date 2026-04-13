/**
 * ronda.js — Gerenciamento de rondas
 */

exigirLogin();

const usuario = Api.getUsuario();
const perfil  = usuario?.perfil || '';

document.getElementById('sidebar-nome').textContent  = usuario?.nome  || '—';
document.getElementById('sidebar-perfil').textContent = labelPerfil(perfil);

if (['cet_admin','opo_auditor'].includes(perfil)) {
  document.getElementById('nav-stats').style.display = '';
}
if (perfil === 'cet_admin') {
  document.getElementById('nav-admin').style.display = '';
}

// Somente membros/coord podem iniciar rondas
const podeEscrever = ['cet_admin','edot_coord','edot_membro'].includes(perfil);
if (!podeEscrever) {
  document.getElementById('btn-nova-ronda').style.display = 'none';
}

function labelPerfil(p) {
  const m = { cet_admin:'CET Admin', opo_auditor:'OPO Auditor', edot_coord:'Coordenador EDOT', edot_membro:'Membro EDOT' };
  return m[p] || p;
}

// ── Carregar setores para o modal ───────────────────────────────────────────
async function carregarSetores() {
  const edotId = usuario?.edot_id;
  if (!edotId) return;
  try {
    const resp = await Api.listarSetores(edotId);
    const setores = resp.setores || resp || [];
    const sel = document.getElementById('r-setor');
    setores.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.nome;
      sel.appendChild(opt);
    });
  } catch(e) { /* sem setores */ }
}

// ── Carregar lista de rondas ────────────────────────────────────────────────
async function carregarRondas() {
  const loading = document.getElementById('loading-rondas');
  const wrapper = document.getElementById('wrapper-rondas');
  const vazio   = document.getElementById('sem-rondas');
  try {
    const d = await Api.listarRondas({ per_page: 50 });
    const itens = d.rondas || d.items || d || [];
    loading.style.display = 'none';
    if (!itens.length) { vazio.style.display = ''; return; }
    wrapper.style.display = '';
    const tbody = document.getElementById('tbody-rondas');
    tbody.innerHTML = itens.map(r => {
      const aberta = !r.data_fim;
      const acoes = (podeEscrever && aberta)
        ? `<button class="btn btn-perigo btn-sm" onclick="abrirModalEncerrar(${r.id})">Encerrar</button>`
        : '';
      return `
        <tr>
          <td>${esc(r.edot_nome || r.edot_sigla || '—')}</td>
          <td>${labelTurno(r.turno)}</td>
          <td>${dataHoraFmt(r.data_inicio)}</td>
          <td>${dataHoraFmt(r.data_fim)}</td>
          <td>${r.leitos_visitados ?? '—'}</td>
          <td>${r.potenciais_encontrados ?? '—'}</td>
          <td>${aberta
            ? '<span class="badge badge-avaliacao">Em andamento</span>'
            : '<span class="badge badge-arquivado">Encerrada</span>'}</td>
          <td>${acoes}</td>
        </tr>`;
    }).join('');
  } catch(e) {
    loading.textContent = 'Erro ao carregar rondas.';
  }
}

// ── Modal nova ronda ────────────────────────────────────────────────────────
document.getElementById('btn-nova-ronda').addEventListener('click', () => {
  if (!usuario?.edot_id) {
    alert('Seu usuário não está vinculado a uma EDOT. Peça ao administrador para corrigir seu cadastro e faça login novamente.');
    return;
  }
  document.getElementById('form-ronda').reset();
  document.getElementById('alerta-ronda').className = 'alerta';
  document.getElementById('modal-ronda').style.display = 'flex';
});

function fecharModal() {
  document.getElementById('modal-ronda').style.display = 'none';
}
window.fecharModal = fecharModal;

document.getElementById('form-ronda').addEventListener('submit', async e => {
  e.preventDefault();
  const btn     = document.getElementById('btn-iniciar');
  const spinner = document.getElementById('spinner-ronda');
  const alerta  = document.getElementById('alerta-ronda');
  alerta.className = 'alerta';

  const turno   = document.getElementById('r-turno').value;
  const setorId = document.getElementById('r-setor').value || null;
  const obs     = document.getElementById('r-obs').value.trim() || null;

  btn.disabled = true;
  spinner.style.display = 'inline-block';
  try {
    await Api.iniciarRonda({ turno, setor_id: setorId ? +setorId : null, observacoes: obs });
    fecharModal();
    carregarRondas();
  } catch(err) {
    alerta.textContent = err.erro || err.message || 'Erro ao iniciar ronda.';
    alerta.className = 'alerta alerta-erro visivel';
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
});

// ── Modal encerrar ronda ────────────────────────────────────────────────────
function abrirModalEncerrar(id) {
  document.getElementById('encerrar-id').value = id;
  document.getElementById('form-encerrar').reset();
  document.getElementById('alerta-encerrar').className = 'alerta';
  document.getElementById('modal-encerrar').style.display = 'flex';
}
window.abrirModalEncerrar = abrirModalEncerrar;

function fecharModalEncerrar() {
  document.getElementById('modal-encerrar').style.display = 'none';
}
window.fecharModalEncerrar = fecharModalEncerrar;

document.getElementById('form-encerrar').addEventListener('submit', async e => {
  e.preventDefault();
  const btn     = document.getElementById('btn-encerrar');
  const spinner = document.getElementById('spinner-encerrar');
  const alerta  = document.getElementById('alerta-encerrar');
  alerta.className = 'alerta';

  const id      = +document.getElementById('encerrar-id').value;
  const leitos  = +document.getElementById('e-leitos').value;
  const pot     = +document.getElementById('e-potenciais').value;
  const obs     = document.getElementById('e-obs').value.trim() || null;

  btn.disabled = true;
  spinner.style.display = 'inline-block';
  try {
    await Api.encerrarRonda(id, { leitos_visitados: leitos, potenciais_encontrados: pot, observacoes: obs });
    fecharModalEncerrar();
    carregarRondas();
  } catch(err) {
    alerta.textContent = err.erro || err.message || 'Erro ao encerrar ronda.';
    alerta.className = 'alerta alerta-erro visivel';
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function labelTurno(t) { return { manha:'Manhã', tarde:'Tarde', noite:'Noite' }[t] || t; }

function dataHoraFmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function esc(str) {
  if (!str) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ────────────────────────────────────────────────────────────────────
carregarSetores();
carregarRondas();
