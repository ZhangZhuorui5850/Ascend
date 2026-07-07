"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { CapturePanel } from "@/components/CapturePanel";
import { MobileNav, Sidebar } from "@/components/Sidebar";

export function AppShellBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [captureOpen, setCaptureOpen] = useState(false);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className={`appFrame ${captureOpen ? "captureOpen" : ""}`}>
      <Sidebar />
      <main className="mainPane">{children}</main>
      <button
        aria-label="关闭收纳小窗口"
        className="captureBackdrop"
        onClick={() => setCaptureOpen(false)}
        type="button"
      />
      <CapturePanel onClose={() => setCaptureOpen(false)} />
      <MobileNav onCaptureClick={() => setCaptureOpen(true)} />
    </div>
  );
}
