"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { analytics, capacity, dayData, exams, home, subjects, tasks } from "./mock";
import styles from "./theme.module.css";

type View = "home" | "day";

export function AlpineExperience({ view }: { view: View }) {
  const [done, setDone] = useState<string[]>([]);
  const [focus, setFocus] = useState(0);
  const visibleTasks = tasks.filter((item) => !done.includes(item.id));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.target as HTMLElement).closest("input, textarea, button, a")) return;
      if (event.key === "j") setFocus((value) => Math.min(value + 1, Math.max(0, visibleTasks.length - 1)));
      if (event.key === "k") setFocus((value) => Math.max(value - 1, 0));
      if (event.key === " " && visibleTasks[focus]) {
        event.preventDefault();
        setDone((value) => [...value, visibleTasks[focus].id]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, visibleTasks]);

  return (
    <main className={styles.root}>
      <nav aria-label="峰线方案导航" className={styles.nav}>
        <Link className={styles.brand} href="/proposals/alpine">
          <span>△</span> ALPINE
        </Link>
        <div>
          <Link aria-current={view === "home" ? "page" : undefined} href="/proposals/alpine">
            首页
          </Link>
          <Link aria-current={view === "day" ? "page" : undefined} href="/proposals/alpine/day">
            每日
          </Link>
          <Link href="/proposals">五案总览</Link>
        </div>
      </nav>

      {view === "home" ? (
        <div className={styles.flow}>
          <header className={styles.hero}>
            <p>八月一日 · 星期六 · 连续学习 {home.streak} 天</p>
            <h1>
              现在，只做
              <br />
              <em>{tasks[0].title}</em>
            </h1>
            <div className={styles.heroMeta}>
              <span>{tasks[0].estimated_minutes} 分钟</span>
              <span>{tasks[0].subject_code}</span>
              <span>到期回忆优先</span>
            </div>
            <Link className={styles.primary} href="/proposals/alpine/day">
              进入今日 <span>→</span>
            </Link>
          </header>
          <section className={styles.lineSection}>
            <div className={styles.sectionHead}>
              <p>接下来</p>
              <span>j / k 移动 · space 完成</span>
            </div>
            <TaskLines done={done} focus={focus} setDone={setDone} />
          </section>
          <section className={styles.week}>
            <p>本周</p>
            <strong>{capacity.studiedMinutes}</strong>
            <span>/ {capacity.targetMinutes} 分钟</span>
            <div className={styles.weekLine}>
              <i style={{ width: `${capacity.completionPercent}%` }} />
            </div>
            <small>
              已排 {capacity.plannedMinutes} · 尚未分配 {capacity.unallocatedMinutes}
            </small>
          </section>
          <section className={styles.quietGrid}>
            <div>
              <p>最近考试</p>
              <strong>{exams[0].name}</strong>
              <span>还有 141 天 · 目标 {exams[0].targetScore}</span>
            </div>
            <div>
              <p>最需照看</p>
              <strong>{analytics.weakPoints[0].title}</strong>
              <span>{analytics.weakPoints[0].reasons[0]}</span>
            </div>
            <div>
              <p>知识进度</p>
              <strong>
                {subjects[0].masteredCount} / {subjects[0].pointCount}
              </strong>
              <span>{subjects[0].name}</span>
            </div>
          </section>
        </div>
      ) : (
        <div className={styles.flow}>
          <header className={styles.dayHead}>
            <p>DAY / 214</p>
            <h1>八月一日</h1>
            <blockquote>“{dayData.entry.plan}”</blockquote>
          </header>
          <section className={styles.lineSection}>
            <div className={styles.sectionHead}>
              <p>今日四件事</p>
              <span>
                {done.length} / {tasks.length} 完成
              </span>
            </div>
            <TaskLines done={done} focus={focus} setDone={setDone} />
          </section>
          <section className={styles.review}>
            <p>到期回忆 · {dayData.dueReviewsTotal}</p>
            <h2>{dayData.dueReviews[0].title}</h2>
            <details>
              <summary>展开提示与答案</summary>
              <p>{dayData.dueReviews[0].prompt}</p>
              <p className={styles.answer}>{dayData.dueReviews[0].answer}</p>
            </details>
          </section>
          <section className={styles.journal}>
            <p>今日留痕</p>
            <textarea aria-label="今日复盘" defaultValue={dayData.entry.summary} />
            <span>本预览只保存在页面中，不会写入数据库。</span>
          </section>
        </div>
      )}
    </main>
  );
}

function TaskLines({
  done,
  focus,
  setDone,
}: {
  done: string[];
  focus: number;
  setDone: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  return (
    <ol className={styles.tasks}>
      {tasks.map((item, index) => {
        const completed = done.includes(item.id);
        return (
          <li className={index === focus ? styles.focused : ""} data-done={completed} key={item.id}>
            <button
              aria-label={`${completed ? "恢复" : "完成"}${item.title}`}
              onClick={() =>
                setDone((value) => (completed ? value.filter((id) => id !== item.id) : [...value, item.id]))
              }
              type="button"
            >
              <span>{completed ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <strong>{item.title}</strong>
              <small>{item.estimated_minutes} min</small>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
