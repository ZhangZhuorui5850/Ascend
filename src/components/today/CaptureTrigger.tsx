"use client";

export function CaptureTrigger({
  children,
  className,
  intent,
}: {
  children: React.ReactNode;
  className?: string;
  intent?: "task" | "study" | "mistake" | "note" | "asset";
}) {
  return (
    <button
      className={className}
      onClick={() => window.dispatchEvent(new CustomEvent("zgca:open-capture", {
        detail: intent ? { intent } : undefined,
      }))}
      type="button"
    >
      {children}
    </button>
  );
}
