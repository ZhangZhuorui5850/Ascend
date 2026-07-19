"use client";

import { useState } from "react";

/** 详情选中（单个）与批量勾选（多个）两套互不干扰的选中态。 */
export function useExplorerSelection() {
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  function toggleSelected(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return { selectedFileId, setSelectedFileId, selectedIds, setSelectedIds, toggleSelected };
}
