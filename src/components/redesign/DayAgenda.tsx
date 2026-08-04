"use client";

import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { BookOpen, Check } from "lucide-react";
import { motion } from "@/lib/motion/contracts";
import { useMotionReduced } from "@/components/ui/MotionProvider";
import type { TrailReview, TrailTask } from "@/components/redesign/mock-data";
import styles from "@/styles/redesign/day.module.css";

type AgendaEntry =
  | { kind: "task"; task: TrailTask }
  | { kind: "review"; review: TrailReview };

const SCORE_LABELS = ["陌生", "模糊", "记得", "熟练"] as const;

/**
 * 每日工作台 v2：议程优先的单栏时间流，任务与复习交错按时间排列。
 * 预览版：勾选/打分只改本地态；切换时接 toggleTaskAction / scoreReview（带 undo）。
 */
export function DayAgenda({ entries }: { entries: AgendaEntry[] }) {
  const reduced = useMotionReduced();
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [scored, setScored] = useState<Record<string, number>>({});
  const [announcement, setAnnouncement] = useState("");

  const variant = reduced ? motion.row.reduced : motion.row;
  const remaining = entries.filter((entry) =>
    entry.kind === "task" ? !doneIds.has(entry.task.id) : scored[entry.review.id] === undefined,
  );

  function completeTask(task: TrailTask) {
    setDoneIds((current) => new Set(current).add(task.id));
    setAnnouncement(`已完成「${task.title}」`);
  }

  function scoreReview(review: TrailReview, score: number) {
    setScored((current) => ({ ...current, [review.id]: score }));
    setAnnouncement(`「${review.title}」记为${SCORE_LABELS[score]}`);
  }

  return (
    <section aria-labelledby="day-agenda-title" className={styles.agenda}>
      <div className={styles.agendaHead}>
        <h2 id="day-agenda-title">今日议程</h2>
        <span aria-live="polite" className={styles.agendaCount}>
          {remaining.length ? `还剩 ${remaining.length} 项` : "议程已清空"}
        </span>
      </div>
      <p aria-live="polite" className={styles.srOnly}>{announcement}</p>

      <ol className={styles.agendaList}>
        <AnimatePresence initial={false}>
          {entries.map((entry) => {
            if (entry.kind === "task") {
              const { task } = entry;
              const done = doneIds.has(task.id);
              return (
                <m.li
                  className={styles.agendaItem}
                  data-done={done || undefined}
                  initial={variant.enter}
                  animate={variant.animate}
                  exit={variant.exit}
                  layout={reduced ? false : "position"}
                  transition={reduced ? undefined : motion.row.reorder}
                  key={task.id}
                >
                  <span className={styles.agendaTime}>{task.scheduledStart ?? "待排"}</span>
                  <div className={styles.agendaCard} data-priority={task.priority}>
                    <div className={styles.agendaCardMain}>
                      <strong>{task.title}</strong>
                      <span className={styles.agendaMeta}>
                        <i data-p={task.priority}>P{task.priority}</i>
                        {task.subjectCode ? <em>{task.subjectCode}</em> : null}
                        <em>{task.estimatedMinutes} min</em>
                      </span>
                    </div>
                    <button
                      aria-label={done ? `已完成「${task.title}」` : `完成「${task.title}」`}
                      aria-pressed={done}
                      className={styles.agendaCheck}
                      disabled={done}
                      onClick={() => completeTask(task)}
                      type="button"
                    >
                      <Check aria-hidden size={15} />
                    </button>
                  </div>
                </m.li>
              );
            }

            const { review } = entry;
            const score = scored[review.id];
            return (
              <m.li
                className={styles.agendaItem}
                data-done={score !== undefined || undefined}
                initial={variant.enter}
                animate={variant.animate}
                exit={variant.exit}
                layout={reduced ? false : "position"}
                transition={reduced ? undefined : motion.row.reorder}
                key={review.id}
              >
                <span className={styles.agendaTime}>
                  <BookOpen aria-hidden size={11} />
                </span>
                <div className={styles.agendaCard} data-kind="review">
                  <div className={styles.agendaCardMain}>
                    <strong>{review.title}</strong>
                    <span className={styles.agendaMeta}>
                      <em>{review.subjectCode}</em>
                      <em>{review.tierName}</em>
                      {review.overdueDays ? <i data-p="1">逾期 {review.overdueDays} 天</i> : <em>今日到期</em>}
                    </span>
                  </div>
                  {score === undefined ? (
                    <div aria-label={`为「${review.title}」打分`} className={styles.scoreGroup} role="group">
                      {SCORE_LABELS.map((label, value) => (
                        <button
                          aria-label={`${label}（${value} 分）`}
                          className={styles.scoreButton}
                          data-score={value}
                          key={value}
                          onClick={() => scoreReview(review, value)}
                          type="button"
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className={styles.scoreDone}>{SCORE_LABELS[score]}</span>
                  )}
                </div>
              </m.li>
            );
          })}
        </AnimatePresence>
      </ol>

      {remaining.length === 0 ? (
        <div className={styles.agendaClear}>
          <span aria-hidden className={styles.agendaSeal}>顶</span>
          <p><strong>今日议程已清空。</strong>去复盘，或预习明天的山径。</p>
        </div>
      ) : null}
    </section>
  );
}
