"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };
type ConfirmOptions = { title: string; description: string; confirmLabel?: string; danger?: boolean };
type FeedbackContextValue = {
  notify: (message: string, kind?: ToastKind) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const id = useRef(0);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);

  const notify = useCallback((message: string, kind: ToastKind = "success") => {
    const toast = { id: ++id.current, kind, message };
    setToasts((current) => [...current.slice(-3), toast]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 3600);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setDialog(options);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  function resolveDialog(value: boolean) {
    resolver.current?.(value);
    resolver.current = null;
    setDialog(null);
  }

  const value = useMemo(() => ({ notify, confirm }), [confirm, notify]);
  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="toastViewport">
        {toasts.map((toast) => {
          const Icon = toast.kind === "success" ? CheckCircle2 : toast.kind === "error" ? XCircle : Info;
          return <div className={`toast toast-${toast.kind}`} key={toast.id} role="status"><Icon size={17} /><span>{toast.message}</span><button aria-label="关闭提示" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} type="button"><X size={14} /></button></div>;
        })}
      </div>
      {dialog ? (
        <div className="dialogBackdrop" onMouseDown={() => resolveDialog(false)} role="presentation">
          <section aria-labelledby="confirm-title" aria-modal="true" className="confirmDialog" onMouseDown={(event) => event.stopPropagation()} role="alertdialog">
            <span className={dialog.danger ? "dialogIcon danger" : "dialogIcon"}><AlertTriangle size={20} /></span>
            <div><h2 id="confirm-title">{dialog.title}</h2><p>{dialog.description}</p></div>
            <footer><button className="secondaryButton" onClick={() => resolveDialog(false)} type="button">取消</button><button className={dialog.danger ? "dangerButton" : "primaryButton"} onClick={() => resolveDialog(true)} type="button">{dialog.confirmLabel || "确认"}</button></footer>
          </section>
        </div>
      ) : null}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback must be used inside FeedbackProvider");
  return value;
}
