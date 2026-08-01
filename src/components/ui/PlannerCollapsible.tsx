"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown } from "lucide-react";
import styles from "@/styles/planner/primitives.module.css";

export function PlannerCollapsible({
  children,
  defaultOpen = false,
  label,
  summary,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
  label: string;
  summary: string;
}) {
  return (
    <Collapsible.Root className={styles.collapsible} defaultOpen={defaultOpen}>
      <Collapsible.Trigger className={styles.collapsibleTrigger}>
        <span>
          <strong>{label}</strong>
          <small>{summary}</small>
        </span>
        <ChevronDown aria-hidden size={17} />
      </Collapsible.Trigger>
      <Collapsible.Panel className={styles.collapsiblePanel} hiddenUntilFound>
        <div className={styles.collapsibleContent}>{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
