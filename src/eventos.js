// @ts-check
// Antes, "config/evento" era un único doc que se pisaba cada vez que se guardaba
// el evento — los invitados no tenían forma de saber a qué noche pertenecían, así
// que la lista de una noche se seguía mostrando en la siguiente si nadie la
// borraba a mano en Firebase (pasó el fin de semana del 12/9/2026). Ahora cada
// noche es un doc propio en "eventos", y "config/activo" apunta a cuál es la
// noche activa en este momento — invitados.js filtra por ese id.
import { db, firebase } from './firebase.js';

/** @typedef {{ id: string, nombreEvento: string, fecha: string, horaCorte: string, edadMinima?: number }} Evento */

// valor por defecto de "edad mínima para listas RRPP" cuando el evento activo
// todavía no tiene nada cargado (eventos viejos, o recién creado) — antes esto
// estaba hardcodeado en +20 en varios lugares del código.
export const EDAD_MINIMA_DEFECTO = 20;

/** @type {Evento|null} */
let eventoActivo = null;

/** @type {Array<(evento: Evento|null) => void>} */
const listeners = [];

function notificar() {
  listeners.forEach(cb => cb(eventoActivo));
}

/**
 * Se llama inmediatamente con el valor actual y de nuevo cada vez que cambia.
 * @param {(evento: Evento|null) => void} callback
 */
export function onEventoActivoChange(callback) {
  listeners.push(callback);
  callback(eventoActivo);
}

export function getEventoActivo() {
  return eventoActivo;
}

/** Edad mínima del evento activo, o el valor por defecto si no tiene nada cargado. */
export function getEdadMinimaActiva() {
  return (eventoActivo && eventoActivo.edadMinima) || EDAD_MINIMA_DEFECTO;
}

/** @type {(() => void)|null} */
let unsubEvento = null;

/** @param {string|null} id */
function suscribirEvento(id) {
  if (unsubEvento) { unsubEvento(); unsubEvento = null; }
  if (!id) {
    eventoActivo = null;
    notificar();
    return;
  }
  unsubEvento = db.collection('eventos').doc(id).onSnapshot((/** @type {any} */ doc) => {
    eventoActivo = doc.exists ? { id: doc.id, ...doc.data() } : null;
    notificar();
  });
}

// puntero al evento activo — se resuelve en cuanto llega el primer snapshot
db.collection('config').doc('activo').onSnapshot((/** @type {any} */ doc) => {
  const id = doc.exists ? doc.data().eventoActivoId : null;
  suscribirEvento(id || null);
});

/**
 * Guarda el evento de esta noche. Si ya existe un evento para la fecha de hoy
 * (ej: el admin solo está ajustando el horario de corte a mitad de la noche),
 * lo actualiza en el mismo doc para no perder los invitados ya cargados. Si es
 * un día nuevo, crea un evento nuevo y lo marca como activo — así la próxima
 * noche arranca con la lista de invitados vacía sin que nadie tenga que
 * resetear nada a mano.
 * @param {{ nombreEvento: string, horaCorte: string, edadMinima: number }} datos
 * @returns {Promise<string>} el id del evento (nuevo o existente) que quedó activo
 */
export async function guardarEventoDeHoy({ nombreEvento, horaCorte, edadMinima }) {
  const fecha = new Date().toISOString().slice(0, 10);
  const existente = await db.collection('eventos').where('fecha', '==', fecha).limit(1).get();

  let eventoId;
  if (!existente.empty) {
    eventoId = existente.docs[0].id;
    await db.collection('eventos').doc(eventoId).update({ nombreEvento, horaCorte, edadMinima });
  } else {
    const ref = await db.collection('eventos').add({
      nombreEvento,
      horaCorte,
      edadMinima,
      fecha,
      creadoEn: firebase.firestore.FieldValue.serverTimestamp()
    });
    eventoId = ref.id;
  }

  await db.collection('config').doc('activo').set({ eventoActivoId: eventoId }, { merge: true });
  return eventoId;
}
