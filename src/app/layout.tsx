import type { Metadata, Viewport } from "next";
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans_Condensed,
  IBM_Plex_Sans_Devanagari,
} from "next/font/google";
import "./globals.css";

/*
 * IBM Plex is the only widely available family with a Devanagari that shares metrics
 * with its Latin, which matters because every screen here carries both scripts. The
 * condensed cut does display work (it has the compressed, official look of a printed
 * form heading) and the mono carries every figure, so columns of rupees line up.
 */
const display = IBM_Plex_Sans_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-plex-condensed",
});

const body = IBM_Plex_Sans_Devanagari({
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-devanagari",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "UNNATI — Kam Nuksan, Zyada Munafa",
  description:
    "Find the mandi that pays you most after transport and spoilage, and share a truck to get there.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#edeae0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="hi">
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
