// @ts-check
import { db, firebase } from '../firebase.js';
import { getSesion } from '../auth.js';
import { onEventoActivoChange, getEventoActivo, guardarEventoDeHoy, EDAD_MINIMA_DEFECTO } from '../eventos.js';
import { onInvitadosChange } from '../invitados.js';
import { registrarAuditoria } from '../auditoria.js';
import { leerNombresDePdf } from '../listImport.js';
import { showToast, escapeHtml, escapeAttr, SVG_CHEVRON, SVG_TRASH, SVG_PLUS, SVG_CLOSE } from '../ui.js';

/** @type {Record<string, boolean>} qué grupos de "Pendientes" están desplegados */
const gruposExpandido = {};

export function initCarga() {
  initConfigEvento();
  initAgregarLista();
  initImportarPdf();
  initPendientes();
  initModalCargaMasiva();
}

/* ---------- Config del evento ---------- */
function initConfigEvento() {
  const cfgNombre = /** @type {HTMLInputElement} */ (document.getElementById('cfgNombre'));
  const cfgHora = /** @type {HTMLInputElement} */ (document.getElementById('cfgHora'));
  const cfgEdadMinima = /** @type {HTMLInputElement} */ (document.getElementById('cfgEdadMinima'));
  const cfgStatus = /** @type {HTMLElement} */ (document.getElementById('cfgStatus'));

  onEventoActivoChange(evento => {
    cfgNombre.value = evento ? (evento.nombreEvento || '') : '';
    cfgHora.value = evento ? (evento.horaCorte || '02:00') : '02:00';
    const edadMinima = (evento && evento.edadMinima) || EDAD_MINIMA_DEFECTO;
    cfgEdadMinima.value = String(edadMinima);
    actualizarEtiquetaTipoRrpp(edadMinima);
  });

  document.getElementById('btnGuardarEvento')?.addEventListener('click', () => {
    const nombreEvento = cfgNombre.value.trim();
    const horaCorte = cfgHora.value;
    const edadMinimaIngresada = parseInt(cfgEdadMinima.value, 10);
    const edadMinima = Number.isFinite(edadMinimaIngresada) && edadMinimaIngresada > 0
      ? edadMinimaIngresada
      : EDAD_MINIMA_DEFECTO;
    guardarEventoDeHoy({ nombreEvento, horaCorte, edadMinima })
      .then(() => {
        cfgStatus.textContent = 'Evento guardado.';
        cfgStatus.className = 'status-msg ok';
      })
      .catch((/** @type {any} */ e) => {
        cfgStatus.textContent = 'Error: ' + e.message;
        cfgStatus.className = 'status-msg err';
      });
  });
}

/** @param {number} edadMinima */
function actualizarEtiquetaTipoRrpp(edadMinima) {
  const opt = document.querySelector('#nuevoTipo option[value="rrpp"]');
  if (opt) opt.textContent = `RRPP (+${edadMinima}, horario, VCP/alrededores)`;
}

/* ---------- Carga de listas ---------- */
function initAgregarLista() {
  document.getElementById('btnAgregarLista')?.addEventListener('click', () => {
    const responsable = /** @type {HTMLInputElement} */ (document.getElementById('nuevoResponsable')).value.trim();
    const tipo = /** @type {HTMLSelectElement} */ (document.getElementById('nuevoTipo')).value;
    const nombresTextarea = /** @type {HTMLTextAreaElement} */ (document.getElementById('nuevosNombres'));
    const lineas = nombresTextarea.value.split('\n').map(l => l.trim()).filter(Boolean);
    const statusEl = /** @type {HTMLElement} */ (document.getElementById('cargaStatus'));

    if (!responsable) {
      statusEl.textContent = 'Falta el nombre del responsable.';
      statusEl.className = 'status-msg err';
      return;
    }
    if (!lineas.length) {
      statusEl.textContent = 'Cargá al menos un nombre.';
      statusEl.className = 'status-msg err';
      return;
    }
    const evento = getEventoActivo();
    if (!evento) {
      statusEl.textContent = 'Configurá el evento de esta noche antes de cargar la lista.';
      statusEl.className = 'status-msg err';
      return;
    }

    const sesion = getSesion();
    const batch = db.batch();
    lineas.forEach(nombreCompleto => {
      const ref = db.collection('invitados').doc();
      batch.set(ref, {
        nombreCompleto,
        responsable,
        tipo,
        eventoId: evento.id,
        estado: 'pendiente',
        horaIngreso: null,
        dni: null,
        edadCalculada: null,
        cargadoPor: sesion ? sesion.nombre : null,
        creadoEn: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    batch.commit().then(() => {
      statusEl.textContent = lineas.length + ' persona(s) agregada(s) a la lista de ' + responsable + '.';
      statusEl.className = 'status-msg ok';
      nombresTextarea.value = '';
      registrarAuditoria('carga_lista', 'Cargó ' + lineas.length + ' nombre(s) en la lista de ' + responsable);
    }).catch((/** @type {any} */ e) => {
      statusEl.textContent = 'Error: ' + e.message;
      statusEl.className = 'status-msg err';
    });
  });
}

/* ---------- Importar lista desde PDF ---------- */
function initImportarPdf() {
  const inputPdfLista = /** @type {HTMLInputElement} */ (document.getElementById('inputPdfLista'));
  document.getElementById('btnImportarPdf')?.addEventListener('click', () => {
    inputPdfLista.click();
  });

  inputPdfLista.addEventListener('change', async (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    inputPdfLista.value = '';
    if (!file) return;
    const statusEl = /** @type {HTMLElement} */ (document.getElementById('cargaStatus'));
    statusEl.textContent = 'Leyendo PDF...';
    statusEl.className = 'status-msg';
    try {
      const nombres = await leerNombresDePdf(file);
      const textarea = /** @type {HTMLTextAreaElement} */ (document.getElementById('nuevosNombres'));
      textarea.value = (textarea.value.trim() ? textarea.value.trim() + '\n' : '') + nombres.join('\n');
      statusEl.textContent = nombres.length + ' nombre(s) detectados del PDF. Revisá la lista antes de agregarla (corregí lo que haga falta) y después tocá "+ Agregar a la lista".';
      statusEl.className = 'status-msg ok';
    } catch (err) {
      statusEl.textContent = 'Error leyendo el PDF: ' + (/** @type {any} */ (err).message);
      statusEl.className = 'status-msg err';
    }
  });
}

/* ---------- Pendientes ---------- */
function initPendientes() {
  onInvitadosChange(invitados => renderPendientes(invitados));
}

/** @param {any[]} invitados */
function renderPendientes(invitados) {
  const pendientes = invitados.filter(i => i.estado === 'pendiente');
  const totalEl = document.getElementById('totalPendientes');
  if (totalEl) totalEl.textContent = String(pendientes.length);
  const cont = /** @type {HTMLElement} */ (document.getElementById('listaPendientes'));
  if (!pendientes.length) {
    cont.innerHTML = '<div class="muted">Sin gente cargada todavía.</div>';
    return;
  }
  /** @type {Record<string, any[]>} */
  const grupos = {};
  pendientes.forEach(p => {
    const key = p.responsable + '||' + p.tipo;
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(p);
  });
  let html = '';
  Object.keys(grupos).sort().forEach(key => {
    const [responsable, tipo] = key.split('||');
    const items = grupos[key];
    const abierto = !!gruposExpandido[key];
    html += `<div class="responsable-group">
      <div class="grupo-header" data-key="${escapeAttr(key)}">
        <h3>${escapeHtml(responsable)} <span class="tag ${tipo === 'rrpp' ? 'tag-rrpp' : 'tag-dueno'}">${tipo === 'rrpp' ? 'RRPP' : 'DUEÑO'}</span></h3>
        <span class="grupo-right">
          <span class="grupo-count">${items.length} ${items.length === 1 ? 'persona' : 'personas'}<span class="chevron${abierto ? ' abierto' : ''}">${SVG_CHEVRON}</span></span>
          <button class="grupo-add-btn" data-key="${escapeAttr(key)}" title="Agregar una persona a esta lista">${SVG_PLUS}</button>
          <button class="grupo-del-btn" data-key="${escapeAttr(key)}" title="Borrar toda esta lista">${SVG_TRASH}</button>
        </span>
      </div>`;
    if (abierto) {
      html += '<div class="grupo-items">';
      items.forEach(p => {
        html += `<div class="list-item"><span>${escapeHtml(p.nombreCompleto)}</span><button class="x-btn" data-id="${p.id}" title="Quitar">${SVG_CLOSE}</button></div>`;
      });
      html += '</div>';
    }
    html += '</div>';
  });
  cont.innerHTML = html;

  cont.querySelectorAll('.grupo-header').forEach(h => {
    h.addEventListener('click', () => {
      const key = /** @type {HTMLElement} */ (h).dataset.key || '';
      gruposExpandido[key] = !gruposExpandido[key];
      renderPendientes(invitados);
    });
  });
  cont.querySelectorAll('.x-btn[data-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      db.collection('invitados').doc(/** @type {HTMLElement} */ (btn).dataset.id).delete();
    });
  });
  cont.querySelectorAll('.grupo-add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirModalCargaMasiva(/** @type {HTMLElement} */ (btn).dataset.key || '');
    });
  });
  cont.querySelectorAll('.grupo-del-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = /** @type {HTMLElement} */ (btn).dataset.key || '';
      const [responsable, tipo] = key.split('||');
      const items = invitados.filter(i => i.estado === 'pendiente' && i.responsable === responsable && i.tipo === tipo);
      if (!items.length) return;
      const ok = confirm('¿Borrar toda la lista de ' + responsable + ' (' + items.length + (items.length === 1 ? ' persona' : ' personas') + ')? No se puede deshacer.');
      if (!ok) return;
      const batch = db.batch();
      items.forEach(i => batch.delete(db.collection('invitados').doc(i.id)));
      batch.commit()
        .then(() => {
          showToast('Lista de ' + responsable + ' borrada.');
          registrarAuditoria('borrar_lista', 'Borró la lista completa de ' + responsable + ' (' + items.length + (items.length === 1 ? ' persona' : ' personas') + ')');
        })
        .catch((/** @type {any} */ e) => showToast('Error: ' + e.message));
    });
  });
}

/* ---------- Modal: carga masiva a una lista existente (reemplaza el prompt() de a un nombre) ---------- */
/** @type {string|null} */
let modalCargaMasivaKey = null;

/** @param {string} key */
function abrirModalCargaMasiva(key) {
  modalCargaMasivaKey = key;
  const [responsable] = key.split('||');
  const sub = /** @type {HTMLElement} */ (document.getElementById('modalCargaMasivaSub'));
  const textarea = /** @type {HTMLTextAreaElement} */ (document.getElementById('modalCargaMasivaTextarea'));
  const status = /** @type {HTMLElement} */ (document.getElementById('modalCargaMasivaStatus'));
  sub.textContent = 'Se van a agregar a la lista de ' + responsable + '.';
  textarea.value = '';
  status.textContent = '';
  status.className = 'status-msg';
  document.getElementById('modalCargaMasiva')?.classList.add('show');
  textarea.focus();
}

function cerrarModalCargaMasiva() {
  document.getElementById('modalCargaMasiva')?.classList.remove('show');
  modalCargaMasivaKey = null;
}

function initModalCargaMasiva() {
  document.getElementById('btnModalCargaMasivaCancelar')?.addEventListener('click', cerrarModalCargaMasiva);
  document.getElementById('btnModalCargaMasivaConfirmar')?.addEventListener('click', () => {
    if (!modalCargaMasivaKey) return;
    const [responsable, tipo] = modalCargaMasivaKey.split('||');
    const textarea = /** @type {HTMLTextAreaElement} */ (document.getElementById('modalCargaMasivaTextarea'));
    const lineas = textarea.value.split('\n').map(l => l.trim()).filter(Boolean);
    const statusEl = /** @type {HTMLElement} */ (document.getElementById('modalCargaMasivaStatus'));
    if (!lineas.length) {
      statusEl.textContent = 'Cargá al menos un nombre.';
      statusEl.className = 'status-msg err';
      return;
    }
    const evento = getEventoActivo();
    if (!evento) {
      statusEl.textContent = 'No hay un evento activo configurado.';
      statusEl.className = 'status-msg err';
      return;
    }

    const sesion = getSesion();
    const batch = db.batch();
    lineas.forEach(nombreCompleto => {
      const ref = db.collection('invitados').doc();
      batch.set(ref, {
        nombreCompleto,
        responsable,
        tipo,
        eventoId: evento.id,
        estado: 'pendiente',
        horaIngreso: null,
        dni: null,
        edadCalculada: null,
        cargadoPor: sesion ? sesion.nombre : null,
        creadoEn: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    batch.commit().then(() => {
      showToast(lineas.length + ' persona(s) agregada(s) a la lista de ' + responsable + '.');
      registrarAuditoria('carga_lista', 'Agregó ' + lineas.length + ' nombre(s) a la lista de ' + responsable);
      cerrarModalCargaMasiva();
    }).catch((/** @type {any} */ e) => {
      statusEl.textContent = 'Error: ' + e.message;
      statusEl.className = 'status-msg err';
    });
  });
}
