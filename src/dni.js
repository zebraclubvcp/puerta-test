// @ts-check
// Lectura del código PDF417 del DNI argentino y cálculo de edad. calcularEdad
// generó un bug real (ver CLAUDE.md, punto 4 de "Estado funcional"): con ruido
// de escaneo devuelve null, y el código viejo lo trataba como "no cumple +20"
// en vez de pedir confirmación manual. Por eso tiene tests en dni.test.js.

/**
 * @param {string} fechaDDMMYYYY formato "DD/MM/YYYY", tal como viene en el PDF417
 * @returns {number|null} null si el formato no matchea o la fecha es inválida
 *   (ruido de escaneo) — nunca una edad inventada.
 */
export function calcularEdad(fechaDDMMYYYY) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((fechaDDMMYYYY || '').trim());
  if (!m) return null;
  const [_, dd, mm, yyyy] = m;
  const nacimiento = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (isNaN(nacimiento.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const noCumplioAun = hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate());
  if (noCumplioAun) edad--;
  return edad;
}

/** @param {string} horaCorteStr formato "HH:MM" */
export function excedeHorario(horaCorteStr) {
  if (!horaCorteStr) return false;
  const now = new Date();
  const h = now.getHours(), min = now.getMinutes();
  if (h >= 12) return false; // tarde/noche, todavía no llegó el corte de la madrugada
  const parts = horaCorteStr.split(':').map(Number);
  const corteMin = parts[0] * 60 + (parts[1] || 0);
  const nowMin = h * 60 + min;
  return nowMin > corteMin;
}

/**
 * @typedef {{
 *   tramite: string, apellido: string, nombre: string, sexo: string, dni: string,
 *   ejemplar: string, fechaNacimiento: string, fechaEmision: string, raw: string
 * }} DniPdf417
 */

/**
 * @param {string} raw
 * @returns {DniPdf417}
 */
export function parseDniPdf417(raw) {
  const parts = raw.split('@');
  return {
    tramite: parts[0] || '',
    apellido: parts[1] || '',
    nombre: parts[2] || '',
    sexo: parts[3] || '',
    dni: parts[4] || '',
    ejemplar: parts[5] || '',
    fechaNacimiento: parts[6] || '',
    fechaEmision: parts[7] || '',
    raw
  };
}
