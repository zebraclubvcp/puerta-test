// @ts-check
// Registro de auditoría. registrarAuditoria() se llama desde varias vistas
// (Carga, Puerta, Usuarios); el render de la lista vive en views/usuarios.js
// porque es la única vista que la muestra.
import { db, firebase } from './firebase.js';
import { getSesion } from './auth.js';

/**
 * @param {string} accion
 * @param {string} detalle
 */
export function registrarAuditoria(accion, detalle) {
  const sesion = getSesion();
  db.collection('auditoria').add({
    accion, detalle,
    usuario: sesion ? sesion.nombre : '—',
    rol: sesion ? sesion.rol : '—',
    creadoEn: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});
}
