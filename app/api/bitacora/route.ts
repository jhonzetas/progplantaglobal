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

export async function DELETE(req: NextRequest) {
  const body = (await req.json()) as { id?: string };
  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const entradas =
    (await redis.lrange<EntradaBitacora>(LISTA_KEY, 0, -1)) || [];
  const entrada = entradas.find((e) => e.id === id);
  if (!entrada) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }
  await redis.lrem(LISTA_KEY, 0, JSON.stringify(entrada));
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    id?: string;
    texto?: string;
    autor?: string;
  };
  const { id } = body;
  const texto = (body.texto ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  if (!texto) {
    return NextResponse.json(
      { error: "El texto no puede estar vacío" },
      { status: 400 }
    );
  }
  const entradas =
    (await redis.lrange<EntradaBitacora>(LISTA_KEY, 0, -1)) || [];
  const indice = entradas.findIndex((e) => e.id === id);
  if (indice === -1) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }
  const autor =
    body.autor !== undefined
      ? body.autor.trim() || null
      : entradas[indice].autor;
  const entradaActualizada: EntradaBitacora = {
    ...entradas[indice],
    texto,
    autor,
  };
  await redis.lset(LISTA_KEY, indice, entradaActualizada);
  return NextResponse.json({ ok: true, entrada: entradaActualizada });
}
