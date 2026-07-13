"use client";

import { useState, useSyncExternalStore } from "react";
import { CheckCircle2, Download, Share } from "lucide-react";
import {
  getInstallSnapshot,
  getServerInstallSnapshot,
  requestInstall,
  subscribeInstall,
} from "@/lib/pwa-install";

export function InstallAppSection() {
  const state = useSyncExternalStore(subscribeInstall, getInstallSnapshot, getServerInstallSnapshot);
  const [message, setMessage] = useState("");

  async function install() {
    setMessage("");
    try {
      const outcome = await requestInstall();
      if (outcome === "dismissed") setMessage("已取消。想装的时候随时回来点这里。");
      if (outcome === "unavailable") setMessage("当前浏览器暂未就绪，稍后再试或刷新页面。");
    } catch {
      setMessage("安装未能启动，请稍后再试。");
    }
  }

  if (state.installed) {
    return (
      <div className="card installCard">
        <CheckCircle2 aria-hidden size={18} />
        <div>
          <strong>已安装到此设备</strong>
          <p>登峰正以独立应用窗口运行。</p>
        </div>
      </div>
    );
  }

  if (state.ios) {
    return (
      <div className="card installCard">
        <Share aria-hidden size={18} />
        <div>
          <strong>添加到主屏幕</strong>
          <p>在 Safari 里点分享按钮，选择「添加到主屏幕」，即可像 App 一样使用。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card installCard">
      <Download aria-hidden size={18} />
      <div>
        <strong>安装到此设备</strong>
        <p>安装后可在独立窗口使用，支持离线打开。</p>
        {!state.supported && !state.canPrompt ? <p className="installHint">此浏览器不支持一键安装，可尝试 Chrome/Edge。</p> : null}
        {message ? <p className="installHint">{message}</p> : null}
      </div>
      <button className="primaryButton" disabled={!state.canPrompt} onClick={() => void install()} type="button">
        安装
      </button>
    </div>
  );
}
