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
