"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 全站唯一允许 count-up 的数字（NowCard 右列大数字）。
 * SSR 直出终值；水合后仅当入场编排窗口（html[data-intro="play"]）仍开着才回卷播放，
 * 减弱动效（系统偏好或应用内设置）与 0 值一律静态直出。
 */
export function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const played = useRef(false);

  useEffect(() => {
    if (played.current || value <= 0) return;
    played.current = true;
    const root = document.documentElement;
    // 水合晚于编排摘除（低端机）时静默保持终值：降级形态是"更快看到内容"
    if (root.dataset.intro !== "play") return;
    if (root.dataset.motion === "reduce") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const duration = 700;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{display}</>;
}
