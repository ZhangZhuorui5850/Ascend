"use client";

import { useSyncExternalStore } from "react";

/** 与 globals.css 中隐藏 .driveDetails 的断点保持一致 */
const NARROW_QUERY = "(max-width: 1080px)";

function subscribeNarrow(callback: () => void) {
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function readNarrow() {
  return window.matchMedia(NARROW_QUERY).matches;
}

/** 窄屏（详情侧栏被 CSS 隐藏的宽度）检测；SSR 一律按宽屏渲染。 */
export function useNarrowScreen(): boolean {
  return useSyncExternalStore(subscribeNarrow, readNarrow, () => false);
}
