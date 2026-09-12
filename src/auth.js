// @ts-check
// Login por PIN + roles ("carga" ve solo Carga; "puerta" ve Puerta+Resumen;
// "admin" ve todo + Usuarios). Qué pestañas mostrar según el rol vive en
// main.js (es una decisión de navegación, no de autenticación).
import { db, firebase } from './firebase.js';

/** @typedef {{ id: string, nombre: string, rol: 'carga'|'puerta'|'admin' }} Sesion */

/** @type {Sesion|null} */
let sesion = null;

export function getSesion() {
  return sesion;
}

/** @param {string} rol */
export function etiquetaRol(rol) {
  return rol === 'admin' ? 'Admin' : rol === 'carga' ? 'Carga' : 'Puerta';
}

function cargarSesionGuardada() {
  try {
    const raw = localStorage.getItem('zebraSesion');
    if (raw) sesion = JSON.parse(raw);
  } catch (e) { sesion = null; }
}

function guardarSesion() {
  try { localStorage.setItem('zebraSesion', JSON.stringify(sesion)); } catch (e) {}
}

// Si la colección de usuarios está vacía (primera vez que se usa este sistema),
// se crea un admin semilla con PIN 0000 para poder entrar y cargar el resto del equipo.
// Conviene que Manu cree su propio usuario admin y desactive/cambie este apenas pueda.
function bootstrapAdminSiHaceFalta() {
  return db.collection('usuarios').limit(1).get().then((/** @type {any} */ snap) => {
    if (snap.empty) {
      return db.collection('usuarios').add({
        nombre: 'Admin', pin: '0000', rol: 'admin', activo: true,
        creadoEn: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  }).catch(() => {});
}

/**
 * Engancha el overlay de login del HTML y arranca el flujo de sesión.
 * @param {(sesion: Sesion) => void} onSesionAplicada llamado cada vez que hay una sesión válida activa
 */
export function initAuth(onSesionAplicada) {
  const loginOverlay = /** @type {HTMLElement} */ (document.getElementById('loginOverlay'));
  const loginPin = /** @type {HTMLInputElement} */ (document.getElementById('loginPin'));
  const loginStatus = /** @type {HTMLElement} */ (document.getElementById('loginStatus'));
  const userInfo = /** @type {HTMLElement} */ (document.getElementById('userInfo'));
  const btnLogin = /** @type {HTMLElement} */ (document.getElementById('btnLogin'));
  const btnLogout = /** @type {HTMLElement} */ (document.getElementById('btnLogout'));

  /** @param {string} [mensaje] */
  function mostrarLogin(mensaje) {
    sesion = null;
    try { localStorage.removeItem('zebraSesion'); } catch (e) {}
    loginOverlay.style.display = 'flex';
    loginPin.value = '';
    loginStatus.textContent = mensaje || '';
    loginStatus.className = 'status-msg' + (mensaje ? ' err' : '');
    userInfo.style.display = 'none';
    btnLogout.style.display = 'none';
  }

  function aplicarSesion() {
    if (!sesion) return;
    loginOverlay.style.display = 'none';
    userInfo.style.display = 'block';
    userInfo.textContent = sesion.nombre + ' · ' + etiquetaRol(sesion.rol);
    btnLogout.style.display = 'flex';
    onSesionAplicada(sesion);
  }

  function intentarLogin() {
    const pin = loginPin.value.trim();
    if (!pin) return;
    loginStatus.textContent = 'Verificando...';
    loginStatus.className = 'status-msg';
    db.collection('usuarios').where('pin', '==', pin).where('activo', '==', true).limit(1).get()
      .then((/** @type {any} */ snap) => {
        if (snap.empty) {
          loginStatus.textContent = 'PIN incorrecto.';
          loginStatus.className = 'status-msg err';
          return;
        }
        const doc = snap.docs[0];
        sesion = { id: doc.id, nombre: doc.data().nombre, rol: doc.data().rol };
        guardarSesion();
        aplicarSesion();
      })
      .catch((/** @type {any} */ e) => {
        loginStatus.textContent = 'Error: ' + e.message;
        loginStatus.className = 'status-msg err';
      });
  }

  btnLogin.addEventListener('click', intentarLogin);
  loginPin.addEventListener('keypress', e => { if (e.key === 'Enter') intentarLogin(); });
  btnLogout.addEventListener('click', () => {
    if (confirm('¿Cerrar sesión?')) mostrarLogin();
  });

  cargarSesionGuardada();
  bootstrapAdminSiHaceFalta().finally(() => {
    if (!sesion) { mostrarLogin(); return; }
    // revalidar que la sesión guardada siga activa (por si fue dada de baja)
    db.collection('usuarios').doc(sesion.id).get().then((/** @type {any} */ doc) => {
      if (doc.exists && doc.data().activo) {
        sesion = { id: doc.id, nombre: doc.data().nombre, rol: doc.data().rol };
        guardarSesion();
        aplicarSesion();
      } else {
        mostrarLogin('Tu acceso fue desactivado. Pedile a un admin que te dé de alta de nuevo.');
      }
    }).catch(() => aplicarSesion()); // sin conexión: dejamos pasar con la sesión ya guardada
  });
}
