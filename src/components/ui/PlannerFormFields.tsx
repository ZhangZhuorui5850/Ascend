"use client";

import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import styles from "@/styles/planner/primitives.module.css";

export function PlannerField({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return <label className={`${styles.field} ${className ?? ""}`.trim()}><span>{label}</span>{children}</label>;
}

export function PlannerSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${styles.fieldControl} ${props.className ?? ""}`.trim()} />;
}

/**
 * Keeps the native picker and its submitted value while presenting a locale-independent
 * ISO date / 24-hour time value in the Planner surface.
 */
export function PlannerDateTimeField(props: InputHTMLAttributes<HTMLInputElement>) {
  const initial = String(props.value ?? props.defaultValue ?? "");
  const [displayValue, setDisplayValue] = useState(initial);
  const { className, onChange, type, ...inputProps } = props;
  const controlledValue = props.value;
  const visibleValue = controlledValue === undefined ? displayValue : String(controlledValue);

  return (
    <span className={`${styles.dateTimeField} ${className ?? ""}`.trim()}>
      <input
        {...inputProps}
        className={styles.dateTimeInput}
        onChange={(event) => {
          setDisplayValue(event.target.value);
          onChange?.(event);
        }}
        type={type}
      />
      <output aria-hidden="true">{visibleValue || (type === "time" ? "HH:mm" : "YYYY-MM-DD")}</output>
    </span>
  );
}

export function PlannerPropertyRow({ children, label }: { children: ReactNode; label: string }) {
  return <label className={styles.propertyRow}><span>{label}</span><span>{children}</span></label>;
}
