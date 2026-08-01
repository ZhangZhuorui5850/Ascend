"use client";

import styles from "@/styles/planner/primitives.module.css";

export type PlannerSegment<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

export function PlannerSegmentedControl<T extends string>({
  ariaLabel,
  items,
  onChange,
  value,
}: {
  ariaLabel: string;
  items: Array<PlannerSegment<T>>;
  onChange: (value: T) => void;
  value: T;
}) {
  return (
    <div aria-label={ariaLabel} className={styles.segmentedControl} role="tablist">
      {items.map((item) => (
        <button
          aria-selected={value === item.id}
          className={value === item.id ? styles.segmentActive : undefined}
          key={item.id}
          onClick={() => onChange(item.id)}
          role="tab"
          tabIndex={value === item.id ? 0 : -1}
          type="button"
        >
          <span>{item.label}</span>
          {item.count === undefined ? null : <small>{item.count}</small>}
        </button>
      ))}
    </div>
  );
}
