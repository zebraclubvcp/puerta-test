// @ts-check
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calcularEdad } from './dni.js';

describe('calcularEdad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 12)); // 12/9/2026, la fecha de esta migración
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calcula bien cuando ya cumplió años este año', () => {
    expect(calcularEdad('01/01/2000')).toBe(26);
  });

  it('resta un año si todavía no cumplió en la fecha de hoy', () => {
    expect(calcularEdad('31/12/2000')).toBe(25);
  });

  it('resta un año si el cumpleaños es más adelante en el mismo mes', () => {
    expect(calcularEdad('30/09/2000')).toBe(25);
  });

  it('no resta si el cumpleaños ya pasó este mes', () => {
    expect(calcularEdad('01/09/2000')).toBe(26);
  });

  // Este es el bug real reportado por Manu el 7/9/2026: con ruido de escaneo,
  // calcularEdad() tiene que devolver null (y NUNCA una edad inventada) para
  // que la puerta pida confirmación manual en vez de rechazar a alguien mayor
  // de edad por error.
  it('devuelve null con string vacío en vez de una edad falsa', () => {
    expect(calcularEdad('')).toBeNull();
  });

  it('devuelve null con texto que no matchea el formato DD/MM/YYYY', () => {
    expect(calcularEdad('ruido de escaneo')).toBeNull();
    expect(calcularEdad('2000-01-01')).toBeNull();
    expect(calcularEdad('1/1/2000')).toBeNull();
  });
});
