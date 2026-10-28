import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/toaster";
import { A11Y_BOOT } from "@/lib/a11y";
import { getLang } from "@/lib/lang";

// Noto Sans pairs with Noto Sans Devanagari, so English and Hindi share one look.
const notoSans = Noto_Sans({ variable: "--font-noto-sans", subsets: ["latin"] });
const notoDeva = Noto_Sans_Devanagari({ variable: "--font-noto-deva", subsets: ["devanagari"], weight: ["400", "500", "600", "700"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "FDR Intelligence Hub", template: "%s · FDR Intelligence Hub" },
  description: "Verification-first portal for AICTE security deposits and FDRs (SIH26265).",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = await getLang();
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: A11Y_BOOT }} />
      </head>
      <body className={`${notoSans.variable} ${notoDeva.variable} ${geistMono.variable} min-h-screen font-sans antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
