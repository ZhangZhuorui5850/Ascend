"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Check, Plus } from "lucide-react";
import { motion } from "@/lib/motion/contracts";
import { MotionProvider, useMotionReduced } from "@/components/ui/MotionProvider";
import { PlannerDrawer } from "@/components/ui/PlannerDrawer";
import type { TrailTask } from "@/components/redesign/mock-data";
import { tasksLists } from "@/components/redesign/mock-data";
import styles from "@/styles/redesign/tasks.module.css";

type Viewport = "desktop" | "tablet" | "mobile";

function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  useEffect(() => {
    const update = () => {
      setViewport(
        window.innerWidth <= 760 ? "mobile" : window.innerWidth < 1180 ? "tablet" : "desktop",
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return viewport;
}

/**
 * 待办 v2 预览：≥1180 三栏 / 761–1179 右侧 Drawer / ≤760 底部 Sheet。
 * 键盘：↑↓ 移动选中、空格完成、Enter 打开详情。mock 数据，不接 action。
 */
export function TasksTrail({ initialTasks }: { initialTasks: TrailTask[] }) {
  return (
    <MotionProvider>
      <TasksTrailInner initialTasks={initialTasks} />
    </MotionProvider>
  );
}

function TasksTrailInner({ initialTasks }: { initialTasks: TrailTask[] }) {
  const reduced = useMotionReduced();
  const viewport = useViewport();
  const [tasks, setTasks] = useState(initialTasks);
  const [activeList, setActiveList] = useState(tasksLists[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(initialTasks[0]?.id ?? null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const triggerRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const selected = tasks.find((task) => task.id === selectedId) ?? null;
  const variant = reduced ? motion.row.reduced : motion.row;

  function toggleDone(task: TrailTask) {
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, done: !item.done } : item)),
    );
    setAnnouncement(task.done ? `已重开「${task.title}」` : `已完成「${task.title}」`);
  }

  function openDetail(task: TrailTask, trigger: HTMLElement | null) {
    setSelectedId(task.id);
    triggerRef.current = trigger;
    if (viewport === "desktop") return;
    setDetailOpen(true);
  }

  function moveSelection(delta: number) {
    const index = tasks.findIndex((task) => task.id === selectedId);
    const next = tasks[Math.min(tasks.length - 1, Math.max(0, index + delta))];
    if (!next) return;
    setSelectedId(next.id);
    rowRefs.current.get(next.id)?.focus();
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); moveSelection(1); }
    if (event.key === "ArrowUp") { event.preventDefault(); moveSelection(-1); }
    if (event.key === " " && selected) { event.preventDefault(); toggleDone(selected); }
    if (event.key === "Enter" && selected) {
      event.preventDefault();
      openDetail(selected, rowRefs.current.get(selected.id) ?? null);
    }
  }

  const inspector = selected ? (
    <div className={styles.inspectorBody}>
      <div className={styles.inspectorField}>
        <span>标题</span>
        <strong>{selected.title}</strong>
      </div>
      <div className={styles.inspectorRow}>
        <div className={styles.inspectorField}>
          <span>优先级</span>
          <strong>P{selected.priority}</strong>
        </div>
        <div className={styles.inspectorField}>
          <span>预估</span>
          <strong>{selected.estimatedMinutes} min</strong>
        </div>
      </div>
      <div className={styles.inspectorRow}>
        <div className={styles.inspectorField}>
          <span>排时</span>
          <strong>{selected.scheduledStart ?? "未排时"}</strong>
        </div>
        <div className={styles.inspectorField}>
          <span>科目</span>
          <strong>{selected.subjectCode ?? "—"}</strong>
        </div>
      </div>
      <div className={styles.inspectorField}>
        <span>备注</span>
        <p>{selected.notes ?? "（无备注）"}</p>
      </div>
      <div className={styles.inspectorActions}>
        <button className={styles.inspectorPrimary} onClick={() => toggleDone(selected)} type="button">
          {selected.done ? "重开任务" : "完成任务"}
        </button>
        <button className={styles.inspectorGhost} type="button">移入回收站</button>
      </div>
      <p className={styles.inspectorHint}>预览版为只读详情；切换时接 updatePlannerTaskAction（乐观锁 expectedVersion）。</p>
    </div>
  ) : null;

  return (
    <div className={styles.workspace}>
      {/* 左：清单栏（≤760 隐藏，交由顶部 chips） */}
      <aside aria-label="清单" className={styles.listsPane}>
        <span className={styles.paneLabel}>清单</span>
        <ul>
          {tasksLists.map((list) => (
            <li key={list.id}>
              <button
                aria-pressed={activeList === list.id}
                className={styles.listItem}
                data-active={activeList === list.id || undefined}
                onClick={() => setActiveList(list.id)}
                type="button"
              >
                <span>{list.name}</span>
                <em>{list.count}</em>
              </button>
            </li>
          ))}
        </ul>
        <button className={styles.listAdd} type="button"><Plus aria-hidden size={14} />新建清单</button>
      </aside>

      {/* 中：任务列表 */}
      <section aria-label="任务列表" className={styles.listPane}>
        <div className={styles.captureBar}>
          <input aria-label="快速添加任务" placeholder="+ 添加任务，回车创建" type="text" />
        </div>
        <p aria-live="polite" className={styles.srOnly}>{announcement}</p>
        <ul
          aria-label="任务"
          className={styles.taskList}
          onKeyDown={onListKeyDown}
          role="listbox"
          aria-activedescendant={selectedId ? `trail-task-${selectedId}` : undefined}
        >
          <AnimatePresence initial={false}>
            {tasks.map((task) => (
              <m.li
                aria-selected={selectedId === task.id}
                className={styles.taskRow}
                data-done={task.done || undefined}
                data-priority={task.priority}
                id={`trail-task-${task.id}`}
                initial={variant.enter}
                animate={variant.animate}
                exit={variant.exit}
                layout={reduced ? false : "position"}
                transition={reduced ? undefined : motion.row.reorder}
                key={task.id}
                ref={(node: HTMLLIElement | null) => {
                  if (node) rowRefs.current.set(task.id, node);
                  else rowRefs.current.delete(task.id);
                }}
                role="option"
                tabIndex={selectedId === task.id ? 0 : -1}
                onClick={(event: React.MouseEvent<HTMLLIElement>) => openDetail(task, event.currentTarget)}
                onFocus={() => setSelectedId(task.id)}
              >
                <button
                  aria-label={task.done ? `重开「${task.title}」` : `完成「${task.title}」`}
                  aria-pressed={task.done}
                  className={styles.taskCheck}
                  onClick={(event) => { event.stopPropagation(); toggleDone(task); }}
                  tabIndex={-1}
                  type="button"
                >
                  <Check aria-hidden size={14} />
                </button>
                <span className={styles.taskMain}>
                  <strong>{task.title}</strong>
                  <span className={styles.taskMeta}>
                    <i data-p={task.priority}>P{task.priority}</i>
                    {task.subjectCode ? <em>{task.subjectCode}</em> : null}
                    {task.scheduledStart ? <em>{task.scheduledStart}</em> : null}
                    <em>{task.estimatedMinutes}m</em>
                  </span>
                </span>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>

      {/* 右：桌面 Inspector（≥1180 内联；其余走 Drawer/Sheet） */}
      {viewport === "desktop" ? (
        <aside aria-label="任务详情" className={styles.inspectorPane}>
          <span className={styles.paneLabel}>详情</span>
          {inspector ?? <p className={styles.inspectorEmpty}>选择一条任务查看详情。</p>}
        </aside>
      ) : (
        <PlannerDrawer
          description={selected ? `P${selected.priority} · ${selected.estimatedMinutes} 分钟` : ""}
          onOpenChange={setDetailOpen}
          open={detailOpen && selected !== null}
          surface={viewport === "mobile" ? "sheet" : "drawer"}
          title={selected?.title ?? "任务详情"}
          triggerRef={triggerRef}
        >
          {inspector}
        </PlannerDrawer>
      )}
    </div>
  );
}
