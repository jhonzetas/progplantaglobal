import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "edge";
const KEY = "kiosko:produccion_turno_anterior";

// Producción real del turno/día anterior. Se edita desde la tarjeta ámbar
// del encabezado (icono de lápiz) — no depende del Excel ni de un deploy,
// queda guardado en Redis y lo ven todas las tablets en el siguiente poll.
type ProduccionAnterior = { unidades: number; fecha: string };

export async function GET() {
  const dato = (await redis.get<ProduccionAnterior>(KEY)) || null;
  return NextResponse.json(dato);
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
  await redis.set(KEY, dato);
  return NextResponse.json({ ok: true, dato });
}
