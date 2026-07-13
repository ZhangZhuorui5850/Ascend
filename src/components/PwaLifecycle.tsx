"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import "@/lib/pwa-install";

export function PwaLifecycle() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

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

  if (!waitingWorker) return null;
  return (
    <aside className="pwaNotice pwaUpdate" role="status">
      <RefreshCw aria-hidden size={18} />
      <div><strong>新版本已准备好</strong><span>保存中的内容不受影响；由你决定何时刷新。</span></div>
      <button className="primaryButton" onClick={applyUpdate} type="button">更新</button>
    </aside>
  );
}
