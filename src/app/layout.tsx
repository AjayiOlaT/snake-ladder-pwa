import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./Providers";
import GlobalAudioController from "../components/GlobalMusicController";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Neon Arena: Snake & Ladder",
  description: "A real-time multiplayer neon snake and ladder battle arena.",
  manifest: "/manifest.json",
  themeColor: "#6366f1",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Neon Arena",
  },
  icons: {
    apple: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${inter.className} bg-slate-950 text-white min-h-screen antialiased`}>
        <Providers>
          <GlobalAudioController />
          {children}
        </Providers>
      </body>
    </html>
  );
}
