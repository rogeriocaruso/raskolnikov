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

    // Painel de geolocalização para auditoria
    renderizarGeo(rondaAtual);

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
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    // Esconde tabela e usa cartões
    document.getElementById('wrapper-pacientes-ronda').style.display = 'none';
    let container = document.getElementById('cards-pacientes-ronda');
    if (!container) {
      container = document.createElement('div');
      container.id = 'cards-pacientes-ronda';
      document.getElementById('wrapper-pacientes-ronda').insertAdjacentElement('afterend', container);
    }
    container.innerHTML = pacientes.map(p => {
      const acoes = rondaAberta && podeEscrever ? botoesAtualizacaoStatus(p) : '';
      return `
        <div class="pac-card" id="linha-pac-${p.id}">
          <div class="pac-card-header">
            <div>
              <div class="pac-card-nome">${esc(p.nome)}</div>
              <div class="pac-card-meta">Pron.: ${esc(p.prontuario)} · ${esc(p.setor_nome || 'Setor não informado')}</div>
              <div class="pac-card-meta">Internação: ${dataFmt(p.data_internacao)}</div>
            </div>
            ${badgeStatus(p.status)}
          </div>
          ${acoes ? `<div class="pac-card-acoes">${acoes.replace(/<div[^>]*>|<\/div>/g,'')}</div>` : ''}
        </div>`;
    }).join('');
    container.style.display = '';
  } else {
    // Desktop: tabela normal
    const container = document.getElementById('cards-pacientes-ronda');
    if (container) container.style.display = 'none';
    document.getElementById('wrapper-pacientes-ronda').style.display = '';
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
}

function botoesAtualizacaoStatus(p) {
  const acoes = {
    sedacao_continua: [
      { status: 'sedacao_pausada', label: 'Pausar Sedação',       cls: 'btn-aviso'    },
      { status: 'protocolo_me',    label: 'Iniciar Protocolo M.E.',cls: 'btn-primario' },
    ],
    sedacao_pausada: [
      { status: 'sedacao_continua', label: 'Retomar Sedação',     cls: 'btn-secundario' },
      { status: 'protocolo_me',     label: 'Iniciar Protocolo M.E.',cls: 'btn-primario' },
    ],
    protocolo_me: [
      { status: 'me_sem_confirmacao', label: 'Sem Confirmação M.E.', cls: 'btn-aviso'   },
      { status: 'me_confirmado',      label: 'M.E. Confirmado',      cls: 'btn-sucesso' },
    ],
    me_sem_confirmacao: [
      { status: 'arquivado', label: 'Arquivar Caso', cls: 'btn-secundario' },
    ],
    me_confirmado: [
      { status: 'me_com_doacao', label: 'Com Doação',  cls: 'btn-sucesso' },
      { status: 'me_sem_doacao', label: 'Sem Doação',  cls: 'btn-perigo'  },
    ],
    me_com_doacao: [
      { status: 'arquivado', label: 'Arquivar Caso', cls: 'btn-secundario' },
    ],
    me_sem_doacao: [
      { status: 'arquivado', label: 'Arquivar Caso', cls: 'btn-secundario' },
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

// ── Geolocalização — painel de auditoria ────────────────────────────────────
function renderizarGeo(r) {
  // Remove painel anterior se existir
  const anterior = document.getElementById('painel-geo');
  if (anterior) anterior.remove();

  const painel = document.createElement('div');
  painel.id = 'painel-geo';
  painel.className = 'card';
  painel.style.cssText = 'padding:1rem 1.25rem;margin-bottom:1rem';

  const linhaInicio = geoLinha(
    'Início', r.geo_lat_inicio, r.geo_lng_inicio, r.geo_precisao_inicio
  );
  const linhaFim = r.data_fim
    ? geoLinha('Encerramento', r.geo_lat_fim, r.geo_lng_fim, r.geo_precisao_fim)
    : '';

  painel.innerHTML = `
    <div class="card-titulo" style="margin-bottom:.75rem">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
      Geolocalização de Auditoria
    </div>
    <div style="display:flex;flex-direction:column;gap:.5rem;font-size:.875rem">
      ${linhaInicio}
      ${linhaFim}
    </div>`;

  // Inserir antes do card de pacientes
  const cardPacientes = document.querySelector('#view-detalhe .card:last-child');
  cardPacientes?.parentNode?.insertBefore(painel, cardPacientes);
}

function geoLinha(rotulo, lat, lng, precisao) {
  if (lat == null || lng == null) {
    return `<div style="display:flex;align-items:center;gap:.5rem">
      <span class="badge badge-nao-doador">${rotulo}</span>
      <span style="color:var(--texto-leve)">Localização não capturada</span>
      <span style="font-size:.78rem;color:var(--vermelho)">(permissão negada ou GPS indisponível)</span>
    </div>`;
  }
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const latFmt  = lat.toFixed(6);
  const lngFmt  = lng.toFixed(6);
  const precFmt = precisao != null ? `±${Math.round(precisao)} m` : '';
  return `<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
    <span class="badge badge-confirmado">${rotulo}</span>
    <span style="font-family:monospace;font-size:.82rem">${latFmt}, ${lngFmt}</span>
    ${precFmt ? `<span style="color:var(--texto-leve);font-size:.8rem">precisão ${precFmt}</span>` : ''}
    <a href="${mapsUrl}" target="_blank" rel="noopener"
       style="font-size:.8rem;color:var(--azul-claro)">
       Ver no mapa ↗
    </a>
  </div>`;
}

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
  btn.textContent = '';
  spinner.style.display = 'inline-block';
  // Tenta capturar localização antes de enviar
  alerta.textContent = 'Capturando localização GPS...';
  alerta.className = 'alerta alerta-aviso visivel';
  const geo = await capturarGeolocalizacao();
  alerta.className = 'alerta';
  try {
    const payload = { turno, setor_id: setorId ? +setorId : null, observacoes: obs, ...geo };
    const resp = await Api.iniciarRonda(payload);
    fecharModal();
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
    btn.textContent = 'Iniciar Ronda';
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
  alerta.textContent = 'Capturando localização GPS...';
  alerta.className = 'alerta alerta-aviso visivel';
  const geo = await capturarGeolocalizacao();
  alerta.className = 'alerta';
  try {
    const payload = { leitos_visitados: leitos, potenciais_encontrados: pot, observacoes: obs, ...geo };
    await Api.encerrarRonda(id, payload);
    fecharModalEncerrar();
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
    edot_id:         rondaAtual?.edot_id || usuario?.edot_id,
    status:          document.getElementById('rp-status').value || 'potencial_doador',
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
    if (novoStatus === 'arquivado') {
      await Api.arquivarPaciente(pacienteId, obs || 'Arquivado durante ronda');
    } else {
      const dados = { status: novoStatus };
      if (obs) dados.observacoes = obs;
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
    sedacao_continua:    ['badge-sedacao-continua', 'Sedação Contínua'],
    sedacao_pausada:     ['badge-sedacao-pausada',  'Sedação Pausada'],
    protocolo_me:        ['badge-protocolo-me',     'Protocolo M.E.'],
    me_sem_confirmacao:  ['badge-me-sem-conf',      'M.E. Sem Confirmação'],
    me_confirmado:       ['badge-me-confirmado',    'M.E. Confirmado'],
    me_com_doacao:       ['badge-me-com-doacao',    'M.E. Com Doação'],
    me_sem_doacao:       ['badge-me-sem-doacao',    'M.E. Sem Doação'],
    arquivado:           ['badge-arquivado',         'Arquivado'],
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
