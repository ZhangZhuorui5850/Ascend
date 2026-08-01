"use client";

import Link from "next/link";
import { Inbox, ListChecks, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { PlannerLabel, TaskList } from "@/lib/planner/types";
import type { PlannerTaskView } from "@/lib/repo/planner-tasks";
import styles from "@/styles/planner/tasks.module.css";

export const PLANNER_SMART_VIEWS: Array<{ id: PlannerTaskView; label: string }> = [
  { id: "inbox", label: "收集箱" },
  { id: "today", label: "今天" },
  { id: "upcoming", label: "近期" },
  { id: "anytime", label: "随时" },
  { id: "overdue", label: "逾期" },
  { id: "waiting", label: "等待" },
  { id: "completed", label: "已完成" },
  { id: "trash", label: "回收站" },
];

export function PlannerMobileNavigation({ view }: { view: PlannerTaskView }) {
  return (
    <nav aria-label="任务智能视图" className={styles.mobileNav}>
      {PLANNER_SMART_VIEWS.map((item) => (
        <Link data-active={view === item.id} href={`/tasks?view=${item.id}`} key={item.id}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function PlannerSidebar({
  labels,
  lists,
  newLabelName,
  newListName,
  onCreateLabel,
  onCreateList,
  onLabelNameChange,
  onListNameChange,
  view,
}: {
  labels: PlannerLabel[];
  lists: TaskList[];
  newLabelName: string;
  newListName: string;
  onCreateLabel: (event: FormEvent<HTMLFormElement>) => void;
  onCreateList: (event: FormEvent<HTMLFormElement>) => void;
  onLabelNameChange: (value: string) => void;
  onListNameChange: (value: string) => void;
  view: PlannerTaskView;
}) {
  const [creating, setCreating] = useState<"list" | "label" | null>(null);
  return (
    <aside aria-label="任务视图与清单" className={styles.sidebar}>
      <nav className={styles.smartViews}>
        {PLANNER_SMART_VIEWS.map((item) => (
          <Link data-active={view === item.id} href={`/tasks?view=${item.id}`} key={item.id}>
            {item.id === "inbox" ? <Inbox size={16} /> : <ListChecks size={16} />}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <section className={styles.sidebarSection}>
        <strong className={styles.sectionLabel}>清单</strong>
        {lists.map((list) => (
          <Link className={styles.listLink} href={`/tasks?view=all&list=${encodeURIComponent(list.id)}`} key={list.id}>
            <span className={styles.colorDot} data-color={list.color_token} />
            {list.name}
          </Link>
        ))}
        {creating === "list" ? <form className={styles.inlineCreate} onSubmit={onCreateList}>
          <input
            aria-label="新清单名称"
            onChange={(event) => onListNameChange(event.target.value)}
            placeholder="新建清单"
            value={newListName}
          />
          <button aria-label="创建清单" type="submit"><Plus size={15} /></button>
        </form> : <button className={styles.createTrigger} onClick={() => setCreating("list")} type="button"><Plus size={15} />新建清单</button>}
      </section>
      <section className={styles.sidebarSection}>
        <strong className={styles.sectionLabel}>标签</strong>
        <div className={styles.labels}>
          {labels.map((label) => <span className={styles.label} key={label.id}>#{label.name}</span>)}
        </div>
        {creating === "label" ? <form className={styles.inlineCreate} onSubmit={onCreateLabel}>
          <input
            aria-label="新标签名称"
            onChange={(event) => onLabelNameChange(event.target.value)}
            placeholder="新建标签"
            value={newLabelName}
          />
          <button aria-label="创建标签" type="submit"><Plus size={15} /></button>
        </form> : <button className={styles.createTrigger} onClick={() => setCreating("label")} type="button"><Plus size={15} />新建标签</button>}
      </section>
    </aside>
  );
}
