import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "edge";

// Producción real del turno/día anterior que se muestra en la tarjeta ámbar
// del encabezado del kiosko.
//
// Fuente principal (automática): la app "reporte-maquinado", que ya recibe
// la hoja REPORTE del Excel de planta. La consultamos de servidor a servidor
// con la clave compartida REPORTE_API_SECRET y cacheamos el resultado unos
// minutos para no golpearla en cada poll de cada tablet.
//
// Fuente de respaldo (manual): el lápiz de la tarjeta escribe en Redis. Solo
// se usa si la automática no está disponible (reporte sin cargar, endpoint
// caído o variables de entorno sin configurar).
const KEY_MANUAL = "kiosko:produccion_turno_anterior";
const KEY_CACHE = "kiosko:produccion_auto_cache";
const CACHE_TTL_OK_S = 600; // 10 min cuando hay dato
const CACHE_TTL_MISS_S = 60; // 1 min cuando no lo hay, para reintentar pronto

type ProduccionAnterior = { unidades: number; fecha: string };
// En caché guardamos también los "sin dato" (como { vacio: true }) para no
// rehacer la cadena completa (redis + fetch entre apps) en cada poll.
type CacheAuto = ProduccionAnterior | { vacio: true };

async function traerAuto(): Promise<ProduccionAnterior | null> {
  const cache = await redis.get<CacheAuto>(KEY_CACHE);
  if (cache) return "vacio" in cache ? null : cache;

  const base = process.env.REPORTE_MAQUINADO_URL;
  const secret = process.env.REPORTE_API_SECRET;
  if (!base || !secret) return null;

  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/api/produccion-dia`, {
      headers: { "X-Api-Key": secret },
      cache: "no-store",
    });
    const data = r.ok
      ? ((await r.json()) as { fecha: string | null; unidades: number | null })
      : null;
    if (!data || !data.fecha || data.unidades == null) {
      await redis.set(KEY_CACHE, { vacio: true }, { ex: CACHE_TTL_MISS_S });
      return null;
    }
    const dato: ProduccionAnterior = {
      fecha: data.fecha,
      unidades: data.unidades,
    };
    await redis.set(KEY_CACHE, dato, { ex: CACHE_TTL_OK_S });
    return dato;
  } catch {
    return null;
  }
}

export async function GET() {
  const [manual, auto] = await Promise.all([
    redis.get<ProduccionAnterior>(KEY_MANUAL),
    traerAuto(),
  ]);
  return NextResponse.json(auto ?? manual ?? null);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { unidades?: unknown; fecha?: unknown };
  const unidades = Number(body.unidades);
  const fecha = typeof body.fecha === "string" ? body.fecha.trim() : "";
  // fecha en formato ISO YYYY-MM-DD (lo que entrega <input type="date">).
  if (
    !Number.isFinite(unidades) ||
    unidades < 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha)
  ) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const dato: ProduccionAnterior = { unidades: Math.round(unidades), fecha };
  await redis.set(KEY_MANUAL, dato);
  return NextResponse.json({ ok: true, dato });
}
