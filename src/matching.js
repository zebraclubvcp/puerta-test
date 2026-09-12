// @ts-check
// Matching de nombres entre lo escaneado del DNI y lo cargado a mano en las
// listas. Esta lógica generó dos bugs reales ya diagnosticados (ver
// CLAUDE.md, "Estado funcional"): por eso tiene tests en matching.test.js.

/** @param {string} str */
export function normalizar(str) {
  return (str || '')
    .toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} str */
export function tokens(str) {
  return normalizar(str).split(' ').filter(Boolean);
}

// ¿"a" y "b" son la misma palabra o una es un apodo/abreviación de la otra?
// (ej: "manu" vs "manuel", "male" vs "malena") — exige al menos 3 letras en común
// para evitar falsos positivos entre nombres cortos distintos.
/**
 * @param {string} a
 * @param {string} b
 */
export function esApodoDe(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const corta = a.length <= b.length ? a : b;
  const larga = a.length <= b.length ? b : a;
  if (corta.length < 3) return false;
  return larga.startsWith(corta);
}

/**
 * @typedef {{ score: number, apellidoRatio: number, nombreRatio: number, apellidoHits: number, soloNombre: boolean }} ResultadoMatch
 */

// Matching robusto DNI ⇄ nombre cargado en la lista:
// - el APELLIDO tiene que aparecer sí o sí (no se abrevia) → filtra cruces entre apellidos distintos
// - el NOMBRE tolera apodos/versiones cortas, porque nadie anota su nombre legal completo en una lista
// - si NO hay apellido en común (muchas listas a mano solo tienen nombre/apodo), en vez de
//   descartar directo matcheamos por nombre/apodo solo, con puntaje más bajo y marcado como
//   soloNombre, para que la puerta lo confirme a ojo (bug reportado por Manu el 7/9/2026).
// Devuelve null si no hay ningún indicio (ni apellido ni nombre/apodo) en común.
/**
 * @param {string[]} apellidoTokensDni
 * @param {string[]} nombreTokensDni
 * @param {string} nombreCompletoLista
 * @returns {ResultadoMatch|null}
 */
export function matchScoreDetallado(apellidoTokensDni, nombreTokensDni, nombreCompletoLista) {
  const invTokens = tokens(nombreCompletoLista);
  if (!invTokens.length) return null;

  const usados = new Set();
  let apellidoHits = 0;
  apellidoTokensDni.forEach(t => {
    const idx = invTokens.findIndex((it, i) => it === t && !usados.has(i));
    if (idx !== -1) { apellidoHits++; usados.add(idx); }
  });

  if (apellidoHits === 0) {
    if (!nombreTokensDni.length) return null;
    let nombreHitsSolo = 0;
    nombreTokensDni.forEach(nt => {
      if (invTokens.some(it => esApodoDe(nt, it))) nombreHitsSolo++;
    });
    if (nombreHitsSolo === 0) return null;
    const nombreRatioSolo = nombreHitsSolo / nombreTokensDni.length;
    return { score: nombreRatioSolo * 0.5, apellidoRatio: 0, nombreRatio: nombreRatioSolo, apellidoHits: 0, soloNombre: true };
  }

  const apellidoRatio = apellidoHits / apellidoTokensDni.length;
  const restantes = invTokens.filter((_, i) => !usados.has(i));

  let nombreHits = 0;
  nombreTokensDni.forEach(nt => {
    if (restantes.some(rt => esApodoDe(nt, rt))) nombreHits++;
  });
  const nombreRatio = nombreTokensDni.length ? nombreHits / nombreTokensDni.length : 1;

  const score = apellidoRatio * 0.65 + nombreRatio * 0.35;
  return { score, apellidoRatio, nombreRatio, apellidoHits, soloNombre: false };
}
