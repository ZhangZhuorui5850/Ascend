"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { CapturePanel } from "@/components/CapturePanel";
import { MobileNav, Sidebar } from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { TopBar } from "@/components/TopBar";
import type { DeviceAccount } from "@/lib/auth";
import type { CaptureSubject } from "@/lib/repo/knowledge";

type AppShellProps = {
  user: { displayName: string; role: "admin" | "user"; account: DeviceAccount; accounts: DeviceAccount[] } | null;
  hierarchy: CaptureSubject[];
  children: React.ReactNode;
};

export function AppShell({ user, hierarchy, children }: AppShellProps) {
  const pathname = usePathname();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    function openCapture() {
      setCaptureOpen(true);
    }
    window.addEventListener("zgca:open-capture", openCapture);
    return () => window.removeEventListener("zgca:open-capture", openCapture);
  }, []);

  if (pathname === "/login" || pathname === "/change-password" || pathname.startsWith("/invite/") || !user) {
    return <>{children}</>;
  }

  return (
    <div className={`appFrame ${captureOpen ? "captureOpen" : ""} ${sidebarCollapsed ? "sidebarCollapsed" : ""}`}>
      <Sidebar account={user.account} collapsed={sidebarCollapsed} displayName={user.displayName} onToggle={() => setSidebarCollapsed((value) => !value)} role={user.role} />
      <div className="appWorkspace">
        <TopBar account={user.account} accounts={user.accounts} onCommand={() => setCommandOpen(true)} onMenu={() => setCommandOpen(true)} role={user.role} />
        <main className="mainPane">{children}</main>
      </div>
      {user.role === "user" ? (
        <>
          <button
            aria-label="关闭收纳面板"
            aria-hidden={!captureOpen}
            className="captureBackdrop"
            data-testid="capture-backdrop"
            onClick={() => setCaptureOpen(false)}
            tabIndex={captureOpen ? 0 : -1}
            type="button"
          />
          <CapturePanel subjects={hierarchy} onClose={() => setCaptureOpen(false)} />
          {!captureOpen ? (
            <button className="captureFab" onClick={() => setCaptureOpen(true)} type="button">
              <Inbox size={17} />
              收纳
            </button>
          ) : null}
        </>
      ) : null}
      <MobileNav onCaptureClick={() => setCaptureOpen(true)} role={user.role} />
      <CommandPalette onCapture={() => setCaptureOpen(true)} open={commandOpen} role={user.role} setOpen={setCommandOpen} />
    </div>
  );
}
