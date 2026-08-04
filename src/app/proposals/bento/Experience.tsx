"use client";

import Link from "next/link";
import { useState } from "react";
import { analytics, capacity, events, exams, home, lists, subjects, tasks } from "./mock";
import styles from "./theme.module.css";

export function BentoExperience({ view }: { view: "home" | "calendar" }) {
  const [done, setDone] = useState<string[]>([]);
  const [selected, setSelected] = useState(1);
  return (
    <main className={styles.root}>
      <nav className={styles.nav} aria-label="便当格方案导航">
        <Link className={styles.brand} href="/proposals/bento">
          <i>登</i>
          <span>
            <b>Ascend</b>
            <small>Bento study space</small>
          </span>
        </Link>
        <div>
          <Link aria-current={view === "home" ? "page" : undefined} href="/proposals/bento">
            首页
          </Link>
          <Link aria-current={view === "calendar" ? "page" : undefined} href="/proposals/bento/calendar">
            日历
          </Link>
          <Link href="/proposals">五案总览</Link>
        </div>
      </nav>
      {view === "home" ? (
        <div className={styles.wrap}>
          <header className={styles.welcome}>
            <div>
              <p>星期六 · 8 月 1 日</p>
              <h1>
                早上好，今天的格子
                <br />
                已经替你收拾好了。
              </h1>
            </div>
            <span>
              🔥<b>{home.streak}</b>
              <small>连续天数</small>
            </span>
          </header>
          <section className={styles.bento}>
            <article className={styles.now}>
              <p>现在做什么</p>
              <span>{tasks[0].subject_code}</span>
              <h2>{tasks[0].title}</h2>
              <div>
                <b>{tasks[0].estimated_minutes}</b>
                <small>分钟专注</small>
              </div>
              <Link href="/proposals/bento/calendar">开始这一格 →</Link>
            </article>
            <article className={styles.queue}>
              <header>
                <p>今日小格</p>
                <span>
                  {done.length}/{tasks.length}
                </span>
              </header>
              {tasks.slice(1).map((item) => (
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
                  <i>{done.includes(item.id) ? "✓" : ""}</i>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.estimated_minutes} min · {item.subject_code}
                    </small>
                  </span>
                </button>
              ))}
            </article>
            <article className={styles.week}>
              <p>本周容量</p>
              <strong>{capacity.completionPercent}%</strong>
              <div>
                <i style={{ width: `${capacity.completionPercent}%` }} />
                <b style={{ width: `${(capacity.plannedMinutes / capacity.targetMinutes) * 100}%` }} />
              </div>
              <span>
                {capacity.studiedMinutes} 已学 · {capacity.plannedMinutes} 已排
              </span>
            </article>
            <article className={styles.exam}>
              <p>下一个节点</p>
              <span>12·20</span>
              <h2>{exams[0].name}</h2>
              <small>目标 {exams[0].targetScore} 分 · 还有 141 天</small>
            </article>
            <article className={styles.stats}>
              <div>
                <span>复习</span>
                <b>{home.dueReviews}</b>
              </div>
              <div>
                <span>错题</span>
                <b>{home.dueMistakes}</b>
              </div>
              <div>
                <span>资料</span>
                <b>{home.today.assets}</b>
              </div>
            </article>
            <article className={styles.weak}>
              <p>要照看的知识点</p>
              <h2>{analytics.weakPoints[0].title}</h2>
              <div>
                <i style={{ width: `${analytics.weakPoints[0].mastery}%` }} />
              </div>
              <span>
                {analytics.weakPoints[0].mastery}% 掌握 · {analytics.weakPoints[0].openMistakes} 道错题未毕业
              </span>
            </article>
            <article className={styles.subject}>
              <p>{subjects[0].code}</p>
              <h2>{subjects[0].name}</h2>
              <strong>
                {subjects[0].masteredCount}
                <small> / {subjects[0].pointCount}</small>
              </strong>
              <span>{subjects[0].dueCount} 个到期点</span>
            </article>
          </section>
        </div>
      ) : (
        <Calendar selected={selected} setSelected={setSelected} />
      )}
    </main>
  );
}

function Calendar({
  selected,
  setSelected,
}: {
  selected: number;
  setSelected: React.Dispatch<React.SetStateAction<number>>;
}) {
  const days = Array.from({ length: 35 }, (_, index) => (index < 2 ? 30 + index : index - 1));
  return (
    <div className={styles.calendarWrap}>
      <header className={styles.calendarHead}>
        <div>
          <p>学习日历</p>
          <h1>2026 年 8 月</h1>
        </div>
        <div>
          <button type="button">←</button>
          <button type="button">今天</button>
          <button type="button">→</button>
        </div>
      </header>
      <div className={styles.calendarLayout}>
        <section className={styles.month}>
          <header>
            {["一", "二", "三", "四", "五", "六", "日"].map((item) => (
              <span key={item}>周{item}</span>
            ))}
          </header>
          <div>
            {days.map((day, index) => {
              const inMonth = index >= 2;
              const hasTask = [5, 6, 9, 12, 16, 20, 27].includes(day);
              return (
                <button
                  aria-pressed={selected === day && inMonth}
                  data-muted={!inMonth}
                  key={`${day}-${index}`}
                  onClick={() => inMonth && setSelected(day)}
                  type="button"
                >
                  <b>{day}</b>
                  {hasTask ? (
                    <>
                      <i />
                      <span>{day === 2 ? "周模考" : day === 5 ? "报名截止" : "学习块"}</span>
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
        <aside className={styles.dayTray}>
          <div className={styles.dateBadge}>
            <strong>{selected}</strong>
            <span>
              八月
              <br />
              星期六
            </span>
          </div>
          <h2>这一天的筹码</h2>
          {tasks
            .filter((item) => item.scheduled_start_at)
            .map((item, index) => (
              <article key={item.id}>
                <i data-color={index} />
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.estimated_minutes} 分钟 · {item.subject_code}
                  </small>
                </span>
              </article>
            ))}
          {events.slice(0, 2).map((item, index) => (
            <article key={item.id}>
              <i data-color={index + 2} />
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.kind} · {item.busy_status}
                </small>
              </span>
            </article>
          ))}
          <footer>
            <span>{lists.length} 个清单</span>
            <span>{capacity.unallocatedMinutes} 分钟可分配</span>
          </footer>
        </aside>
      </div>
    </div>
  );
}
