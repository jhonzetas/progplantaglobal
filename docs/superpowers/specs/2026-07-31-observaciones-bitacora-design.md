# OBSERVACIONES (Excel, solo lectura) + BITÁCORA (operarios, editable)

## Contexto

El usuario pidió dos espacios de notas nuevos en el kiosko:

1. Un espacio para que él (desde Excel) deje observaciones puntuales
   visibles en la app, sin que los operarios puedan editarlas.
2. Un espacio para que los operarios registren novedades/solicitudes del
   turno directamente en la app, sin tener que escribirlas a mano en
   papel.

## OBSERVACIONES

### Alcance (decidido en brainstorming)

- Solo lectura en la app — el usuario la escribe en Excel, la app solo
  la muestra.
- Fuente: celda **A3** de la hoja `Programa_Maq` (dentro de las filas
  1-4 que el macro ya ignora al leer filas productivas, así que no
  colisiona con nada).
- Puede quedar vacía — no es obligatoria.
- Ubicación en la app: franja de ancho completo, entre el header
  (título + fecha) y los encabezados de columna de la tabla.
- Alto objetivo: equivalente a ~3 filas de Excel. Si el texto es más
  largo de lo que cabe en ese alto, la franja tiene scroll vertical
  interno (no se trunca ni se pierde texto).
- Título "OBSERVACIONES:" a la izquierda de la franja, seguido del
  texto.

### Diseño técnico

- **Macro** (`macro/ExportarProgramacionJSON.bas`): lee
  `ws.Range("A3").Value` (texto plano, sin parseo especial) y lo agrega
  como nuevo campo de nivel superior en el JSON: `"observaciones"`.
- **JSON** (`public/data/programacion.json`): nuevo campo top-level
  `observaciones: string` (puede ser `""`).
- **Frontend** (`app/page.tsx`): nueva franja entre `<header>` y
  `<table>`, renderizada solo cuando `prog.observaciones` no está vacío
  (si está vacío, no ocupa espacio — no tiene sentido mostrar una franja
  en blanco con solo el título). Estilo visual consistente con el resto
  del kiosko (fondo panel, acento ámbar, `font-display`).

## BITÁCORA

### Alcance (decidido en brainstorming)

- **Editable por operarios**, directamente en la app — reemplaza el
  papel para "novedades o solicitudes del turno".
- **Registro tipo log**: cada nota se agrega como una entrada nueva con
  fecha/hora; las notas anteriores nunca se borran ni se sobrescriben
  al agregar una nueva.
- **Nombre del operario: opcional** por nota (campo libre, no
  obligatorio para poder guardar).
- **Sin límite** de longitud de texto ni de cantidad de entradas.
- Ubicación: al final del programa, después de la última fila de la
  tabla (hoy, el bloque de DMK 7 LASER) — dentro del área con scroll de
  la tabla, no como un panel fijo aparte.

### Diseño técnico

- **Almacenamiento**: Redis, lista bajo la clave `kiosko:bitacora`
  (`LPUSH`/`LRANGE` de Upstash), cada entrada un JSON serializado
  `{ texto: string, autor: string | null, fecha: string }` (fecha en
  ISO, generada server-side al guardar, no confiar en el reloj del
  cliente).
- **Nueva ruta API** `app/api/bitacora/route.ts`:
  - `GET`: devuelve todas las entradas, más recientes primero.
  - `POST`: recibe `{ texto: string, autor?: string }`, valida que
    `texto` no esté vacío (trim), agrega la entrada con fecha actual del
    servidor.
  - Mismo `runtime = "edge"` que el resto de la API.
  - Protegida por el mismo middleware de login que ya cubre `/api/*`
    (no requiere cambios en `middleware.ts`, ya cubre cualquier ruta
    bajo `/api/`).
- **Frontend**: nueva sección al final de la tabla (fuera del
  `<table>`, dentro del mismo contenedor con scroll) con:
  - Lista de entradas existentes (texto, autor si lo hay, fecha
    formateada), más recientes arriba.
  - Formulario simple: textarea + campo de nombre opcional + botón
    "Agregar nota". Al enviar, hace `POST` y agrega la entrada
    localmente sin esperar el próximo poll (optimista, igual que
    `marcar`/`limpiarEstado`).
  - Se sincroniza con el poll existente (cada 20s) igual que el resto
    del estado, para que todas las tablets vean las mismas notas.

## Fuera de alcance

- No hay edición ni borrado de entradas de la bitácora ya guardadas
  (append-only real) — si algo se escribió mal, se agrega una nota
  nueva aclarando, no se corrige la anterior.
- No hay backfill de las 4 correcciones menores pendientes
  (autenticación de API, config de ESLint, duplicación de código,
  condición de carrera) — quedan fuera de este spec, ya se harán aparte.
- El responsive para celular del kiosko completo (tabla principal)
  sigue pendiente por separado, como ya se acordó.
