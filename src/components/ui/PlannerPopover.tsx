"use client";

import { Popover } from "@base-ui/react/popover";
import { X } from "lucide-react";
import type { ReactElement } from "react";
import styles from "@/styles/planner/primitives.module.css";

export function PlannerPopover({
  children,
  description,
  onOpenChange,
  open,
  title,
  trigger,
}: {
  children: React.ReactNode;
  description: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  title: string;
  trigger: ReactElement;
}) {
  return (
    <Popover.Root onOpenChange={onOpenChange} open={open}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner align="start" className={styles.popoverPositioner} sideOffset={8}>
          <Popover.Popup className={styles.popoverPopup} finalFocus>
            <header className={styles.popoverHeader}>
              <div>
                <Popover.Title className={styles.overlayTitle}>{title}</Popover.Title>
                <Popover.Description className={styles.overlayDescription}>
                  {description}
                </Popover.Description>
              </div>
              <Popover.Close aria-label={`关闭${title}`} className={styles.iconButton}>
                <X size={16} />
              </Popover.Close>
            </header>
            <div className={styles.popoverContent}>{children}</div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
