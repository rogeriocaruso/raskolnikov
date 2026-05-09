/**
 * api.js — Cliente HTTP central do sistema EDOT
 * Todas as chamadas à API passam por aqui.
 */

const API_BASE = '';  // mesma origem; altere para URL completa se necessário

const Api = {
  // ── Token ──────────────────────────────────────────────────────────────────
  getToken()  { return localStorage.getItem('edot_token'); },
  getUsuario(){ return JSON.parse(localStorage.getItem('edot_usuario') || 'null'); },

  salvarSessao(token, usuario) {
    localStorage.setItem('edot_token', token);
    localStorage.setItem('edot_usuario', JSON.stringify(usuario));
  },

  limparSessao() {
    localStorage.removeItem('edot_token');
    localStorage.removeItem('edot_usuario');
  },

  estaLogado() { return !!this.getToken(); },

  // ── Requisição base ────────────────────────────────────────────────────────
  async req(metodo, caminho, corpo = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opcoes = { method: metodo, headers };
    if (corpo) opcoes.body = JSON.stringify(corpo);

    const resp = await fetch(API_BASE + caminho, opcoes);

    if (resp.status === 401) {
      this.limparSessao();
      window.location.href = '/';
      return;
    }

    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) throw { status: resp.status, ...dados };
    return dados;
  },

  get(caminho)          { return this.req('GET',    caminho); },
  post(caminho, corpo)  { return this.req('POST',   caminho, corpo); },
  put(caminho, corpo)   { return this.req('PUT',    caminho, corpo); },

  // fetch-style wrapper usado por módulos que passam body já serializado
  async request(caminho, opcoes = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const resp = await fetch(API_BASE + caminho, { method: 'GET', ...opcoes, headers });
    if (resp.status === 401) { this.limparSessao(); window.location.href = '/'; return; }
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) throw { status: resp.status, ...dados };
    return dados;
  },

  // ── Auth ───────────────────────────────────────────────────────────────────
  login(email, senha)   { return this.post('/auth/login', { email, senha }); },

  // ── Pacientes ──────────────────────────────────────────────────────────────
  listarPacientes(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get('/patients/' + (q ? '?' + q : ''));
  },
  obterPaciente(id)     { return this.get(`/patients/${id}`); },
  criarPaciente(dados)  { return this.post('/patients/', dados); },
  atualizarPaciente(id, dados) { return this.put(`/patients/${id}`, dados); },
  arquivarPaciente(id, motivo) {
    return this.post(`/patients/${id}/arquivar`, { motivo });
  },
  historicoPaciente(id) { return this.get(`/patients/${id}/historico`); },

  // ── Rondas ─────────────────────────────────────────────────────────────────
  listarRondas(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get('/rounds/' + (q ? '?' + q : ''));
  },
  iniciarRonda(dados)   { return this.post('/rounds/', dados); },
  obterRonda(id)        { return this.get(`/rounds/${id}`); },
  encerrarRonda(id, dados) { return this.post(`/rounds/${id}/encerrar`, dados); },

  // ── Stats ──────────────────────────────────────────────────────────────────
  dashboardStats(dias = 30) { return this.get(`/stats/?dias=${dias}`); },
  statsEdots()              { return this.get('/stats/edots'); },

  // ── Admin ──────────────────────────────────────────────────────────────────
  listarUsuarios()      { return this.get('/admin/usuarios'); },
  criarUsuario(dados)   { return this.post('/admin/usuarios', dados); },
  atualizarUsuario(id, dados) { return this.put(`/admin/usuarios/${id}`, dados); },
  desativarUsuario(id)  { return this.post(`/admin/usuarios/${id}/desativar`); },
  listarEdots()         { return this.get('/admin/edots'); },
  listarOpos()          { return this.get('/admin/opos'); },
  listarSetores(edot_id) {
    return this.get('/admin/setores' + (edot_id ? `?edot_id=${edot_id}` : ''));
  },
};

// Redireciona para login se não autenticado (exceto na própria página de login)
function exigirLogin() {
  if (!Api.estaLogado() && !window.location.pathname.endsWith('index.html')
      && window.location.pathname !== '/') {
    window.location.href = '/';
  }
}

// ── Menu mobile (hambúrguer) ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Botão hambúrguer
  const btn = document.createElement('button');
  btn.id = 'btn-menu';
  btn.setAttribute('aria-label', 'Abrir menu');
  btn.innerHTML = '&#9776;';
  document.body.appendChild(btn);

  // Overlay escuro atrás da sidebar
  const overlay = document.createElement('div');
  overlay.id = 'sidebar-overlay';
  document.body.appendChild(overlay);

  function abrirMenu() {
    sidebar.classList.add('aberta');
    overlay.classList.add('visivel');
    btn.setAttribute('aria-expanded', 'true');
  }
  function fecharMenu() {
    sidebar.classList.remove('aberta');
    overlay.classList.remove('visivel');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', () =>
    sidebar.classList.contains('aberta') ? fecharMenu() : abrirMenu()
  );
  overlay.addEventListener('click', fecharMenu);

  // Fecha ao navegar (clique em link da sidebar)
  sidebar.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', fecharMenu)
  );
});

// ── Modal: Alterar Senha ──────────────────────────────────────────────────
function abrirModalSenha() {
  let modal = document.getElementById('modal-alterar-senha');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-alterar-senha';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:360px">
        <div class="modal-header">
          <h2 class="modal-titulo">Alterar Senha</h2>
          <button class="modal-fechar" id="btn-fechar-senha">&times;</button>
        </div>
        <div id="alerta-senha" class="alerta"></div>
        <form id="form-alterar-senha">
          <div class="form-grupo">
            <label>Senha atual *</label>
            <input type="password" id="as-atual" required autocomplete="current-password">
          </div>
          <div class="form-grupo">
            <label>Nova senha *</label>
            <input type="password" id="as-nova" required placeholder="Mínimo 6 caracteres" autocomplete="new-password">
          </div>
          <div class="form-grupo">
            <label>Confirmar nova senha *</label>
            <input type="password" id="as-confirma" required autocomplete="new-password">
          </div>
          <div style="display:flex;gap:.75rem;justify-content:flex-end">
            <button type="button" class="btn btn-secundario" id="btn-cancelar-senha">Cancelar</button>
            <button type="submit" class="btn btn-sucesso" id="btn-as-salvar">Salvar</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(modal);

    const fechar = () => { modal.style.display = 'none'; };
    modal.getElementById = (id) => modal.querySelector('#' + id);
    document.getElementById('btn-fechar-senha').addEventListener('click', fechar);
    document.getElementById('btn-cancelar-senha').addEventListener('click', fechar);
    modal.addEventListener('click', e => { if (e.target === modal) fechar(); });

    document.getElementById('form-alterar-senha').addEventListener('submit', async ev => {
      ev.preventDefault();
      const alerta = document.getElementById('alerta-senha');
      const nova    = document.getElementById('as-nova').value;
      const confirma = document.getElementById('as-confirma').value;
      const btn     = document.getElementById('btn-as-salvar');
      alerta.className = 'alerta';
      alerta.textContent = '';
      if (nova !== confirma) {
        alerta.className = 'alerta alerta-erro';
        alerta.textContent = 'As senhas não coincidem.';
        return;
      }
      btn.disabled = true;
      try {
        await Api.post('/auth/alterar-senha', {
          senha_atual: document.getElementById('as-atual').value,
          nova_senha: nova,
        });
        alerta.className = 'alerta alerta-sucesso';
        alerta.textContent = 'Senha alterada com sucesso!';
        document.getElementById('form-alterar-senha').reset();
        setTimeout(fechar, 1500);
      } catch (err) {
        alerta.className = 'alerta alerta-erro';
        alerta.textContent = err.erro || err.message || 'Erro ao alterar senha.';
      } finally {
        btn.disabled = false;
      }
    });
  }
  document.getElementById('alerta-senha').className = 'alerta';
  document.getElementById('alerta-senha').textContent = '';
  document.getElementById('form-alterar-senha').reset();
  modal.style.display = 'flex';
}

// ── Geolocalização ────────────────────────────────────────────────────────
/**
 * Captura a posição GPS atual do dispositivo.
 * Resolve com { geo_lat, geo_lng, geo_precisao } ou null se negada/indisponível.
 * Timeout de 12 segundos; alta precisão habilitada.
 */
function capturarGeolocalizacao() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        geo_lat:      pos.coords.latitude,
        geo_lng:      pos.coords.longitude,
        geo_precisao: Math.round(pos.coords.accuracy),
      }),
      ()  => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

// ── Utilitários de data/hora ───────────────────────────────────────────────
// O backend armazena tudo em UTC (datetime.utcnow). Para exibir corretamente
// no fuso de Brasília (UTC-3 / America/Sao_Paulo) é preciso:
//  1. Informar ao JS que o ISO string é UTC adicionando 'Z' quando ausente
//  2. Converter para o fuso correto via Intl / toLocaleString

function _utcIso(iso) {
  // Adiciona 'Z' se o string não tiver indicador de fuso (naive UTC do Python)
  if (!iso) return iso;
  return (iso.includes('Z') || iso.includes('+')) ? iso : iso + 'Z';
}

// Formata timestamp (data + hora) em horário de Brasília
function dataHoraFmt(iso) {
  if (!iso) return '—';
  return new Date(_utcIso(iso)).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// Formata data (sem hora). Strings YYYY-MM-DD são tratadas literalmente
// para evitar deslocamento de dia por fuso horário.
function dataFmt(iso) {
  if (!iso) return '—';
  if (iso.length === 10) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  return new Date(_utcIso(iso)).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });
}
