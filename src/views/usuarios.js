// @ts-check
import { db, firebase } from '../firebase.js';
import { etiquetaRol } from '../auth.js';
import { registrarAuditoria } from '../auditoria.js';
import { escapeHtml, escapeAttr } from '../ui.js';

export function initUsuarios() {
  document.getElementById('btnCrearUsuario')?.addEventListener('click', () => {
    const nombreInput = /** @type {HTMLInputElement} */ (document.getElementById('nuevoUsuarioNombre'));
    const rol = /** @type {HTMLSelectElement} */ (document.getElementById('nuevoUsuarioRol')).value;
    const nombre = nombreInput.value.trim();
    const statusEl = /** @type {HTMLElement} */ (document.getElementById('usuarioStatus'));
    if (!nombre) {
      statusEl.textContent = 'Falta el nombre.';
      statusEl.className = 'status-msg err';
      return;
    }
    statusEl.textContent = 'Generando PIN...';
    statusEl.className = 'status-msg';

    /** @param {number} intentos */
    function intentarConPinUnico(intentos) {
      const pin = generarPin4Digitos();
      db.collection('usuarios').where('pin', '==', pin).where('activo', '==', true).limit(1).get().then((/** @type {any} */ snap) => {
        if (!snap.empty && intentos > 0) { intentarConPinUnico(intentos - 1); return; }
        db.collection('usuarios').add({
          nombre, rol, pin, activo: true, creadoEn: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
          statusEl.innerHTML = `${escapeHtml(nombre)} creado/a. Su PIN es <strong>${pin}</strong> — pasáselo para que pueda entrar.`;
          statusEl.className = 'status-msg ok';
          nombreInput.value = '';
          registrarAuditoria('alta_usuario', 'Agregó a ' + nombre + ' (' + etiquetaRol(rol) + ')');
          renderUsuarios();
        }).catch((/** @type {any} */ e) => {
          statusEl.textContent = 'Error: ' + e.message;
          statusEl.className = 'status-msg err';
        });
      });
    }
    intentarConPinUnico(5);
  });
}

function generarPin4Digitos() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function renderUsuarios() {
  const cont = /** @type {HTMLElement} */ (document.getElementById('listaUsuarios'));
  db.collection('usuarios').orderBy('creadoEn', 'asc').get().then((/** @type {any} */ snap) => {
    if (snap.empty) { cont.innerHTML = '<div class="muted">Todavía no hay nadie cargado.</div>'; return; }
    cont.innerHTML = snap.docs.map((/** @type {any} */ d) => {
      const u = d.data();
      const tagClass = u.rol === 'admin' ? 'tag-admin' : (u.rol === 'carga' ? 'tag-rrpp' : 'tag-dueno');
      return `<div class="usuario-row${u.activo ? '' : ' inactivo'}">
        <span><span class="u-nombre">${escapeHtml(u.nombre)}</span> <span class="tag ${tagClass}">${etiquetaRol(u.rol)}</span></span>
        <span class="u-right">
          <span class="u-pin">${escapeHtml(u.pin)}</span>
          <button class="btn-sm btn-secondary" data-id="${d.id}" data-activo="${u.activo}" data-nombre="${escapeAttr(u.nombre)}">${u.activo ? 'Desactivar' : 'Activar'}</button>
        </span>
      </div>`;
    }).join('');
    cont.querySelectorAll('button[data-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const el = /** @type {HTMLElement} */ (btn);
        const nuevoEstado = el.dataset.activo !== 'true';
        db.collection('usuarios').doc(el.dataset.id).update({ activo: nuevoEstado }).then(() => {
          registrarAuditoria(nuevoEstado ? 'reactivar_usuario' : 'desactivar_usuario', (nuevoEstado ? 'Reactivó' : 'Desactivó') + ' a ' + el.dataset.nombre);
          renderUsuarios();
        });
      });
    });
  }).catch(() => { cont.innerHTML = '<div class="muted">No se pudo cargar la lista.</div>'; });
}

export function renderAuditoria() {
  const cont = /** @type {HTMLElement} */ (document.getElementById('listaAuditoria'));
  db.collection('auditoria').orderBy('creadoEn', 'desc').limit(20).get().then((/** @type {any} */ snap) => {
    if (snap.empty) { cont.innerHTML = '<div class="muted">Sin actividad todavía.</div>'; return; }
    cont.innerHTML = snap.docs.map((/** @type {any} */ d) => {
      const a = d.data();
      const hora = a.creadoEn && a.creadoEn.toDate ? a.creadoEn.toDate().toLocaleString('es-AR') : '';
      return `<div class="auditoria-row"><strong>${escapeHtml(a.usuario || '—')}</strong> — ${escapeHtml(a.detalle || a.accion || '')}<span class="a-hora">${escapeHtml(hora)}</span></div>`;
    }).join('');
  }).catch(() => { cont.innerHTML = '<div class="muted">No se pudo cargar la actividad.</div>'; });
}
