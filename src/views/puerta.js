// @ts-check
import { db } from '../firebase.js';
import { getSesion } from '../auth.js';
import { getEventoActivo } from '../eventos.js';
import { getInvitados, onInvitadosChange } from '../invitados.js';
import { registrarAuditoria } from '../auditoria.js';
import { normalizar, tokens, matchScoreDetallado } from '../matching.js';
import { calcularEdad, excedeHorario, parseDniPdf417 } from '../dni.js';
import { showToast, escapeHtml } from '../ui.js';

/** @type {any} */
const ZXing = /** @type {any} */ (window).ZXing;

/** @type {any|null} invitado elegido a mano, pendiente de escaneo */
let preseleccion = null;
/** @type {any|null} candidato en pantalla, a la espera de confirmar ingreso */
let candidato = null;
/** modoBusquedaManual decide qué pasa al tocar un resultado:
 * "con_dni" (default): hay que escanear el DNI igual para confirmar edad/identidad.
 * "sin_dni": se salta el escaneo por completo (persona sin DNI encima) — sin verificar nada,
 * a criterio del fiscalizador; queda registrado en la auditoría al confirmar.
 * @type {'con_dni'|'sin_dni'} */
let modoBusquedaManual = 'con_dni';

let currentStream = /** @type {MediaStream|null} */ (null);
let reader = /** @type {any} */ (null);

export function initPuerta() {
  if (ZXing) {
    const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } = ZXing;
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.PDF_417]);
    reader = new BrowserMultiFormatReader(hints);
  }

  document.getElementById('btnEscanear')?.addEventListener('click', () => { preseleccion = null; iniciarEscaneo(); });
  document.getElementById('btnBuscarManual')?.addEventListener('click', () => {
    const box = /** @type {HTMLElement} */ (document.getElementById('buscarManualBox'));
    if (box.style.display === 'block' && modoBusquedaManual === 'con_dni') { box.style.display = 'none'; return; }
    abrirBusquedaManual('con_dni');
  });
  document.getElementById('btnSinDni')?.addEventListener('click', () => {
    const box = /** @type {HTMLElement} */ (document.getElementById('buscarManualBox'));
    if (box.style.display === 'block' && modoBusquedaManual === 'sin_dni') { box.style.display = 'none'; return; }
    abrirBusquedaManual('sin_dni');
  });
  document.getElementById('inputBuscar')?.addEventListener('input', renderBusquedaManual);

  onInvitadosChange(() => {
    const box = document.getElementById('buscarManualBox');
    if (box && box.style.display !== 'none') renderBusquedaManual();
  });

  document.getElementById('btnCancelarCandidato')?.addEventListener('click', () => {
    candidato = null;
    preseleccion = null;
    /** @type {HTMLElement} */ (document.getElementById('candidatoCard')).style.display = 'none';
    /** @type {HTMLElement} */ (document.getElementById('btnConfirmarIngreso')).style.display = 'flex';
  });

  document.getElementById('btnConfirmarIngreso')?.addEventListener('click', confirmarIngreso);
}

/* ---------- Búsqueda manual (fallback) + ingreso sin DNI ---------- */
/** @param {'con_dni'|'sin_dni'} modo */
function abrirBusquedaManual(modo) {
  modoBusquedaManual = modo;
  const box = /** @type {HTMLElement} */ (document.getElementById('buscarManualBox'));
  box.style.display = 'block';
  const label = /** @type {HTMLElement} */ (document.getElementById('buscarManualModoLabel'));
  if (modo === 'sin_dni') {
    label.textContent = '⚠️ Elegí a la persona: vas a confirmar su ingreso SIN escanear el DNI.';
    label.className = 'status-msg err';
  } else {
    label.textContent = 'Elegí a la persona y después escaneá su DNI para confirmar.';
    label.className = 'status-msg';
  }
  renderBusquedaManual();
}

function renderBusquedaManual() {
  const q = normalizar(/** @type {HTMLInputElement} */ (document.getElementById('inputBuscar')).value);
  const cont = /** @type {HTMLElement} */ (document.getElementById('resultadosBusqueda'));
  if (!q) { cont.innerHTML = ''; return; }
  const pendientes = getInvitados().filter(i => i.estado === 'pendiente');
  const results = pendientes.filter(p => normalizar(p.nombreCompleto).includes(q)).slice(0, 8);
  if (!results.length) {
    cont.innerHTML = '<div class="muted" style="margin-top:6px;">Sin coincidencias.</div>';
    return;
  }
  cont.innerHTML = results.map(p =>
    `<div class="search-result" data-id="${p.id}">${escapeHtml(p.nombreCompleto)} <span class="tag ${p.tipo === 'rrpp' ? 'tag-rrpp' : 'tag-dueno'}">${p.tipo === 'rrpp' ? 'RRPP' : 'DUEÑO'}</span> · ${escapeHtml(p.responsable)}</div>`
  ).join('');
  cont.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => {
      const inv = getInvitados().find(i => i.id === /** @type {HTMLElement} */ (el).dataset.id);
      /** @type {HTMLElement} */ (document.getElementById('buscarManualBox')).style.display = 'none';
      if (modoBusquedaManual === 'sin_dni') {
        mostrarCandidato(inv, null, null, 1, true);
      } else {
        const scanStatus = /** @type {HTMLElement} */ (document.getElementById('scanStatus'));
        scanStatus.textContent = 'Seleccionado: ' + inv.nombreCompleto + '. Ahora escaneá su DNI para confirmar identidad y edad.';
        scanStatus.className = 'status-msg';
        preseleccion = inv; // se completará con el escaneo
        iniciarEscaneo();
      }
    });
  });
}

/* ---------- Escaneo DNI (ZXing) ---------- */
function iniciarEscaneo() {
  const video = /** @type {HTMLVideoElement} */ (document.getElementById('video'));
  const statusEl = /** @type {HTMLElement} */ (document.getElementById('scanStatus'));
  video.style.display = 'block';
  statusEl.textContent = 'Pidiendo acceso a la cámara...';
  statusEl.className = 'status-msg';

  reader.decodeFromConstraints(
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
    video,
    (/** @type {any} */ result, /** @type {any} */ err) => {
      if (result) {
        const parsed = parseDniPdf417(result.getText());
        onDniEscaneado(parsed);
      }
    }
  ).then(() => {
    statusEl.textContent = 'Cámara activa. Apuntá al código de barras de atrás del DNI.';
    currentStream = video.srcObject;
    activarLinterna();
  }).catch((/** @type {any} */ e) => {
    statusEl.textContent = 'Error al acceder a la cámara: ' + e.message;
    statusEl.className = 'status-msg err';
  });
}

function activarLinterna() {
  if (!currentStream) return;
  const track = currentStream.getVideoTracks()[0];
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  const btnTorch = /** @type {HTMLElement} */ (document.getElementById('btnTorch'));
  if (caps.torch) {
    btnTorch.style.display = 'flex';
    let on = false;
    btnTorch.onclick = () => {
      on = !on;
      track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {});
      /** @type {HTMLElement} */ (document.getElementById('btnTorchLabel')).textContent = on ? 'Apagar linterna' : 'Linterna';
    };
  }
}

function detenerEscaneo() {
  try { reader.reset(); } catch (e) {}
  /** @type {HTMLElement} */ (document.getElementById('video')).style.display = 'none';
  /** @type {HTMLElement} */ (document.getElementById('btnTorch')).style.display = 'none';
}

/** @param {import('../dni.js').DniPdf417} dni */
function onDniEscaneado(dni) {
  detenerEscaneo();
  const edad = calcularEdad(dni.fechaNacimiento);
  const statusEl = /** @type {HTMLElement} */ (document.getElementById('scanStatus'));

  if (preseleccion) {
    // ya eligieron manualmente a quién es, solo falta la edad/identidad del DNI
    mostrarCandidato(preseleccion, edad, dni, 1);
    statusEl.textContent = '';
    return;
  }

  // matching automático contra pendientes: el apellido tiene que coincidir sí o sí,
  // el nombre tolera apodos/versiones cortas (nadie anota su nombre legal completo en una lista)
  const apellidoTokens = tokens(dni.apellido);
  const nombreTokens = tokens(dni.nombre);
  const pendientes = getInvitados().filter(i => i.estado === 'pendiente');
  const candidatos = pendientes
    .map(p => {
      const m = matchScoreDetallado(apellidoTokens, nombreTokens, p.nombreCompleto);
      return m ? { p, ...m } : null;
    })
    .filter(Boolean)
    .sort((a, b) => /** @type {any} */ (b).score - /** @type {any} */ (a).score);

  if (!candidatos.length) {
    statusEl.innerHTML = '❌ No aparece en ninguna lista (' + escapeHtml(dni.apellido + ' ' + dni.nombre) + ', ' + (edad !== null ? edad + ' años' : 'edad no calculada') + '). Probá "Buscar por nombre".';
    statusEl.className = 'status-msg err';
    return;
  }

  // si hay más de una persona posible y no está claro cuál es (puntajes parecidos),
  // dejamos que el fiscalizador elija a mano en vez de adivinar
  const top = /** @type {any} */ (candidatos[0]);
  const segundo = /** @type {any} */ (candidatos[1]);
  const ambiguo = !!segundo && (top.score - segundo.score) < 0.2;

  if (!ambiguo) {
    mostrarCandidato(top.p, edad, dni, top.score, false, top.soloNombre);
  } else {
    mostrarMultiplesCandidatos(/** @type {any[]} */ (candidatos), edad, dni);
  }
}

/**
 * @param {any[]} candidatos
 * @param {number|null} edad
 * @param {import('../dni.js').DniPdf417} dni
 */
function mostrarMultiplesCandidatos(candidatos, edad, dni) {
  /** @type {HTMLElement} */ (document.getElementById('scanStatus')).textContent = '';
  /** @type {HTMLElement} */ (document.getElementById('candidatoTitle')).textContent = 'Hay más de una coincidencia';
  /** @type {HTMLElement} */ (document.getElementById('candidatoCard')).style.display = 'block';
  /** @type {HTMLElement} */ (document.getElementById('candidatoInfo')).innerHTML =
    `<div class="muted">DNI escaneado: <strong>${escapeHtml(dni.apellido + ' ' + dni.nombre)}</strong>${edad !== null ? ' · ' + edad + ' años' : ''}. Elegí a quién corresponde:</div>`;
  const checklistEl = /** @type {HTMLElement} */ (document.getElementById('candidatoChecklist'));
  checklistEl.innerHTML = candidatos.slice(0, 6).map((c, idx) =>
    `<div class="search-result" data-idx="${idx}">${escapeHtml(c.p.nombreCompleto)} <span class="tag ${c.p.tipo === 'rrpp' ? 'tag-rrpp' : 'tag-dueno'}">${c.p.tipo === 'rrpp' ? 'RRPP' : 'DUEÑO'}</span> · ${escapeHtml(c.p.responsable)}${c.soloNombre ? ' · ⚠️ solo por nombre' : ''}</div>`
  ).join('');
  /** @type {HTMLElement} */ (document.getElementById('btnConfirmarIngreso')).style.display = 'none';
  checklistEl.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => {
      const c = candidatos[Number(/** @type {HTMLElement} */ (el).dataset.idx)];
      mostrarCandidato(c.p, edad, dni, c.score, false, c.soloNombre);
    });
  });
}

/**
 * @param {any} inv
 * @param {number|null} edad
 * @param {import('../dni.js').DniPdf417|null} dni
 * @param {number} score
 * @param {boolean} [sinDni]
 * @param {boolean} [soloNombre]
 */
function mostrarCandidato(inv, edad, dni, score, sinDni, soloNombre) {
  candidato = { invitado: inv, edad, dni, score, sinDni: !!sinDni, soloNombre: !!soloNombre };
  /** @type {HTMLElement} */ (document.getElementById('candidatoTitle')).textContent = sinDni ? 'Ingreso sin DNI' : 'Datos encontrados';
  /** @type {HTMLElement} */ (document.getElementById('candidatoCard')).style.display = 'block';
  /** @type {HTMLElement} */ (document.getElementById('btnConfirmarIngreso')).style.display = 'flex';
  const tipo = inv.tipo;
  const infoEl = /** @type {HTMLElement} */ (document.getElementById('candidatoInfo'));

  if (sinDni) {
    // Ingreso sin verificar DNI: no hay edad ni identidad confirmadas, se salta
    // por completo el checklist automático — queda a criterio del fiscalizador
    // y registrado en la auditoría al confirmar.
    infoEl.innerHTML = `
      <div class="list-item"><span>Nombre en lista</span><strong>${escapeHtml(inv.nombreCompleto)}</strong></div>
      <div class="list-item"><span>Responsable</span><strong>${escapeHtml(inv.responsable)} <span class="tag ${tipo === 'rrpp' ? 'tag-rrpp' : 'tag-dueno'}">${tipo === 'rrpp' ? 'RRPP' : 'DUEÑO'}</span></strong></div>
    `;
    /** @type {HTMLElement} */ (document.getElementById('candidatoChecklist')).innerHTML =
      '<div class="status-msg err" style="text-align:left;">⚠️ No se escaneó el DNI: no hay edad ni identidad verificadas. Confirmá solo si estás seguro/a — queda registrado con tu nombre.</div>';
    /** @type {HTMLButtonElement} */ (document.getElementById('btnConfirmarIngreso')).disabled = false;
    return;
  }

  infoEl.innerHTML = `
    ${soloNombre ? '<div class="status-msg err" style="text-align:left;">⚠️ Coincidencia solo por nombre (el apellido escaneado no coincidió con la lista) — confirmá bien que es la persona correcta.</div>' : ''}
    <div class="list-item"><span>Nombre en lista</span><strong>${escapeHtml(inv.nombreCompleto)}</strong></div>
    <div class="list-item"><span>Responsable</span><strong>${escapeHtml(inv.responsable)} <span class="tag ${tipo === 'rrpp' ? 'tag-rrpp' : 'tag-dueno'}">${tipo === 'rrpp' ? 'RRPP' : 'DUEÑO'}</span></strong></div>
    ${dni && dni.apellido ? `<div class="list-item"><span>DNI escaneado</span><strong>${escapeHtml(dni.apellido + ' ' + dni.nombre)}</strong></div>` : ''}
    <div class="list-item"><span>Edad</span><strong>${edad !== null ? edad + ' años' : 'no se pudo leer'}</strong></div>
  `;

  const checklistEl = /** @type {HTMLElement} */ (document.getElementById('candidatoChecklist'));
  let bloqueaIngreso = false;
  let html = '';

  if (tipo === 'rrpp') {
    const edadDesconocida = edad === null;
    if (edadDesconocida) {
      // calcularEdad() devolvió null por ruido en el escaneo — antes esto se trataba
      // como "NO CUMPLE +20" (falso rechazo, bug reportado por Manu el 7/9/2026).
      // Ahora se pide confirmación manual en vez de bloquear automáticamente.
      html += `<div class="list-item"><span>Requisito +20 años</span><span class="badge badge-warn">NO SE PUDO LEER</span></div>`;
      html += `<div class="checkline"><input type="checkbox" id="chkEdadManual"><label for="chkEdadManual" style="margin:0;">Confirmo a ojo que es mayor de 20 años (no se pudo calcular la edad del escaneo)</label></div>`;
    } else {
      const edadOk = /** @type {number} */ (edad) >= 20;
      html += `<div class="list-item"><span>Requisito +20 años</span><span class="badge ${edadOk ? 'badge-ok' : 'badge-no'}">${edadOk ? 'OK' : 'NO CUMPLE'}</span></div>`;
      if (!edadOk) bloqueaIngreso = true;
    }

    const eventoActivo = getEventoActivo();
    const horaCorte = (eventoActivo && eventoActivo.horaCorte) || '02:00';
    const excedido = excedeHorario(horaCorte);
    html += `<div class="list-item"><span>Horario (corte ${escapeHtml(horaCorte)})</span><span class="badge ${!excedido ? 'badge-ok' : 'badge-no'}">${!excedido ? 'OK' : 'FUERA DE HORARIO'}</span></div>`;
    if (excedido) bloqueaIngreso = true;

    html += `<div class="checkline"><input type="checkbox" id="chkVcp"><label for="chkVcp" style="margin:0;">Confirmo verbalmente que es de Carlos Paz o alrededores</label></div>`;
  } else {
    html += `<div class="muted">Lista de dueño/encargado — sin restricciones de edad ni horario.</div>`;
  }
  checklistEl.innerHTML = html;

  const btnConfirmar = /** @type {HTMLButtonElement} */ (document.getElementById('btnConfirmarIngreso'));
  function actualizarBoton() {
    if (tipo === 'rrpp') {
      const chkVcp = /** @type {HTMLInputElement} */ (document.getElementById('chkVcp'));
      const chkEdadManual = /** @type {HTMLInputElement|null} */ (document.getElementById('chkEdadManual'));
      const edadPendiente = !!chkEdadManual && !chkEdadManual.checked;
      btnConfirmar.disabled = bloqueaIngreso || !chkVcp.checked || edadPendiente;
    } else {
      btnConfirmar.disabled = false;
    }
  }
  actualizarBoton();
  if (tipo === 'rrpp') {
    document.getElementById('chkVcp')?.addEventListener('change', actualizarBoton);
    document.getElementById('chkEdadManual')?.addEventListener('change', actualizarBoton);
  }
}

function confirmarIngreso() {
  if (!candidato) return;
  const { invitado, edad, dni, sinDni } = candidato;
  if (sinDni) {
    const ok = confirm('¿Confirmás el ingreso de ' + invitado.nombreCompleto + ' SIN haber escaneado su DNI? Esto queda registrado con tu nombre.');
    if (!ok) return;
  }
  const sesion = getSesion();
  db.collection('invitados').doc(invitado.id).update({
    estado: 'ingresado',
    horaIngreso: Date.now(),
    edadCalculada: sinDni ? null : edad,
    dni: (!sinDni && dni) ? { apellido: dni.apellido, nombre: dni.nombre, dni: dni.dni } : null,
    ingresadoPor: sesion ? sesion.nombre : null,
    sinDni: !!sinDni
  }).then(() => {
    showToast(sinDni ? '⚠️ Ingreso sin DNI confirmado: ' + invitado.nombreCompleto : '✅ Ingreso confirmado: ' + invitado.nombreCompleto);
    registrarAuditoria(sinDni ? 'ingreso_sin_dni' : 'confirmar_ingreso', (sinDni ? 'Confirmó ingreso SIN DNI de ' : 'Confirmó el ingreso de ') + invitado.nombreCompleto);
    candidato = null;
    preseleccion = null;
    /** @type {HTMLElement} */ (document.getElementById('candidatoCard')).style.display = 'none';
    /** @type {HTMLElement} */ (document.getElementById('scanStatus')).textContent = '';
  }).catch((/** @type {any} */ e) => {
    showToast('Error: ' + e.message);
  });
}
