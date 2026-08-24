import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Model Council — Compare AI models with confidence",
  description: "Compare multiple AI models and get one transparent, evidence-backed answer.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Model Council",
    description: "Ask once. Decide with confidence.",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "Model Council — Ask once. Decide with confidence." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Model Council",
    description: "Ask once. Decide with confidence.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
