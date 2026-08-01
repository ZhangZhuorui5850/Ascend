"use client";

import { Drawer } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import type { RefObject } from "react";
import styles from "@/styles/planner/primitives.module.css";

export type PlannerDrawerSurface = "drawer" | "sheet";

export function PlannerDrawer({
  children,
  description,
  initialFocus,
  onOpenChange,
  open,
  surface,
  title,
  triggerRef,
}: {
  children: React.ReactNode;
  description: string;
  initialFocus?: RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  surface: PlannerDrawerSurface;
  title: string;
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const sheet = surface === "sheet";
  const snapPoints: Drawer.Root.SnapPoint[] | undefined = sheet ? [0.42, 0.92] : undefined;
  const portal = (
    <Drawer.Portal>
      <Drawer.Backdrop className={styles.backdrop} data-planner-backdrop />
      <Drawer.Viewport className={styles.drawerViewport}>
        <Drawer.Popup
          className={styles.drawerPopup}
          data-planner-surface={surface}
          finalFocus={triggerRef ?? true}
          initialFocus={initialFocus ?? true}
        >
          {sheet ? (
            <div aria-hidden className={styles.sheetDragArea}>
              <span className={styles.sheetHandle} />
            </div>
          ) : null}
          <header className={styles.drawerHeader}>
            <div>
              <Drawer.Title className={styles.overlayTitle}>{title}</Drawer.Title>
              <Drawer.Description className={styles.overlayDescription}>
                {description}
              </Drawer.Description>
            </div>
            <Drawer.Close aria-label={`关闭${title}`} className={styles.iconButton}>
              <X size={18} />
            </Drawer.Close>
          </header>
          <Drawer.Content className={styles.drawerContent}>
            {children}
          </Drawer.Content>
        </Drawer.Popup>
      </Drawer.Viewport>
    </Drawer.Portal>
  );

  return (
    <Drawer.Root
      defaultSnapPoint={sheet ? snapPoints?.[0] : undefined}
      onOpenChange={onOpenChange}
      open={open}
      snapPoints={snapPoints}
      snapToSequentialPoints
      swipeDirection={sheet ? "down" : "right"}
    >
      {sheet ? (
        <Drawer.VirtualKeyboardProvider>{portal}</Drawer.VirtualKeyboardProvider>
      ) : portal}
    </Drawer.Root>
  );
}
