"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Inbox } from "lucide-react";
import { CapturePanel } from "@/components/CapturePanel";
import { MobileNav, Sidebar } from "@/components/Sidebar";
import type { CaptureSubject } from "@/lib/repo/knowledge";

type AppShellProps = {
  user: { displayName: string } | null;
  hierarchy: CaptureSubject[];
  children: React.ReactNode;
};

export function AppShell({ user, hierarchy, children }: AppShellProps) {
  const pathname = usePathname();
  const [captureOpen, setCaptureOpen] = useState(false);

  if (pathname === "/login" || !user) {
    return <>{children}</>;
  }

  return (
    <div className={`appFrame ${captureOpen ? "captureOpen" : ""}`}>
      <Sidebar displayName={user.displayName} />
      <main className="mainPane">{children}</main>
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
      <MobileNav onCaptureClick={() => setCaptureOpen(true)} />
    </div>
  );
}
