"use client";

import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { motion } from "@/lib/motion/contracts";
import { useMotionReduced } from "@/components/ui/MotionProvider";
import type { TrailTask } from "@/components/redesign/mock-data";
import styles from "@/styles/redesign/home.module.css";

/**
 * 首页 NEXT 队列：Motion 管行进入/退出/重排；勾选完成授予全页唯一印章时刻。
 * 数据为预览 mock；切换时以 PlannerTask + updatePlannerTaskAction 替换 setTasks。
 */
export function NextQueue({ initialTasks }: { initialTasks: TrailTask[] }) {
  const reduced = useMotionReduced();
  const [tasks, setTasks] = useState(initialTasks);
  const open = tasks.filter((task) => !task.done);
  const doneCount = tasks.length - open.length;
  const allDone = tasks.length > 0 && open.length === 0;

  function complete(id: string) {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, done: true } : task)),
    );
  }

  const variant = reduced ? motion.row.reduced : motion.row;

  return (
    <section aria-labelledby="trail-next-title" className={styles.nextSection}>
      <div className={styles.sectionHead}>
        <div>
          <span className={styles.kicker}>NEXT · 接下来</span>
          <h2 id="trail-next-title">山径上的三步</h2>
        </div>
        <span aria-live="polite" className={styles.sectionMeta}>
          {allDone ? "今日队列已清空" : `已完成 ${doneCount}/${tasks.length}`}
        </span>
      </div>

      <ol className={styles.trail}>
        <AnimatePresence initial={false}>
          {open.slice(0, 3).map((task) => (
            <m.li
              className={styles.trailItem}
              initial={variant.enter}
              animate={variant.animate}
              exit={variant.exit}
              layout={reduced ? false : "position"}
              transition={reduced ? undefined : motion.row.reorder}
              key={task.id}
            >
              <span aria-hidden className={styles.trailNode} />
              <div className={styles.trailCard} data-priority={task.priority}>
                <div className={styles.trailCardMain}>
                  <span className={styles.trailTime}>{task.scheduledStart ?? "待排"}</span>
                  <strong>{task.title}</strong>
                  <span className={styles.trailMeta}>
                    <i data-p={task.priority}>P{task.priority}</i>
                    {task.subjectCode ? <em>{task.subjectCode}</em> : null}
                    <em>{task.estimatedMinutes} min</em>
                  </span>
                </div>
                <button
                  aria-label={`完成「${task.title}」`}
                  className={styles.trailCheck}
                  onClick={() => complete(task.id)}
                  type="button"
                >
                  <svg aria-hidden viewBox="0 0 16 16" width="14" height="14">
                    <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </m.li>
          ))}
        </AnimatePresence>
        {allDone ? (
          <li className={styles.trailSummit}>
            <span aria-hidden className={styles.summitSeal}>顶</span>
            <p><strong>三步皆清。</strong>山径之上，今日已无挂碍。</p>
          </li>
        ) : null}
      </ol>
    </section>
  );
}
