import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { getDb } from "@/lib/db";
import { getCaptureHierarchy, type CaptureSubject } from "@/lib/repo/knowledge";
import { optionalSession } from "@/lib/request-auth";
import "./globals.css";

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
  const hierarchy: CaptureSubject[] = user?.workspaceId
    ? getCaptureHierarchy(getDb(), { workspaceId: user.workspaceId })
    : [];

  return (
    <html lang="zh-CN">
      <body>
        <AppShell user={user ? { displayName: user.displayName, role: user.role } : null} hierarchy={hierarchy}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
