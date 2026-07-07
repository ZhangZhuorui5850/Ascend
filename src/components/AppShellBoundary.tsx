"use client";

import { usePathname } from "next/navigation";
import { CapturePanel } from "@/components/CapturePanel";
import { Sidebar } from "@/components/Sidebar";

export function AppShellBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="appFrame">
      <Sidebar />
      <main className="mainPane">{children}</main>
      <CapturePanel />
    </div>
  );
}
