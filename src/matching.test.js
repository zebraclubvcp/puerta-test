// @ts-check
import { describe, it, expect } from 'vitest';
import { normalizar, esApodoDe, matchScoreDetallado, tokens } from './matching.js';

describe('normalizar', () => {
  it('saca acentos, pasa a minúsculas y colapsa espacios', () => {
    expect(normalizar('  José   Pérez  ')).toBe('jose perez');
  });

  it('devuelve string vacío para valores nulos/indefinidos', () => {
    // @ts-expect-error se prueba a propósito con un valor fuera del tipo declarado
    expect(normalizar(null)).toBe('');
    // @ts-expect-error se prueba a propósito con un valor fuera del tipo declarado
    expect(normalizar(undefined)).toBe('');
  });
});

describe('esApodoDe', () => {
  it('reconoce apodos/versiones cortas del mismo nombre', () => {
    expect(esApodoDe('manu', 'manuel')).toBe(true);
    expect(esApodoDe('male', 'malena')).toBe(true);
  });

  it('exige al menos 3 letras en común para evitar falsos positivos', () => {
    expect(esApodoDe('an', 'ana')).toBe(false);
  });

  it('rechaza nombres que no son prefijo uno del otro', () => {
    expect(esApodoDe('ana', 'ale')).toBe(false);
  });
});

describe('matchScoreDetallado', () => {
  it('matchea fuerte cuando coincide apellido y nombre', () => {
    const r = matchScoreDetallado(tokens('Perez'), tokens('Juan'), 'Juan Perez');
    expect(r).not.toBeNull();
    expect(r?.soloNombre).toBe(false);
    expect(r?.score).toBeGreaterThan(0.9);
  });

  it('tolera apodos en el nombre aunque el apellido sea exacto', () => {
    const r = matchScoreDetallado(tokens('Perez'), tokens('Manuel'), 'Manu Perez');
    expect(r).not.toBeNull();
    expect(r?.soloNombre).toBe(false);
    expect(r?.nombreRatio).toBe(1);
  });

  it('devuelve null si no hay ningún indicio en común', () => {
    const r = matchScoreDetallado(tokens('Gomez'), tokens('Pedro'), 'Juan Perez');
    expect(r).toBeNull();
  });

  it('sin apellido en común matchea por nombre/apodo solo, con puntaje bajo y marcado (fix 7/9/2026)', () => {
    // la lista de un RRPP a veces solo tiene el nombre de pila o un apodo,
    // nunca el apellido — antes esto directamente no daba ningún candidato
    const r = matchScoreDetallado(tokens('Gonzalez'), tokens('Manuel'), 'Manu');
    expect(r).not.toBeNull();
    expect(r?.soloNombre).toBe(true);
    expect(r?.score).toBeLessThanOrEqual(0.5);
  });

  it('sin apellido y sin ningún nombre/apodo en común, no da candidato', () => {
    const r = matchScoreDetallado(tokens('Gonzalez'), tokens('Manuel'), 'Rodrigo');
    expect(r).toBeNull();
  });
});
