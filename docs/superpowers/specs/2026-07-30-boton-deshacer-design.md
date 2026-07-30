# Botón "deshacer" (flecha circular de retroceso)

## Contexto

El kiosko es una sola pantalla (no hay navegación entre páginas). La única
acción mutable que hacen los operarios es marcar cada fila de OP como
`TRA` (en trabajo) o `TER` (terminado), vía los botones de la última
columna de la tabla. No existe forma de corregir un toque accidental —
si se equivocan, la única salida es avisar a alguien con acceso directo
al backend/Redis.

## Objetivo

Agregar un botón circular de "deshacer" (flecha curva hacia atrás, estilo
llamada de WhatsApp) en el encabezado, que revierta las **últimas
marcaciones TRA/TER** hechas en esa pantalla (hasta 5 pasos atrás) — de
verdad, sincronizado con el backend compartido, no solo visualmente en
ese tablet.

## Alcance (decidido en brainstorming)

- Deshace las **últimas 5 marcaciones**, en orden: cada toque retrocede
  un paso más (como un historial corto de deshacer, no solo la más
  reciente). Cubre el caso de varios errores seguidos (ej. marcar mal
  la fila A y luego también la B) sin volverse un historial infinito.
- Sin límite de tiempo: el botón queda clickeable indefinidamente hasta
  que se agote el historial (5 pasos) o se recargue la página — no se
  desactiva solo por dejarlo un rato sin tocar.
- Un toque, sin confirmación — mismo comportamiento que TRA/TER.
- Deshabilitado/atenuado cuando el historial está vacío (nada reciente
  que deshacer en esa sesión de pantalla; se resetea al recargar la
  página, igual que el resto del estado en memoria).
- Deshacer no genera una nueva entrada en el historial (no hay
  "rehacer" — no se puede deshacer un deshacer).
- Visible **siempre durante todo el turno**, no solo antes de
  "Iniciar Turno" (los errores de marcado pasan en cualquier momento del
  turno, y "Iniciar Turno" desaparece una vez se entra a pantalla
  completa).
- Ubicación: círculo a la izquierda de "Iniciar Turno" (o, cuando ese
  botón ya no está visible, como primer elemento de ese grupo, junto al
  indicador de conexión).
- Color: ámbar (`#FFB020`, ya usado como acento principal de la app),
  para distinguirlo visualmente de "Iniciar Turno" (azul).

## Diseño técnico

### Frontend (`app/page.tsx`)

- Nuevo estado `historial: { id: string; valorAnterior: Estado | undefined }[]`
  (useState, no ref — necesita disparar re-render para habilitar/
  deshabilitar el botón). Actúa como pila: se agrega al final, se
  deshace desde el final. Tamaño máximo 5 — al agregar un elemento que
  supere el límite, se descarta el más antiguo (`historial.slice(-5)`).
- `marcar(opId, valor)` captura `estado[opId]` **antes** de aplicar el
  cambio y lo agrega al final de `historial` (excepto cuando la llamada
  viene de `deshacer()`, ver abajo).
- Nueva función `limpiarEstado(opId)`: quita la clave `opId` del estado
  local (deja la fila en blanco) y llama `DELETE /api/estado` con
  `{ id: opId }`. Sigue el mismo patrón optimista que `marcar` (aplica
  local primero, revierte silenciosamente si falla la red — el próximo
  poll reconcilia).
- Nueva función `deshacer()`:
  - Si `historial` está vacío, no hace nada (el botón deshabilitado ya
    evita el toque).
  - Toma el último elemento del historial y lo quita de la pila.
  - Si su `valorAnterior` es `undefined` → llama `limpiarEstado(id)`.
  - Si `valorAnterior` es `"TRA"` o `"TER"` → aplica ese valor sin
    agregar una nueva entrada al historial (para que no se pueda
    "deshacer el deshacer").
- Botón nuevo en el header, componente `BotonDeshacer`: círculo con ícono
  SVG de flecha curva de retroceso (dibujado inline, sin dependencias
  nuevas), `disabled={historial.length === 0}`, `onClick={deshacer}`.

### Backend (`app/api/estado/route.ts`)

- Nuevo método `DELETE`: recibe `{ id }` en el body, valida que exista,
  hace `redis.hdel(HASH_KEY, id)`, responde `{ ok: true }`. Mismo
  `runtime = "edge"` que el resto del archivo.

## Diseño visual

- Círculo de ~36px (similar al tamaño del botón "Iniciar Turno" en
  altura), fondo `bg-amber/15`, borde `border-amber`, ícono en
  `text-amber` — mismo lenguaje visual que ya usa "Iniciar Turno"
  (fondo translúcido + borde + texto del color de acento).
- Ícono: flecha curva de 180° apuntando a la izquierda (U-turn / undo),
  SVG simple, centrado en el círculo.
- Estado deshabilitado: opacidad reducida (`opacity-40`,
  `cursor-not-allowed`), sin el glow/énfasis del estado activo.
- Sin texto/label — solo el ícono dentro del círculo (como los botones
  circulares de llamada de WhatsApp).
