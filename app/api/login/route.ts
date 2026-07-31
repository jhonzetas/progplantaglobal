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
