"use client";

import { useTransition } from "react";
import { Laptop, LogOut, MonitorSmartphone, Smartphone } from "lucide-react";
import { revokeDeviceSessionAction } from "@/app/actions/settings";
import { useFeedback } from "@/components/FeedbackProvider";
import type { UserSession } from "@/lib/auth";

export function DeviceSessions({ sessions }: { sessions: UserSession[] }) {
  const [pending, startTransition] = useTransition();
  const { confirm, notify } = useFeedback();

  function revoke(session: UserSession) {
    void confirm({ title: "退出这台设备？", description: "该设备的登录状态会立即失效，需要重新输入密码。", confirmLabel: "退出设备", danger: true }).then((accepted) => {
      if (!accepted) return;
      startTransition(async () => {
        const result = await revokeDeviceSessionAction(session.id);
        notify(result.ok ? "设备已退出" : result.error || "退出失败", result.ok ? "success" : "error");
      });
    });
  }

  return (
    <section className="card deviceSessions" aria-label="登录设备">
      <div className="sectionTitle"><div><span className="sectionKicker">SECURITY</span><h2>登录设备</h2></div><span className="sectionHint">{sessions.length} 个有效会话</span></div>
      <div className="deviceList">
        {sessions.map((session) => {
          const Icon = deviceIcon(session.userAgent);
          return <article className="deviceRow" key={session.id}><span className="deviceIcon"><Icon size={18} /></span><div><strong>{deviceName(session.userAgent)}</strong><small>{session.ipHint || "未知网络"} · 最近活动 {formatTime(session.lastSeenAt)}</small></div><button aria-label={`退出 ${deviceName(session.userAgent)}`} className="secondaryButton" disabled={pending} onClick={() => revoke(session)} type="button"><LogOut size={14} />退出</button></article>;
        })}
        {!sessions.length ? <p className="empty">没有有效的设备会话。</p> : null}
      </div>
    </section>
  );
}

function deviceIcon(agent: string) {
  if (/iphone|android|mobile/i.test(agent)) return Smartphone;
  if (/macintosh|windows|linux/i.test(agent)) return Laptop;
  return MonitorSmartphone;
}

function deviceName(agent: string): string {
  if (/iphone/i.test(agent)) return "iPhone";
  if (/ipad/i.test(agent)) return "iPad";
  if (/android/i.test(agent)) return "Android 设备";
  if (/macintosh/i.test(agent)) return "Mac";
  if (/windows/i.test(agent)) return "Windows 设备";
  return agent ? "浏览器会话" : "未知设备";
}

function formatTime(value: string): string {
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
