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
