"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, Share, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALL_DISMISSED_AT = "zgca-pwa-install-dismissed-at";
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

export function PwaLifecycle() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  const installDismissedRecently = useCallback(() => {
    const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISSED_AT) || 0);
    return Date.now() - dismissedAt < DISMISS_FOR_MS;
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const syncViewport = () => {
      if (viewport.scale !== 1) {
        root.style.removeProperty("--app-visual-height");
        delete root.dataset.keyboardOpen;
        return;
      }
      root.style.setProperty("--app-visual-height", `${Math.round(viewport.height)}px`);
      const keyboardOpen = window.innerHeight - viewport.height > 120;
      if (keyboardOpen) root.dataset.keyboardOpen = "true";
      else delete root.dataset.keyboardOpen;
    };
    syncViewport();
    viewport.addEventListener("resize", syncViewport);
    viewport.addEventListener("scroll", syncViewport);
    return () => {
      viewport.removeEventListener("resize", syncViewport);
      viewport.removeEventListener("scroll", syncViewport);
      root.style.removeProperty("--app-visual-height");
      delete root.dataset.keyboardOpen;
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null;

    const watchRegistration = (nextRegistration: ServiceWorkerRegistration) => {
      registration = nextRegistration;
      if (nextRegistration.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(nextRegistration.waiting);
      }
      nextRegistration.addEventListener("updatefound", () => {
        const worker = nextRegistration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setWaitingWorker(worker);
        });
      });
    };

    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(watchRegistration)
      .catch(() => undefined);

    const checkForUpdates = () => {
      if (document.visibilityState === "visible") void registration?.update();
    };
    document.addEventListener("visibilitychange", checkForUpdates);
    const interval = window.setInterval(checkForUpdates, 60 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", checkForUpdates);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (isStandalone() || installDismissedRecently()) return;
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const ua = navigator.userAgent;
    const iosSafari = /iP(hone|ad|od)/.test(ua) && /Safari/.test(ua) && !/(CriOS|FxiOS|EdgiOS)/.test(ua);
    const iosHelpTimer = iosSafari ? window.setTimeout(() => setShowIosHelp(true), 0) : null;
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      if (iosHelpTimer !== null) window.clearTimeout(iosHelpTimer);
    };
  }, [installDismissedRecently]);

  function dismissInstall() {
    localStorage.setItem(INSTALL_DISMISSED_AT, String(Date.now()));
    setInstallPrompt(null);
    setShowIosHelp(false);
  }

  async function requestInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
    else dismissInstall();
  }

  function applyUpdate() {
    if (!waitingWorker) return;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  if (waitingWorker) {
    return (
      <aside className="pwaNotice pwaUpdate" role="status">
        <RefreshCw aria-hidden size={18} />
        <div><strong>新版本已准备好</strong><span>保存中的内容不受影响；由你决定何时刷新。</span></div>
        <button className="primaryButton" onClick={applyUpdate} type="button">更新</button>
      </aside>
    );
  }

  if (!installPrompt && !showIosHelp) return null;
  return (
    <aside className="pwaNotice" role="status">
      {showIosHelp ? <Share aria-hidden size={18} /> : <Download aria-hidden size={18} />}
      <div>
        <strong>把登峰放到主屏幕</strong>
        <span>{showIosHelp ? "点 Safari 的分享按钮，再选“添加到主屏幕”。" : "安装后可在独立窗口中使用。"}</span>
      </div>
      {installPrompt ? <button className="primaryButton" onClick={() => void requestInstall()} type="button">安装</button> : null}
      <button aria-label="暂不提示安装" className="pwaNoticeClose" onClick={dismissInstall} type="button"><X size={16} /></button>
    </aside>
  );
}
