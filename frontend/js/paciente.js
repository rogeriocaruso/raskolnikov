/**
 * paciente.js — Listagem e formulário de pacientes
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

const podeEscrever = ['cet_admin','edot_coord','edot_membro'].includes(perfil);
if (!podeEscrever) {
  document.getElementById('btn-novo-paciente').style.display = 'none';
}

function labelPerfil(p) {
  const m = { cet_admin:'CET Admin', opo_auditor:'OPO Auditor', edot_coord:'Coordenador EDOT', edot_membro:'Membro EDOT' };
  return m[p] || p;
}

// ── Estado ──────────────────────────────────────────────────────────────────
let pagina = 1;
let totalPaginas = 1;
let pacienteAtual = null;

// ── Lista de pacientes ──────────────────────────────────────────────────────
async function carregarPacientes() {
  const loading = document.getElementById('loading-pacientes');
  const wrapper = document.getElementById('wrapper-pacientes');
  const vazio   = document.getElementById('sem-pacientes');
  const pag     = document.getElementById('paginacao');

  loading.style.display = '';
  wrapper.style.display = 'none';
  vazio.style.display   = 'none';

  const params = {
    page: pagina,
    per_page: 20,
  };
  const busca  = document.getElementById('busca').value.trim();
  const status = document.getElementById('filtro-status').value;
  if (busca)  params.search = busca;
  if (status) params.status = status;

  try {
    const d = await Api.listarPacientes(params);
    const itens = d.pacientes || d.items || [];
    totalPaginas = d.pages || 1;
    pagina = d.page || 1;

    loading.style.display = 'none';
    if (!itens.length) { vazio.style.display = ''; return; }
    wrapper.style.display = '';

    const tbody = document.getElementById('tbody-pacientes');
    tbody.innerHTML = itens.map(p => `
      <tr>
        <td>${esc(p.nome)}</td>
        <td>${esc(p.prontuario)}</td>
        <td>${dataFmt(p.data_nascimento)}</td>
        <td>${badgeStatus(p.status)}</td>
        <td>${esc(p.setor_nome || '—')}</td>
        <td>${dataFmt(p.data_internacao)}</td>
        <td>
          <button class="btn btn-secundario btn-sm" onclick="abrirPaciente(${p.id})">
            ${podeEscrever ? 'Editar' : 'Ver'}
          </button>
        </td>
      </tr>`).join('');

    // Paginação
    const infoEl = document.getElementById('info-pagina');
    infoEl.textContent = `Página ${pagina} de ${totalPaginas} (${d.total || itens.length} pacientes)`;
    document.getElementById('btn-anterior').disabled = pagina <= 1;
    document.getElementById('btn-proximo').disabled  = pagina >= totalPaginas;
    pag.style.display = totalPaginas > 1 ? 'flex' : 'none';
  } catch(e) {
    loading.textContent = 'Erro ao carregar pacientes.';
  }
}

window.abrirPaciente = async function(id) {
  try {
    const p = await Api.obterPaciente(id);
    preencherForm(p);
    mostrarForm();
    await carregarHistorico(id);
  } catch(e) {
    alert('Erro ao carregar paciente.');
  }
};

// ── Formulário ──────────────────────────────────────────────────────────────
function mostrarForm() {
  document.getElementById('view-lista').style.display = 'none';
  document.getElementById('view-form').style.display = '';
}

function mostrarLista() {
  document.getElementById('view-lista').style.display = '';
  document.getElementById('view-form').style.display = 'none';
  pacienteAtual = null;
  carregarPacientes();
}

function preencherForm(p) {
  pacienteAtual = p;
  document.getElementById('form-titulo').textContent = p ? 'Editar Paciente' : 'Novo Paciente';
  document.getElementById('p-id').value         = p?.id || '';
  document.getElementById('p-nome').value       = p?.nome || '';
  document.getElementById('p-prontuario').value = p?.prontuario || '';
  document.getElementById('p-nascimento').value = p?.data_nascimento?.slice(0,10) || '';
  document.getElementById('p-internacao').value = p?.data_internacao?.slice(0,10) || '';
  document.getElementById('p-status').value     = p?.status || 'potencial_doador';
  document.getElementById('p-causa').value      = p?.causa_morte || '';
  document.getElementById('p-obs').value        = p?.observacoes || '';

  const btnArq = document.getElementById('btn-arquivar');
  if (p && p.status !== 'arquivado' && podeEscrever) {
    btnArq.style.display = '';
  } else {
    btnArq.style.display = 'none';
  }

  // Desabilitar formulário para leitura
  const campos = document.getElementById('form-paciente').querySelectorAll('input,select,textarea');
  campos.forEach(el => el.disabled = !podeEscrever);
  document.getElementById('form-paciente').querySelector('button[type=submit]').style.display = podeEscrever ? '' : 'none';
}

document.getElementById('btn-novo-paciente').addEventListener('click', () => {
  preencherForm(null);
  document.getElementById('card-historico').style.display = 'none';
  mostrarForm();
  carregarSetoresForm();
});

document.getElementById('btn-voltar').addEventListener('click', mostrarLista);
document.getElementById('btn-cancelar-form').addEventListener('click', mostrarLista);

// Carregar setores para o formulário
async function carregarSetoresForm(setorAtual) {
  const sel = document.getElementById('p-setor');
  sel.innerHTML = '<option value="">Selecione o setor...</option>';
  const edotId = usuario?.edot_id || pacienteAtual?.edot_id;
  if (!edotId) return;
  try {
    const resp = await Api.listarSetores(edotId);
    const setores = resp.setores || resp || [];
    setores.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.nome;
      if (setorAtual && s.id === setorAtual) opt.selected = true;
      sel.appendChild(opt);
    });
    if (pacienteAtual?.setor_id) sel.value = pacienteAtual.setor_id;
  } catch(e) { /* sem setores */ }
}

// Submeter formulário
document.getElementById('form-paciente').addEventListener('submit', async e => {
  e.preventDefault();
  const btn     = document.getElementById('form-paciente').querySelector('button[type=submit]');
  const spinner = document.getElementById('spinner-form');
  const alerta  = document.getElementById('alerta-form');
  alerta.className = 'alerta';

  const id = document.getElementById('p-id').value;
  const dados = {
    nome:            document.getElementById('p-nome').value.trim(),
    prontuario:      document.getElementById('p-prontuario').value.trim(),
    edot_id:         pacienteAtual?.edot_id || usuario?.edot_id,
    status:          document.getElementById('p-status').value,
    causa_morte:     document.getElementById('p-causa').value.trim() || null,
    observacoes:     document.getElementById('p-obs').value.trim() || null,
    data_nascimento: document.getElementById('p-nascimento').value || null,
    data_internacao: document.getElementById('p-internacao').value || null,
    setor_id:        document.getElementById('p-setor').value ? +document.getElementById('p-setor').value : null,
  };

  btn.disabled = true;
  spinner.style.display = 'inline-block';
  try {
    if (id) {
      await Api.atualizarPaciente(+id, dados);
    } else {
      await Api.criarPaciente(dados);
    }
    mostrarLista();
  } catch(err) {
    alerta.textContent = err.erro || err.message || 'Erro ao salvar paciente.';
    alerta.className = 'alerta alerta-erro visivel';
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
});

// Carregar setores ao abrir paciente existente
async function abrirPacienteComSetores(p) {
  await carregarSetoresForm(p.setor_id);
}

// Override abrirPaciente para carregar setores também
window.abrirPaciente = async function(id) {
  try {
    const p = await Api.obterPaciente(id);
    preencherForm(p);
    mostrarForm();
    await carregarSetoresForm(p.setor_id);
    await carregarHistorico(id);
  } catch(e) {
    alert('Erro ao carregar paciente.');
  }
};

// ── Arquivar ────────────────────────────────────────────────────────────────
document.getElementById('btn-arquivar').addEventListener('click', () => {
  document.getElementById('motivo-arquivar').value = '';
  document.getElementById('alerta-arquivar').className = 'alerta';
  document.getElementById('modal-arquivar').style.display = 'flex';
});

window.fecharModalArquivar = function() {
  document.getElementById('modal-arquivar').style.display = 'none';
};

document.getElementById('btn-confirmar-arquivar').addEventListener('click', async () => {
  const motivo = document.getElementById('motivo-arquivar').value;
  const alerta = document.getElementById('alerta-arquivar');
  if (!motivo) {
    alerta.textContent = 'Selecione o motivo.';
    alerta.className = 'alerta alerta-erro visivel';
    return;
  }
  const id = +document.getElementById('p-id').value;
  try {
    await Api.arquivarPaciente(id, motivo);
    fecharModalArquivar();
    mostrarLista();
  } catch(err) {
    alerta.textContent = err.erro || err.message || 'Erro ao arquivar.';
    alerta.className = 'alerta alerta-erro visivel';
  }
});

// ── Histórico ───────────────────────────────────────────────────────────────
async function carregarHistorico(id) {
  const card  = document.getElementById('card-historico');
  const lista = document.getElementById('historico-lista');
  try {
    const h = await Api.historicoPaciente(id);
    const itens = h.historico || h || [];
    if (!itens.length) { card.style.display = 'none'; return; }
    card.style.display = '';
    lista.innerHTML = itens.map(item => `
      <div class="historico-item">
        <div class="historico-data">${dataHoraFmt(item.created_at)}</div>
        <div class="historico-corpo">
          <span class="historico-campo">${esc(item.campo_alterado)}</span>
          ${item.valor_anterior !== null && item.valor_anterior !== undefined
            ? `<span style="color:var(--texto-leve)"> · de </span><em>${esc(String(item.valor_anterior))}</em>
               <span style="color:var(--texto-leve)"> para </span><strong>${esc(String(item.valor_novo))}</strong>`
            : `<span style="color:var(--texto-leve)">: </span>${esc(String(item.valor_novo))}`}
          ${item.observacao ? `<div style="color:var(--texto-leve);font-size:.8rem;margin-top:.2rem">${esc(item.observacao)}</div>` : ''}
        </div>
      </div>`).join('');
  } catch(e) {
    card.style.display = 'none';
  }
}

// ── Paginação ───────────────────────────────────────────────────────────────
document.getElementById('btn-anterior').addEventListener('click', () => { pagina--; carregarPacientes(); });
document.getElementById('btn-proximo').addEventListener('click', () => { pagina++; carregarPacientes(); });

document.getElementById('btn-buscar').addEventListener('click', () => { pagina = 1; carregarPacientes(); });
document.getElementById('busca').addEventListener('keydown', e => { if (e.key === 'Enter') { pagina = 1; carregarPacientes(); } });

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

// dataFmt e dataHoraFmt definidas globalmente em api.js (fuso América/São_Paulo)

function esc(str) {
  if (!str) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Verificar se veio de link direto com ?id= ───────────────────────────────
const params = new URLSearchParams(window.location.search);
const idParam = params.get('id');
if (idParam) {
  window.abrirPaciente(+idParam);
} else {
  carregarPacientes();
}
