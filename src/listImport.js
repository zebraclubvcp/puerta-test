// @ts-check
// Importación de listas de invitados desde PDF (pdf.js, cargado como <script>
// global en index.html, igual que antes de la migración).

/** @type {any} */
const pdfjsLib = /** @type {any} */ (window).pdfjsLib;
if (pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Muchas listas en PDF vienen en varias columnas (para que entren más nombres por página).
// pdf.js entrega cada "corrida" de texto con su posición X; si simplemente uniéramos todo lo
// que está a la misma altura con un espacio, terminaríamos pegando 2 o 3 personas de columnas
// distintas en un solo nombre. Por eso, si el salto horizontal entre dos corridas de texto es
// mucho más grande que el tamaño de letra (osea, no es un espacio normal entre palabras),
// lo tratamos como el borde de una columna y empezamos un nombre nuevo.
/** @param {any[]} items */
export function extraerLineasDePagina(items) {
  /** @type {Record<number, {str: string, x: number, width: number, fontSize: number}[]>} */
  const porLinea = {};
  items.forEach(it => {
    if (!it.str || !it.str.trim()) return; // pdf.js inserta "espacios" sintéticos entre corridas de texto; se ignoran acá
    const y = Math.round(it.transform[5]);
    const fontSize = it.height || Math.abs(it.transform[0]) || 10;
    if (!porLinea[y]) porLinea[y] = [];
    porLinea[y].push({ str: it.str, x: it.transform[4], width: it.width || 0, fontSize });
  });

  // agrupa alturas casi idénticas (a veces varían 1-2pt dentro de la misma fila visual)
  const ys = Object.keys(porLinea).map(Number).sort((a, b) => b - a);
  /** @type {number[][]} */
  const gruposY = [];
  ys.forEach(y => {
    const g = gruposY.find(g => Math.abs(g[0] - y) <= 2);
    if (g) g.push(y); else gruposY.push([y]);
  });

  /** @type {string[]} */
  const lineas = [];
  gruposY.forEach(grupoY => {
    let itemsLinea = /** @type {{str: string, x: number, width: number, fontSize: number}[]} */ ([]);
    grupoY.forEach(y => { itemsLinea = itemsLinea.concat(porLinea[y]); });
    if (!itemsLinea.length) return;
    itemsLinea.sort((a, b) => a.x - b.x);

    const clusters = [[itemsLinea[0]]];
    for (let i = 1; i < itemsLinea.length; i++) {
      const prev = itemsLinea[i - 1];
      const gap = itemsLinea[i].x - (prev.x + prev.width);
      const umbralColumna = Math.max(prev.fontSize * 1.2, 10);
      if (gap > umbralColumna) clusters.push([]);
      clusters[clusters.length - 1].push(itemsLinea[i]);
    }
    clusters.forEach(cluster => {
      const texto = cluster.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
      if (texto) lineas.push(texto);
    });
  });
  return lineas;
}

/**
 * Lee un PDF y devuelve la lista de nombres detectados (numeración limpiada,
 * líneas muy cortas descartadas). Tira si pdf.js no está disponible o no se
 * pudo extraer texto — el llamador decide cómo mostrar el error.
 * @param {File} file
 * @returns {Promise<string[]>}
 */
export async function leerNombresDePdf(file) {
  if (!pdfjsLib) {
    throw new Error('No se pudo cargar el lector de PDF (revisá la conexión a internet).');
  }
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let lineas = /** @type {string[]} */ ([]);
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    lineas = lineas.concat(extraerLineasDePagina(content.items));
  }
  // limpia numeración ("1.", "1)", "-") y descarta líneas muy cortas (probable basura/encabezado)
  const nombres = lineas
    .map(l => l.replace(/^\s*\d+[.)\-:]?\s*/, '').trim())
    .filter(l => l.length >= 3);

  if (!nombres.length) {
    throw new Error('No se pudo extraer texto del PDF (¿es una foto o un escaneo? probá con uno exportado como texto).');
  }
  return nombres;
}
