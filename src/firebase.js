// @ts-check
// Firebase (compat SDK) se carga como <script> global en index.html, no como
// paquete npm — eso no cambia con la migración a Vite (ver CLAUDE.md, sección
// "Backend — Firebase"). Acá solo lo tomamos de window y lo inicializamos.

/** @type {any} */
const firebaseGlobal = /** @type {any} */ (window).firebase;

const firebaseConfig = {
  apiKey: "AIzaSyDYjdQw1YS2fGOb5EmwNSk8X-mGOtlUduQ",
  authDomain: "zebra-puerta.firebaseapp.com",
  projectId: "zebra-puerta",
  storageBucket: "zebra-puerta.firebasestorage.app",
  messagingSenderId: "953302953272",
  appId: "1:953302953272:web:ffea2258d872b34a6d25cd"
};

firebaseGlobal.initializeApp(firebaseConfig);
export const db = firebaseGlobal.firestore();

// Sin esto se pierden escrituras en tránsito con cortes de señal o recargas
// (bug reportado por Manu el 7/9/2026) — no sacar.
db.enablePersistence({ synchronizeTabs: true }).catch((/** @type {any} */ err) => {
  console.warn('No se pudo activar la persistencia offline de Firestore:', err.code);
});

export const firebase = firebaseGlobal;
