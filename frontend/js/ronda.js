/**
 * ronda.js — Gerenciamento de rondas com acompanhamento de pacientes
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
  document.getElementById('btn-nova-ronda').style.display = 'none';
}

function labelPerfil(p) {
  const m = { cet_admin:'CET Admin', opo_auditor:'OPO Auditor', edot_coord:'Coordenador EDOT', edot_membro:'Membro EDOT' };
  return m[p] || p;
}

// ── Estado ──────────────────────────────────────────────────────────────────
let rondaAtual = null;
let setoresDaEdot = [];

// ── Lista de rondas ──────────────────────────────────────────────────────────
async function carregarRondas() {
  const loading = document.getElementById('loading-rondas');
  const wrapper = document.getElementById('wrapper-rondas');
  const vazio   = document.getElementById('sem-rondas');
  loading.style.display = '';
  wrapper.style.display = 'none';
  vazio.style.display   = 'none';
  try {
    const d = await Api.listarRondas({ per_page: 50 });
    const itens = d.rondas || d.items || [];
    loading.style.display = 'none';
    if (!itens.length) { vazio.style.display = ''; return; }
    wrapper.style.display = '';
    const tbody = document.getElementById('tbody-rondas');
    tbody.innerHTML = itens.map(r => {
      const aberta = !r.data_fim;
      let acoes = '';
      if (aberta && podeEscrever) {
        acoes = `<button class="btn btn-sucesso btn-sm" onclick="abrirDetalhe(${r.id})">
                   Acompanhar →
                 </button>`;
      } else {
        acoes = `<button class="btn btn-secundario btn-sm" onclick="abrirDetalhe(${r.id})">
                   Ver detalhes
                 </button>`;
      }
      return `
        <tr>
          <td><strong>${esc(r.edot_nome || r.edot_sigla || '—')}</strong></td>
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
    loading.style.display = 'none';
    vazio.style.display = '';
  }
}

// ── Detalhe da ronda: pacientes ──────────────────────────────────────────────
async function abrirDetalhe(rondaId) {
  document.getElementById('view-lista').style.display = 'none';
  document.getElementById('view-detalhe').style.display = '';
  document.getElementById('loading-pacientes-ronda').style.display = '';
  document.getElementById('wrapper-pacientes-ronda').style.display = 'none';
  document.getElementById('sem-pacientes-ronda').style.display = 'none';
  document.getElementById('alerta-detalhe').className = 'alerta';

  try {
    const d = await Api.obterRonda(rondaId);
    rondaAtual = d.ronda;
    const pacientes = d.pacientes_edot || [];

    // Cabeçalho
    const aberta = !rondaAtual.data_fim;
    document.getElementById('detalhe-titulo').textContent =
      `${esc(rondaAtual.edot_nome || rondaAtual.edot_sigla || 'EDOT')} — Turno ${labelTurno(rondaAtual.turno)}`;
    document.getElementById('detalhe-subtitulo').textContent =
      `Iniciada em ${dataHoraFmt(rondaAtual.data_inicio)}` +
      (aberta ? ' · Em andamento' : ` · Encerrada em ${dataHoraFmt(rondaAtual.data_fim)}`);

    // Botões
    const btnNovo     = document.getElementById('btn-novo-paciente-ronda');
    const btnEncerrar = document.getElementById('btn-encerrar-detalhe');
    if (aberta && podeEscrever) {
      btnNovo.style.display     = '';
      btnEncerrar.style.display = '';
      btnEncerrar.onclick = () => abrirModalEncerrar(rondaAtual.id);
    } else {
      btnNovo.style.display     = 'none';
      btnEncerrar.style.display = 'none';
    }

    if (!aberta) {
      const alerta = document.getElementById('alerta-detalhe');
      alerta.textContent = `Ronda encerrada. Leitos visitados: ${rondaAtual.leitos_visitados ?? '—'} · Potenciais encontrados: ${rondaAtual.potenciais_encontrados ?? 0}`;
      alerta.className = 'alerta alerta-aviso visivel';
    }

    // Carregar setores para formulários
    await carregarSetoresDaEdot();

    // Tabela de pacientes
    document.getElementById('loading-pacientes-ronda').style.display = 'none';
    const badge = document.getElementById('badge-total');
    badge.textContent = `${pacientes.length} caso${pacientes.length !== 1 ? 's' : ''}`;

    if (!pacientes.length) {
      document.getElementById('sem-pacientes-ronda').style.display = '';
      // Mostrar/esconder box de "sem PD" conforme ronda aberta ou não
      const boxSemPd = document.getElementById('box-sem-pd');
      if (boxSemPd) boxSemPd.style.display = aberta && podeEscrever ? '' : 'none';
      return;
    }
    document.getElementById('wrapper-pacientes-ronda').style.display = '';
    renderizarPacientes(pacientes, aberta);

  } catch(e) {
    document.getElementById('loading-pacientes-ronda').style.display = 'none';
    document.getElementById('loading-pacientes-ronda').textContent = 'Erro ao carregar ronda.';
  }
}
window.abrirDetalhe = abrirDetalhe;

function renderizarPacientes(pacientes, rondaAberta) {
  const tbody = document.getElementById('tbody-pacientes-ronda');
  tbody.innerHTML = pacientes.map(p => {
    const botoesStatus = rondaAberta && podeEscrever
      ? botoesAtualizacaoStatus(p)
      : `<span style="font-size:.8rem;color:var(--texto-leve)">Somente leitura</span>`;
    return `
      <tr id="linha-pac-${p.id}">
        <td><strong>${esc(p.nome)}</strong></td>
        <td>${esc(p.prontuario)}</td>
        <td>${badgeStatus(p.status)}</td>
        <td>${esc(p.setor_nome || '—')}</td>
        <td>${dataFmt(p.data_internacao)}</td>
        <td>${botoesStatus}</td>
      </tr>`;
  }).join('');
}

function botoesAtualizacaoStatus(p) {
  const acoes = {
    potencial_doador:  [
      { status: 'em_avaliacao',     label: 'Em Avaliação',  cls: 'btn-aviso'    },
      { status: 'nao_doador',       label: 'Não Doador',    cls: 'btn-perigo'   },
    ],
    em_avaliacao: [
      { status: 'doador_confirmado',label: 'Confirmado',    cls: 'btn-sucesso'  },
      { status: 'nao_doador',       label: 'Não Doador',    cls: 'btn-perigo'   },
    ],
    doador_confirmado: [
      { status: 'arquivado',        label: 'Arquivar',      cls: 'btn-secundario' },
    ],
    nao_doador: [
      { status: 'potencial_doador', label: 'Reativar',      cls: 'btn-primario' },
      { status: 'arquivado',        label: 'Arquivar',      cls: 'btn-secundario' },
    ],
  };
  const opcoes = acoes[p.status] || [];
  if (!opcoes.length) return '<span style="font-size:.8rem;color:var(--texto-leve)">Arquivado</span>';
  return `<div style="display:flex;gap:.35rem;flex-wrap:wrap">
    ${opcoes.map(o =>
      `<button class="btn ${o.cls} btn-sm" onclick="abrirModalStatus(${p.id},'${esc(p.nome)}','${o.status}','${o.label}')">${o.label}</button>`
    ).join('')}
  </div>`;
}

function voltarLista() {
  rondaAtual = null;
  document.getElementById('view-detalhe').style.display = 'none';
  document.getElementById('view-lista').style.display = '';
  carregarRondas();
}
window.voltarLista = voltarLista;

// ── Setores da EDOT ──────────────────────────────────────────────────────────
async function carregarSetoresDaEdot() {
  const edotId = rondaAtual?.edot_id || usuario?.edot_id;
  if (!edotId) return;
  try {
    const resp = await Api.listarSetores(edotId);
    setoresDaEdot = resp.setores || resp || [];
    ['r-setor', 'rp-setor'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      // Limpa opções extras
      while (sel.options.length > 1) sel.remove(1);
      setoresDaEdot.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.nome;
        sel.appendChild(opt);
      });
    });
  } catch(e) { /* sem setores cadastrados */ }
}

// Carregar setores no modal de nova ronda (ao abrir)
async function carregarSetoresModal() {
  const edotId = usuario?.edot_id;
  if (!edotId) return;
  try {
    const resp = await Api.listarSetores(edotId);
    setoresDaEdot = resp.setores || resp || [];
    const sel = document.getElementById('r-setor');
    while (sel.options.length > 1) sel.remove(1);
    setoresDaEdot.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.nome;
      sel.appendChild(opt);
    });
  } catch(e) { /* sem setores */ }
}

// ── Modal: Nova ronda ────────────────────────────────────────────────────────
document.getElementById('btn-nova-ronda').addEventListener('click', () => {
  if (!usuario?.edot_id) {
    alert('Seu usuário não está vinculado a uma EDOT. Peça ao administrador para corrigir seu cadastro e faça login novamente.');
    return;
  }
  document.getElementById('form-ronda').reset();
  document.getElementById('alerta-ronda').className = 'alerta';
  carregarSetoresModal();
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
    const resp = await Api.iniciarRonda({ turno, setor_id: setorId ? +setorId : null, observacoes: obs });
    fecharModal();
    // Abrir direto no detalhe da ronda recém criada
    const novaRonda = resp.ronda || resp;
    if (novaRonda?.id) {
      abrirDetalhe(novaRonda.id);
    } else {
      carregarRondas();
    }
  } catch(err) {
    alerta.textContent = err.erro || err.message || 'Erro ao iniciar ronda.';
    alerta.className = 'alerta alerta-erro visivel';
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
});

// ── Modal: Encerrar ronda ────────────────────────────────────────────────────
function abrirModalEncerrar(id, semPd = false) {
  document.getElementById('encerrar-id').value = id;
  document.getElementById('e-leitos').value = '0';
  document.getElementById('e-potenciais').value = '0';
  document.getElementById('e-obs').value = semPd
    ? 'Nenhum potencial doador identificado nesta ronda.'
    : '';
  document.getElementById('alerta-encerrar').className = 'alerta';
  document.getElementById('modal-encerrar').style.display = 'flex';
}

// Botão "Registrar ronda sem PD" no estado vazio
document.addEventListener('click', e => {
  if (e.target && e.target.id === 'btn-encerrar-sem-pd') {
    abrirModalEncerrar(rondaAtual.id, true);
  }
});
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

  const id     = +document.getElementById('encerrar-id').value;
  const leitos = +(document.getElementById('e-leitos').value || 0);
  const pot    = +(document.getElementById('e-potenciais').value || 0);
  const obs    = document.getElementById('e-obs').value.trim() || null;

  btn.disabled = true;
  spinner.style.display = 'inline-block';
  try {
    await Api.encerrarRonda(id, { leitos_visitados: leitos, potenciais_encontrados: pot, observacoes: obs });
    fecharModalEncerrar();
    // Reabrir o detalhe já encerrado
    await abrirDetalhe(id);
  } catch(err) {
    alerta.textContent = err.erro || err.message || 'Erro ao encerrar ronda.';
    alerta.className = 'alerta alerta-erro visivel';
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
});

// ── Modal: Registrar potencial doador ────────────────────────────────────────
document.getElementById('btn-novo-paciente-ronda').addEventListener('click', () => {
  document.getElementById('form-paciente-ronda').reset();
  document.getElementById('alerta-paciente').className = 'alerta';
  // Popular setores no select do modal
  const sel = document.getElementById('rp-setor');
  while (sel.options.length > 1) sel.remove(1);
  setoresDaEdot.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.nome;
    sel.appendChild(opt);
  });
  document.getElementById('modal-paciente').style.display = 'flex';
});

function fecharModalPaciente() {
  document.getElementById('modal-paciente').style.display = 'none';
}
window.fecharModalPaciente = fecharModalPaciente;

document.getElementById('form-paciente-ronda').addEventListener('submit', async e => {
  e.preventDefault();
  const btn     = document.getElementById('btn-salvar-paciente');
  const spinner = document.getElementById('spinner-paciente');
  const alerta  = document.getElementById('alerta-paciente');
  alerta.className = 'alerta';

  const dados = {
    nome:            document.getElementById('rp-nome').value.trim(),
    prontuario:      document.getElementById('rp-prontuario').value.trim(),
    status:          'potencial_doador',
    data_nascimento: document.getElementById('rp-nascimento').value || null,
    data_internacao: document.getElementById('rp-internacao').value || null,
    setor_id:        document.getElementById('rp-setor').value ? +document.getElementById('rp-setor').value : null,
    causa_morte:     document.getElementById('rp-causa').value.trim() || null,
    observacoes:     document.getElementById('rp-obs').value.trim() || null,
  };

  btn.disabled = true;
  spinner.style.display = 'inline-block';
  try {
    await Api.criarPaciente(dados);
    fecharModalPaciente();
    // Recarregar detalhe da ronda para mostrar o novo paciente
    await abrirDetalhe(rondaAtual.id);
  } catch(err) {
    alerta.textContent = err.erro || err.message || 'Erro ao registrar paciente.';
    alerta.className = 'alerta alerta-erro visivel';
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
});

// ── Modal: Atualizar status do paciente ───────────────────────────────────────
function abrirModalStatus(pacienteId, pacienteNome, novoStatus, labelStatus) {
  document.getElementById('status-paciente-id').value = pacienteId;
  document.getElementById('status-paciente-nome').textContent = pacienteNome;
  document.getElementById('status-obs').value = '';
  document.getElementById('alerta-status').className = 'alerta';

  // Botão de confirmação dinâmico
  const opcoes = document.getElementById('status-opcoes');
  opcoes.innerHTML = `
    <button class="btn btn-primario" id="btn-confirmar-status" style="width:100%;justify-content:center">
      Confirmar: ${labelStatus}
    </button>`;

  document.getElementById('btn-confirmar-status').onclick = () =>
    confirmarStatus(pacienteId, novoStatus);

  document.getElementById('modal-status').style.display = 'flex';
}
window.abrirModalStatus = abrirModalStatus;

function fecharModalStatus() {
  document.getElementById('modal-status').style.display = 'none';
}
window.fecharModalStatus = fecharModalStatus;

async function confirmarStatus(pacienteId, novoStatus) {
  const alerta = document.getElementById('alerta-status');
  const obs    = document.getElementById('status-obs').value.trim() || null;
  alerta.className = 'alerta';
  try {
    const dados = { status: novoStatus };
    if (obs) dados.observacoes = obs;
    await Api.atualizarPaciente(pacienteId, dados);

    // Se arquivando, usar endpoint de arquivar
    if (novoStatus === 'arquivado') {
      await Api.arquivarPaciente(pacienteId, obs || 'Arquivado durante ronda');
    } else {
      await Api.atualizarPaciente(pacienteId, dados);
    }

    fecharModalStatus();
    // Recarregar pacientes da ronda
    await abrirDetalhe(rondaAtual.id);
  } catch(err) {
    alerta.textContent = err.erro || err.message || 'Erro ao atualizar status.';
    alerta.className = 'alerta alerta-erro visivel';
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function badgeStatus(s) {
  const m = {
    potencial_doador:  ['badge-potencial', 'Potencial Doador'],
    em_avaliacao:      ['badge-avaliacao',  'Em Avaliação'],
    doador_confirmado: ['badge-confirmado', 'Doador Confirmado'],
    nao_doador:        ['badge-nao-doador', 'Não Doador'],
    arquivado:         ['badge-arquivado',  'Arquivado'],
  };
  const [cls, txt] = m[s] || ['badge-arquivado', s];
  return `<span class="badge ${cls}">${txt}</span>`;
}

function labelTurno(t) {
  return { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite', plantao: 'Plantão' }[t] || t;
}

// dataFmt e dataHoraFmt definidas globalmente em api.js (fuso América/São_Paulo)

function esc(str) {
  if (!str) return '—';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Init ─────────────────────────────────────────────────────────────────────
carregarRondas();
