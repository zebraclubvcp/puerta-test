// @ts-check
import { defineConfig } from 'vite';

// base relativo: el sitio se sirve en https://zebraclubvcp.github.io/puerta-test/
// (GitHub Pages de proyecto, no de usuario), así que los assets no pueden
// asumir que viven en la raíz del dominio.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist'
  },
  test: {
    environment: 'node'
  }
});
