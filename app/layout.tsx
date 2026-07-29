import type { Metadata } from "next";
import { Geist, Geist_Mono, Fredoka } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Font dei titoli per il restyling "Neon Arcade" (2026-07-29) — rotondo e chiuso, in linea con
// la forma pillola/molto arrotondata scelta per bottoni, badge e card. Il corpo del testo resta
// su Geist per leggibilità nelle liste/tabelle più dense (candidature, pagamenti, ecc.).
const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "BlinkJob — Il lavoro temporaneo, in tempo reale",
  description:
    "BlinkJob collega aziende e lavoratori temporanei tramite geolocalizzazione, disponibilità e matching spiegabile.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
