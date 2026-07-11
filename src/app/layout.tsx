import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { FeedbackProvider } from "@/components/FeedbackProvider";
import { listAccountSummaries, mergeAccountTokens, type DeviceAccount } from "@/lib/auth";
import { SESSION_COOKIE, SESSIONS_COOKIE } from "@/lib/auth-constants";
import { getDb } from "@/lib/db";
import { getCaptureHierarchy, type CaptureSubject } from "@/lib/repo/knowledge";
import { optionalSession } from "@/lib/request-auth";
import { parseSessionsCookieValue } from "@/lib/session-cookies";
import "./globals.css";

export const metadata: Metadata = {
  title: "登峰 · Ascend 学习工作台",
  description: "日历驱动的学习管理系统：计划、复习、错题与资料，都为当天的学习服务。",
};

const themeScript = `try{const t=localStorage.getItem('zgca-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;const s=localStorage.getItem('zgca-skin');if(['aurora','brutal','cloud','terminal'].includes(s))document.documentElement.dataset.skin=s}catch(e){}`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await optionalSession();
  const hierarchy: CaptureSubject[] = user?.workspaceId
    ? getCaptureHierarchy(getDb(), { workspaceId: user.workspaceId })
    : [];

  // 本设备已登录账号列表（活跃账号排最前），驱动右上角账户菜单的免密快速切换
  let accounts: DeviceAccount[] = [];
  if (user) {
    const cookieStore = await cookies();
    const tokens = mergeAccountTokens(
      cookieStore.get(SESSION_COOKIE)?.value,
      parseSessionsCookieValue(cookieStore.get(SESSIONS_COOKIE)?.value),
    );
    accounts = listAccountSummaries(tokens);
  }
  const account = accounts.find((item) => item.userId === user?.userId);

  return (
    <html lang="zh-CN">
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <FeedbackProvider>
          <AppShell
            user={
              user && account
                ? { displayName: user.displayName, role: user.role, account, accounts }
                : null
            }
            hierarchy={hierarchy}
          >
            {children}
          </AppShell>
        </FeedbackProvider>
      </body>
    </html>
  );
}
