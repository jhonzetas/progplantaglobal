# Pantalla de login propia + sesión por cookie

## Contexto

El kiosko está desplegado en Vercel bajo el dominio público por defecto
`progplantaglobal.vercel.app` (plan Hobby/gratuito), sin ningún tipo de
autenticación. Ninguno de los endpoints de `/api/estado` (`GET`, `POST`,
`DELETE`) valida quién hace la petición — cualquiera que encuentre la URL
puede ver la programación de producción real, o marcar/borrar el estado
de cualquier fila, sin estar en la planta.

Este gap es preexistente (no lo introdujo el botón de deshacer, aunque el
nuevo `DELETE` hereda la misma falta de protección que ya tenían `GET` y
`POST`). Se identificó durante la revisión de esa función y se aborda
ahora como su propio trabajo.

**Revisión de este spec:** la primera versión proponía HTTP Basic Auth
(cuadro nativo del navegador). Se descartó porque el usuario pidió una
pantalla de login propia, con imagen de fondo de la planta y efectos
luminosos coherentes con el resto de la app — eso no se puede lograr con
el cuadro nativo del navegador. Este documento reemplaza esa versión.

## Objetivo

Una pantalla de login (`/login`) con diseño propio — imagen de fondo de
la planta, atenuada, tarjeta central con el mismo lenguaje visual del
resto del kiosko — que protege tanto las páginas como la API mediante una
cookie de sesión de larga duración.

## Alcance (decidido en brainstorming)

- Protege **todo**: la página del kiosko y los tres métodos de
  `/api/estado`. No solo las acciones que cambian datos — también evita
  que alguien sin credenciales vea la programación.
- Un solo usuario/clave compartido para todos los dispositivos: correo
  `gmaquinado@gmail.com` + clave (provista por el usuario). Se guardan
  **solo** como variables de entorno (`AUTH_USER`, `AUTH_PASSWORD`) —
  nunca en el código ni en documentos versionados en git.
- Formulario con dos campos: correo y clave (se consideró simplificar a
  un solo campo tipo PIN, pero el usuario prefirió mantener correo+clave
  por verse más profesional).
- Sesión larga: **~1 año** vía cookie — en la práctica, un dispositivo ya
  autenticado no vuelve a pedir la clave. Si el dispositivo se pierde o
  cambia de manos, hay que rotar `AUTH_PASSWORD` manualmente para
  invalidar la sesión.
- **Diseño visual de la pantalla de login:**
  - Imagen de fondo: `public/images/planta-global.webp` (la foto de la
    planta de maquinado provista por el usuario), a pantalla completa,
    con una capa oscura semitransparente encima (tono `panel` del tema,
    ~75-80% de opacidad) para que la tarjeta de login se lea bien sobre
    la foto.
  - Tarjeta centrada con el mismo lenguaje visual que ya usa el header
    del kiosko: reutiliza la animación `barrido-luz` (`globals.css`)
    como acento — mismo motivo de "luz recorriendo" que ya tienen el
    header y los encabezados de columna, para que la pantalla de login
    se sienta parte de la misma app y no algo pegado aparte.
  - Colores/tipografía consistentes con el resto: acento ámbar
    (`#FFB020`), `font-display` para texto, fondo oscuro `panel`.
  - **Totalmente responsivo** (celular, tablet, PC) — es una pantalla
    nueva, no tiene ningún riesgo sobre la tabla del kiosko existente
    (esa sigue exactamente igual en tablet/PC).
- Sin pantalla de "cerrar sesión" — no se pidió, no se agrega (YAGNI). Si
  hace falta invalidar sesiones más adelante, se hace rotando
  `AUTH_PASSWORD`.
- Descartado: HTTP Basic Auth nativo (no personalizable visualmente) y
  la protección de pago de Vercel (plan Pro).

## Diseño técnico

### `middleware.ts` (nuevo archivo, raíz del proyecto)

- Corre en cada petición (`matcher` excluye solo `_next/static`,
  `_next/image` y `favicon.ico` — todo lo demás pasa por el middleware).
- Rutas públicas (sin exigir cookie): `/login`, `/api/login`, y
  `/images/*` (la imagen de fondo debe poder cargar sin sesión).
- Para el resto: lee la cookie `kiosko_auth`. Si no existe o no coincide
  con `process.env.AUTH_PASSWORD`:
  - Si la ruta empieza con `/api/`: responde `401` JSON
    `{ "error": "No autenticado" }`.
  - Si no: redirige (307) a `/login`.
- **Fail-closed:** si `AUTH_USER` o `AUTH_PASSWORD` no están definidas en
  el entorno, todas las peticiones (salvo las públicas) se rechazan — un
  despliegue mal configurado bloquea el acceso en vez de dejarlo abierto
  sin darse cuenta.

### `app/login/page.tsx` (nueva página, client component)

- Formulario con dos campos (correo, clave) y botón "Entrar".
- Al enviar: `POST /api/login` con `{ correo, clave }`.
- Si la respuesta es 200: navega a `/` (la cookie ya quedó puesta por la
  respuesta del servidor).
- Si la respuesta es 401: muestra un mensaje de error ("Correo o clave
  incorrectos") sin navegar.
- Fondo: imagen `public/images/planta-global.webp` a pantalla completa
  (`object-cover`) con capa oscura encima; tarjeta centrada con el
  acento `barrido-luz` reutilizado del header.

### `app/api/login/route.ts` (nueva ruta)

- `POST`: recibe `{ correo, clave }`. Compara contra
  `process.env.AUTH_USER` / `process.env.AUTH_PASSWORD` (comparación de
  igualdad simple — el nivel de amenaza es disuadir acceso
  casual/automatizado, no un atacante dirigido, así que no hace falta
  comparación de tiempo constante ni hashing).
- Si coincide: responde 200 y pone la cookie `kiosko_auth` — httpOnly,
  `Secure`, `SameSite=Lax`, `maxAge` ~1 año (31536000 segundos), valor
  igual a `process.env.AUTH_PASSWORD` (conocer la cookie exige ya conocer
  la clave, así que no es una exposición adicional respecto a la clave
  misma).
- Si no coincide: responde 401 `{ "error": "Correo o clave incorrectos" }`.
- Mismo `runtime = "edge"` que el resto de las rutas de la API.

### Variables de entorno

- `AUTH_USER`, `AUTH_PASSWORD` — se agregan a `.env.local` (ya ignorado
  por git) para desarrollo local, y a Vercel → Project Settings →
  Environment Variables para producción (requiere un redeploy para tomar
  efecto, igual que las variables de Redis — ver `docs/DEPLOY.md`).

### Documentación

- Se agrega una sección a `docs/DEPLOY.md` explicando cómo configurar
  `AUTH_USER`/`AUTH_PASSWORD` en Vercel.

## Fuera de alcance

Los otros 3 hallazgos menores identificados durante la revisión del botón
de deshacer (falta de config de ESLint, duplicación de código entre
`marcar`/`limpiarEstado`, condición de carrera en marcaciones rápidas
seguidas) se abordan por separado, no como parte de este cambio.
