"use client";

import { useState } from "react";

/** 新建章节/知识点的临时输入卡片：Enter 提交，Esc/失焦取消 */
export function MapAddCard({ parentKey, placeholder, onSubmit, onCancel }: {
  parentKey: string;
  placeholder: string;
  onSubmit: (title: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function submit(input: HTMLInputElement) {
    const title = input.value.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      await onSubmit(title);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mapNode">
      <div className="mapCard mapAddCard" data-map-node={`add:${parentKey}`} data-map-parent={parentKey}>
        <input
          aria-label={placeholder}
          autoFocus
          disabled={busy}
          onBlur={(event) => {
            if (!event.target.value.trim()) onCancel();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit(event.currentTarget);
            if (event.key === "Escape") onCancel();
          }}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
