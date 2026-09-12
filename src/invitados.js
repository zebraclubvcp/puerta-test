// @ts-check
// Cache local de invitados sincronizada en vivo con Firestore, igual que en el
// index.html original — con la diferencia de que ahora la consulta se filtra
// por el evento activo (ver eventos.js). Los invitados cargados antes de este
// cambio no tienen eventoId, así que nunca matchean acá: quedan archivados
// (visibles solo entrando directo a Firebase) sin que haya que borrar nada.
import { db } from './firebase.js';
import { onEventoActivoChange } from './eventos.js';

/** @type {any[]} */
let invitados = [];

/** @type {Array<(invitados: any[]) => void>} */
const listeners = [];

function notificar() {
  listeners.forEach(cb => cb(invitados));
}

/**
 * Se llama inmediatamente con el valor actual y de nuevo cada vez que cambia.
 * @param {(invitados: any[]) => void} callback
 */
export function onInvitadosChange(callback) {
  listeners.push(callback);
  callback(invitados);
}

export function getInvitados() {
  return invitados;
}

/** @type {(() => void)|null} */
let unsub = null;

onEventoActivoChange(evento => {
  if (unsub) { unsub(); unsub = null; }
  if (!evento) {
    invitados = [];
    notificar();
    return;
  }
  unsub = db.collection('invitados').where('eventoId', '==', evento.id)
    .onSnapshot((/** @type {any} */ snap) => {
      invitados = snap.docs.map((/** @type {any} */ d) => ({ id: d.id, ...d.data() }));
      notificar();
    });
});
