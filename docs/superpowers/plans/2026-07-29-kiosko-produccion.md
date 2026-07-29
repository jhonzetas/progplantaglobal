# Kiosko Producción V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship the Next.js kiosk app (tablet display + TR/TER/PAR state) described in `docs/superpowers/specs/2026-07-29-kiosko-produccion-design.md`, ready to deploy to Vercel today.

**Architecture:** Next.js 14 App Router, static `public/data/programacion.json` (written by an external VBA macro) polled client-side, `/api/estado` edge route backed by Upstash Redis for operator state. Single repo, no separate backend service.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, `@upstash/redis`. No automated test framework is installed — see Global Constraints.

## Global Constraints

- Working directory: `C:\progplantaglobal.vercel.app`. Git already initialized, remote `origin` already set to `https://github.com/jhonzetas/progplantaglobal.git` (no push yet).
- `public/data/programacion.json` already exists (real sample data, 70 rows, generated from the actual Excel) — do not overwrite it during scaffolding.
- No automated test framework (Jest/Vitest) is installed for this project. This is a deliberate scope decision, not an oversight: the project ships same-day (see spec section 12 timeline) and has no business logic complex enough to justify the setup cost. Verification is via `npm run build` (typecheck + compile), `curl` against the dev server, and manual browser checks. Do not add a test framework mid-plan.
- Column set, labels, date formatting, and ID scheme are fixed by the spec (section 4, 6) — do not redesign them while implementing.
- The VBA macro must write UTF-8 without BOM issues and must stop reading a machine's OP rows once that machine's subtotal row is hit (spec section 7, points 1-2) — this is a correctness requirement, not optional polish.
- Node.js and npm are available (`node v24.0.2`, `npm 11.3.0`).

---

### Task 1: Project scaffold, `lib/redis.ts`, `/api/estado` route

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.js`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `.gitignore`
- Create: `.env.local.example`
- Create: `app/layout.tsx`
- Create: `app/page.tsx` (temporary stub, replaced in Task 2)
- Create: `app/globals.css`
- Create: `lib/redis.ts`
- Create: `app/api/estado/route.ts`

**Interfaces:**
- Produces: `redis` (exported const from `lib/redis.ts`, an `@upstash/redis` `Redis` client instance) — consumed by `app/api/estado/route.ts`.
- Produces: `GET`/`POST` handlers in `app/api/estado/route.ts` implementing the contract in spec section 5 — consumed by `app/page.tsx` in Task 2 via `fetch("/api/estado?ids=...")` and `fetch("/api/estado", {method:"POST", ...})`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "progplantaglobal",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@upstash/redis": "^1.34.0"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.40",
    "tailwindcss": "^3.4.7",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.5"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
```

- [ ] **Step 4: Write `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
```

- [ ] **Step 5: Write `postcss.config.js`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Write `.gitignore`**

```
node_modules
.next
.env*.local
!.env.local.example
```

- [ ] **Step 7: Write `.env.local.example`**

```
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

- [ ] **Step 8: Write `lib/redis.ts`**

```ts
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "",
});
```

- [ ] **Step 9: Write `app/api/estado/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "edge";
const HASH_KEY = "kiosko:estado";
const ESTADOS_VALIDOS = ["TR", "TER", "PAR"];

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids");
  const estado = (await redis.hgetall<Record<string, string>>(HASH_KEY)) || {};

  if (idsParam) {
    const validos = new Set(idsParam.split(",").filter(Boolean));
    const obsoletos = Object.keys(estado).filter((k) => !validos.has(k));
    if (obsoletos.length > 0) {
      await redis.hdel(HASH_KEY, ...obsoletos);
      obsoletos.forEach((k) => delete estado[k]);
    }
  }
  return NextResponse.json(estado);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { id?: string; estado?: string };
  const { id, estado: valor } = body;
  if (!id || !valor || !ESTADOS_VALIDOS.includes(valor)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  await redis.hset(HASH_KEY, { [id]: valor });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 10: Write `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body {
  touch-action: manipulation;
  -webkit-user-select: none;
  user-select: none;
  overscroll-behavior: none;
}
```

- [ ] **Step 11: Write `app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Programa de Maquinado",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 12: Write temporary stub `app/page.tsx`** (replaced in full in Task 2 — this only exists so the toolchain has a route to build/serve)

```tsx
export default function Kiosko() {
  return <div className="p-8 text-2xl">Cargando programación...</div>;
}
```

- [ ] **Step 13: Install dependencies**

Run: `npm install`
Expected: installs without errors, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 14: Verify build**

Run: `npm run build`
Expected: `Compiled successfully`, no TypeScript errors. This is the project's typecheck gate in place of unit tests (see Global Constraints).

- [ ] **Step 15: Verify dev server serves the stub page**

Run (start in background or with a timeout): `npm run dev`
Then: `curl -s http://localhost:3000 | grep "Cargando programación"`
Expected: the grep finds a match. Stop the dev server after checking.

- [ ] **Step 16: Commit**

```bash
git add package.json tsconfig.json next.config.js tailwind.config.ts postcss.config.js .gitignore .env.local.example app lib package-lock.json
git commit -m "Scaffold Next.js app with redis client and estado API route"
```

---

### Task 2: Full kiosk UI (`app/page.tsx`)

**Files:**
- Modify: `app/page.tsx` (replace Task 1 stub with full implementation)

**Interfaces:**
- Consumes: `GET /data/programacion.json` (static file, shape per spec section 4: `{version, ultimaActualizacion, columnas, filas}`); `GET /api/estado?ids=...` and `POST /api/estado` from Task 1.
- Produces: the kiosk screen — no other file depends on this one.

- [ ] **Step 1: Replace `app/page.tsx` with the full kiosk implementation**

```tsx
"use client";
import { useEffect, useRef, useState, useCallback } from "react";

type Programacion = {
  version: number;
  ultimaActualizacion: string;
  columnas: string[];
  filas: (string | number | null)[][];
};
type FilaObj = Record<string, string | number | null> & { ID: string };

const COLUMNAS_VISIBLES = [
  { key: "Maquina", label: "MÁQUINA", ancho: 11 },
  { key: "OP", label: "OP", ancho: 4 },
  { key: "REF", label: "REF", ancho: 4 },
  { key: "LINEA", label: "LINEA", ancho: 3 },
  { key: "ACAB", label: "ACAB", ancho: 3 },
  { key: "COLOR", label: "COLOR", ancho: 4 },
  { key: "DESTINO", label: "DESTINO", ancho: 5 },
  { key: "NOTAS", label: "MARCA Y NOTAS\nADICIONALES", ancho: 12 },
  { key: "LAM", label: "# LAM", ancho: 3 },
  { key: "POR_PRODUCIR", label: "POR\nPRODUCIR", ancho: 4 },
  { key: "PEDIDO_CLIENTE", label: "PEDIDO\nCLIENTE", ancho: 4 },
  { key: "TIEMPO_MONTAJE", label: "TIEMPO DE\nMONTAJE", ancho: 4 },
  { key: "VELOCIDAD", label: "VELOCIDAD", ancho: 3 },
  { key: "HORAS_MAQUINADO", label: "HORAS\nMAQUINADO", ancho: 4 },
  { key: "TIEMPO_MAQUINADO", label: "TIEMPO\nMAQUINADO", ancho: 4 },
  { key: "FECHA_RODAJA", label: "FECHA\nRODAJA", ancho: 3 },
  { key: "INICIA_MAQUINADO", label: "INICIA\nMAQUINADO", ancho: 4 },
  { key: "TERMINA_MAQUINADO", label: "TERMINA\nMAQUINADO", ancho: 4 },
  { key: "FECHA_DESPACHO", label: "FECHA\nDESPACHO", ancho: 3 },
  { key: "RODAJA", label: "RODAJA", ancho: 3 },
  { key: "MONTAJE_AFUERA", label: "MONTAJE\nAFUERA", ancho: 3 },
] as const;

const COLUMNAS_FECHA = new Set([
  "FECHA_RODAJA",
  "INICIA_MAQUINADO",
  "TERMINA_MAQUINADO",
  "FECHA_DESPACHO",
]);

const MESES_ABR = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
];

const POLL_MS = 20000;

function formatCelda(key: string, valor: string | number | null): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (COLUMNAS_FECHA.has(key) && typeof valor === "string") {
    const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const [, , mes, dia] = m;
      const abr = MESES_ABR[parseInt(mes, 10) - 1] ?? mes;
      return `${parseInt(dia, 10)} ${abr}`;
    }
  }
  return String(valor);
}

function filasAObjetos(prog: Programacion): FilaObj[] {
  return prog.filas.map((fila) => {
    const obj: any = {};
    prog.columnas.forEach((c, i) => (obj[c] = fila[i]));
    return obj as FilaObj;
  });
}

function pickPending(prev: Record<string, string>, pendientes: Set<string>) {
  const r: Record<string, string> = {};
  pendientes.forEach((id) => {
    if (prev[id]) r[id] = prev[id];
  });
  return r;
}

export default function Kiosko() {
  const [prog, setProg] = useState<Programacion | null>(null);
  const [estado, setEstado] = useState<Record<string, string>>({});
  const [conectado, setConectado] = useState(true);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const enviosPendientes = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/data/programacion.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error("sin json");
      const data: Programacion = await r.json();
      setProg((prev) => (prev && prev.version === data.version ? prev : data));

      const filas = filasAObjetos(data);
      const ids = filas.map((f) => f.ID).join(",");
      const rEstado = await fetch(`/api/estado?ids=${encodeURIComponent(ids)}`, {
        cache: "no-store",
      });
      if (rEstado.ok) {
        const nuevoEstado = await rEstado.json();
        setEstado((prev) => ({
          ...nuevoEstado,
          ...pickPending(prev, enviosPendientes.current),
        }));
      }
      setConectado(true);
    } catch {
      setConectado(false);
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    const preventContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", preventContextMenu);
    return () => document.removeEventListener("contextmenu", preventContextMenu);
  }, []);

  async function marcar(opId: string, valor: "TR" | "TER" | "PAR") {
    setEstado((prev) => ({ ...prev, [opId]: valor }));
    enviosPendientes.current.add(opId);
    try {
      await fetch("/api/estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: opId, estado: valor }),
      });
    } catch {
      // El estado ya quedó marcado localmente; el próximo poll exitoso lo reconciliará.
    } finally {
      enviosPendientes.current.delete(opId);
    }
  }

  function iniciarTurno() {
    document.documentElement.requestFullscreen?.().catch(() => {});
    setPantallaCompleta(true);
  }

  if (!prog) return <div className="p-8 text-2xl">Cargando programación...</div>;

  const filas = filasAObjetos(prog);

  return (
    <div className="h-screen w-screen overflow-hidden select-none bg-white text-black flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-300 shrink-0">
        <div className="text-xl font-bold">PROGRAMA DE MAQUINADO</div>
        <div className="text-sm text-gray-600">
          Última actualización {prog.ultimaActualizacion} · Versión {prog.version}
        </div>
        <div className="flex items-center gap-3">
          {!pantallaCompleta && (
            <button
              onClick={iniciarTurno}
              className="px-3 py-1 rounded bg-blue-600 text-white text-sm font-semibold"
            >
              Iniciar turno
            </button>
          )}
          <div className="text-lg font-semibold">
            {conectado ? "🟢 ACTUALIZADO" : "🔴 SIN CONEXIÓN"}
          </div>
        </div>
      </header>

      {!conectado && (
        <div className="bg-orange-100 text-orange-800 text-center py-1 shrink-0">
          SIN CONEXIÓN — Mostrando última programación.
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <table className="w-full border-collapse text-[11px] leading-tight table-fixed">
          <colgroup>
            {COLUMNAS_VISIBLES.map((c) => (
              <col key={c.key} style={{ width: `${c.ancho}%` }} />
            ))}
            <col style={{ width: "7%" }} />
          </colgroup>
          <thead className="sticky top-0 bg-gray-200 z-10">
            <tr>
              {COLUMNAS_VISIBLES.map((c) => (
                <th
                  key={c.key}
                  className="p-1 text-left border-b border-gray-300 align-bottom whitespace-pre-line"
                >
                  {c.label}
                </th>
              ))}
              <th className="p-1 border-b border-gray-300">ACCIÓN</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const actual = estado[fila.ID];
              return (
                <tr
                  key={fila.ID}
                  className="border-b border-gray-200 odd:bg-white even:bg-gray-50 align-top"
                >
                  {COLUMNAS_VISIBLES.map((c) => (
                    <td key={c.key} className="p-1 break-words whitespace-pre-line">
                      {formatCelda(c.key, fila[c.key])}
                    </td>
                  ))}
                  <td className="p-1">
                    <div className="flex flex-col gap-1">
                      <BotonEstado
                        label="TR"
                        activo={actual === "TR"}
                        colorActivo="bg-green-500"
                        onClick={() => marcar(fila.ID, "TR")}
                      />
                      <BotonEstado
                        label="TER"
                        activo={actual === "TER"}
                        colorActivo="bg-blue-500"
                        onClick={() => marcar(fila.ID, "TER")}
                      />
                      <BotonEstado
                        label="PAR"
                        activo={actual === "PAR"}
                        colorActivo="bg-orange-500"
                        onClick={() => marcar(fila.ID, "PAR")}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BotonEstado({
  label,
  activo,
  colorActivo,
  onClick,
}: {
  label: string;
  activo: boolean;
  colorActivo: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full py-1.5 rounded font-bold text-white text-[11px] leading-none ${
        activo ? colorActivo : "bg-gray-300 hover:bg-gray-400"
      }`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: `Compiled successfully`, no TypeScript errors.

- [ ] **Step 3: Verify the table renders with real data**

Run: `npm run dev` (background), then `curl -s http://localhost:3000/data/programacion.json | grep -o "VANGUARD2_01"`
Expected: match found (confirms the static JSON is served).

Then, in a browser (Chrome via `mcp__claude-in-chrome__navigate` to `http://localhost:3000`, or manually): confirm the table shows machine rows (`VANGUARD 2 // 18 LINEAS ESPESOR 2,2`, `HPK - 1 // 18 LINEAS`, ...), 21 data columns + ACCIÓN column, and tapping `TR` turns it green immediately. Stop the dev server after checking.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "Build full kiosk UI: 22-column table, polling, TR/TER/PAR actions"
```

---

### Task 3: VBA macro (`macro/ExportarProgramacionJSON.bas`)

**Files:**
- Create: `macro/ExportarProgramacionJSON.bas`

**Interfaces:**
- Produces: `public/data/programacion.json` in the exact shape consumed by `app/page.tsx` (Task 2) — column order and keys must match `COLUMNAS_VISIBLES`/the `columnas` array exactly.

- [ ] **Step 1: Write `macro/ExportarProgramacionJSON.bas`**

```vba
Option Explicit

Sub ExportarProgramacionJSON()
    Dim ws As Worksheet
    Dim rutaProyecto As String, rutaJSON As String
    Dim ultimaFila As Long, r As Long
    Dim maquinaActual As String, contador As Long
    Dim cerrada As Boolean
    Dim filas As String, json As String
    Dim version As Long
    Dim primeraFila As Boolean

    ' ===== AJUSTA SOLO ESTA LÍNEA SI MUEVES LA CARPETA =====
    rutaProyecto = "C:\progplantaglobal.vercel.app\"
    ' ========================================================

    rutaJSON = rutaProyecto & "public\data\programacion.json"
    Set ws = ThisWorkbook.Sheets("PROGRAMACION MAQUINADO")

    Dim celdaVersion As Range
    Set celdaVersion = ws.Range("ZZ1")
    If IsEmpty(celdaVersion.Value) Then
        celdaVersion.Value = 1
    Else
        celdaVersion.Value = celdaVersion.Value + 1
    End If
    version = celdaVersion.Value

    ultimaFila = ws.UsedRange.Rows(ws.UsedRange.Rows.Count).Row

    Dim columnas(1 To 22) As String
    columnas(1) = "ID": columnas(2) = "Maquina": columnas(3) = "OP": columnas(4) = "REF"
    columnas(5) = "LINEA": columnas(6) = "ACAB": columnas(7) = "COLOR": columnas(8) = "DESTINO"
    columnas(9) = "NOTAS": columnas(10) = "LAM": columnas(11) = "POR_PRODUCIR": columnas(12) = "PEDIDO_CLIENTE"
    columnas(13) = "TIEMPO_MONTAJE": columnas(14) = "VELOCIDAD": columnas(15) = "HORAS_MAQUINADO"
    columnas(16) = "TIEMPO_MAQUINADO": columnas(17) = "FECHA_RODAJA": columnas(18) = "INICIA_MAQUINADO"
    columnas(19) = "TERMINA_MAQUINADO": columnas(20) = "FECHA_DESPACHO": columnas(21) = "RODAJA"
    columnas(22) = "MONTAJE_AFUERA"

    Dim colJSON As String, i As Integer
    For i = 1 To 22
        colJSON = colJSON & """" & columnas(i) & """"
        If i < 22 Then colJSON = colJSON & ","
    Next i

    filas = "": maquinaActual = "SIN_MAQUINA": contador = 0: cerrada = False: primeraFila = True

    For r = 5 To ultimaFila
        Dim valOP As Variant, valCant As Variant, opStr As String, cantStr As String
        valOP = ws.Cells(r, 1).Value
        valCant = ws.Cells(r, 9).Value ' columna I = POR PRODUCIR
        opStr = Trim(valOP & "")
        cantStr = Trim(valCant & "")

        If opStr = "" And cantStr = "" Then
            ' fila vacía separadora -> ignorar

        ElseIf opStr = "" And cantStr <> "" Then
            ' fila de subtotal -> cierra la máquina actual; no vuelve a
            ' aceptar filas de OP hasta el siguiente encabezado de máquina.
            cerrada = True

        ElseIf opStr <> "" And Not IsNumeric(valOP) Then
            ' fila de encabezado de máquina
            maquinaActual = opStr
            contador = 0
            cerrada = False

        ElseIf IsNumeric(valOP) And Not cerrada Then
            ' fila de OP válida
            contador = contador + 1
            Dim idFila As String
            idFila = LimpiarID(maquinaActual) & "_" & Format(contador, "00")

            If Not primeraFila Then filas = filas & ","
            primeraFila = False

            filas = filas & "[" & JStr(idFila) & "," & JStr(maquinaActual) & "," & _
                JVal(ws.Cells(r, 1)) & "," & JVal(ws.Cells(r, 2)) & "," & JVal(ws.Cells(r, 3)) & "," & _
                JVal(ws.Cells(r, 4)) & "," & JVal(ws.Cells(r, 5)) & "," & JVal(ws.Cells(r, 6)) & "," & _
                JVal(ws.Cells(r, 7)) & "," & JVal(ws.Cells(r, 8)) & "," & JVal(ws.Cells(r, 9)) & "," & _
                JVal(ws.Cells(r, 10)) & "," & JVal(ws.Cells(r, 11)) & "," & JVal(ws.Cells(r, 12)) & "," & _
                JVal(ws.Cells(r, 13)) & "," & JVal(ws.Cells(r, 14)) & "," & JVal(ws.Cells(r, 15)) & "," & _
                JVal(ws.Cells(r, 16)) & "," & JVal(ws.Cells(r, 17)) & "," & JVal(ws.Cells(r, 18)) & "," & _
                JVal(ws.Cells(r, 19)) & "," & JVal(ws.Cells(r, 20)) & "]"

        ' Else: IsNumeric(valOP) And cerrada -> fila posterior al subtotal, se ignora
        ' (protege contra bloques duplicados pegados por error después del subtotal).
        End If
    Next r

    json = "{""version"":" & version & ",""ultimaActualizacion"":""" & Format(Now, "yyyy-mm-dd hh:mm:ss") & _
        """,""columnas"":[" & colJSON & "],""filas"":[" & filas & "]}"

    GuardarUTF8SinBOM rutaJSON, json

    Dim resultado As String
    resultado = PublicarEnGitHub(rutaProyecto, version)

    MsgBox "Exportación completada." & vbCrLf & "Versión: " & version & vbCrLf & resultado, _
        vbInformation, "Kiosko Producción"
End Sub

Private Function LimpiarID(texto As String) As String
    Dim t As String
    t = UCase(Trim(texto))
    t = Replace(t, " ", ""): t = Replace(t, "/", ""): t = Replace(t, "-", ""): t = Replace(t, Chr(10), "")
    If Len(t) > 12 Then t = Left(t, 12)
    LimpiarID = t
End Function

Private Function JVal(c As Range) As String
    If IsEmpty(c.Value) Then
        JVal = "null"
    ElseIf IsDate(c.Value) Then
        JVal = """" & Format(c.Value, "yyyy-mm-dd hh:mm") & """"
    ElseIf IsNumeric(c.Value) Then
        JVal = Replace(CStr(c.Value), ",", ".")
    Else
        JVal = """" & Replace(Replace(CStr(c.Value), "\", "\\"), """", "\""") & """"
    End If
End Function

Private Function JStr(texto As String) As String
    JStr = """" & Replace(Replace(texto, "\", "\\"), """", "\""") & """"
End Function

' Escribe contenido UTF-8 sin BOM. ADODB.Stream con Charset="utf-8" añade un
' BOM de 3 bytes al guardar; se descarta releyendo en modo binario desde la
' posición 3 antes de guardar el archivo final.
Private Sub GuardarUTF8SinBOM(ruta As String, contenido As String)
    Dim txtStream As Object, binStream As Object
    Dim bytes() As Byte

    Set txtStream = CreateObject("ADODB.Stream")
    txtStream.Type = 2 ' texto
    txtStream.Charset = "utf-8"
    txtStream.Open
    txtStream.WriteText contenido
    txtStream.Position = 0
    txtStream.Type = 1 ' binario
    txtStream.Position = 3 ' saltar BOM
    bytes = txtStream.Read
    txtStream.Close

    Set binStream = CreateObject("ADODB.Stream")
    binStream.Type = 1
    binStream.Open
    binStream.Write bytes
    binStream.SaveToFile ruta, 2 ' adSaveCreateOverWrite
    binStream.Close
End Sub

Private Function PublicarEnGitHub(ruta As String, version As Long) As String
    Dim wsh As Object
    Set wsh = CreateObject("WScript.Shell")
    Dim cmd As String
    cmd = "cmd /c cd /d """ & ruta & """ && git add public\data\programacion.json && " & _
          "git commit -m ""Actualizacion automatica v" & version & """ && git push origin main"
    Dim ret As Long
    ret = wsh.Run(cmd, 0, True)
    If ret = 0 Then
        PublicarEnGitHub = "GitHub: publicado. Vercel iniciará el despliegue en unos segundos."
    Else
        PublicarEnGitHub = "AVISO: git devolvió código " & ret & ". Revisa manualmente 'git status' " & _
            "en la carpeta (puede ser que no hubiera cambios, o falten credenciales de push configuradas)."
    End If
End Function
```

- [ ] **Step 2: Manual verification (cannot be automated from this environment — VBA runs only inside Excel)**

In Excel: open the VBA editor (Alt+F11) in `GESTION_PRODUCCION.xlsm`, insert a new module, paste the contents of `macro/ExportarProgramacionJSON.bas`, then run `Debug > Compile VBAProject`.
Expected: no compile errors. Then assign the macro to a button and run it once; confirm `public\data\programacion.json` updates and contains readable (non-corrupted) accented characters (e.g. "DISEÑO") when opened in a text editor.

- [ ] **Step 3: Commit**

```bash
git add macro/ExportarProgramacionJSON.bas
git commit -m "Add VBA export macro with UTF-8 and subtotal-boundary fixes"
```

---

### Task 4: Deployment runbook

**Files:**
- Create: `docs/DEPLOY.md`

**Interfaces:**
- None (documentation only).

- [ ] **Step 1: Write `docs/DEPLOY.md`**

```markdown
# Despliegue — Kiosko Producción

## 1. Subir el código a GitHub

git remote ya está configurado hacia `https://github.com/jhonzetas/progplantaglobal.git`.

```bash
git push -u origin main
```

Si pide usuario/contraseña de forma interactiva, configura primero Git Credential
Manager o una llave SSH — el macro del Excel depende de que este paso no requiera
login manual.

## 2. Crear el proyecto en Vercel

1. Entra a https://vercel.com y conecta tu cuenta de GitHub si no lo has hecho.
2. "Add New..." → "Project" → selecciona el repo `jhonzetas/progplantaglobal`.
3. Vercel detecta Next.js automáticamente — no cambies nada en "Build & Output Settings".
4. Click "Deploy". El primer deploy tardará 1-2 minutos.
5. Si quieres que el dominio sea `progplantaglobal.vercel.app`, ve a
   Project Settings → General → Project Name y ajústalo antes o después del primer deploy
   (el dominio `<project-name>.vercel.app` sigue el nombre del proyecto).

## 3. Conectar Upstash Redis

1. En el proyecto de Vercel, pestaña **Storage** → "Create Database" → **Upstash Redis**
   (plan Free, sin tarjeta).
2. Conéctala al proyecto cuando lo pida.
3. Ve a Project Settings → Environment Variables y confirma qué nombres quedaron creados:
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` (heredado) o `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN`. `lib/redis.ts` ya intenta ambos nombres, así que no
   necesitas renombrarlas.
4. Ve a Deployments → el último deploy → menú "..." → **Redeploy** (las variables de
   entorno solo se aplican en el próximo build, no en el actual).

## 4. Verificar en la nube

1. Abre `https://<tu-proyecto>.vercel.app` en un navegador de escritorio.
2. Confirma que la tabla carga con los datos reales.
3. Toca `TR` en una fila, refresca la página, confirma que el estado se mantuvo
   (esto prueba que Upstash está conectado correctamente).

## 5. Configurar la tablet

1. Abre la URL de Vercel en el navegador de la tablet.
2. Toca "Iniciar turno" para entrar en pantalla completa, o configura el navegador
   kiosko del dispositivo (ej. Fully Kiosk Browser) para abrir esa URL directamente
   en modo kiosko a nivel de sistema.

## 6. Prerrequisito para el macro de Excel

En una terminal, en `C:\progplantaglobal.vercel.app`, confirma que `git push origin main`
funciona sin pedir usuario/clave. Si pide login, el macro se queda colgado esperando —
configura Git Credential Manager o SSH antes de usarlo en producción.
```

- [ ] **Step 2: Commit**

```bash
git add docs/DEPLOY.md
git commit -m "Add deployment runbook for Vercel and Upstash setup"
```

---

### Task 5: Push to GitHub

**Files:** none (git operation only).

**Interfaces:** none.

- [ ] **Step 1: Push all commits to the configured remote**

Run: `git push -u origin main`
Expected: push succeeds (or prompts for GitHub credentials if not yet authenticated on this machine — resolve interactively, this is expected to require the user's GitHub login once).

- [ ] **Step 2: Confirm on GitHub**

Visit `https://github.com/jhonzetas/progplantaglobal` (or ask the user to confirm) and verify all files are present: `app/`, `lib/`, `macro/`, `docs/`, `public/data/programacion.json`, `package.json`.
