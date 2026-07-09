import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { getDb } from "@/lib/db";
import { getCaptureHierarchy, type CaptureSubject } from "@/lib/repo/knowledge";
import { optionalSession } from "@/lib/request-auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ZGCA 学习工作台",
  description: "日历驱动的备考学习管理系统",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await optionalSession();
  const hierarchy: CaptureSubject[] = user ? getCaptureHierarchy(getDb()) : [];

  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AppShell user={user ? { displayName: user.displayName } : null} hierarchy={hierarchy}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
