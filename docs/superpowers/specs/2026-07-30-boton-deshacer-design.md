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
llamada de WhatsApp) en el encabezado, que revierta la **última
marcación TRA/TER** hecha en esa pantalla — de verdad, sincronizado con
el backend compartido, no solo visualmente en ese tablet.

## Alcance (decidido en brainstorming)

- Deshace solo la **última marcación**, un solo nivel (no historial
  largo tipo Ctrl+Z múltiple).
- Un toque, sin confirmación — mismo comportamiento que TRA/TER.
- Deshabilitado/atenuado cuando no hay ninguna marcación reciente que
  deshacer en esa sesión de pantalla (se resetea al recargar la
  página, igual que el resto del estado en memoria).
- Después de deshacer, el botón queda deshabilitado otra vez — deshacer
  no genera una nueva acción deshacible (no hay "rehacer").
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

- Nuevo estado `ultimaAccion: { id: string; valorAnterior: Estado | undefined } | null`
  (useState, no ref — necesita disparar re-render para habilitar/
  deshabilitar el botón).
- `marcar(opId, valor)` captura `estado[opId]` **antes** de aplicar el
  cambio y lo guarda en `ultimaAccion` (excepto cuando la llamada viene
  de `deshacer()`, ver abajo).
- Nueva función `limpiarEstado(opId)`: quita la clave `opId` del estado
  local (deja la fila en blanco) y llama `DELETE /api/estado` con
  `{ id: opId }`. Sigue el mismo patrón optimista que `marcar` (aplica
  local primero, revierte silenciosamente si falla la red — el próximo
  poll reconcilia).
- Nueva función `deshacer()`:
  - Si `ultimaAccion` es `null`, no hace nada (el botón deshabilitado ya
    evita el toque).
  - Si `valorAnterior` es `undefined` → llama `limpiarEstado(id)`.
  - Si `valorAnterior` es `"TRA"` o `"TER"` → aplica ese valor sin volver
    a registrar `ultimaAccion` (para que no se pueda "deshacer el
    deshacer").
  - Al terminar, pone `ultimaAccion` en `null`.
- Botón nuevo en el header, componente `BotonDeshacer`: círculo con ícono
  SVG de flecha curva de retroceso (dibujado inline, sin dependencias
  nuevas), `disabled={!ultimaAccion}`, `onClick={deshacer}`.

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
