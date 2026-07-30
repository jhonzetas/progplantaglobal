# Pantalla de login propia + sesión por cookie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the entire kiosk app (pages + `/api/estado`) behind a custom-styled login screen with a session cookie, replacing the current no-auth state.

**Architecture:** Three independent, sequentially-buildable pieces: (1) `POST /api/login` validates credentials against env vars and issues a long-lived httpOnly cookie; (2) `app/login/page.tsx` is the styled login UI that calls it; (3) `middleware.ts` gates every route by checking that cookie, redirecting unauthenticated page requests to `/login` and rejecting unauthenticated API requests with 401. Built in that order so each task is independently testable — the gate (Task 3) is added last, once the thing it redirects to already exists and works.

**Tech Stack:** Next.js 14 app router (edge runtime for API routes and middleware), React 18 client components, Tailwind CSS. No test framework is installed in this repo — verification is via `tsc --noEmit`, `curl` against the local dev server, and manual browser testing.

## Global Constraints

- Credentials: a single shared correo/clave pair, read from `process.env.AUTH_USER` / `process.env.AUTH_PASSWORD`. **Never hardcode the actual credential values in any file, commit, or plan document** — `.env.local` already has them set locally (gitignored); read them from there when a step needs the real values.
- Cookie: name `kiosko_auth`, value equals `process.env.AUTH_PASSWORD` verbatim, `httpOnly: true`, `secure: true`, `sameSite: "lax"`, `path: "/"`, `maxAge: 31536000` (~1 year, spec decision — long-lived so a device rarely re-prompts).
- Fail-closed: if `AUTH_USER` or `AUTH_PASSWORD` is unset in the environment, every gated request must be rejected (never fail-open).
- Comparison is simple string equality — no hashing or constant-time comparison (documented spec decision: the threat model is deterring casual/automated access, not a targeted attacker).
- Login form has two fields: correo and clave (not simplified to a single PIN — explicit user decision, see spec).
- Background image asset already exists at `public/images/planta-global.webp` (committed).
- Reuse the existing `.encabezado-luz` CSS class (`app/globals.css`) for the login card's light-sweep accent — do not duplicate its keyframes/gradient into a new class.
- The login page must be responsive across mobile/tablet/PC — it's a new page, so this carries no risk to the existing kiosk table (which must not be touched by this plan).
- Spec doc: `docs/superpowers/specs/2026-07-30-login-personalizado-design.md`.

---

### Task 1: `POST /api/login` endpoint

**Files:**
- Create: `app/api/login/route.ts`

**Interfaces:**
- Produces: `POST /api/login` — body `{ correo: string, clave: string }`. On match: `200 { ok: true }` with `Set-Cookie: kiosko_auth=<AUTH_PASSWORD value>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`. On mismatch: `401 { error: "Correo o clave incorrectos" }`. This is the exact contract Task 2 (login page) and Task 3 (middleware, cookie name/value only) depend on.

- [ ] **Step 1: Write the route handler**

Create `app/api/login/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { correo?: string; clave?: string };
  const { correo, clave } = body;

  if (
    !correo ||
    !clave ||
    correo !== process.env.AUTH_USER ||
    clave !== process.env.AUTH_PASSWORD
  ) {
    return NextResponse.json(
      { error: "Correo o clave incorrectos" },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("kiosko_auth", process.env.AUTH_PASSWORD as string, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 31536000,
  });
  return res;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual test against the local dev server**

Run in one terminal: `npm run dev` (leave it running).

In another terminal, from the repo root (so `.env.local` is in the current directory):

```bash
export $(grep -v '^#' .env.local | xargs)
```

This loads `AUTH_USER`/`AUTH_PASSWORD` (and the Redis vars) as shell variables from the gitignored `.env.local` — do not print their values or paste them into your report; reference them only as `$AUTH_USER`/`$AUTH_PASSWORD`.

Wrong password:
```bash
curl -s -i -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d "{\"correo\":\"$AUTH_USER\",\"clave\":\"wrong-password-xyz\"}"
```
Expected: `HTTP/1.1 401`, body `{"error":"Correo o clave incorrectos"}`, **no** `Set-Cookie` header in the response.

Missing fields:
```bash
curl -s -i -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{}'
```
Expected: `HTTP/1.1 401`, same error body, no `Set-Cookie`.

Correct credentials:
```bash
curl -s -i -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d "{\"correo\":\"$AUTH_USER\",\"clave\":\"$AUTH_PASSWORD\"}"
```
Expected: `HTTP/1.1 200`, body `{"ok":true}`, and a `Set-Cookie: kiosko_auth=...; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax` header present (curl will print it since `-i` includes response headers — do not echo the cookie's actual value in your report, just confirm the header's attributes are correct: `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=31536000`, `Path=/`).

- [ ] **Step 4: Commit**

```bash
git add app/api/login/route.ts
git commit -m "$(cat <<'EOF'
Add POST /api/login to issue the kiosk session cookie

Validates correo/clave against AUTH_USER/AUTH_PASSWORD and sets a
long-lived httpOnly cookie on success. Standalone endpoint — nothing
enforces the cookie yet (that's a later task), so this alone doesn't
change who can reach the app.
EOF
)"
```

---

### Task 2: `/login` page (styled UI)

**Files:**
- Create: `app/login/page.tsx`

**Interfaces:**
- Consumes: `POST /api/login` from Task 1 (`{correo, clave}` body; `200 {ok:true}` + cookie on success, `401 {error}` on failure).

- [ ] **Step 1: Write the login page**

Create `app/login/page.tsx`:

```tsx
"use client";
import { useState, FormEvent } from "react";
import Image from "next/image";

export default function Login() {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo, clave }),
      });
      if (r.ok) {
        window.location.href = "/";
        return;
      }
      const data = await r.json().catch(() => null);
      setError(data?.error ?? "Correo o clave incorrectos");
    } catch {
      setError("No se pudo conectar. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-panel font-display">
      <div className="absolute inset-0 -z-20">
        <Image
          src="/images/planta-global.webp"
          alt=""
          fill
          priority
          className="object-cover"
        />
      </div>
      <div className="absolute inset-0 -z-10 bg-panel/80" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm overflow-hidden rounded-lg border border-amber/40 bg-panel/90 shadow-[0_0_40px_rgba(255,176,32,0.15)]">
          <div className="encabezado-luz h-1.5" />
          <div className="p-6 sm:p-8">
            <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wide text-center">
              <span className="text-soft-blue">Programa de</span>{" "}
              <span className="text-amber">Maquinado</span>
            </h1>
            <p className="mt-1 mb-6 text-center text-xs sm:text-sm uppercase tracking-wide text-ink-dim">
              Inicia sesión para continuar
            </p>

            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="correo"
                  className="text-xs font-bold uppercase tracking-wide text-ink-dim"
                >
                  Correo
                </label>
                <input
                  id="correo"
                  type="email"
                  autoComplete="email"
                  required
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  className="rounded border border-amber/40 bg-panel-alt px-3 py-2 text-ink outline-none focus:border-amber"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="clave"
                  className="text-xs font-bold uppercase tracking-wide text-ink-dim"
                >
                  Clave
                </label>
                <input
                  id="clave"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  className="rounded border border-amber/40 bg-panel-alt px-3 py-2 text-ink outline-none focus:border-amber"
                />
              </div>

              {error && (
                <p className="text-sm font-bold text-signal-red" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={cargando}
                className="mt-2 rounded bg-amber/15 border border-amber py-2 text-sm font-bold uppercase tracking-wide text-amber disabled:opacity-50"
              >
                {cargando ? "Entrando…" : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual browser test**

With `npm run dev` running, open `http://localhost:3000/login`.

1. Confirm the background photo (`public/images/planta-global.webp`) renders full-screen, dimmed, with the login card centered and legible on top of it.
2. Confirm the thin light-sweep bar at the top of the card is animating (same visual motif as the kiosk header — open `http://localhost:3000/` in another tab to compare side by side).
3. Resize the browser window (or use device toolbar) to a phone width (~375px), a tablet width (~768px), and a desktop width (~1280px). Confirm the card stays centered, readable, and doesn't overflow or clip at any of the three widths.
4. Submit the form with an empty correo/clave: confirm the browser's native `required` validation blocks submission (no request sent).
5. Submit with a wrong clave: confirm an error message appears ("Correo o clave incorrectos") and the page does NOT navigate away.
6. Submit with the correct correo/clave (read them from `.env.local` — do not hardcode them into your test, your report, or any file): confirm the page navigates to `/` (the kiosk table, which is still open to everyone at this point since Task 3 hasn't added the gate yet — that's expected for this task).
7. After the successful login in step 6, open browser devtools → Application/Storage → Cookies, and confirm a `kiosko_auth` cookie exists with `HttpOnly` and `Secure` flags set, `SameSite=Lax`, and an expiry roughly one year out. Do not paste the cookie's value into your report.

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx
git commit -m "$(cat <<'EOF'
Add styled /login page

Full-screen background photo of the plant (dimmed), login card reusing
the header's light-sweep accent, responsive across mobile/tablet/PC.
Calls POST /api/login; nothing redirects here yet (Task 3 adds the
gate), so this alone doesn't change who can reach the app.
EOF
)"
```

---

### Task 3: `middleware.ts` gate + deploy docs

**Files:**
- Create: `middleware.ts` (repo root, alongside `next.config.js`)
- Modify: `docs/DEPLOY.md`

**Interfaces:**
- Consumes: the `kiosko_auth` cookie contract from Task 1 (name `kiosko_auth`, valid value equals `process.env.AUTH_PASSWORD`).

- [ ] **Step 1: Write the middleware**

Create `middleware.ts` in the repo root (same level as `next.config.js`, `package.json` — NOT inside `app/`):

```ts
import { NextRequest, NextResponse } from "next/server";

const RUTAS_PUBLICAS = ["/login", "/api/login", "/images"];

function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`)
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (esRutaPublica(pathname)) {
    return NextResponse.next();
  }

  const password = process.env.AUTH_PASSWORD;
  const cookie = req.cookies.get("kiosko_auth")?.value;

  if (!password || cookie !== password) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual test — gate behavior**

With `npm run dev` running (restart it after adding `middleware.ts` if it was already running, so Next.js picks up the new file):

1. In a fresh browser profile/incognito window (no cookie yet), visit `http://localhost:3000/`. Confirm you're redirected to `/login`.
2. From the same incognito window, visit `http://localhost:3000/api/estado`. Confirm it returns `401 {"error":"No autenticado"}` instead of the row data.
3. Confirm `http://localhost:3000/login` itself still loads normally (not redirected into a loop) and the background image at `http://localhost:3000/images/planta-global.webp` loads directly in the browser.
4. Log in through the `/login` form with the correct credentials (from `.env.local`, never hardcoded). Confirm you're redirected to `/` and the kiosk table now loads.
5. Refresh `/` a few times and wait through at least one 20-second poll cycle (watch the network tab for `/api/estado` requests): confirm they now return `200` with real data, not `401` — i.e. the cookie is being sent automatically on the app's own polling `fetch` calls without any code change to `app/page.tsx`.
6. Still logged in, mark a row TRA and confirm it works end-to-end (proves the whole stack — login, cookie, gated API — works together for a real user action).

- [ ] **Step 4: Manual test — fail-closed behavior**

Temporarily comment out (or rename) `AUTH_PASSWORD` in `.env.local`, restart `npm run dev`, and confirm that even a request carrying a previously-valid `kiosko_auth` cookie now gets redirected to `/login` (page) / `401` (API) — i.e. missing env var fails closed, not open. Restore `.env.local` to its original content afterward and restart `npm run dev` again before moving on.

- [ ] **Step 5: Update deploy docs**

In `docs/DEPLOY.md`, add a new numbered section after the existing "3. Conectar Upstash Redis" section (renumber the following sections accordingly — the existing "4. Verificar en la nube" becomes "5.", etc.):

```markdown
## 4. Configurar el login

1. En el proyecto de Vercel, ve a Project Settings → Environment Variables
   y agrega `AUTH_USER` (el correo) y `AUTH_PASSWORD` (la clave) — son las
   credenciales compartidas para entrar al kiosko.
2. Ve a Deployments → el último deploy → menú "..." → **Redeploy** (las
   variables de entorno solo se aplican en el próximo build, no en el
   actual).
3. Al abrir la URL del kiosko por primera vez en cada dispositivo, va a
   pedir correo y clave — después de iniciar sesión una vez, ese
   dispositivo queda con sesión iniciada por ~1 año.
```

- [ ] **Step 6: Commit**

```bash
git add middleware.ts docs/DEPLOY.md
git commit -m "$(cat <<'EOF'
Add middleware to gate the whole app behind the login cookie

Pages redirect to /login and API routes return 401 when the
kiosko_auth cookie is missing or invalid, with fail-closed behavior if
AUTH_USER/AUTH_PASSWORD aren't configured. This is what actually
enforces the login added in the previous two tasks.
EOF
)"
```
