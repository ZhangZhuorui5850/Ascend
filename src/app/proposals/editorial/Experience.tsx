"use client";

import Link from "next/link";
import { useState } from "react";
import { analytics, capacity, dayData, home, subjects, tasks } from "./mock";
import styles from "./theme.module.css";

export function EditorialExperience({ view }: { view: "home" | "day" }) {
  const [done, setDone] = useState<string[]>([]);
  const [edition, setEdition] = useState(0);
  return (
    <main className={styles.root}>
      <header className={styles.masthead}>
        <Link href="/proposals/editorial">THE ASCEND REVIEW</Link>
        <p>学习 · 复盘 · 长期主义</p>
        <nav aria-label="编辑部方案导航">
          <Link aria-current={view === "home" ? "page" : undefined} href="/proposals/editorial">
            今日头版
          </Link>
          <Link aria-current={view === "day" ? "page" : undefined} href="/proposals/editorial/day">
            每日专刊
          </Link>
          <Link href="/proposals">五案总览</Link>
        </nav>
      </header>
      {view === "home" ? (
        <HomeEdition done={done} setDone={setDone} />
      ) : (
        <DayEdition done={done} edition={edition} setDone={setDone} setEdition={setEdition} />
      )}
    </main>
  );
}

function HomeEdition({ done, setDone }: { done: string[]; setDone: React.Dispatch<React.SetStateAction<string[]>> }) {
  return (
    <div className={styles.paper}>
      <div className={styles.issueLine}>
        <span>第 214 期</span>
        <strong>2026 年 8 月 1 日 · 星期六</strong>
        <span>今日学习 {home.today.studyMinutes} 分钟</span>
      </div>
      <section className={styles.cover}>
        <div className={styles.coverStory}>
          <p className={styles.kicker}>今日故事 / COVER STORY</p>
          <h1>
            把拥塞窗口，
            <br />
            从“记得”推进到
            <br />
            <em>能够闭卷讲清。</em>
          </h1>
          <p className={styles.deck}>今日最重要的不是做更多，而是让一次失败的回忆变成下一次稳定的提取。</p>
          <Link href="/proposals/editorial/day">阅读今日专刊 →</Link>
        </div>
        <aside className={styles.coverAside}>
          <p className={styles.kicker}>编辑数字</p>
          <strong>{home.dueReviews + home.dueMistakes}</strong>
          <span>个到期项目</span>
          <blockquote>“{dayData.entry.plan}”</blockquote>
        </aside>
      </section>
      <section className={styles.columns}>
        <article className={styles.contents}>
          <header>
            <p className={styles.kicker}>今日目录</p>
            <h2>四件值得完成的事</h2>
          </header>
          {tasks.map((item, index) => (
            <button
              data-done={done.includes(item.id)}
              key={item.id}
              onClick={() =>
                setDone((value) =>
                  value.includes(item.id) ? value.filter((id) => id !== item.id) : [...value, item.id],
                )
              }
              type="button"
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.title}</strong>
              <small>
                {item.subject_code} · {item.estimated_minutes} 分钟
              </small>
            </button>
          ))}
        </article>
        <article className={styles.feature}>
          <p className={styles.kicker}>薄弱点专题</p>
          <h2>{analytics.weakPoints[0].title}</h2>
          <p className={styles.dropcap}>
            连续两次回忆失败不是“粗心”的证据，而是提取路径尚未稳定。今天先画出慢启动、拥塞避免、快重传与快恢复之间的状态转换，再做一次无提示复述。
          </p>
          <div>
            <span>掌握度</span>
            <strong>{analytics.weakPoints[0].mastery}%</strong>
            <i style={{ width: `${analytics.weakPoints[0].mastery}%` }} />
          </div>
        </article>
      </section>
      <section className={styles.footerStories}>
        <article>
          <p className={styles.kicker}>本周纵览</p>
          <h2>
            {capacity.studiedMinutes} / {capacity.targetMinutes}
          </h2>
          <p>已投入分钟 · 另有 {capacity.plannedMinutes} 分钟已排入计划。</p>
        </article>
        {subjects.map((subject) => (
          <article key={subject.code}>
            <p className={styles.kicker}>{subject.code}</p>
            <h2>{subject.name}</h2>
            <p>
              {subject.masteredCount} 个知识点已掌握，{subject.dueCount} 个等待复习。
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}

function DayEdition({
  done,
  edition,
  setDone,
  setEdition,
}: {
  done: string[];
  edition: number;
  setDone: React.Dispatch<React.SetStateAction<string[]>>;
  setEdition: React.Dispatch<React.SetStateAction<number>>;
}) {
  const dates = ["七月三十一日", "八月一日", "八月二日"];
  return (
    <div className={styles.paper}>
      <div className={styles.pager}>
        <button aria-label="前一天" onClick={() => setEdition((value) => Math.max(-1, value - 1))} type="button">
          ← 前一页
        </button>
        <span>{dates[edition + 1]}</span>
        <button aria-label="后一天" onClick={() => setEdition((value) => Math.min(1, value + 1))} type="button">
          后一页 →
        </button>
      </div>
      <header className={styles.dayTitle}>
        <p>THE DAILY EDITION · DAY 214</p>
        <h1>{dates[edition + 1]}</h1>
        <blockquote>
          {edition === 0 ? dayData.entry.plan : edition < 0 ? "整理昨天的证据，不急着下结论。" : dayData.entry.tomorrow}
        </blockquote>
      </header>
      <div className={styles.dayColumns}>
        <section className={styles.agenda}>
          <p className={styles.kicker}>目录 / AGENDA</p>
          {tasks.map((item, index) => (
            <button
              data-done={done.includes(item.id)}
              key={item.id}
              onClick={() =>
                setDone((value) =>
                  value.includes(item.id) ? value.filter((id) => id !== item.id) : [...value, item.id],
                )
              }
              type="button"
            >
              <span>{index + 1}</span>
              <strong>{item.title}</strong>
              <small>{item.estimated_minutes} min</small>
            </button>
          ))}
        </section>
        <article className={styles.recall}>
          <p className={styles.kicker}>今日考问</p>
          <h2>{dayData.dueReviews[0].title}</h2>
          <p className={styles.dropcap}>{dayData.dueReviews[0].prompt}</p>
          <details>
            <summary>揭晓编辑部答案</summary>
            <p>{dayData.dueReviews[0].answer}</p>
          </details>
          <aside>
            <strong>边注</strong>
            <p>{dayData.notes[0].content}</p>
          </aside>
        </article>
        <article className={styles.editorNote}>
          <p className={styles.kicker}>主编手记 / REVIEW</p>
          <h2>少切换，才有真正的完成。</h2>
          <textarea aria-label="每日复盘" defaultValue={dayData.entry.summary} />
          <small>预览内容不会写入真实数据。</small>
        </article>
      </div>
    </div>
  );
}
