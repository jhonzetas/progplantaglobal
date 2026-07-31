# OBSERVACIONES + BITÁCORA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only OBSERVACIONES band (sourced from Excel) between the kiosk header and the table, and an editable, append-only BITACORA log at the end of the schedule that operators write directly in the app.

**Architecture:** Four tasks in dependency order. (1) The Excel macro reads cell A3 and adds an `observaciones` field to the exported JSON. (2) The frontend renders that field as a new band. (3) A new `/api/bitacora` route stores/reads an append-only list in Redis. (4) The frontend adds a form + entry list at the end of the table, wired to that route. Tasks 1+2 (OBSERVACIONES) and 3+4 (BITACORA) are independent of each other and could be done in either order, but are sequenced this way so the macro's contract (task 1) exists before the frontend that consumes it (task 2), and the API (task 3) exists before the frontend that calls it (task 4).

**Tech Stack:** Next.js 14 app router (edge runtime API routes), React 18 client component, Upstash Redis (`@upstash/redis`), Tailwind CSS, VBA (Excel macro). No test framework is installed in this repo — verification is via `tsc --noEmit`, `curl`, and manual browser testing. The VBA task (Task 1) cannot be executed or tested by an agent — no Excel is available in this environment — so that task is verified by careful manual code tracing only; real-world verification happens when the human runs it in Excel, same as prior macro changes in this project.

## Global Constraints

- OBSERVACIONES is read-only in the app — sourced from `Programa_Maq!A3`, may be empty, rendered as a full-width band between the header and the table, capped at roughly 3 Excel-rows of height with internal vertical scroll if longer (nothing is ever truncated/lost).
- BITACORA is an **append-only log** — entries are never edited or deleted through the app. Each entry: text (unlimited length), optional author name, server-generated timestamp.
- BITACORA lives at the end of the schedule (after the last table row), inside the same scrollable container as the table — not a separate fixed panel.
- BITACORA is already protected by the existing login middleware (`middleware.ts`'s public-route allowlist is `/login`, `/api/login`, `/images` — anything else under `/api/` is gated already; no middleware changes needed).
- Spec doc: `docs/superpowers/specs/2026-07-31-observaciones-bitacora-design.md`.

---

### Task 1: Macro reads OBSERVACIONES from Excel

**Files:**
- Modify: `macro/ExportarProgramacionJSON.bas`

**Interfaces:**
- Produces: a new top-level JSON field `"observaciones"` (string, may be `""`) in `public/data/programacion.json`, sourced from `Programa_Maq!A3`. This is the exact field name Task 2's frontend reads.

- [ ] **Step 1: Read A3 and add it to the JSON output**

In `macro/ExportarProgramacionJSON.bas`, find this block near the end of `ExportarProgramacionJSON`:

```vba
    Application.ScreenUpdating = True
    ThisWorkbook.Save ' persiste los IDs nuevos escritos en la columna AA

    json = "{""version"":" & version & ",""ultimaActualizacion"":""" & Format(Now, "yyyy-mm-dd hh:mm:ss") & _
        """,""columnas"":[" & colJSON & "],""filas"":[" & filas & "]}"
```

Replace it with:

```vba
    Application.ScreenUpdating = True
    ThisWorkbook.Save ' persiste los IDs nuevos escritos en la columna AA

    Dim observaciones As String
    observaciones = Trim(CStr(ws.Cells(3, "A").Value))

    json = "{""version"":" & version & ",""ultimaActualizacion"":""" & Format(Now, "yyyy-mm-dd hh:mm:ss") & _
        """,""observaciones"":" & JStr(observaciones) & ",""columnas"":[" & colJSON & "],""filas"":[" & filas & "]}"
```

(`JStr` already exists in this file and handles quoting/escaping — same function used for `idFila` and `maquinaActual`.)

- [ ] **Step 2: Trace it by hand (no execution available)**

There is no Excel/VBA runtime available to run this. Instead, manually trace the change against the file:

1. Confirm `ws` still refers to `ThisWorkbook.Sheets("Programa_Maq")` at the point this code runs (it's set once near the top of the sub and never reassigned — confirm by reading the full sub top to bottom).
2. Confirm `JStr` correctly wraps an empty string: `JStr("")` → `""""` (a JSON empty string `""`), so a blank A3 produces valid JSON `"observaciones":""`, not `"observaciones":` (which would be invalid JSON). Trace through the `JStr` function definition to confirm this.
3. Confirm the resulting `json` string is still balanced/valid JSON by manually reading the concatenation left to right — count braces and commas.
4. Confirm this change does not touch anything inside the `For r = 5 To lastRow` loop, the ID-persistence logic (columns AA), or `PublicarEnGitHub` — it only adds one new top-level field.

- [ ] **Step 3: Commit**

```bash
git add macro/ExportarProgramacionJSON.bas
git commit -m "$(cat <<'EOF'
Export OBSERVACIONES (Programa_Maq!A3) into programacion.json

Read-only note field the user writes directly in Excel, above the
data rows the macro already parses. Empty by default.
EOF
)"
```

---

### Task 2: Render the OBSERVACIONES band

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `Programacion.observaciones: string` (from Task 1's JSON contract).

- [ ] **Step 1: Add the field to the `Programacion` type**

In `app/page.tsx`, find:

```ts
type Programacion = {
  version: number;
  ultimaActualizacion: string;
  columnas: string[];
  filas: (string | number | null)[][];
};
```

Replace with:

```ts
type Programacion = {
  version: number;
  ultimaActualizacion: string;
  observaciones: string;
  columnas: string[];
  filas: (string | number | null)[][];
};
```

- [ ] **Step 2: Render the band**

Find the header/banner region:

```tsx
      </header>

      {!conectado && (
        <div className="bg-signal-red/10 text-signal-red text-center py-1 shrink-0 font-bold uppercase tracking-wide text-sm">
          Sin conexión — mostrando última programación
        </div>
      )}
```

Replace with:

```tsx
      </header>

      {prog.observaciones.trim() !== "" && (
        <div className="shrink-0 border-b-2 border-amber bg-panel-alt px-4 py-1 max-h-[4.5rem] overflow-y-auto flex items-start gap-2">
          <span className="shrink-0 font-display font-bold uppercase tracking-wide text-amber text-xs whitespace-nowrap pt-0.5">
            OBSERVACIONES:
          </span>
          <span className="font-data text-xs text-ink whitespace-pre-line">
            {prog.observaciones}
          </span>
        </div>
      )}

      {!conectado && (
        <div className="bg-signal-red/10 text-signal-red text-center py-1 shrink-0 font-bold uppercase tracking-wide text-sm">
          Sin conexión — mostrando última programación
        </div>
      )}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual browser test**

The real macro (Task 1) can't run here, so simulate its output locally:

1. Open `public/data/programacion.json`, add `"observaciones": "Prueba de observaciones — línea uno.\nLínea dos."` as a top-level field (comma-separate it correctly with the existing fields), save.
2. Run `npm run dev`, log in if prompted, open `http://localhost:3000`.
3. Confirm the OBSERVACIONES band appears between the header and the table (or between the header and the "Sin conexión" banner, if that's showing), with the label on the left and the two-line text next to it, and that it visually fits roughly 3 table-rows of height.
4. Type or paste several more lines into that JSON field (10+ short lines) to exceed the band's height, reload, and confirm the band scrolls internally rather than clipping/hiding text or breaking the page layout.
5. Set `"observaciones": ""` (empty), reload, and confirm the band disappears entirely (no empty band, no leftover gap).
6. **Revert `public/data/programacion.json` to its original committed content** before finishing (`git checkout -- public/data/programacion.json`) — this file is live production data, not a fixture, and must not be left modified.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "$(cat <<'EOF'
Render the OBSERVACIONES band between the header and the table

Read-only, full-width, ~3-row max height with internal scroll if the
text is longer. Hidden entirely when empty.
EOF
)"
```

---

### Task 3: `/api/bitacora` endpoint

**Files:**
- Create: `app/api/bitacora/route.ts`

**Interfaces:**
- Produces:
  - `GET /api/bitacora` → `200`, JSON array of entries, most-recent-first: `{ id: string; texto: string; autor: string | null; fecha: string }[]`.
  - `POST /api/bitacora` — body `{ texto: string, autor?: string }`. Empty/whitespace-only `texto` → `400 { error: "El texto no puede estar vacío" }`. Otherwise → `200 { ok: true, entrada: {id, texto, autor, fecha} }`, and the entry is persisted. `fecha` is generated server-side (`new Date().toISOString()`) — never trust a client-supplied timestamp. `id` is server-generated (`crypto.randomUUID()`) for stable React keys later. `autor` is `null` when not supplied or blank after trimming.

- [ ] **Step 1: Write the route**

Create `app/api/bitacora/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "edge";
const LISTA_KEY = "kiosko:bitacora";

type EntradaBitacora = {
  id: string;
  texto: string;
  autor: string | null;
  fecha: string;
};

export async function GET() {
  const entradas =
    (await redis.lrange<EntradaBitacora>(LISTA_KEY, 0, -1)) || [];
  return NextResponse.json(entradas);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { texto?: string; autor?: string };
  const texto = (body.texto ?? "").trim();
  if (!texto) {
    return NextResponse.json(
      { error: "El texto no puede estar vacío" },
      { status: 400 }
    );
  }
  const entrada: EntradaBitacora = {
    id: crypto.randomUUID(),
    texto,
    autor: body.autor?.trim() || null,
    fecha: new Date().toISOString(),
  };
  await redis.lpush(LISTA_KEY, entrada);
  return NextResponse.json({ ok: true, entrada });
}
```

`LPUSH` prepends, so `LRANGE(key, 0, -1)` already returns most-recent-first — no extra sorting needed. This follows the same pattern as `app/api/estado/route.ts` — pass typed JS objects directly to the Upstash client (`redis.hset(HASH_KEY, {...})` there, `redis.lpush(LISTA_KEY, entrada)` here) and let the client handle serialization, rather than manually calling `JSON.stringify`/`JSON.parse`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual test against the local dev server**

Run in one terminal: `npm run dev`.

In another terminal, authenticate first (this route is gated by the login middleware, same as `/api/estado`):

```bash
export $(grep -v '^#' .env.local | xargs)
curl -s -c cookies.txt -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d "{\"correo\":\"$AUTH_USER\",\"clave\":\"$AUTH_PASSWORD\"}" -o /dev/null -w "login: %{http_code}\n"
```

Empty list initially:
```bash
curl -s -b cookies.txt http://localhost:3000/api/bitacora
```
Expected: `[]` (or whatever pre-existing test entries you haven't cleaned up yet — see cleanup note below).

Reject empty text:
```bash
curl -s -i -b cookies.txt -X POST http://localhost:3000/api/bitacora \
  -H "Content-Type: application/json" -d '{"texto":"   "}'
```
Expected: `400`, body `{"error":"El texto no puede estar vacío"}`.

Add an entry without an author:
```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/bitacora \
  -H "Content-Type: application/json" -d '{"texto":"Prueba sin autor"}'
```
Expected: `{"ok":true,"entrada":{"id":"...","texto":"Prueba sin autor","autor":null,"fecha":"..."}}` — confirm `id` looks like a UUID, `autor` is JSON `null` (not the string `"null"`), `fecha` is a valid ISO timestamp close to now.

Add an entry with an author:
```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/bitacora \
  -H "Content-Type: application/json" -d '{"texto":"Prueba con autor","autor":"  Juan  "}'
```
Expected: `autor` in the response is `"Juan"` (trimmed).

Confirm ordering:
```bash
curl -s -b cookies.txt http://localhost:3000/api/bitacora
```
Expected: an array with (at least) the two entries just added, **most recent first** (so "Prueba con autor" appears before "Prueba sin autor").

**Cleanup:** this is the local dev Redis (same shared instance the rest of this project uses per `.env.local`) — after testing, remove the test entries so they don't linger. There's no DELETE exposed on this route (append-only by design), so clear the list directly via the Upstash REST API using the credentials already in `.env.local`:

```bash
curl -s -X POST "$KV_REST_API_URL/del/kiosko:bitacora" \
  -H "Authorization: Bearer $KV_REST_API_TOKEN"
```

Then confirm with `curl -s -b cookies.txt http://localhost:3000/api/bitacora` that it returns `[]`. Document in your report that you did this.

- [ ] **Step 4: Commit**

```bash
git add app/api/bitacora/route.ts
git commit -m "$(cat <<'EOF'
Add GET/POST /api/bitacora for the operator log

Append-only: POST adds a timestamped entry (server-generated id and
timestamp, optional trimmed author), GET returns all entries
most-recent-first. No edit/delete — matches the spec's append-only
bitácora design.
EOF
)"
```

---

### Task 4: BITACORA UI (form + entry list)

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/bitacora` and `POST /api/bitacora` from Task 3, exact contract above.

- [ ] **Step 1: Add state**

In `Kiosko()`, near the existing `historial` state declaration, add:

```ts
  const [bitacora, setBitacora] = useState<
    { id: string; texto: string; autor: string | null; fecha: string }[]
  >([]);
  const [notaTexto, setNotaTexto] = useState("");
  const [notaAutor, setNotaAutor] = useState("");
  const [enviandoNota, setEnviandoNota] = useState(false);
```

- [ ] **Step 2: Fetch it in `poll()`**

Find, inside `poll()`:

```ts
      if (rEstado.ok) {
        const nuevoEstado = await rEstado.json();
        actualizarEstado((prev) =>
          combinarConPendientes(nuevoEstado, prev, enviosPendientes.current)
        );
      }
      guardarCacheLocal(data, estadoRef.current);
```

Replace with:

```ts
      if (rEstado.ok) {
        const nuevoEstado = await rEstado.json();
        actualizarEstado((prev) =>
          combinarConPendientes(nuevoEstado, prev, enviosPendientes.current)
        );
      }

      const rBitacora = await fetch("/api/bitacora", { cache: "no-store" });
      if (rBitacora.ok) {
        setBitacora(await rBitacora.json());
      }

      guardarCacheLocal(data, estadoRef.current);
```

(Bitácora entries are append-only and don't need the `enviosPendientes`/`combinarConPendientes` optimistic-merge machinery that TRA/TER marks need — a new entry is prepended to local state directly on successful POST, per Step 3 below, and a poll landing mid-request at worst briefly doesn't yet show the newest entry until the next 20s tick, which self-corrects and never loses data.)

- [ ] **Step 3: Add the submit function**

Add this function inside `Kiosko()`, near `marcar`/`limpiarEstado`:

```ts
  async function agregarNota() {
    const texto = notaTexto.trim();
    if (!texto) return;
    setEnviandoNota(true);
    try {
      const r = await fetch("/api/bitacora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto,
          autor: notaAutor.trim() || undefined,
        }),
      });
      if (r.ok) {
        const data = await r.json();
        setBitacora((prev) => [data.entrada, ...prev]);
        setNotaTexto("");
      }
    } catch {
      // El texto queda en el campo para que el operario pueda reintentar.
    } finally {
      setEnviandoNota(false);
    }
  }
```

- [ ] **Step 4: Render the section after the table**

Find the end of the table and its wrapping scroll container:

```tsx
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Replace with:

```tsx
          </tbody>
        </table>

        <div className="border-t-4 border-amber bg-panel-alt px-4 py-3">
          <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-amber">
            Bitácora
          </h2>

          <div className="mb-3 flex flex-col gap-2">
            <textarea
              value={notaTexto}
              onChange={(e) => setNotaTexto(e.target.value)}
              placeholder="Escribe una novedad o solicitud del turno…"
              rows={2}
              className="w-full rounded border border-amber/40 bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-amber"
            />
            <div className="flex gap-2">
              <input
                value={notaAutor}
                onChange={(e) => setNotaAutor(e.target.value)}
                placeholder="Tu nombre (opcional)"
                className="flex-1 rounded border border-amber/40 bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-amber"
              />
              <button
                onClick={agregarNota}
                disabled={enviandoNota || notaTexto.trim() === ""}
                className="rounded bg-amber/15 border border-amber px-4 py-1 text-xs font-bold uppercase tracking-wide text-amber disabled:opacity-40"
              >
                {enviandoNota ? "Guardando…" : "Agregar nota"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {bitacora.length === 0 && (
              <p className="text-xs italic text-ink-dim">Sin notas todavía.</p>
            )}
            {bitacora.map((nota) => (
              <div key={nota.id} className="border-l-2 border-amber/40 pl-2 text-xs">
                <div className="font-data text-ink-dim">
                  {new Date(nota.fecha).toLocaleString("es-CO")}
                  {nota.autor ? ` · ${nota.autor}` : ""}
                </div>
                <div className="whitespace-pre-line text-ink">{nota.texto}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual browser test**

With `npm run dev` running and logged in at `http://localhost:3000`:

1. Scroll to the bottom of the table. Confirm the "Bitácora" section appears after the last row (DMK 7 LASER block currently), inside the same scrolling area as the table (i.e. it scrolls together with the table, it isn't a fixed panel).
2. Confirm it initially shows "Sin notas todavía." (assuming Task 3's test cleanup left the list empty — if not, that's fine, just note what you see).
3. Type a note with no name, click "Agregar nota". Confirm it appears at the top of the list immediately, with a timestamp and no author shown, and the textarea clears.
4. Type a second note, fill in a name, submit. Confirm it appears above the first note (most-recent-first), with the name shown.
5. Confirm the "Agregar nota" button is disabled while the textarea is empty, and re-enables once you type something.
6. Reload the page. Confirm both notes are still there (persisted, not just local state) and still in the same most-recent-first order.
7. Open the same URL in a second browser tab, add a third note there, then wait up to 20s (or manually trigger another poll by reloading) in the first tab and confirm the third note appears — this proves it syncs across devices via the existing poll, not just local state.
8. **Cleanup:** clear out the test notes you added before finishing, the same way as Task 3:

```bash
export $(grep -v '^#' .env.local | xargs)
curl -s -X POST "$KV_REST_API_URL/del/kiosko:bitacora" \
  -H "Authorization: Bearer $KV_REST_API_TOKEN"
```

Confirm via `curl -s -b cookies.txt http://localhost:3000/api/bitacora` that it returns `[]` afterward.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "$(cat <<'EOF'
Add BITACORA section: operator-editable append-only log

Form (text + optional author) at the end of the schedule, inside the
same scrolling area as the table. Entries persist via POST /api/bitacora
and sync across devices through the existing 20s poll — no edit/delete,
matching the append-only design.
EOF
)"
```
