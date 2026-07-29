# Kiosko Producción V1 — Design Spec

Fecha: 2026-07-29
Estado: Aprobado para implementación
Repo: https://github.com/jhonzetas/progplantaglobal.git

## 1. Objetivo

Pantalla de kiosko (tablet Android, fija en planta) que muestra la programación de
maquinado exportada desde un Excel (`.xlsm`) y permite al operario marcar el estado
de cada orden de producción (TR / TER / PAR) con un toque, sin login ni diálogos.

## 2. Arquitectura

**Corrección importante sobre el diseño original:** el archivo real con macros y cálculos
es `GESTION DE PRODUCCION PLANTA GLOBAL_1.xlsm`, hoja `Programa_Maq` — no
`IMPRIMIBLE MAQUINADO.xlsx` (ese es un archivo `.xlsx` plano, sin macros, que el usuario
arma/actualiza a mano como copia para imprimir). El export al kiosko **no puede depender**
de que el usuario mantenga esa copia al día a mano — tiene que leer directo de la fuente
real y viva: `Programa_Maq`, la misma hoja sobre la que ya corre el macro existente
`ActualizarFechas` (botón que el usuario ya usa a diario para recalcular fechas de
producción).

```
GESTION DE PRODUCCION PLANTA GLOBAL_1.xlsm
   hoja Programa_Maq (fuente real, actualizada a diario)
        │  Botón existente "Actualizar Fechas" (ActualizarFechas)
        │  recalcula fechas/horas de producción
        │  + llamada nueva a ExportarProgramacionJSON al final
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
- Un solo clic en el botón que el usuario ya usa hoy (`ActualizarFechas`) hace todo el flujo:
  recalcula fechas → exporta JSON → publica a GitHub. No hay paso manual de copiado.

## 3. Estructura real del Excel (verificada contra el archivo)

Archivo fuente real: `GESTION DE PRODUCCION PLANTA GLOBAL_1.xlsm`, hoja `Programa_Maq`
(no el imprimible — ver sección 2). Verificado tanto por lectura de datos como leyendo el
código VBA real de `ActualizarFechas` (Módulo6) con `oletools`, que es quien ya escribe y
mantiene esta hoja a diario:

- Encabezados reales en la **fila 4**, 20 columnas (A:T), texto exacto con espacios sueltos
  y el salto de línea embebido en `MONTAJE\nAFUERA` (`ActualizarFechas` los escribe él mismo
  en `S4`/`T4` en cada corrida).
- La "máquina" no es una columna: es una fila de texto en columna A que agrupa las filas de
  OP debajo, hasta la siguiente fila de texto. Regla exacta usada por `ActualizarFechas` (y
  replicada en el macro nuevo): `colA<>"" AND NOT IsNumeric(colA) AND colJ no contiene "DIA"`.
- Fila de subtotal: `ActualizarFechas` la detecta con `InStr(colJ, "DIA") > 0` (columna J =
  `PEDIDO CLIENTE`, que en esas filas trae texto como `" DIAS"`). El macro nuevo usa
  exactamente esta misma regla, no una propia.
- **Fila productiva con OP vacío es válida:** `ActualizarFechas` NO exige que la columna OP
  sea numérica para tratar una fila como productiva — cualquier fila con contenido en A:N
  que no sea encabezado de máquina ni subtotal se procesa. El usuario confirmó el caso real:
  son materiales cancelados/no maquinados que se reprograman para "recuperar la rodaja" y
  convertirla en botón para otro cliente, sin un número de OP nuevo asignado todavía. La
  primera versión de este macro exigía OP numérico y habría descartado esas filas
  silenciosamente — corregido para igualar la regla de `ActualizarFechas`.
- La OP no es única como llave cuando sí está presente — se repite entre filas, incluso
  dentro de la misma máquina.
- **Nota de calidad de datos (histórica, ya no aplica al snapshot actual):** en una revisión
  anterior sobre `IMPRIMIBLE MAQUINADO.xlsx` se encontró un bloque de 10 filas duplicadas en
  `DMK 7 LASER` después de su subtotal — error de copiar/pegar. Motivó la regla de "cortar en
  el subtotal" (sección 7, punto 2), que sí es una adición nueva del macro sobre la lógica de
  `ActualizarFechas`.

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

`Sub ExportarProgramacionJSON` vive en `GESTION DE PRODUCCION PLANTA GLOBAL_1.xlsm` (junto a
`ActualizarFechas`), lee `ThisWorkbook.Sheets("Programa_Maq")` directamente (fila 5 en
adelante, `lastRow` calculado igual que `ActualizarFechas`: última fila con contenido en
columna J, no `UsedRange`), clasifica cada fila con la misma lógica exacta de
`ActualizarFechas` (sección 3), y escribe `public/data/programacion.json`.

**Integración con el flujo existente:** se agrega una línea `Call ExportarProgramacionJSON`
al final de `ActualizarFechas` (Módulo6), justo después de
`MsgBox "Programa actualizado correctamente.", vbInformation` y antes de `End Sub`. Así el
botón que el usuario ya usa a diario hace todo en un clic: recalcular fechas → exportar JSON
→ publicar a GitHub. Esto no lo hace Claude directamente (no se puede editar el proyecto VBA
de un `.xlsm` de forma programática) — el usuario pega el módulo nuevo y agrega esa línea a
mano en el editor de VBA.

**Cambios/adiciones respecto al primer borrador del usuario:**

1. El archivo se escribe en **UTF-8 real** usando `ADODB.Stream` (no `Open ... For Output`
   + `Print #`, que usa el codepage ANSI del sistema). El Excel real contiene tildes y "Ñ"
   (ej. "DISEÑO LASER"); sin este cambio esos caracteres se corromperían en el JSON
   consumido por el navegador.
2. **Límite de máquina en su subtotal:** una vez que el parser encuentra la fila de
   subtotal de una máquina (misma regla que `ActualizarFechas`: `InStr(colJ,"DIA")>0`), deja
   de aceptar filas productivas para esa máquina — solo vuelve a aceptar cuando aparece una
   nueva fila de encabezado de máquina. Esta es la única regla que el macro nuevo agrega
   *por encima* de la lógica de `ActualizarFechas` (que no la tiene). Motivo: se encontró un
   bloque de 10 filas duplicadas después del subtotal de `DMK 7 LASER` en una revisión
   anterior (error de copiar/pegar); esta regla evita que ese tipo de error se exporte
   silenciosamente en el futuro.
3. El contador de `version` se guarda en una hoja oculta (`KioskoConfig`, muy oculta) dentro
   de `GESTION DE PRODUCCION PLANTA GLOBAL_1.xlsm` — no en `Programa_Maq` ni en el imprimible,
   para que persista entre ejecuciones sin interferir con el trabajo diario del usuario.

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
