import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const data = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-data",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Programa de Maquinado",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${display.variable} ${data.variable}`}>
      <body>{children}</body>
    </html>
  );
}
