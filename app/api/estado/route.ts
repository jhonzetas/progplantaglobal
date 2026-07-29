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
