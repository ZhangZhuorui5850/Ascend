"use client";

import Link from "next/link";
import { useState } from "react";
import { analytics, capacity, dayData, events, home, tasks } from "./mock";
import styles from "./theme.module.css";

type View = "home" | "day" | "calendar";
const week = ["MON 27", "TUE 28", "WED 29", "THU 30", "FRI 31", "SAT 01", "SUN 02"];

export function CommandExperience({ view }: { view: View }) {
  const [done, setDone] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "risk" | "scheduled">("all");
  const filtered = tasks.filter(
    (item) => filter === "all" || (filter === "risk" ? item.priority === 1 : item.scheduled_start_at),
  );
  return (
    <main className={styles.root}>
      <aside className={styles.rail}>
        <Link className={styles.brand} href="/proposals/command">
          <span>▲</span>
          <b>ASCEND</b>
          <small>CMD/02</small>
        </Link>
        <nav aria-label="指挥舱方案导航">
          <Link aria-current={view === "home" ? "page" : undefined} href="/proposals/command">
            OVERVIEW <i>01</i>
          </Link>
          <Link aria-current={view === "day" ? "page" : undefined} href="/proposals/command/day">
            DAY OPS <i>02</i>
          </Link>
          <Link aria-current={view === "calendar" ? "page" : undefined} href="/proposals/command/calendar">
            CALENDAR <i>03</i>
          </Link>
          <Link href="/proposals">
            ALL PROPOSALS <i>↗</i>
          </Link>
        </nav>
        <div className={styles.system}>
          <i />
          <span>SYSTEM ONLINE</span>
          <small>UTC+08:00</small>
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <span>LEARNING OPERATIONS</span>
            <strong>{view === "home" ? "OVERVIEW" : view === "day" ? "DAY / 2026-08-01" : "WEEK / W31"}</strong>
          </div>
          <p>
            <i /> SYNCED 08:42:16
          </p>
        </header>
        {view === "home" ? (
          <HomePanel />
        ) : view === "day" ? (
          <DayPanel done={done} filter={filter} filtered={filtered} setDone={setDone} setFilter={setFilter} />
        ) : (
          <CalendarPanel />
        )}
      </div>
    </main>
  );
}

function HomePanel() {
  const max = Math.max(...analytics.dailyMinutes.map((item) => item.minutes));
  return (
    <div className={styles.dashboard}>
      <section className={styles.alert}>
        <span>PRIORITY SIGNAL</span>
        <h1>{analytics.weakPoints[0].title}</h1>
        <p>{analytics.weakPoints[0].reasons.join(" · ")}</p>
        <Link href="/proposals/command/day">OPEN DAY OPS →</Link>
      </section>
      <section className={styles.metrics}>
        <Metric label="STUDY / TODAY" value={home.today.studyMinutes} unit="MIN" delta="+18%" />
        <Metric label="DUE QUEUE" value={home.dueReviews + home.dueMistakes} unit="ITEMS" delta="3 RISK" warn />
        <Metric
          label="WEEK CAPACITY"
          value={capacity.completionPercent}
          unit="%"
          delta={`${capacity.unallocatedMinutes} FREE`}
        />
        <Metric label="STREAK" value={home.streak} unit="DAYS" delta="STABLE" />
      </section>
      <section className={styles.chartPanel}>
        <PanelHead label="OUTPUT / 7D" meta="MINUTES" />
        <div className={styles.bars}>
          {analytics.dailyMinutes.map((item) => (
            <div key={item.day}>
              <i style={{ height: `${Math.max(8, (item.minutes / max) * 100)}%` }} />
              <span>{item.day.slice(8)}</span>
              <b>{item.minutes}</b>
            </div>
          ))}
        </div>
      </section>
      <section className={styles.capacity}>
        <PanelHead label="CAPACITY MAP" meta="900 MIN TARGET" />
        <div className={styles.capacityTrack}>
          <i style={{ width: `${(capacity.studiedMinutes / capacity.targetMinutes) * 100}%` }} />
          <b style={{ width: `${(capacity.plannedMinutes / capacity.targetMinutes) * 100}%` }} />
        </div>
        <dl>
          <div>
            <dt>LOGGED</dt>
            <dd>{capacity.studiedMinutes}</dd>
          </div>
          <div>
            <dt>PLANNED</dt>
            <dd>{capacity.plannedMinutes}</dd>
          </div>
          <div>
            <dt>UNALLOCATED</dt>
            <dd>{capacity.unallocatedMinutes}</dd>
          </div>
        </dl>
      </section>
      <section className={styles.queue}>
        <PanelHead label="ACTIVE QUEUE" meta={`${tasks.length} TASKS`} />
        <TaskTable tasksToShow={tasks} />
      </section>
      <section className={styles.risk}>
        <PanelHead label="RISK REGISTER" meta="LIVE" />
        {analytics.weakPoints.map((point) => (
          <div key={point.id}>
            <b>{point.priorityScore}</b>
            <span>
              <strong>{point.title}</strong>
              <small>
                {point.tierName} · mastery {point.mastery}%
              </small>
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

function DayPanel({
  done,
  filter,
  filtered,
  setDone,
  setFilter,
}: {
  done: string[];
  filter: "all" | "risk" | "scheduled";
  filtered: typeof tasks;
  setDone: React.Dispatch<React.SetStateAction<string[]>>;
  setFilter: React.Dispatch<React.SetStateAction<"all" | "risk" | "scheduled">>;
}) {
  return (
    <div className={styles.dayGrid}>
      <section className={styles.dayBrief}>
        <PanelHead label="MISSION BRIEF" meta="08:00–21:30" />
        <h1>{dayData.entry.plan}</h1>
        <p>{dayData.entry.summary}</p>
        <dl>
          <div>
            <dt>DUE REVIEW</dt>
            <dd>{dayData.dueReviewsTotal}</dd>
          </div>
          <div>
            <dt>DUE MISTAKE</dt>
            <dd>{dayData.dueMistakesTotal}</dd>
          </div>
          <div>
            <dt>ASSETS</dt>
            <dd>{dayData.assets.length}</dd>
          </div>
        </dl>
      </section>
      <section className={styles.taskOps}>
        <PanelHead label="TASK OPERATIONS" meta={`${done.length}/${tasks.length} DONE`} />
        <div className={styles.filters}>
          {(["all", "risk", "scheduled"] as const).map((key) => (
            <button aria-pressed={filter === key} key={key} onClick={() => setFilter(key)} type="button">
              {key.toUpperCase()}
            </button>
          ))}
        </div>
        <TaskTable done={done} setDone={setDone} tasksToShow={filtered} />
      </section>
      <section className={styles.reviewPanel}>
        <PanelHead label="RECALL QUEUE" meta={`${dayData.dueReviewsTotal} DUE`} />
        <strong>{dayData.dueReviews[0].title}</strong>
        <p>{dayData.dueReviews[0].prompt}</p>
        <div>
          <button type="button">0 LOST</button>
          <button type="button">1 FUZZY</button>
          <button type="button">2 GOT IT</button>
          <button type="button">3 SOLID</button>
        </div>
      </section>
      <section className={styles.notes}>
        <PanelHead label="FIELD NOTES" meta="LOCAL MOCK" />
        <textarea aria-label="行动记录" defaultValue={dayData.notes[0].content} />
      </section>
    </div>
  );
}

function CalendarPanel() {
  const [selected, setSelected] = useState(5);
  return (
    <div className={styles.calendarPage}>
      <section className={styles.calendarHead}>
        <div>
          <span>AUG / 2026</span>
          <h1>WEEK 31</h1>
        </div>
        <div>
          <button type="button">← PREV</button>
          <button type="button">TODAY</button>
          <button type="button">NEXT →</button>
        </div>
      </section>
      <section className={styles.weekGrid}>
        <div className={styles.timeAxis}>
          {["08", "10", "12", "14", "16", "18", "20"].map((hour) => (
            <span key={hour}>{hour}:00</span>
          ))}
        </div>
        {week.map((label, index) => (
          <button
            aria-pressed={selected === index}
            className={styles.dayColumn}
            key={label}
            onClick={() => setSelected(index)}
            type="button"
          >
            <b>{label}</b>
            {index === 5 ? (
              <>
                <i className={styles.blockA}>
                  09:00
                  <br />
                  TCP RECALL
                </i>
                <i className={styles.blockB}>
                  13:00
                  <br />
                  NETWORK CLASS
                </i>
              </>
            ) : null}
            {index === 6 ? (
              <i className={styles.blockExam}>
                09:00
                <br />
                WEEKLY MOCK
              </i>
            ) : null}
            <span style={{ height: `${capacity.days[index].studiedMinutes / 1.4}px` }} />
          </button>
        ))}
      </section>
      <section className={styles.calendarBottom}>
        <div>
          <PanelHead label="SELECTED / SAT 01" meta="4 BLOCKS" />
          <TaskTable tasksToShow={tasks.filter((item) => item.scheduled_start_at)} />
        </div>
        <div>
          <PanelHead label="EVENT FEED" meta={`${events.length}`} />
          {events.map((item) => (
            <p key={item.id}>
              <i data-kind={item.kind} />
              <strong>{item.title}</strong>
              <span>{item.kind}</span>
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  delta,
  warn = false,
}: {
  label: string;
  value: number;
  unit: string;
  delta: string;
  warn?: boolean;
}) {
  return (
    <article data-warn={warn}>
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
      <p>{delta}</p>
    </article>
  );
}
function PanelHead({ label, meta }: { label: string; meta: string }) {
  return (
    <header className={styles.panelHead}>
      <strong>{label}</strong>
      <span>{meta}</span>
    </header>
  );
}
function TaskTable({
  tasksToShow,
  done = [],
  setDone,
}: {
  tasksToShow: typeof tasks;
  done?: string[];
  setDone?: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  return (
    <div className={styles.taskTable}>
      {tasksToShow.map((item) => (
        <button
          data-done={done.includes(item.id)}
          key={item.id}
          onClick={() =>
            setDone?.((value) => (value.includes(item.id) ? value.filter((id) => id !== item.id) : [...value, item.id]))
          }
          type="button"
        >
          <i>{item.priority === 1 ? "P1" : `P${item.priority}`}</i>
          <strong>{item.title}</strong>
          <span>{item.subject_code}</span>
          <b>{item.estimated_minutes}m</b>
        </button>
      ))}
    </div>
  );
}
