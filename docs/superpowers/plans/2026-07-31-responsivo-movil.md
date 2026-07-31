# Responsivo para celular Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the kiosk usable on phone screens (smaller text, horizontal-scrolling table with a sticky machine column, wrapping header) while leaving tablet (≥768px) and PC completely unchanged.

**Architecture:** Every existing Tailwind class in `app/page.tsx` stays exactly as-is. All mobile adjustments are added as new `max-md:` (applies only below 768px) classes alongside the existing ones — nothing is replaced or removed. Three tasks, each touching a different region of the same file: the header, the table, and the OBSERVACIONES/BITACORA blocks.

**Tech Stack:** Next.js 14, React 18, Tailwind CSS 3.4 (supports `max-*` breakpoint variants natively — no config changes needed). No test framework — verification is `tsc --noEmit` plus manual browser testing at three widths.

## Global Constraints

- **Breakpoint: 768px** (Tailwind's built-in `md` breakpoint, used as `max-md:`). Below 768px is "mobile"; at 768px and above, nothing in this plan changes anything.
- **Never remove or modify an existing class** — only add new `max-md:`-prefixed classes alongside what's already there. If a task's diff shows any existing (non-`max-md:`) class value changed or removed, that's a defect.
- **Every task's manual test must explicitly verify 768px and a PC width (1280px) look pixel-for-pixel identical to before this plan** — not just that mobile looks good. This is the single most important thing to get right per the user's explicit requirement.
- Keep the 20 data columns + Acción column — no columns are hidden on mobile, they're reached via horizontal scroll instead.
- Spec doc: `docs/superpowers/specs/2026-07-31-responsivo-movil-design.md`.

---

### Task 1: Header wraps and shrinks on mobile

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Update the header JSX**

Find:

```tsx
      <header className="encabezado-luz flex items-center justify-between px-4 py-2 border-b-2 border-amber shrink-0">
        <div className="text-2xl font-extrabold uppercase tracking-wide border-r border-r-amber/40 pr-4">
          <span className="text-soft-blue">Programa de</span> <span className="text-amber">Maquinado</span>
        </div>
        <div className="font-data text-xs text-soft-blue tracking-wide border-r border-r-amber/40 px-4">
          ACTUALIZADO {prog.ultimaActualizacion} · V{prog.version}
        </div>
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
      </header>
```

Replace with:

```tsx
      <header className="encabezado-luz flex flex-wrap items-center justify-between gap-y-1 px-4 py-2 border-b-2 border-amber shrink-0 max-md:px-2 max-md:py-1.5">
        <div className="text-2xl font-extrabold uppercase tracking-wide border-r border-r-amber/40 pr-4 max-md:text-base max-md:border-r-0 max-md:pr-0">
          <span className="text-soft-blue">Programa de</span> <span className="text-amber">Maquinado</span>
        </div>
        <div className="font-data text-xs text-soft-blue tracking-wide border-r border-r-amber/40 px-4 max-md:order-3 max-md:basis-full max-md:border-r-0 max-md:px-0">
          ACTUALIZADO {prog.ultimaActualizacion} · V{prog.version}
        </div>
        <div className="flex items-center gap-3 pl-2 max-md:gap-2 max-md:pl-0">
          <BotonDeshacer disabled={historial.length === 0} onClick={deshacer} />
          {!pantallaCompleta && (
            <button
              onClick={iniciarTurno}
              className="px-3 py-1 rounded bg-signal-blue/15 border border-signal-blue text-signal-blue text-sm font-bold uppercase tracking-wide max-md:px-2 max-md:text-xs"
            >
              Iniciar turno
            </button>
          )}
          <EstadoConexion conectado={conectado} />
        </div>
      </header>
```

What changed: `flex-wrap` lets the three children wrap instead of overflowing; the title shrinks (`max-md:text-base`) and drops its right border/padding (`max-md:border-r-0 max-md:pr-0`, since a wrapped layout doesn't need a vertical divider); the date/version block is forced onto its own full-width row below the title+buttons via `max-md:basis-full max-md:order-3`; the "Iniciar turno" button gets tighter padding and smaller text. Every added class has the `max-md:` prefix — at 768px and up this block is byte-for-byte the same classes as before (all the base, unprefixed classes are untouched).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual browser test at three widths**

With `npm run dev` running, log in, and use the browser's device toolbar (or resize the window) to check:

1. **1280px (PC) and 768px (tablet) — must look IDENTICAL to before this task.** Compare against your memory of the header (title left, date/version center, buttons right, all on one row with vertical divider lines) — if anything shifted, sized differently, or lost its divider at these widths, that's a bug; the `max-md:` classes must not be affecting anything at ≥768px.
2. **375px (phone):** confirm the title and buttons sit on the first row (title left, buttons right, both readable and not clipped), the "ACTUALIZADO … · V…" line wraps to its own row below and is fully visible, and nothing is cut off or overlapping at the edges.
3. **414px and 428px** (a couple of common larger phone widths): same checks as 375px — confirm no regressions at slightly wider phone sizes.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "$(cat <<'EOF'
Make the header wrap and shrink on phone screens

Adds max-md: classes alongside the existing ones so the title, date,
and buttons wrap onto two rows below 768px instead of overflowing.
Tablet/PC (≥768px) render with the exact same classes as before —
nothing existing was modified or removed.
EOF
)"
```

---

### Task 2: Table gets smaller text, horizontal scroll, and a sticky machine column on mobile

**Files:**
- Modify: `app/page.tsx`

This is the highest-risk task in this plan — verify tablet/PC extra carefully.

- [ ] **Step 1: Allow horizontal scroll and force a minimum table width on mobile**

Find:

```tsx
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <table className="w-full border-collapse text-[11px] leading-tight table-fixed font-data">
```

Replace with:

```tsx
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        <table className="w-full border-collapse text-[11px] leading-tight table-fixed font-data max-md:min-w-[1100px] max-md:text-[9px]">
```

Why this works: `table-fixed` combined with percentage-width `<col>` elements (unchanged, still in the `<colgroup>` below) makes every column shrink proportionally to whatever width the table itself renders at. Today the table is always `w-full` (100% of its container), so on a narrow phone every column gets squeezed into a few pixels — that's the actual bug being fixed. `max-md:min-w-[1100px]` forces the table to be at least 1100px wide *only* below 768px, which overrides `w-full`'s shrink and makes the same percentage columns resolve to comfortable pixel widths instead — the table becomes wider than the phone's viewport, and the container's `overflow-x-auto` (changed from `overflow-x-hidden`, which was actively preventing this) lets the user scroll sideways to reach it. At ≥768px, `max-md:min-w-[1100px]` doesn't apply and the table is `w-full` exactly as it always was — `overflow-x-auto` vs `overflow-x-hidden` makes no visual difference there either, since nothing overflows the container at those widths in the first place.

`1100px` is a starting estimate, not a fixed requirement — during Step 6's manual test, if the narrowest columns (the ones with `ancho: 3` in `COLUMNAS_VISIBLES`, e.g. LINEA/ACAB/VELOCIDAD/RODAJA/FECHA_RODAJA/FECHA_DESPACHO) still look cramped or clip short text like a date abbreviation, increase this value (and `max-md:text-[9px]` similarly if needed) until they're comfortably legible. Keep the mechanism (a `max-md:`-only min-width) — just tune the number based on what you actually see.

- [ ] **Step 2: Make the MÁQUINA header cell stick to the left on mobile**

Find:

```tsx
              {COLUMNAS_VISIBLES.map((c) => (
                <th
                  key={c.key}
                  className="p-1 text-left border-b-2 border-b-amber border-r border-r-amber/20 align-bottom whitespace-pre-line overflow-hidden font-display font-bold uppercase tracking-wide text-ink-dim text-[11px]"
                >
                  {c.label}
                </th>
              ))}
```

Replace with:

```tsx
              {COLUMNAS_VISIBLES.map((c) => (
                <th
                  key={c.key}
                  className={`p-1 text-left border-b-2 border-b-amber border-r border-r-amber/20 align-bottom whitespace-pre-line overflow-hidden font-display font-bold uppercase tracking-wide text-ink-dim text-[11px] max-md:text-[9px] ${
                    c.key === "Maquina"
                      ? "max-md:sticky max-md:left-0 max-md:z-20 max-md:bg-panel-alt"
                      : ""
                  }`}
                >
                  {c.label}
                </th>
              ))}
```

- [ ] **Step 3: Make the MÁQUINA data cell (the rowSpan cell) stick to the left on mobile**

Find:

```tsx
                  {grupo.inicioGrupo && (
                    <td
                      rowSpan={grupo.tamanoGrupo}
                      className={`p-1 border-l-2 border-amber bg-panel-alt font-display font-bold uppercase text-amber text-center align-middle text-sm tracking-wide ${divisorGrupo}`}
                      style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                    >
                      {nombreCortoMaquina(fila.Maquina as string)}
                    </td>
                  )}
```

Replace with:

```tsx
                  {grupo.inicioGrupo && (
                    <td
                      rowSpan={grupo.tamanoGrupo}
                      className={`p-1 border-l-2 border-amber bg-panel-alt font-display font-bold uppercase text-amber text-center align-middle text-sm tracking-wide max-md:sticky max-md:left-0 max-md:z-20 max-md:text-[10px] ${divisorGrupo}`}
                      style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                    >
                      {nombreCortoMaquina(fila.Maquina as string)}
                    </td>
                  )}
```

(This cell already has `bg-panel-alt`, so it's already opaque — no separate mobile background override needed here, unlike the header cell in Step 2 which had no background of its own.)

- [ ] **Step 4: Shrink the TRA/TER button text slightly on mobile**

Find, in the `BotonEstado` component definition near the bottom of the file:

```tsx
      className={`w-full py-1.5 rounded font-display font-extrabold text-[11px] leading-none tracking-wide transition-shadow ${
        activo ? estilos.activo : estilos.inactivo
      }`}
```

Replace with:

```tsx
      className={`w-full py-1.5 rounded font-display font-extrabold text-[11px] max-md:text-[9px] leading-none tracking-wide transition-shadow ${
        activo ? estilos.activo : estilos.inactivo
      }`}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual browser test at three widths**

With `npm run dev` running and logged in:

1. **1280px (PC) and 768px (tablet) — must be pixel-for-pixel identical to before this task.** The table must still be exactly `w-full`, no horizontal scrollbar should appear (or be reachable — there should be nothing to scroll to), font sizes and the MÁQUINA column's appearance (not sticky, no special background beyond what it already had) must be unchanged. This is the check that matters most — take your time on it.
2. **375px (phone):**
   - Confirm the table is now wider than the viewport and you can scroll it horizontally.
   - Confirm the MÁQUINA column stays fixed on the left edge as you scroll right — it should never disappear off-screen.
   - Confirm the column header row stays fixed at the top as you scroll down (this already worked before — confirm this task didn't break it) AND that the MÁQUINA header cell in particular renders correctly at the top-left corner when you've scrolled both down and right at the same time (this is the trickiest interaction — sticky-top and sticky-left together — check it specifically, don't assume it just works because each direction works alone).
   - Confirm text in the columns is now legible (not wrapping into a wall of single characters) once you've scrolled to see them.
   - Confirm the TRA/TER buttons in the Acción column are still comfortably tappable and readable.
3. Do the same three checks at **414px and 428px**.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "$(cat <<'EOF'
Make the schedule table usable on phone screens

Below 768px: smaller font, a forced minimum table width so table-fixed's
percentage columns resolve to legible pixel widths instead of getting
squeezed to nothing, horizontal scroll to reach them, and the MÁQUINA
column pinned to the left edge as a reference point while scrolling.
Tablet/PC render with the exact same classes as before this change.
EOF
)"
```

---

### Task 3: OBSERVACIONES and BITÁCORA fit on mobile

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Tighten OBSERVACIONES padding on mobile**

Find:

```tsx
      {(prog.observaciones ?? "").trim() !== "" && (
        <div className="shrink-0 border-b-2 border-amber bg-panel-alt px-4 py-1 max-h-[4.5rem] overflow-y-auto flex items-start gap-2">
```

Replace with:

```tsx
      {(prog.observaciones ?? "").trim() !== "" && (
        <div className="shrink-0 border-b-2 border-amber bg-panel-alt px-4 py-1 max-h-[4.5rem] overflow-y-auto flex items-start gap-2 max-md:px-2">
```

- [ ] **Step 2: Stack the BITÁCORA form on mobile**

Find:

```tsx
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
```

Replace with:

```tsx
            <div className="flex gap-2 max-md:flex-col">
              <input
                value={notaAutor}
                onChange={(e) => setNotaAutor(e.target.value)}
                placeholder="Tu nombre (opcional)"
                className="flex-1 rounded border border-amber/40 bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-amber"
              />
              <button
                onClick={agregarNota}
                disabled={enviandoNota || notaTexto.trim() === ""}
                className="rounded bg-amber/15 border border-amber px-4 py-1 text-xs font-bold uppercase tracking-wide text-amber disabled:opacity-40 max-md:w-full max-md:py-2"
              >
                {enviandoNota ? "Guardando…" : "Agregar nota"}
              </button>
            </div>
```

(The name input already becomes full-width automatically once `flex-col` stacks it, since it's `flex-1` in a now-vertical flex container — no extra class needed there. The button gets `max-md:w-full` to match, and a touch a bit more vertical padding, `max-md:py-2`, for a more comfortable tap target.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual browser test at three widths**

With `npm run dev` running and logged in, scroll to the OBSERVACIONES band (add test text to `public/data/programacion.json`'s `observaciones` field temporarily if it's currently empty in your local copy, same as Task 2 of the observaciones plan did — **revert that file before finishing**, it's live production data) and to the BITÁCORA section at the bottom:

1. **1280px (PC) and 768px (tablet) — must be pixel-for-pixel identical to before this task.** OBSERVACIONES padding and the BITÁCORA form's side-by-side name-input-then-button layout must be unchanged.
2. **375px, 414px, 428px (phone widths):**
   - OBSERVACIONES: confirm the band still reads clearly with the tighter padding.
   - BITÁCORA: confirm the name input and "Agregar nota" button now stack vertically (input on top, full-width button below), both comfortably tappable, instead of being squeezed side by side.
   - Add a test note at 375px width to confirm the form still actually submits and the new entry appears in the list correctly at this width (functional check, not just visual) — then, if using the shared dev Redis, clean it up the same way prior tasks in this project have (`curl -X POST "$KV_REST_API_URL/del/kiosko:bitacora" -H "Authorization: Bearer $KV_REST_API_TOKEN"` after loading `.env.local`).

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "$(cat <<'EOF'
Fit OBSERVACIONES and BITACORA to phone screens

Tighter OBSERVACIONES padding and a stacked (instead of side-by-side)
BITACORA form on mobile. Tablet/PC render with the exact same classes
as before this change.
EOF
)"
```
