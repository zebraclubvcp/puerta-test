// @ts-check
import { getEventoActivo } from '../eventos.js';
import { getInvitados, onInvitadosChange } from '../invitados.js';
import { showToast, escapeHtml } from '../ui.js';

export function initResumen() {
  onInvitadosChange(invitados => renderResumen(invitados));

  document.getElementById('btnCopiarResumen')?.addEventListener('click', async () => {
    const txt = generarTextoResumen();
    try {
      await navigator.clipboard.writeText(txt);
      showToast('Resumen copiado — pegalo donde lo quieras enviar');
    } catch (e) {
      descargarResumenTxt(txt);
      showToast('No se pudo copiar, se descargó como archivo');
    }
  });

  document.getElementById('btnDescargarResumen')?.addEventListener('click', () => {
    descargarResumenTxt(generarTextoResumen());
  });
}

/** @param {any[]} invitados */
function renderResumen(invitados) {
  const ingresados = invitados.filter(i => i.estado === 'ingresado');
  const totalEl = document.getElementById('totalIngresado');
  if (totalEl) totalEl.textContent = String(ingresados.length);
  const cont = /** @type {HTMLElement} */ (document.getElementById('resumenPorResponsable'));
  if (!ingresados.length) {
    cont.innerHTML = '<div class="muted">Todavía no hay ingresos.</div>';
    return;
  }
  /** @type {Record<string, number>} */
  const counts = {};
  ingresados.forEach(i => {
    const key = i.responsable + '||' + i.tipo;
    counts[key] = (counts[key] || 0) + 1;
  });
  const rows = Object.keys(counts).map(key => {
    const [responsable, tipo] = key.split('||');
    return { responsable, tipo, count: counts[key] };
  }).sort((a, b) => b.count - a.count);
  cont.innerHTML = rows.map(r =>
    `<div class="resumen-row"><span>${escapeHtml(r.responsable)} <span class="tag ${r.tipo === 'rrpp' ? 'tag-rrpp' : 'tag-dueno'}">${r.tipo === 'rrpp' ? 'RRPP' : 'DUEÑO'}</span></span><span class="resumen-count">${r.count}</span></div>`
  ).join('');
}

/* ---------- Exportar / compartir resumen ---------- */
function generarTextoResumen() {
  // para el texto compartido no importa si la lista era RRPP o dueño/encargado,
  // solo nombre y cantidad total ingresada por esa persona
  const evento = getEventoActivo();
  const ingresados = getInvitados().filter(i => i.estado === 'ingresado');
  /** @type {Record<string, number>} */
  const counts = {};
  ingresados.forEach(i => {
    counts[i.responsable] = (counts[i.responsable] || 0) + 1;
  });
  const rows = Object.keys(counts)
    .map(responsable => ({ responsable, count: counts[responsable] }))
    .sort((a, b) => b.count - a.count);

  let txt = '🦓 Zebra Club';
  if (evento && evento.nombreEvento) txt += ' — ' + evento.nombreEvento;
  txt += '\n';
  if (evento && evento.fecha) txt += 'Fecha: ' + evento.fecha + '\n';
  txt += 'Resumen de ingresos por lista\n\n';
  if (!rows.length) {
    txt += '(todavía no hay ingresos)\n';
  } else {
    rows.forEach(r => {
      txt += r.responsable + ': ' + r.count + '\n';
    });
  }
  txt += '\nTOTAL: ' + ingresados.length;
  return txt;
}

/** @param {string} txt */
function descargarResumenTxt(txt) {
  const evento = getEventoActivo();
  const blob = new Blob([txt], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'resumen-zebra-' + ((evento && evento.fecha) || new Date().toISOString().slice(0, 10)) + '.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
