import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { FeedbackProvider } from "@/components/FeedbackProvider";
import { PwaLifecycle } from "@/components/PwaLifecycle";
import { listAccountSummaries, mergeAccountTokens, type DeviceAccount } from "@/lib/auth";
import { SESSION_COOKIE, SESSIONS_COOKIE } from "@/lib/auth-constants";
import { getDb } from "@/lib/db";
import { getCaptureHierarchy, type CaptureSubject } from "@/lib/repo/knowledge";
import { optionalSession } from "@/lib/request-auth";
import { parseSessionsCookieValue } from "@/lib/session-cookies";
import "./globals.css";

export const metadata: Metadata = {
  title: "登峰 · Ascend",
  description: "日历驱动的学习管理系统：计划、复习、错题与资料，都为当天的学习服务。",
  applicationName: "登峰",
  // manifest URL 加版本参数：iOS 会长期缓存 manifest 本体，改图标/名称时递增以强制重取
  manifest: "/manifest.webmanifest?v=2",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "登峰 · Ascend",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2eee3" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1710" },
  ],
};

const themeScript = `try{var d=document.documentElement;const t=localStorage.getItem('zgca-theme');if(t==='light'||t==='dark')d.dataset.theme=t;const s=localStorage.getItem('zgca-skin');if(['aurora','brutal','cloud','terminal'].includes(s))d.dataset.skin=s;
var g=parseInt(localStorage.getItem('zgca-grid'));if(!isNaN(g))d.style.setProperty('--grid-alpha',String(Math.max(0,Math.min(100,g))/100));
var z=localStorage.getItem('zgca-zoom');if(['0.9','1.1','1.25'].includes(z))d.style.setProperty('--ui-zoom',z);
var lh=localStorage.getItem('zgca-lh');if(lh==='compact'||lh==='loose')d.dataset.lh=lh;
if(localStorage.getItem('zgca-font')==='serif')d.dataset.uiFont='serif';
if(localStorage.getItem('zgca-motion')==='reduce')d.dataset.motion='reduce';
if(localStorage.getItem('zgca-contrast')==='high')d.dataset.contrast='high'}catch(e){}`;

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
          <PwaLifecycle />
        </FeedbackProvider>
      </body>
    </html>
  );
}
