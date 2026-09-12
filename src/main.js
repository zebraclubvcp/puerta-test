// @ts-check
import './style.css';
import './firebase.js';
import { initAuth } from './auth.js';
import { onEventoActivoChange } from './eventos.js';
import { initCarga } from './views/carga.js';
import { initPuerta } from './views/puerta.js';
import { initResumen } from './views/resumen.js';
import { initUsuarios, renderUsuarios, renderAuditoria } from './views/usuarios.js';

// Roles: "carga" ve solo Carga; "puerta" ve Puerta+Resumen; "admin" ve todo + Usuarios.
/** @type {Record<string, string[]>} */
const PERMISOS_POR_ROL = {
  carga: ['carga'],
  puerta: ['puerta', 'resumen'],
  admin: ['carga', 'puerta', 'resumen', 'usuarios']
};

/** @param {string} viewName */
function activarVista(viewName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelector('.tab-btn[data-view="' + viewName + '"]')?.classList.add('active');
  document.getElementById('view-' + viewName)?.classList.add('active');
  if (viewName === 'usuarios') { renderUsuarios(); renderAuditoria(); }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const viewName = /** @type {HTMLElement} */ (btn).dataset.view || '';
    activarVista(viewName);
  });
});

/* ---------- Header: nombre del evento activo ---------- */
onEventoActivoChange(evento => {
  const el = document.getElementById('eventoInfo');
  if (!el) return;
  if (evento) {
    el.textContent = (evento.nombreEvento || 'Sin nombre') + ' · corte RRPP ' + (evento.horaCorte || '--:--');
  } else {
    el.textContent = 'Configurá el evento en la pestaña Carga';
  }
});

/* ---------- Login + permisos por rol ---------- */
initAuth(sesion => {
  const permitido = PERMISOS_POR_ROL[sesion.rol] || [];
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const viewName = /** @type {HTMLElement} */ (btn).dataset.view || '';
    /** @type {HTMLElement} */ (btn).style.display = permitido.includes(viewName) ? 'flex' : 'none';
  });
  const primero = permitido[0];
  if (primero) activarVista(primero);
});

/* ---------- Vistas ---------- */
initCarga();
initPuerta();
initResumen();
initUsuarios();

/* ---------- PWA: service worker ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
