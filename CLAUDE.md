# CLAUDE.md — Zebra Club: Control de listas en la puerta (puerta-test)

> Este archivo es para que cualquier sesión de Claude (en VS Code, Claude Code CLI, o donde sea) arranque con el contexto completo del proyecto sin tener que repreguntar todo. Va en la raíz del repo `zebraclubvcp/puerta-test`.

## Qué es esto

App web (PWA, un solo `index.html` por ahora) que reemplaza las listas free de RRPP y dueños en la puerta de Zebra Club, una disco en Carlos Paz, Argentina. Repo: `zebraclubvcp/puerta-test`. Deploy: GitHub Pages en `https://zebraclubvcp.github.io/puerta-test/`.

Zebra Club es un proyecto donde Manu (el usuario) constantemente arma soluciones nuevas buscando la eficiencia de la operación — este sistema nació de un diagnóstico de "Ingresos" hecho para el plan de temporada Verano 2027.

## Alcance de esta herramienta

Solo cubre el canal de "listas free" (RRPP y dueños/encargados). NO reemplaza entradas anticipadas ni taquilla — eso es terreno de una propuesta de ticketera propia (Sistemas Ícaro), todavía sin condiciones comerciales definidas. Si esta app funciona bien, Manu la quiere mostrar como modelo ya probado al equipo que le desarrolla esa ticketera.

## Reglas de negocio clave

- **RRPP**: exige +20 años, horario límite, y que la persona sea de Carlos Paz o alrededores.
- **Dueño/encargado**: sin esas restricciones, a veces con horario más flexible.
- El código PDF417 del DNI argentino trae 9 campos (trámite, apellido, nombre, sexo, DNI, ejemplar, fecha de nacimiento, fecha de emisión, CUIL parcial) pero **NO trae domicilio** — la regla de "Carlos Paz o alrededores" sigue siendo un checkbox manual del fiscalizador, nunca se puede automatizar del todo.
- Lo que sí se saca automático del escaneo: nombre exacto (para buscar en listas) y edad (calculada de la fecha de nacimiento).

## Estado funcional (al 12/9/2026)

App en producción con 4 vistas — Carga, Puerta, Resumen, Usuarios — más login por PIN con roles, PWA instalable, ingreso sin DNI y registro de auditoría.

El 7/9/2026 Manu probó el sistema en una noche real y volvió con 6 devoluciones. Se diagnosticó cada una contra el `index.html` real de producción (nunca contra suposiciones) y se armaron fixes. **Estos fixes siguen sin subirse a GitHub** — al 12/9 Manu confirmó que no los subió:

1. **Carga masiva a una lista existente**: el "+" de cada grupo usaba `prompt()` de a un nombre por vez. Se reemplazó por un modal con textarea que escribe en batch a Firestore.
2. **Matching de nombres**: `matchScoreDetallado` exigía apellido sí o sí y devolvía cero candidatos cuando la lista solo tenía nombre/apodo. Fix: si no hay apellido en común, matchea por nombre/apodo solo (puntaje más bajo), con aviso "⚠️ Coincidencia solo por nombre".
3. Se activó `db.enablePersistence({synchronizeTabs:true})` en Firestore — sin esto se perdían escrituras en tránsito con cortes de señal o recargas.
4. **Bug de edad "aleatoria"**: en realidad `calcularEdad()` devuelve `null` cuando el escaneo tiene ruido, y el código viejo lo trataba como "NO CUMPLE +20" (falso rechazo). Fix: badge "NO SE PUDO LEER" + checkbox de confirmación manual.
5. Visor de escaneo angosto (antes ocupaba toda la pantalla) con marco guía.
6. Hipótesis sin confirmar con Manu: "buscar por nombre no carga al Resumen" — el flujo exige un escaneo posterior para cerrar el ingreso; si ese escaneo falla o se abandona, la persona queda sin registrar.

Infraestructura: Firebase plan Spark (gratis) — cuotas verificadas 7/9/2026 muy por encima del uso real (50K lecturas/día, 20K escrituras/día). La fragilidad real no era el plan gratuito sino la falta de persistencia offline (ya resuelta en el punto 3).

## Rediseño visual — dirección definitiva

Motivo: la versión anterior (violeta / "Liquid Glass") se sentía genérica / hecha por IA, sin relación con la identidad real de Zebra Club (blanco y negro, rayas de cebra, Bebas Neue — la que se usa en carta digital, flyers, reportes de eventos).

**Investigación real que fundamenta la dirección** (pedida explícitamente por Manu — nunca inventar reglas de diseño sin esto):
- Zona del pulgar / touch targets (parachutedesign.ca): CTA principal abajo al centro, mínimo 44×44px (WCAG 2.1) / 48dp.
- Apps de check-in de boliche (GuestQueue y comparativas 2026): lista buscable a mano, confirmar tocando, escaneo como atajo, contadores en vivo.
- POS bajo presión (agentestudio.com): botones grandes tipo "fat finger", feedback al presionar, color agrupado por función.
- Dark mode real (Material 3 / atmos.style): negro puro + blanco puro causa halación de noche; usar #121212 y aclarar superficies para dar jerarquía; bajar ~20 puntos de saturación a los colores sobre fondo oscuro.

**Las 7 reglas de la dirección** (valen para las pantallas ya armadas y para cualquier pantalla nueva):
1. Fondo `#121212`, superficies `#1c1c1c`, bordes `#2e2e2e`, texto `#ededed`, secundario `#8f8f8f`. Nunca negro ni blanco puros.
2. Una sola cosa blanca por pantalla: la acción principal. Lo más brillante es siempre lo que hay que tocar.
3. La acción principal va abajo (zona del pulgar), 64-72px de alto.
4. Los números que se miran de reojo van grandes y arriba (Bebas Neue).
5. Color solo con significado: verde apagado `#7fbf8f` = pasó/ingresó, ámbar `#d9b45b` = atención/linterna. Nada decorativo.
6. Las rayas de cebra como firma (sombra del botón principal, logo del header), no como pared blanca.
7. Tipografía: Bebas Neue (títulos y números) + Onest (resto).

**Regla de interacción que salió de diseñar la pantalla de Carga**: la acción primaria puede cambiar según el estado — es primaria la que corresponde al momento (ej: "GUARDAR EVENTO" pasa a ser "AGREGAR A LA LISTA" una vez que el evento ya se guardó).

**Canvas de diseño (Claude Design)**: https://claude.ai/code/artifact/024ad1c5-23f4-45e9-83a1-be64791650f6 — página "Definitivo" (4 pantallas finales) y página "Exploración" (direcciones viejas A/B/C, dejadas para comparar).
- `PuertaRecomendada.dc.html`: **aprobada por Manu**.
- `CargaFinal.dc.html`, `ResumenFinal.dc.html`, `UsuariosFinal.dc.html`: armadas, **esperando devolución de Manu**.

**Linterna**: interruptor cuadrado justo debajo del visor de escaneo. Apagada = renglón gris casi invisible; encendida = pinta el renglón y las guías del visor de ámbar + aparece un ícono chico junto al reloj del header (para no olvidársela prendida). Criterio: la frecuencia de uso define la ubicación, no compite con el CTA principal.

**Tipografía — pendiente de decisión de Manu**: encontró TT Interphases Pro ("letras copadas para app") pero es paga (~US$34 por estilo / ~US$307 la familia completa), no está en Google Fonts y no se puede incrustar sin licencia. La dirección definitiva usa **Onest** (gratuita, Google Fonts) mientras tanto. Queda pendiente que decida si compra la licencia.

## Backend — Firebase, proyecto "zebra-puerta"

- Firestore Standard, región `southamerica-east1` (São Paulo).
- Reglas: `allow read, write: if true;` — sin Firebase Auth real, el único gate es el PIN a nivel de interfaz.
- **Restricción dura y repetida: ninguna sesión de Claude puede modificar las reglas de seguridad de Firestore, ni con autorización explícita de Manu.**
- Config del SDK (pública, va en el código cliente tal cual):

```js
const firebaseConfig = {
  apiKey: "AIzaSyDYjdQw1YS2fGOb5EmwNSk8X-mGOtlUduQ",
  authDomain: "zebra-puerta.firebaseapp.com",
  projectId: "zebra-puerta",
  storageBucket: "zebra-puerta.firebasestorage.app",
  messagingSenderId: "953302953272",
  appId: "1:953302953272:web:ffea2258d872b34a6d25cd"
};
```

- Plan Spark (free) — cuotas verificadas 7/9/2026: 50K lecturas/día, 20K escrituras/día, 20K borrados/día, 1GiB almacenado, 10GiB red/mes.
- Firebase acá **no tiene deploy propio** — es solo la base de datos a la que la app se conecta desde el navegador con el SDK cliente. El único deploy real de este proyecto es el del sitio estático a GitHub Pages.

### Colecciones Firestore
- `config/evento`: `{ nombreEvento, fecha, horaCorte }`
- `invitados`: `{ nombreCompleto, responsable, tipo: "rrpp"|"dueno", estado: "pendiente"|"ingresado", horaIngreso, dni, edadCalculada, cargadoPor, ingresadoPor, sinDni, creadoEn }`
- `usuarios`: `{ nombre, pin, rol: "carga"|"puerta"|"admin", activo, creadoEn }`
- `auditoria`: `{ accion, detalle, usuario, rol, creadoEn }`

## Arquitectura actual vs. objetivo

**Hoy**: un solo `index.html` con las 4 vistas, el login, el matching, el escaneo, Firestore y el service worker todos mezclados. Ese formato es la causa raíz de bugs como el de la "edad aleatoria": un cambio en una parte puede romper otra sin que se note hasta usarlo en vivo.

**Objetivo (reestructuración en curso, ver pendientes)**: proyecto Vite con módulos separados por responsabilidad (auth/PIN, conexión a Firestore, matching de nombres, lectura de DNI + cálculo de edad, importación de listas/PDF, un archivo por vista), tests con Vitest para matching y cálculo de edad (las partes que ya generaron bugs), chequeo de tipos liviano con JSDoc + `// @ts-check` (sin migrar a TypeScript completo por ahora), y un workflow de GitHub Actions que compila y publica en Pages automáticamente en cada push a `main`. `manifest.json`, `sw.js` e íconos se mantienen como están (van en la carpeta `public/` de Vite, se copian tal cual).

Orden de migración acordado: (1) pasar el código actual a la nueva estructura SIN cambiar comportamiento, verificar que el pipeline de build/deploy funciona igual que hoy; (2) agregar los tests sobre el comportamiento actual, como red de seguridad; (3) recién ahí incorporar el rediseño ya aprobado en el canvas, vista por vista, probando local antes de cada push.

## Reglas aprendidas para trabajar en este proyecto

- Para diagnosticar un bug, SIEMPRE leer el código real primero (antes: `raw.githubusercontent.com/zebraclubvcp/puerta-test/main/index.html`; ahora, con el repo clonado, el archivo local) — nunca asumir qué contiene una vista.
- Nunca `height: 100%` fijo en `html`/`body` — usar siempre `min-height`.
- El apellido no siempre está en las listas cargadas a mano — el matching de nombres necesita siempre un fallback de menor confianza por nombre/apodo solo.
- Firestore sin `enablePersistence({synchronizeTabs:true})` pierde escrituras en tránsito con cortes de señal — ya está activado, no sacarlo.
- Identidad visual: fuera de la app (piezas impresas, carta digital, flyers) Zebra Club es blanco/negro puro + rayas + Bebas Neue. DENTRO de la app (uso nocturno) la versión correcta es `#121212`/`#ededed` con las rayas como acento — no mezclar los dos sistemas.
- En listas densas dentro de una tarjeta de 390px, separar nombre+tag de contador+iconos con `white-space:nowrap` / `min-width:0` / `flex-shrink:0`.
- Antes de sumar cualquier librería nueva por CDN, verificar con un fetch real que la URL exacta existe.
- Manu no juzga disposición/layout, solo comportamiento por uso real: da devoluciones de funcionalidad y espera que la traducción a diseño la resuelva Claude sin preguntarle gusto en cada detalle. Cuando la decisión es puramente estética y él no tiene con qué juzgarla, investigar apps reales y reglas medidas, y recomendar UNA dirección con motivos — no ofrecerle más opciones para elegir.
- Para cambios de diseño/UX o de arquitectura NO triviales, discutir el trade-off con Manu antes de escribir código. (Esta reestructuración completa se discutió y acordó con él el 11-12/9/2026 antes de tocar nada.)
- Restricción dura, repetida: nunca tocar ni proponer tocar las reglas de seguridad de Firestore.

## Pendientes al 12/9/2026

1. Manu: terminar de instalar VS Code + extensión Claude Code, clonar el repo localmente, dejar el flujo de push funcionando.
2. Subir los 6 fixes de comportamiento (arriba) a producción — siguen sin estar en GitHub.
3. Devolución de Manu sobre las pantallas de Carga / Resumen / Usuarios en el canvas de diseño.
4. Decisión de tipografía: quedarse con Onest o comprar la licencia de TT Interphases Pro.
5. Reestructurar `index.html` en el proyecto Vite modular (ver arriba), con tests para matching/DNI antes de tocar comportamiento.
6. Recién después de reestructurar, incorporar el rediseño aprobado pantalla por pantalla.
7. Pendiente de siempre: que Manu cree su propio usuario admin real en la vista Usuarios y desactive el PIN semilla `0000`.
