# Kiosko Producción V1 — Design Spec

Fecha: 2026-07-29
Estado: Aprobado para implementación
Repo: https://github.com/jhonzetas/progplantaglobal.git

## 1. Objetivo

Pantalla de kiosko (tablet Android, fija en planta) que muestra la programación de
maquinado exportada desde un Excel (`.xlsm`) y permite al operario marcar el estado
de cada orden de producción (TR / TER / PAR) con un toque, sin login ni diálogos.

## 2. Arquitectura

```
GESTION_PRODUCCION.xlsm
        │  Macro VBA (botón "Exportar y Publicar")
        ▼
public/data/programacion.json   (dentro del repo Next.js)
        │  git add · commit · push (automático desde el macro)
        ▼
GitHub (jhonzetas/progplantaglobal)
        │  push → Vercel redeploya solo
        ▼
https://progplantaglobal.vercel.app
        │
        ▼
Tablet Android (modo kiosko)
   ├── GET /data/programacion.json   (poll cada 20s, estático)
   └── GET/POST /api/estado         (Upstash Redis: HGETALL / HSET / HDEL)
```

- El JSON de programación es de solo lectura para la app — lo genera el macro.
- El estado del operario (TR/TER/PAR) vive en Upstash Redis, único hash `kiosko:estado`,
  porque un sitio estático en Vercel no puede escribir su propio contenido.
- Cualquier push a `main` dispara un redeploy automático en Vercel (ya integrado).

## 3. Estructura real del Excel (verificada contra el archivo)

Archivo fuente: `C:\Users\GLOBAL\OneDrive\Desktop\PRODUCCION GLOBAL\IMPRIMIBLE MAQUINADO.xlsx`,
hoja `PROGRAMACION MAQUINADO`.

Verificado programáticamente (no asumido):
- Encabezados reales en la **fila 4**, 20 columnas (A:T), texto exacto con espacios sueltos
  y el salto de línea embebido en `MONTAJE\nAFUERA`.
- La "máquina" no es una columna: es una fila de texto (columna A, resto vacío, a veces
  celdas fusionadas A:N) que agrupa las filas de OP debajo, hasta la siguiente fila de texto.
- Filas de subtotal intercaladas: columna A vacía, columna I (`POR PRODUCIR`) con un número.
  Se excluyen del export.
- La OP no es única como llave — se repite entre filas, incluso dentro de la misma máquina.
- Snapshot actual (jul-29): **18 grupos de máquina**, **80 filas de OP** con datos, de los
  cuales 4 grupos (`MULTIFORM // LINEAS VARIAS`, `DVK 1 MULTIBARRA`, `DVK 2`,
  `PROGRAMACION LASER`) no tienen OP asignadas actualmente — no aparecerán en la tabla, lo
  cual es correcto (no hay nada que mostrar).
- **Nota de calidad de datos:** al momento de esta revisión, el grupo `DMK 7 LASER`
  contenía 10 filas duplicadas exactamente (mismo OP+REF+notas) después de su subtotal —
  error de copiar/pegar en el Excel. El usuario confirmó ignorar ese bloque duplicado.
  Esto motivó una regla de parsing más estricta (ver sección 7) en vez de una limpieza
  manual puntual, para que el mismo tipo de error no se cuele en exportaciones futuras.

## 4. Contrato de datos — `programacion.json`

22 columnas: las 20 del Excel + `ID` (llave técnica, oculta) + `Maquina` (derivada de la
fila de agrupación, sí visible).

```json
{
  "version": 18,
  "ultimaActualizacion": "2026-07-29 08:05:00",
  "columnas": ["ID","Maquina","OP","REF","LINEA","ACAB","COLOR","DESTINO",
    "NOTAS","LAM","POR_PRODUCIR","PEDIDO_CLIENTE","TIEMPO_MONTAJE","VELOCIDAD",
    "HORAS_MAQUINADO","TIEMPO_MAQUINADO","FECHA_RODAJA","INICIA_MAQUINADO",
    "TERMINA_MAQUINADO","FECHA_DESPACHO","RODAJA","MONTAJE_AFUERA"],
  "filas": [["VANGUARD2_01","VANGUARD 2  // 18 LINEAS ESPESOR 2,2",3055,"0188", ...]]
}
```

`ID` se construye como `MAQUINA_SLUG + "_" + contador secuencial dentro de esa máquina`
(ej. `HPK1_05`). Estable mientras no se reordenen manualmente filas de una máquina entre
exportaciones (riesgo aceptado — ver sección 8).

## 5. Contrato de datos — estado (Upstash Redis)

Hash único `kiosko:estado` → `{ "HPK1_05": "TR", "VANGUARD2_01": "TER", ... }`.

- `GET /api/estado?ids=<lista>` → devuelve el hash completo y borra cualquier clave que
  ya no esté en `ids` (limpieza automática cuando una OP desaparece del Excel).
- `POST /api/estado` con `{ "id": "...", "estado": "TR"|"TER"|"PAR" }` → guarda un campo.

## 6. Frontend (kiosko)

- Tabla de 22 columnas + columna de acción, `table-layout: fixed`, anchos por columna
  ajustables, texto de encabezado idéntico al Excel (incluye saltos de línea).
- Fechas (`FECHA_RODAJA`, `INICIA_MAQUINADO`, `TERMINA_MAQUINADO`, `FECHA_DESPACHO`) se
  muestran como `29 JUL` (día + 3 letras de mes, sin hora ni año).
- `NOTAS` y `Maquina` (texto libre) hacen *wrap* en vez de truncar — la fila crece de alto.
  Scroll solo vertical, nunca horizontal.
- Polling cada 20s a `/data/programacion.json` y a `/api/estado`. Si falla, se mantiene la
  última programación visible con banner "SIN CONEXIÓN" — nunca pantalla en blanco.
- Botones TR/TER/PAR: respuesta visual inmediata (optimista), sin diálogos de confirmación.
- Modo kiosko: sin selección de texto, sin menú contextual, viewport fijo, botón inicial
  para pantalla completa (gesto de usuario requerido por el navegador).
- **Riesgo aceptado y confirmado con el usuario:** 22 columnas a ~11px puede quedar
  apretado. Se construye así y se ajustan tamaños de fuente/columna mañana contra la
  tablet física real, no se rediseña preventivamente.

## 7. Macro VBA

Exporta las filas 5 en adelante de `PROGRAMACION MAQUINADO`, detecta máquina/subtotal/OP
con la misma lógica verificada en la sección 3, y escribe `public/data/programacion.json`.

**Cambios respecto al primer borrador del usuario:**

1. El archivo se escribe en **UTF-8 real** usando `ADODB.Stream` (no `Open ... For Output`
   + `Print #`, que usa el codepage ANSI del sistema). El Excel real contiene tildes y "Ñ"
   (ej. "DISEÑO LASER"); sin este cambio esos caracteres se corromperían en el JSON
   consumido por el navegador.
2. **Límite de máquina en su subtotal:** una vez que el parser encuentra la fila de
   subtotal de una máquina (columna OP vacía + columna `POR PRODUCIR` con número), deja de
   aceptar filas de OP para esa máquina — solo vuelve a aceptar filas cuando aparece una
   nueva fila de texto (nuevo encabezado de máquina). Motivo: se encontró un bloque de 10
   filas duplicadas después del subtotal de `DMK 7 LASER` (error de copiar/pegar); esta
   regla evita que ese tipo de error se exporte silenciosamente en el futuro, sin depender
   de que alguien limpie el Excel a tiempo.

Después de escribir el archivo, el macro ejecuta `git add`, `git commit`, `git push origin
main` vía `WScript.Shell`. Prerrequisito: credenciales de git ya configuradas en la máquina
del Excel (Git Credential Manager o SSH) — si no, el macro queda colgado esperando login.

## 8. Riesgos conocidos (sin cambios respecto al brief original del usuario)

| Riesgo | Mitigación |
|---|---|
| ID posicional, no un dato estable del Excel | Aceptado; solo se rompe si se reordenan filas manualmente entre exportaciones |
| Cada exportación dispara rebuild completo de Vercel (~30-60s extra) | Aceptable para reporte de turno |
| `git push` del macro requiere credenciales ya configuradas | Documentado como prerrequisito antes de la primera ejecución |
| Free tier Upstash (256MB / 500K comandos/mes) | Sobra margen para el volumen esperado |
| 22 columnas a ~11px | Confirmado con el usuario: construir así, ajustar con tablet real |

## 9. Fuera de alcance de esta app

- Corregir datos de producción incorrectos dentro del Excel (OP, REF, notas, cantidades,
  etc.) — responsabilidad del usuario. La única protección automática que aplica esta app
  es estructural (sección 7, punto 2: no leer filas de OP después del subtotal de una
  máquina), no una limpieza de contenido.
- Crear el repo remoto en GitHub, el proyecto en Vercel, o conectar Upstash — son pasos
  manuales en dashboards de terceros; se harán con guía paso a paso cuando corresponda.

## 10. Plan de archivos a crear

```
app/layout.tsx
app/page.tsx
app/globals.css
app/api/estado/route.ts
lib/redis.ts
public/data/programacion.json      (datos reales de prueba, generados del Excel actual)
macro/ExportarProgramacionJSON.bas (para pegar en el .xlsm)
package.json / next.config.js / tailwind.config.ts / tsconfig.json
```
