import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "edge";

// Producción real del turno/día anterior que se muestra en la tarjeta ámbar
// del encabezado del kiosko. Única fuente: la app "reporte-maquinado", que
// ya recibe la hoja REPORTE del Excel de planta. No se edita desde el kiosko.
//
// La consultamos de servidor a servidor con la clave compartida
// REPORTE_API_SECRET y cacheamos el resultado unos minutos para no golpearla
// en cada poll de cada tablet.
const KEY_CACHE = "kiosko:produccion_auto_cache";
const CACHE_TTL_OK_S = 600; // 10 min cuando hay dato
const CACHE_TTL_MISS_S = 60; // 1 min cuando no lo hay, para reintentar pronto

type ProduccionAnterior = {
  unidades: number;
  fecha: string;
  montajes: number | null;
};
// En caché guardamos también los "sin dato" (como { vacio: true }) para no
// rehacer la cadena completa (redis + fetch entre apps) en cada poll.
type CacheAuto = ProduccionAnterior | { vacio: true };

export async function GET() {
  const cache = await redis.get<CacheAuto>(KEY_CACHE);
  if (cache) {
    return NextResponse.json("vacio" in cache ? null : cache);
  }

  const base = process.env.REPORTE_MAQUINADO_URL;
  const secret = process.env.REPORTE_API_SECRET;
  if (!base || !secret) return NextResponse.json(null);

  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/api/produccion-dia`, {
      headers: { "X-Api-Key": secret },
      cache: "no-store",
    });
    const data = r.ok
      ? ((await r.json()) as {
          fecha: string | null;
          unidades: number | null;
          montajes?: number | null;
        })
      : null;
    if (!data || !data.fecha || data.unidades == null) {
      await redis.set(KEY_CACHE, { vacio: true }, { ex: CACHE_TTL_MISS_S });
      return NextResponse.json(null);
    }
    const dato: ProduccionAnterior = {
      fecha: data.fecha,
      unidades: data.unidades,
      montajes: data.montajes ?? null,
    };
    await redis.set(KEY_CACHE, dato, { ex: CACHE_TTL_OK_S });
    return NextResponse.json(dato);
  } catch {
    return NextResponse.json(null);
  }
}
