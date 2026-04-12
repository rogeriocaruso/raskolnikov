/**
 * admin.js — Administração: usuários, EDOTs, setores
 */

exigirLogin();

const usuario = Api.getUsuario();
const perfil  = usuario?.perfil || '';

document.getElementById('sidebar-nome').textContent  = usuario?.nome  || '—';
document.getElementById('sidebar-perfil').textContent = labelPerfil(perfil);

// Somente cet_admin e edot_coord têm acesso
if (!['cet_admin','edot_coord'].includes(perfil)) {
  window.location.href = '/dashboard';
}

// cet_admin pode criar EDOTs; edot_coord só vê usuários de sua EDOT
const ehAdmin = perfil === 'cet_admin';
if (!ehAdmin) {
  document.getElementById('aba-edots').style.display   = 'none';
  document.getElementById('toolbar-edots').style.display = 'none';
}

function labelPerfil(p) {
  const m = { cet_admin:'CET Admin', opo_auditor:'OPO Auditor', edot_coord:'Coordenador EDOT', edot_membro:'Membro EDOT' };
  return m[p] || p;
}

// ── Abas ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.aba').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach(b => b.classList.remove('aba-ativa'));
    btn.classList.add('aba-ativa');
    const aba = btn.dataset.aba;
    document.getElementById('painel-usuarios').style.display = aba === 'usuarios' ? '' : 'none';
    document.getElementById('painel-edots').style.display    = aba === 'edots'    ? '' : 'none';
    document.getElementById('painel-setores').style.display  = aba === 'setores'  ? '' : 'none';

    if (aba === 'edots')    carregarEdots();
    if (aba === 'setores')  carregarSetores();
  });
});

// ── Cache de EDOTs e OPOs ───────────────────────────────────────────────────
let _edots = [];
let _opos  = [];

async function garantirEdots() {
  if (!_edots.length) _edots = await Api.listarEdots().catch(() => []);
  return _edots;
}
async function garantirOpos() {
  if (!_opos.length) _opos = await Api.listarOpos().catch(() => []);
  return _opos;
}

// ── Usuários ────────────────────────────────────────────────────────────────
async function carregarUsuarios() {
  const loading = document.getElementById('loading-usuarios');
  const wrapper = document.getElementById('wrapper-usuarios');
  loading.style.display = '';
  wrapper.style.display = 'none';
  try {
    const dados = await Api.listarUsuarios();
    const itens = dados.usuarios || dados || [];
    loading.style.display = 'none';
    wrapper.style.display = '';
    const tbody = document.getElementById('tbody-usuarios');
    tbody.innerHTML = itens.map(u => `
      <tr>
        <td>${esc(u.nome)}</td>
        <td>${esc(u.email)}</td>
        <td>${labelPerfil(u.perfil)}</td>
        <td>${esc(u.edot_nome || u.opo_nome || '—')}</td>
        <td>${u.ativo
          ? '<span class="badge badge-confirmado">Ativo</span>'
          : '<span class="badge badge-arquivado">Inativo</span>'}</td>
        <td><button class="btn btn-secundario btn-sm" onclick="editarUsuario(${u.id})">Editar</button></td>
      </tr>`).join('');
  } catch(e) {
    loading.textContent = 'Erro ao carregar usuários.';
  }
}

// Modal novo usuário
document.getElementById('btn-novo-usuario').addEventListener('click', () => abrirModalUsuario(null));

window.editarUsuario = async function(id) {
  try {
    const dados = await Api.listarUsuarios();
    const itens = dados.usuarios || dados || [];
    const u = itens.find(x => x.id === id);
    if (u) abrirModalUsuario(u);
  } catch(e) { alert('Erro ao carregar usuário.'); }
};

async function abrirModalUsuario(u) {
  document.getElementById('titulo-usuario').textContent = u ? 'Editar Usuário' : 'Novo Usuário';
  document.getElementById('alerta-usuario').className = 'alerta';
  document.getElementById('u-id').value    = u?.id || '';
  document.getElementById('u-nome').value  = u?.nome || '';
  document.getElementById('u-email').value = u?.email || '';
  document.getElementById('u-senha').value = '';
  document.getElementById('u-perfil').value = u?.perfil || '';

  // Campo senha: obrigatório só no cadastro
  const grupoSenha = document.getElementById('grupo-senha');
  const inputSenha = document.getElementById('u-senha');
  grupoSenha.style.display = '';
  inputSenha.required = !u;

  // Perfil: edot_coord só cria membros
  const grupoPerfil = document.getElementById('grupo-perfil');
  if (!ehAdmin) {
    grupoPerfil.style.display = 'none';
    document.getElementById('u-perfil').value = 'edot_membro';
  } else {
    grupoPerfil.style.display = '';
  }

  // Desativar botão
  const btnDes = document.getElementById('btn-desativar-usuario');
  btnDes.style.display = u && u.ativo && ehAdmin ? '' : 'none';
  btnDes.onclick = () => desativarUsuario(u.id);

  // Selects de EDOT e OPO
  await garantirEdots();
  await garantirOpos();
  preencherSelectEdot(document.getElementById('u-edot'), u?.edot_id);
  preencherSelectOpo(document.getElementById('u-opo'), u?.opo_id);

  document.getElementById('modal-usuario').style.display = 'flex';
}

window.fecharModalUsuario = function() {
  document.getElementById('modal-usuario').style.display = 'none';
};

document.getElementById('form-usuario').addEventListener('submit', async e => {
  e.preventDefault();
  const btn     = e.target.querySelector('button[type=submit]');
  const spinner = document.getElementById('spinner-usuario');
  const alerta  = document.getElementById('alerta-usuario');
  alerta.className = 'alerta';

  const id    = document.getElementById('u-id').value;
  const dados = {
    nome:   document.getElementById('u-nome').value.trim(),
    email:  document.getElementById('u-email').value.trim(),
    perfil: document.getElementById('u-perfil').value || 'edot_membro',
    edot_id: document.getElementById('u-edot').value ? +document.getElementById('u-edot').value : null,
    opo_id:  document.getElementById('u-opo').value  ? +document.getElementById('u-opo').value  : null,
  };
  const senha = document.getElementById('u-senha').value;
  if (senha) dados.senha = senha;

  btn.disabled = true;
  spinner.style.display = 'inline-block';
  try {
    if (id) {
      await Api.atualizarUsuario(+id, dados);
    } else {
      await Api.criarUsuario(dados);
    }
    fecharModalUsuario();
    carregarUsuarios();
  } catch(err) {
    alerta.textContent = err.erro || err.message || 'Erro ao salvar usuário.';
    alerta.className = 'alerta alerta-erro visivel';
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
});

async function desativarUsuario(id) {
  if (!confirm('Desativar este usuário?')) return;
  try {
    await Api.desativarUsuario(id);
    fecharModalUsuario();
    carregarUsuarios();
  } catch(e) { alert('Erro ao desativar.'); }
}

// ── EDOTs ───────────────────────────────────────────────────────────────────
async function carregarEdots() {
  const loading = document.getElementById('loading-edots');
  const wrapper = document.getElementById('wrapper-edots');
  loading.style.display = '';
  wrapper.style.display = 'none';
  try {
    _edots = await Api.listarEdots();
    const itens = _edots || [];
    loading.style.display = 'none';
    wrapper.style.display = '';
    const tbody = document.getElementById('tbody-edots');
    tbody.innerHTML = itens.map(e => `
      <tr>
        <td>${esc(e.sigla)}</td>
        <td>${esc(e.nome || e.hospital_nome)}</td>
        <td>${esc(e.opo_sigla || e.opo_nome || '—')}</td>
        <td>${e.ativo
          ? '<span class="badge badge-confirmado">Ativo</span>'
          : '<span class="badge badge-arquivado">Inativo</span>'}</td>
      </tr>`).join('');
  } catch(e) {
    loading.textContent = 'Erro ao carregar EDOTs.';
  }
}

document.getElementById('btn-novo-edot').addEventListener('click', async () => {
  document.getElementById('alerta-edot').className = 'alerta';
  document.getElementById('form-edot').reset();
  await garantirOpos();
  preencherSelectOpo(document.getElementById('edot-opo'));
  document.getElementById('modal-edot').style.display = 'flex';
});

window.fecharModalEdot = function() {
  document.getElementById('modal-edot').style.display = 'none';
};

document.getElementById('form-edot').addEventListener('submit', async e => {
  e.preventDefault();
  const btn     = e.target.querySelector('button[type=submit]');
  const spinner = document.getElementById('spinner-edot');
  const alerta  = document.getElementById('alerta-edot');
  alerta.className = 'alerta';

  const dados = {
    nome:   document.getElementById('edot-nome').value.trim(),
    sigla:  document.getElementById('edot-sigla').value.trim().toUpperCase(),
    opo_id: +document.getElementById('edot-opo').value,
  };

  btn.disabled = true;
  spinner.style.display = 'inline-block';
  try {
    await Api.post('/admin/edots', dados);
    fecharModalEdot();
    _edots = [];
    carregarEdots();
  } catch(err) {
    alerta.textContent = err.erro || err.message || 'Erro ao salvar EDOT.';
    alerta.className = 'alerta alerta-erro visivel';
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
});

// ── Setores ─────────────────────────────────────────────────────────────────
async function carregarSetores() {
  const loading  = document.getElementById('loading-setores');
  const wrapper  = document.getElementById('wrapper-setores');
  const edotId   = document.getElementById('filtro-edot-setor').value || null;
  loading.style.display = '';
  wrapper.style.display = 'none';
  try {
    const itens = await Api.listarSetores(edotId);
    loading.style.display = 'none';
    wrapper.style.display = '';
    const tbody = document.getElementById('tbody-setores');
    tbody.innerHTML = (itens || []).map(s => `
      <tr>
        <td>${esc(s.nome)}</td>
        <td>${esc(s.edot_nome || s.edot_sigla || '—')}</td>
        <td>${esc(s.descricao || '—')}</td>
        <td>${s.ativo
          ? '<span class="badge badge-confirmado">Ativo</span>'
          : '<span class="badge badge-arquivado">Inativo</span>'}</td>
      </tr>`).join('');
  } catch(e) {
    loading.textContent = 'Erro ao carregar setores.';
  }
}

document.getElementById('filtro-edot-setor').addEventListener('change', carregarSetores);

document.getElementById('btn-novo-setor').addEventListener('click', async () => {
  document.getElementById('alerta-setor').className = 'alerta';
  document.getElementById('form-setor').reset();
  await garantirEdots();
  preencherSelectEdot(document.getElementById('setor-edot'));
  document.getElementById('modal-setor').style.display = 'flex';
});

window.fecharModalSetor = function() {
  document.getElementById('modal-setor').style.display = 'none';
};

document.getElementById('form-setor').addEventListener('submit', async e => {
  e.preventDefault();
  const btn     = e.target.querySelector('button[type=submit]');
  const spinner = document.getElementById('spinner-setor');
  const alerta  = document.getElementById('alerta-setor');
  alerta.className = 'alerta';

  const dados = {
    nome:      document.getElementById('setor-nome').value.trim(),
    edot_id:   +document.getElementById('setor-edot').value,
    descricao: document.getElementById('setor-descricao').value.trim() || null,
  };

  btn.disabled = true;
  spinner.style.display = 'inline-block';
  try {
    await Api.post('/admin/setores', dados);
    fecharModalSetor();
    carregarSetores();
  } catch(err) {
    alerta.textContent = err.erro || err.message || 'Erro ao salvar setor.';
    alerta.className = 'alerta alerta-erro visivel';
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
});

// ── Helpers de select ───────────────────────────────────────────────────────
function preencherSelectEdot(sel, valorAtual) {
  const atual = sel.value;
  // Manter primeira opção
  while (sel.options.length > 1) sel.remove(1);
  _edots.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = `${e.sigla} — ${e.nome || e.hospital_nome}`;
    if (valorAtual && e.id === valorAtual) opt.selected = true;
    sel.appendChild(opt);
  });

  // Popular também o filtro de setores
  const filtroEdot = document.getElementById('filtro-edot-setor');
  if (filtroEdot) {
    while (filtroEdot.options.length > 1) filtroEdot.remove(1);
    _edots.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.sigla} — ${e.nome || e.hospital_nome}`;
      filtroEdot.appendChild(opt);
    });
  }
}

function preencherSelectOpo(sel, valorAtual) {
  while (sel.options.length > 1) sel.remove(1);
  _opos.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = `${o.sigla} — ${o.nome}`;
    if (valorAtual && o.id === valorAtual) opt.selected = true;
    sel.appendChild(opt);
  });
}

function esc(str) {
  if (!str) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ────────────────────────────────────────────────────────────────────
carregarUsuarios();
garantirEdots();
garantirOpos();
