import type { Metadata } from "next";
import { Geist, Noto_Sans_Kannada } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const kannada = Noto_Sans_Kannada({ variable: "--font-kannada", subsets: ["kannada"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Vivarisu AI — Kannada story studio",
  description: "Prompt to fully narrated, emotion-directed Kannada episodes with Gnani Prisma, Timbre and voice cloning.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="kn" className={`${geist.variable} ${kannada.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
