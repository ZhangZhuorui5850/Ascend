"use client";

import { Inbox, ListChecks, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { PlannerLabel, TaskList } from "@/lib/planner/types";
import type { PlannerTaskView } from "@/lib/planner/task-views";
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

export function PlannerMobileNavigation({
  onViewChange,
  view,
}: {
  onViewChange: (view: PlannerTaskView) => void;
  view: PlannerTaskView;
}) {
  return (
    <nav aria-label="任务智能视图" className={styles.mobileNav}>
      {PLANNER_SMART_VIEWS.map((item) => (
        <button
          aria-current={view === item.id ? "page" : undefined}
          data-active={view === item.id}
          key={item.id}
          onClick={() => onViewChange(item.id)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function PlannerSidebar({
  activeListId,
  labels,
  lists,
  newLabelName,
  newListName,
  onCreateLabel,
  onCreateList,
  onLabelNameChange,
  onListNameChange,
  onViewChange,
  view,
}: {
  activeListId?: string;
  labels: PlannerLabel[];
  lists: TaskList[];
  newLabelName: string;
  newListName: string;
  onCreateLabel: (event: FormEvent<HTMLFormElement>) => void;
  onCreateList: (event: FormEvent<HTMLFormElement>) => void;
  onLabelNameChange: (value: string) => void;
  onListNameChange: (value: string) => void;
  onViewChange: (view: PlannerTaskView, listId?: string) => void;
  view: PlannerTaskView;
}) {
  const [creating, setCreating] = useState<"list" | "label" | null>(null);
  return (
    <aside aria-label="任务视图与清单" className={styles.sidebar}>
      <nav className={styles.smartViews}>
        {PLANNER_SMART_VIEWS.map((item) => (
          <button
            aria-current={view === item.id && !activeListId ? "page" : undefined}
            data-active={view === item.id && !activeListId}
            key={item.id}
            onClick={() => onViewChange(item.id)}
            type="button"
          >
            {item.id === "inbox" ? <Inbox size={16} /> : <ListChecks size={16} />}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <section className={styles.sidebarSection}>
        <strong className={styles.sectionLabel}>清单</strong>
        {lists.map((list) => (
          <button
            aria-current={activeListId === list.id ? "page" : undefined}
            className={styles.listLink}
            data-active={activeListId === list.id}
            key={list.id}
            onClick={() => onViewChange("all", list.id)}
            type="button"
          >
            <span className={styles.colorDot} data-color={list.color_token} />
            {list.name}
          </button>
        ))}
        {creating === "list" ? (
          <form className={styles.inlineCreate} onSubmit={onCreateList}>
            <input
              aria-label="新清单名称"
              onChange={(event) => onListNameChange(event.target.value)}
              placeholder="新建清单"
              value={newListName}
            />
            <button aria-label="创建清单" type="submit">
              <Plus size={15} />
            </button>
          </form>
        ) : (
          <button className={styles.createTrigger} onClick={() => setCreating("list")} type="button">
            <Plus size={15} />
            新建清单
          </button>
        )}
      </section>
      <section className={styles.sidebarSection}>
        <strong className={styles.sectionLabel}>标签</strong>
        <div className={styles.labels}>
          {labels.map((label) => (
            <span className={styles.label} key={label.id}>
              #{label.name}
            </span>
          ))}
        </div>
        {creating === "label" ? (
          <form className={styles.inlineCreate} onSubmit={onCreateLabel}>
            <input
              aria-label="新标签名称"
              onChange={(event) => onLabelNameChange(event.target.value)}
              placeholder="新建标签"
              value={newLabelName}
            />
            <button aria-label="创建标签" type="submit">
              <Plus size={15} />
            </button>
          </form>
        ) : (
          <button className={styles.createTrigger} onClick={() => setCreating("label")} type="button">
            <Plus size={15} />
            新建标签
          </button>
        )}
      </section>
    </aside>
  );
}
