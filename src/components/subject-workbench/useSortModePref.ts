"use client";

import { useEffect, useState } from "react";
import type { PointSortMode } from "@/components/point-sort";

/** 知识点排序方式偏好：按科目落 localStorage，进入页面后异步恢复 */
export function useSortModePref(subjectCode: string) {
  const [sortMode, setSortMode] = useState<PointSortMode>("manual");

  useEffect(() => {
    const saved = localStorage.getItem(`zgca-point-sort:${subjectCode}`);
    window.setTimeout(() => {
      if (saved === "manual" || saved === "time" || saved === "importance") setSortMode(saved);
    }, 0);
  }, [subjectCode]);

  function changeSortMode(mode: PointSortMode) {
    setSortMode(mode);
    localStorage.setItem(`zgca-point-sort:${subjectCode}`, mode);
  }

  return { sortMode, changeSortMode };
}
