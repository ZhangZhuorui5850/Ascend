"use client";

import { Plus } from "lucide-react";

export function OpenCaptureButton({ label = "记录" }: { label?: string }) {
  return (
    <button
      className="sectionLink asButton"
      onClick={() => window.dispatchEvent(new CustomEvent("zgca:open-capture"))}
      type="button"
    >
      <Plus size={13} />
      {label}
    </button>
  );
}
