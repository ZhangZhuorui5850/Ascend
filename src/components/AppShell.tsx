"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ViewTransition } from "react";
import { Plus } from "lucide-react";
import { CapturePanel } from "@/components/CapturePanel";
import { MobileNav, Sidebar } from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { TopBar } from "@/components/TopBar";
import type { DeviceAccount } from "@/lib/auth";
import { setActiveOfflineWorkspace } from "@/lib/offline-review";
import type { PluginId } from "@/lib/plugins/registry";
import type { CaptureSubject } from "@/lib/repo/knowledge";
import type { ModulePref } from "@/lib/repo/settings";
import type { CaptureKind } from "@/lib/capture/parser";

type AppShellProps = {
  user: { displayName: string; role: "admin" | "user"; workspaceKey: string | null; account: DeviceAccount; accounts: DeviceAccount[] } | null;
  hierarchy: CaptureSubject[];
  enabledPluginIds?: PluginId[];
  modulePrefs?: ModulePref[];
  children: React.ReactNode;
};

export function AppShell({ user, hierarchy, enabledPluginIds, modulePrefs, children }: AppShellProps) {
  const pathname = usePathname();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureIntent, setCaptureIntent] = useState<CaptureKind | undefined>();
  const [commandOpen, setCommandOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    void setActiveOfflineWorkspace(user?.workspaceKey ?? null).catch((error) => {
      console.warn("离线工作区标记更新失败", error);
    });
  }, [user?.workspaceKey]);

  useEffect(() => {
    function openCapture(event: Event) {
      const requested = (event as CustomEvent<{ intent?: CaptureKind }>).detail?.intent;
      setCaptureIntent(requested);
      setCaptureOpen(true);
    }
    window.addEventListener("zgca:open-capture", openCapture);
    return () => window.removeEventListener("zgca:open-capture", openCapture);
  }, []);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCaptureIntent(undefined);
        setCaptureOpen(true);
      }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  // 顶栏汉堡按钮：手机与手机横屏弹出导航抽屉，桌面宽度切换侧栏折叠。
  function handleMenu() {
    if (window.matchMedia("(max-width: 900px)").matches) {
      setMobileNavOpen((open) => !open);
    } else {
      setSidebarCollapsed((value) => !value);
    }
  }

  if (pathname === "/login" || pathname === "/change-password" || pathname.startsWith("/invite/") || !user) {
    return <>{children}</>;
  }

  return (
    <div className={`appFrame ${sidebarCollapsed ? "sidebarCollapsed" : ""}`}>
      <Sidebar
        account={user.account}
        accounts={user.accounts}
        collapsed={sidebarCollapsed && !mobileNavOpen}
        displayName={user.displayName}
        enabledPluginIds={enabledPluginIds}
        mobileOpen={mobileNavOpen}
        modulePrefs={modulePrefs}
        onNavigate={() => setMobileNavOpen(false)}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        role={user.role}
      />
      {mobileNavOpen ? (
        <button aria-label="关闭导航" className="mobileNavBackdrop" onClick={() => setMobileNavOpen(false)} type="button" />
      ) : null}
      <div className="appWorkspace">
        <TopBar account={user.account} accounts={user.accounts} onCommand={() => setCommandOpen(true)} onMenu={handleMenu} role={user.role} />
        <main className="mainPane">
          <ViewTransition key={pathname} name="ascend-page">
            {children}
          </ViewTransition>
        </main>
      </div>
      {user.role === "user" ? (
        <>
          <CapturePanel
            intent={captureIntent}
            onOpenChange={setCaptureOpen}
            open={captureOpen}
            subjects={hierarchy}
          />
          {!captureOpen ? (
            <button
              className="captureFab"
              onClick={() => {
                setCaptureIntent(undefined);
                setCaptureOpen(true);
              }}
              type="button"
            >
              <Plus size={17} />
              记录
            </button>
          ) : null}
        </>
      ) : null}
      <MobileNav enabledPluginIds={enabledPluginIds} modulePrefs={modulePrefs} onCaptureClick={() => {
        setCaptureIntent(undefined);
        setCaptureOpen(true);
      }} role={user.role} />
      <CommandPalette enabledPluginIds={enabledPluginIds} modulePrefs={modulePrefs} onCapture={() => {
        setCaptureIntent(undefined);
        setCaptureOpen(true);
      }} open={commandOpen} role={user.role} setOpen={setCommandOpen} />
    </div>
  );
}
