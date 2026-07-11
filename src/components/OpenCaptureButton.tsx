"use client";

import { Inbox } from "lucide-react";

export function OpenCaptureButton({ label = "打开收纳" }: { label?: string }) {
  return (
    <button
      className="sectionLink asButton"
      onClick={() => window.dispatchEvent(new CustomEvent("zgca:open-capture"))}
      type="button"
    >
      <Inbox size={13} />
      {label}
    </button>
  );
}
