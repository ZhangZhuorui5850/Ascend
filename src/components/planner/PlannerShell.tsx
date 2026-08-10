import Link from "next/link";
import { CalendarDays, ListChecks } from "lucide-react";
import styles from "@/styles/planner/shell.module.css";

export function PlannerShell({
  active,
  children,
  description,
  title,
}: {
  active: "tasks" | "calendar";
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className={styles.shell} data-planner-shell>
      <header className={styles.header}>
        <div>
          <p>PLANNER</p>
          <h1>计划</h1>
        </div>
        <nav aria-label="计划视图" className={styles.views}>
          <Link aria-current={active === "tasks" ? "page" : undefined} href="/tasks">
            <ListChecks aria-hidden size={17} />
            任务
          </Link>
          <Link aria-current={active === "calendar" ? "page" : undefined} href="/calendar">
            <CalendarDays aria-hidden size={17} />
            日历
          </Link>
        </nav>
      </header>
      <div className={styles.context}>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
