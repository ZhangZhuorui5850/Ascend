"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Toast } from "@base-ui/react/toast";
import { AlertTriangle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  PlannerToastViewport,
  type PlannerToastData,
  type PlannerToastKind,
} from "@/components/ui/PlannerToast";
import styles from "@/styles/planner/primitives.module.css";

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
};

type NotifyOptions = {
  undo?: () => void;
  actionLabel?: string;
};

type FeedbackContextValue = {
  notify: (
    message: string,
    kind?: PlannerToastKind,
    options?: NotifyOptions,
  ) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider limit={4} timeout={3600}>
      <FeedbackBridge>{children}</FeedbackBridge>
    </Toast.Provider>
  );
}

function FeedbackBridge({ children }: { children: React.ReactNode }) {
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const toastManager = Toast.useToastManager<PlannerToastData>();

  const notify = useCallback((
    message: string,
    kind: PlannerToastKind = "success",
    options?: NotifyOptions,
  ) => {
    toastManager.add({
      data: {
        actionLabel: options?.actionLabel,
        kind,
        undo: options?.undo,
      },
      description: message,
      priority: kind === "error" || kind === "conflict" ? "high" : "low",
      type: kind,
    });
  }, [toastManager]);

  const confirm = useCallback((options: ConfirmOptions) => {
    setDialog(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const resolveDialog = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setDialog(null);
  }, []);

  const value = useMemo(() => ({ confirm, notify }), [confirm, notify]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <PlannerToastViewport />
      <Dialog.Root
        onOpenChange={(open) => {
          if (!open) resolveDialog(false);
        }}
        open={Boolean(dialog)}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.dialogBackdrop} />
          <Dialog.Viewport className={styles.dialogViewport}>
            <Dialog.Popup className={styles.dialogPopup} finalFocus initialFocus>
              {dialog ? (
                <>
                  <div className={styles.dialogHeader}>
                    <span className={styles.dialogIcon} data-danger={Boolean(dialog.danger)}>
                      <AlertTriangle aria-hidden size={20} />
                    </span>
                    <div>
                      <Dialog.Title className={styles.overlayTitle}>
                        {dialog.title}
                      </Dialog.Title>
                      <Dialog.Description className={styles.overlayDescription}>
                        {dialog.description}
                      </Dialog.Description>
                    </div>
                  </div>
                  <footer className={styles.dialogActions}>
                    <button
                      className="secondaryButton"
                      onClick={() => resolveDialog(false)}
                      type="button"
                    >
                      取消
                    </button>
                    <button
                      className={dialog.danger ? "dangerButton" : "primaryButton"}
                      onClick={() => resolveDialog(true)}
                      type="button"
                    >
                      {dialog.confirmLabel || "确认"}
                    </button>
                  </footer>
                </>
              ) : null}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback must be used inside FeedbackProvider");
  return value;
}
