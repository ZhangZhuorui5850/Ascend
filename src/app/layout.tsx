import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { FeedbackProvider } from "@/components/FeedbackProvider";
import { getDb } from "@/lib/db";
import { getCaptureHierarchy, type CaptureSubject } from "@/lib/repo/knowledge";
import { optionalSession } from "@/lib/request-auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "登峰 · Ascend 学习工作台",
  description: "日历驱动的学习管理系统：计划、复习、错题与资料，都为当天的学习服务。",
};

const themeScript = `try{const t=localStorage.getItem('zgca-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

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
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <FeedbackProvider>
          <AppShell user={user ? { displayName: user.displayName, role: user.role } : null} hierarchy={hierarchy}>
            {children}
          </AppShell>
        </FeedbackProvider>
      </body>
    </html>
  );
}
