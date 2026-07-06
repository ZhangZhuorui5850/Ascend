import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CapturePanel } from "@/components/CapturePanel";
import { Sidebar } from "@/components/Sidebar";
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
  description: "日历驱动的中关村备考学习管理系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <div className="appFrame">
          <Sidebar />
          <main className="mainPane">{children}</main>
          <CapturePanel />
        </div>
      </body>
    </html>
  );
}
