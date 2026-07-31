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
    <div className="relative isolate h-screen w-screen overflow-hidden bg-panel font-display">
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
