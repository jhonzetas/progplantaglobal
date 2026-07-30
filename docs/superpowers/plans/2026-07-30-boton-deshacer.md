# Botón "deshacer" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a circular "undo" button to the kiosk header that reverts up to the last 5 TRA/TER row markings, synced with the shared Redis backend.

**Architecture:** A `historial` stack (max 5 entries, in React state) records `{id, valorAnterior}` every time a row gets marked. The new "deshacer" button pops the stack and re-applies the popped `valorAnterior` — either re-marking the row (TRA/TER) or clearing it entirely via a new `DELETE /api/estado` endpoint (the current API can only set TRA/TER, not clear).

**Tech Stack:** Next.js 14 app router (edge runtime API routes), React 18 (client component), Upstash Redis (`@upstash/redis`), Tailwind CSS. No test framework is installed in this repo — verification is via `tsc --noEmit`, `next lint`, `curl` against the local dev server, and manual browser testing.

## Global Constraints

- Undo history is capped at **5** entries (`historial.slice(-5)`), oldest dropped first (spec: "últimas 5 marcaciones").
- No confirmation dialog — one tap reverts immediately (spec decision).
- No time limit on how long the button stays enabled — only shrinks when history empties or the page reloads (spec decision).
- The undo button is visible in the header **at all times during the shift**, not just before "Iniciar Turno" (spec decision) — placed immediately to the left of "Iniciar Turno" in the header's right-hand button group.
- Button color: amber (`#FFB020`, existing `amber` Tailwind token), circular, ~36px, no text label — SVG curved back-arrow icon only.
- Undoing a mark must never itself push a new entry onto `historial` (no redo).
- Spec doc: `docs/superpowers/specs/2026-07-30-boton-deshacer-design.md`.

---

### Task 1: `DELETE /api/estado` endpoint

**Files:**
- Modify: `app/api/estado/route.ts`

**Interfaces:**
- Produces: `DELETE /api/estado` — accepts JSON body `{ id: string }`, removes that field from the `kiosko:estado` Redis hash, responds `{ ok: true }` on success or `{ error: string }` with status 400 if `id` is missing.

- [ ] **Step 1: Add the `DELETE` handler**

In `app/api/estado/route.ts`, add this new export after the existing `POST` function (after line 31, the closing `}` of `POST`):

```ts
export async function DELETE(req: NextRequest) {
  const body = (await req.json()) as { id?: string };
  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  await redis.hdel(HASH_KEY, id);
  return NextResponse.json({ ok: true });
}
```

The full file should now read:

```ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "edge";
const HASH_KEY = "kiosko:estado";
const ESTADOS_VALIDOS = ["TRA", "TER"];

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

export async function DELETE(req: NextRequest) {
  const body = (await req.json()) as { id?: string };
  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  await redis.hdel(HASH_KEY, id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual test against the local dev server**

Run in one terminal: `npm run dev` (leave it running).

In another terminal, using a throwaway id that can't collide with a real OP (`TEST_UNDO_1`):

```bash
curl -s -X POST http://localhost:3000/api/estado \
  -H "Content-Type: application/json" \
  -d '{"id":"TEST_UNDO_1","estado":"TRA"}'
```
Expected: `{"ok":true}`

```bash
curl -s "http://localhost:3000/api/estado?ids=TEST_UNDO_1"
```
Expected: `{"TEST_UNDO_1":"TRA"}`

```bash
curl -s -X DELETE http://localhost:3000/api/estado \
  -H "Content-Type: application/json" \
  -d '{"id":"TEST_UNDO_1"}'
```
Expected: `{"ok":true}`

```bash
curl -s "http://localhost:3000/api/estado?ids=TEST_UNDO_1"
```
Expected: `{}` (field is gone)

Also confirm the error path:

```bash
curl -s -X DELETE http://localhost:3000/api/estado \
  -H "Content-Type: application/json" \
  -d '{}'
```
Expected: `{"error":"Datos inválidos"}`

- [ ] **Step 4: Commit**

```bash
git add app/api/estado/route.ts
git commit -m "$(cat <<'EOF'
Add DELETE /api/estado to clear a row's mark entirely

Needed so the undo button can revert a row back to "unmarked" (not
just toggle between TRA/TER), which the existing POST endpoint can't
express.
EOF
)"
```

---

### Task 2: Undo state, logic, and header button

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `DELETE /api/estado` from Task 1 (`{id: string}` body).
- Produces: `BotonDeshacer` component (local to `page.tsx`, not exported — used only in `Kiosko()`).

- [ ] **Step 1: Make the poll merge logic clear-aware**

The existing `pickPending` helper (lines 97-103) only knows how to *preserve* a pending value; it can't express "this id was cleared locally and is still in flight, don't let the server's stale value win." Replace it with a version that also deletes ids that are pending-and-locally-absent:

Replace (lines 97-103):

```ts
function pickPending(prev: Record<string, string>, pendientes: Set<string>) {
  const r: Record<string, string> = {};
  pendientes.forEach((id) => {
    if (prev[id]) r[id] = prev[id];
  });
  return r;
}
```

With:

```ts
// Combina lo recién sondeado del servidor con lo que hay pendiente de
// confirmar localmente (marcaciones o limpiezas con una petición aún en
// vuelo), para que un poll que llegue en medio de esa ventana no
// resucite momentáneamente un valor que el operario ya cambió.
function combinarConPendientes(
  nuevoEstado: Record<string, string>,
  prev: Record<string, string>,
  pendientes: Set<string>
): Record<string, string> {
  const combinado = { ...nuevoEstado };
  pendientes.forEach((id) => {
    if (prev[id]) combinado[id] = prev[id];
    else delete combinado[id];
  });
  return combinado;
}
```

- [ ] **Step 2: Update `poll()` to use the new helper**

In `poll()` (around lines 184-190), replace:

```ts
      if (rEstado.ok) {
        const nuevoEstado = await rEstado.json();
        actualizarEstado((prev) => ({
          ...nuevoEstado,
          ...pickPending(prev, enviosPendientes.current),
        }));
      }
```

With:

```ts
      if (rEstado.ok) {
        const nuevoEstado = await rEstado.json();
        actualizarEstado((prev) =>
          combinarConPendientes(nuevoEstado, prev, enviosPendientes.current)
        );
      }
```

- [ ] **Step 3: Add the `historial` state**

In `Kiosko()`, right after the `enviosPendientes` ref declaration (line 153, `const enviosPendientes = useRef<Set<string>>(new Set());`), add:

```ts
  // Pila de las últimas marcaciones (máx. 5) para poder deshacerlas.
  // `valorAnterior` es undefined cuando la fila no tenía ninguna marca
  // antes del cambio.
  const [historial, setHistorial] = useState<
    { id: string; valorAnterior: Estado | undefined }[]
  >([]);
```

- [ ] **Step 4: Make `marcar()` record history, and add `limpiarEstado()`**

Replace the existing `marcar` function (lines 219-233):

```ts
  async function marcar(opId: string, valor: Estado) {
    actualizarEstado((prev) => ({ ...prev, [opId]: valor }));
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
```

With (adds an internal `registrarHistorial` option, defaulting to `true`, so `deshacer()` can re-apply a value without pushing a new undo entry):

```ts
  async function marcar(opId: string, valor: Estado, registrarHistorial = true) {
    if (registrarHistorial) {
      const valorAnterior = estadoRef.current[opId] as Estado | undefined;
      setHistorial((prev) => [...prev, { id: opId, valorAnterior }].slice(-5));
    }
    actualizarEstado((prev) => ({ ...prev, [opId]: valor }));
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

  async function limpiarEstado(opId: string) {
    actualizarEstado((prev) => {
      const siguiente = { ...prev };
      delete siguiente[opId];
      return siguiente;
    });
    enviosPendientes.current.add(opId);
    try {
      await fetch("/api/estado", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: opId }),
      });
    } catch {
      // El estado ya quedó limpiado localmente; el próximo poll exitoso lo reconciliará.
    } finally {
      enviosPendientes.current.delete(opId);
    }
  }

  function deshacer() {
    if (historial.length === 0) return;
    const ultimo = historial[historial.length - 1];
    // El pop se hace aparte de las llamadas con efectos (limpiarEstado/marcar):
    // React 18 en modo estricto puede invocar dos veces el actualizador de
    // setState, y no queremos disparar la petición de red dos veces.
    setHistorial((prev) => prev.slice(0, -1));
    if (ultimo.valorAnterior === undefined) {
      limpiarEstado(ultimo.id);
    } else {
      marcar(ultimo.id, ultimo.valorAnterior, false);
    }
  }
```

- [ ] **Step 5: Add the `BotonDeshacer` component**

Add this new component after `EstadoConexion` (after line 377, its closing `}`):

```tsx
function BotonDeshacer({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label="Deshacer última marcación"
      className={`w-9 h-9 rounded-full flex items-center justify-center border transition-opacity ${
        disabled
          ? "opacity-40 cursor-not-allowed border-amber/40 text-amber/40"
          : "border-amber text-amber bg-amber/15"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <polyline points="9 14 4 9 9 4" />
        <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 6: Wire the button into the header**

Replace the header's right-hand button group (lines 259-269):

```tsx
        <div className="flex items-center gap-3 pl-2">
          {!pantallaCompleta && (
            <button
              onClick={iniciarTurno}
              className="px-3 py-1 rounded bg-signal-blue/15 border border-signal-blue text-signal-blue text-sm font-bold uppercase tracking-wide"
            >
              Iniciar turno
            </button>
          )}
          <EstadoConexion conectado={conectado} />
        </div>
```

With:

```tsx
        <div className="flex items-center gap-3 pl-2">
          <BotonDeshacer disabled={historial.length === 0} onClick={deshacer} />
          {!pantallaCompleta && (
            <button
              onClick={iniciarTurno}
              className="px-3 py-1 rounded bg-signal-blue/15 border border-signal-blue text-signal-blue text-sm font-bold uppercase tracking-wide"
            >
              Iniciar turno
            </button>
          )}
          <EstadoConexion conectado={conectado} />
        </div>
```

- [ ] **Step 7: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 8: Manual browser test**

With `npm run dev` running (from Task 1) and the browser open at `http://localhost:3000`:

1. Confirm the amber circular undo button appears in the header, left of "Iniciar turno", and looks disabled (dim, ~40% opacity).
2. Click `TRA` on any row (note its machine/OP so you can identify it, e.g. `HPK2_01`). Confirm the undo button becomes fully opaque/enabled.
3. Click the undo button. Confirm the row goes back to blank (no TRA/TER highlight) immediately.
4. Verify the backend actually cleared it: `curl -s "http://localhost:3000/api/estado?ids=HPK2_01"` → expect `{}`.
5. Click `TRA` on row A, then `TER` on a different row B. Click undo once: confirm row B goes blank first (LIFO — most recent first), row A still shows TRA. Click undo again: confirm row A also goes blank, and the button is disabled again (nothing left to undo).
6. Click `TRA` on a row, then click `TER` on the *same* row (correcting a mistake by re-marking, not by undoing). Click undo: confirm it goes back to `TRA` (the value before the last marking), not blank.
7. Mark 6 different rows in a row (more than the 5-entry cap). Click undo 5 times and confirm all 5 most recent are reverted and the button is now disabled — the very first (6th-oldest) marking should remain untouched, since it was pushed out of the history.

- [ ] **Step 9: Commit**

```bash
git add app/page.tsx
git commit -m "$(cat <<'EOF'
Add undo button for the last 5 row markings

Circular amber button in the header, always visible during the shift,
left of "Iniciar turno". Tracks a 5-entry history of TRA/TER marks and
reverts them in LIFO order, including clearing a row back to unmarked
via the new DELETE /api/estado endpoint.
EOF
)"
```
