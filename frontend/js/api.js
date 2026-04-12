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
