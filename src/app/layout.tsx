import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mewgenics · Родословная — анализ .sav сохранений",
  description:
    "Приложение для анализа файлов сохранений Mewgenics (.sav): просмотр всех котов, родителей и потомков выбранного кота, коэффициенты инбридинга.",
  keywords: ["Mewgenics", "родословная", "сохранение", "sav", "коты", "семейное дерево"],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Mewgenics · Родословная",
    description: "Анализ .sav сохранений Mewgenics: коты, родители, потомки, инбридинг",
    siteName: "Mewgenics Pedigree",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
