/**
 * filtros.js — Barra de filtros reutilizável (OPO, Hospital, período) com
 * botões de exportação (PDF, CSV, XLSX). Escopada pelo perfil do usuário.
 *
 * Uso:
 *   const f = montarFiltros(document.getElementById('barra-filtros'), {
 *     exportBase: '/reports/dashboard',   // habilita botões de exportação
 *     onChange: (params) => carregarAlgo(params),
 *   });
 *   f.getParams();  // "opo_id=1&edot_id=2&data_inicio=...&data_fim=..."
 */
function montarFiltros(container, opts = {}) {
  const { exportBase = null, onChange = null, showPeriodo = true } = opts;
  const usuario = Api.getUsuario();
  const perfil  = usuario?.perfil || '';
  const mostrarOpo      = perfil === 'cet_admin';
  const mostrarHospital = perfil === 'cet_admin' || perfil === 'opo';

  container.classList.add('barra-filtros');
  container.innerHTML = `
    <div class="filtros-linha">
      ${mostrarOpo ? `
        <div class="filtro-item">
          <label>OPO</label>
          <select id="f-opo"><option value="">Todas</option></select>
        </div>` : ''}
      ${mostrarHospital ? `
        <div class="filtro-item">
          <label>Hospital</label>
          <select id="f-edot"><option value="">Todos</option></select>
        </div>` : ''}
      ${showPeriodo ? `
        <div class="filtro-item">
          <label>De</label>
          <input type="date" id="f-inicio">
        </div>
        <div class="filtro-item">
          <label>Até</label>
          <input type="date" id="f-fim">
        </div>` : ''}
      <div class="filtro-item">
        <label>&nbsp;</label>
        <button type="button" class="btn btn-secundario btn-sm" id="f-limpar">Limpar</button>
      </div>
      ${exportBase ? `
        <div class="filtro-item filtro-export">
          <label>Exportar</label>
          <div class="export-btns">
            <button type="button" class="btn btn-sm btn-export" data-fmt="pdf">PDF</button>
            <button type="button" class="btn btn-sm btn-export" data-fmt="xlsx">XLSX</button>
            <button type="button" class="btn btn-sm btn-export" data-fmt="csv">CSV</button>
          </div>
        </div>` : ''}
    </div>
    <div id="f-alerta" class="alerta" style="margin-top:.5rem"></div>
  `;

  const selOpo  = container.querySelector('#f-opo');
  const selEdot = container.querySelector('#f-edot');
  const inpIni  = container.querySelector('#f-inicio');
  const inpFim  = container.querySelector('#f-fim');
  const alerta  = container.querySelector('#f-alerta');

  let todosEdots = [];

  function preencherEdots() {
    if (!selEdot) return;
    const opoSel = selOpo ? selOpo.value : '';
    const atual = selEdot.value;
    selEdot.innerHTML = '<option value="">Todos</option>';
    todosEdots
      .filter(e => !opoSel || String(e.opo_id) === String(opoSel))
      .forEach(e => {
        const o = document.createElement('option');
        o.value = e.id;
        o.textContent = e.sigla ? `${e.sigla} — ${e.hospital_nome}` : e.hospital_nome;
        selEdot.appendChild(o);
      });
    selEdot.value = atual && [...selEdot.options].some(o => o.value === atual) ? atual : '';
  }

  // Carrega opções conforme perfil
  (async () => {
    try {
      if (selOpo) {
        const d = await Api.listarOpos();
        (d.opos || []).forEach(o => {
          const opt = document.createElement('option');
          opt.value = o.id;
          opt.textContent = o.sigla ? `${o.sigla} — ${o.nome}` : o.nome;
          selOpo.appendChild(opt);
        });
      }
      if (selEdot) {
        const d = await Api.listarEdots();
        todosEdots = d.edots || [];
        preencherEdots();
      }
    } catch (e) { /* silencioso */ }
  })();

  function getParams() {
    const p = new URLSearchParams();
    if (selOpo && selOpo.value)   p.set('opo_id', selOpo.value);
    if (selEdot && selEdot.value) p.set('edot_id', selEdot.value);
    if (inpIni && inpIni.value)   p.set('data_inicio', inpIni.value);
    if (inpFim && inpFim.value)   p.set('data_fim', inpFim.value);
    return p.toString();
  }

  function dispararChange() { if (onChange) onChange(getParams()); }

  if (selOpo)  selOpo.addEventListener('change', () => { preencherEdots(); dispararChange(); });
  if (selEdot) selEdot.addEventListener('change', dispararChange);
  if (inpIni)  inpIni.addEventListener('change', dispararChange);
  if (inpFim)  inpFim.addEventListener('change', dispararChange);

  container.querySelector('#f-limpar').addEventListener('click', () => {
    if (selOpo)  selOpo.value = '';
    if (selEdot) { preencherEdots(); selEdot.value = ''; }
    if (inpIni)  inpIni.value = '';
    if (inpFim)  inpFim.value = '';
    dispararChange();
  });

  if (exportBase) {
    container.querySelectorAll('.btn-export').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fmt = btn.dataset.fmt;
        const qs = getParams();
        alerta.className = 'alerta';
        alerta.textContent = '';
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = '...';
        try {
          await Api.baixar(`${exportBase}.${fmt}` + (qs ? '?' + qs : ''));
        } catch (err) {
          alerta.className = 'alerta alerta-erro visivel';
          alerta.textContent = err.erro || 'Erro ao gerar relatório.';
        } finally {
          btn.disabled = false;
          btn.textContent = original;
        }
      });
    });
  }

  return { getParams };
}
