# Autenticación básica para toda la app

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

## Objetivo

Exigir usuario/clave para entrar a **toda la app** — tanto las páginas
como la API — usando HTTP Basic Auth a nivel de middleware de Next.js.
Sin pantallas nuevas, sin cambios en el frontend existente.

## Alcance (decidido en brainstorming)

- Protege **todo**: la página del kiosko y los tres métodos de
  `/api/estado`. No solo las acciones que cambian datos — también evita
  que alguien sin credenciales vea la programación.
- Mecanismo: HTTP Basic Auth vía `middleware.ts`, usando el cuadro nativo
  de usuario/clave del navegador (`WWW-Authenticate: Basic`), no una
  pantalla de login propia.
- Un solo usuario/clave compartido para todos los dispositivos (todas las
  tablets y el propio usuario) — no hay necesidad de credenciales por
  operario.
- Credenciales provistas por el usuario, guardadas **solo** como
  variables de entorno (`AUTH_USER`, `AUTH_PASSWORD`) — nunca en el
  código ni en documentos versionados en git.
- No requiere cambios en `app/page.tsx`: el navegador reenvía las
  credenciales automáticamente en cada petición al mismo origen una vez
  autenticado una vez (comportamiento estándar de Basic Auth en
  navegadores), así que el polling cada 20s sigue funcionando sin
  tocarlo.
- Descartado por ahora: pantalla de PIN propia (más trabajo de diseño) y
  la protección nativa de contraseña de Vercel (función de pago, plan
  Pro).

## Diseño técnico

### `middleware.ts` (nuevo archivo, raíz del proyecto)

- Se ejecuta antes de cualquier ruta (`matcher: ["/(.*)"]`).
- Lee el header `Authorization` de la petición. Si falta, o no es
  `Basic <credenciales-correctas-en-base64>`, responde `401` con header
  `WWW-Authenticate: Basic realm="Kiosko Produccion"` — esto dispara el
  cuadro nativo del navegador.
- Compara usuario/clave decodificados contra `process.env.AUTH_USER` /
  `process.env.AUTH_PASSWORD`. Comparación de igualdad simple (no hace
  falta comparación de tiempo constante para este nivel de amenaza —
  disuadir acceso casual/automatizado, no un atacante dirigido).
- Corre en el edge runtime (comportamiento por defecto del middleware de
  Next.js), consistente con el resto de la app (`app/api/estado/route.ts`
  ya usa `runtime = "edge"`).

### Variables de entorno

- `AUTH_USER`, `AUTH_PASSWORD` — se agregan a `.env.local` (ya ignorado
  por git) para desarrollo local, y a Vercel → Project Settings →
  Environment Variables para producción (requiere un redeploy para
  tomar efecto, igual que las variables de Redis — ver `docs/DEPLOY.md`).
- Si cualquiera de las dos variables falta en el entorno, el middleware
  debe rechazar **todas** las peticiones con 401 (fail-closed, no
  fail-open) — así un despliegue mal configurado bloquea el acceso en
  vez de dejarlo abierto sin darse cuenta.

### Documentación

- Se agrega una sección a `docs/DEPLOY.md` explicando cómo configurar
  `AUTH_USER`/`AUTH_PASSWORD` en Vercel, y cómo configurar usuario/clave
  una sola vez en el navegador kiosko de las tablets (ej. Fully Kiosk
  Browser tiene un campo de "HTTP Authentication" en sus ajustes).

## Fuera de alcance

Los otros 3 hallazgos menores identificados durante la revisión del botón
de deshacer (falta de config de ESLint, duplicación de código entre
`marcar`/`limpiarEstado`, condición de carrera en marcaciones rápidas
seguidas) se abordan por separado, no como parte de este cambio.
