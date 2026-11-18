// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

import "./globals.css";
import "katex/dist/katex.min.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CRS Learning",
  description: "Trading, finanzas y herramientas de negocio en un solo lugar.",
  applicationName: "CRS",
  manifest: "/app/manifest.webmanifest",
  appleWebApp: { capable: true, title: "CRS", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/trading-app/favicon.svg", sizes: "any", type: "image/svg+xml" }],
    apple: [{ url: "/trading-app/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}

        <Toaster
          position="bottom-right"
          richColors
          closeButton
        />
      </body>
    </html>
  );
}