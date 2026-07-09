"use client";

import { useSyncExternalStore } from "react";

function subscribe(onTick: () => void) {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
}

// 每秒变化的快照；服务端渲染返回 0，显示占位符避免水合不一致。
function getSecondStamp() {
  return Math.floor(Date.now() / 1000);
}

export function HomeClock() {
  const stamp = useSyncExternalStore(subscribe, getSecondStamp, () => 0);

  let time = "--:--:--";
  let date = "";
  if (stamp) {
    const now = new Date(stamp * 1000);
    time = now.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Shanghai",
    });
    date = now.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
      timeZone: "Asia/Shanghai",
    });
  }

  return (
    <div className="homeClock" aria-live="off">
      <strong suppressHydrationWarning>{time}</strong>
      <span suppressHydrationWarning>{date}</span>
    </div>
  );
}
