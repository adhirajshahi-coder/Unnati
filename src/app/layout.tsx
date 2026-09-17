import type { Metadata, Viewport } from "next";
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans_Condensed,
  IBM_Plex_Sans_Devanagari,
} from "next/font/google";
import "./globals.css";
import { currentUser } from "@/lib/auth";
import { isRtl, type Lang } from "@/lib/i18n";

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

/**
 * The document's own language, taken from the signed-in user.
 *
 * Worth a query on every request because two things read it and neither is decorative:
 * a screen reader picks its voice from `lang`, and `dir` is what puts Urdu the right
 * way round. Setting it to a fixed "hi" would have a screen reader pronounce Tamil with
 * a Hindi voice — which is roughly the experience this whole feature exists to end.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser().catch(() => null);
  const lang: Lang = user?.language ?? "hi";

  return (
    <html lang={lang} dir={isRtl(lang) ? "rtl" : "ltr"}>
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
