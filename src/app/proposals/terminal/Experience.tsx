"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { analytics, capacity, dayData, home, tasks } from "./mock";
import styles from "./theme.module.css";

export function TerminalExperience({ view }: { view: "home" | "day" }) {
  const [focus, setFocus] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const [canceled, setCanceled] = useState<string[]>([]);
  const [palette, setPalette] = useState(false);
  const [log, setLog] = useState<string[]>(["workspace mounted: mock-workspace", "planner contract: v2 / snake_case"]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((value) => !value);
        return;
      }
      if ((event.target as HTMLElement).closest("input,textarea,button,a")) return;
      if (event.key === "j") setFocus((value) => Math.min(tasks.length - 1, value + 1));
      if (event.key === "k") setFocus((value) => Math.max(0, value - 1));
      if (event.key === " ") {
        event.preventDefault();
        const id = tasks[focus].id;
        setDone((value) => (value.includes(id) ? value.filter((item) => item !== id) : [...value, id]));
        setLog((value) => [...value, `task.toggle --id ${id} --status completed`].slice(-4));
      }
      if (event.key === "x") {
        const id = tasks[focus].id;
        setCanceled((value) => (value.includes(id) ? value.filter((item) => item !== id) : [...value, id]));
        setLog((value) => [...value, `task.cancel --id ${id}`].slice(-4));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);
  return (
    <main className={styles.root}>
      <aside className={styles.tree}>
        <Link className={styles.brand} href="/proposals/terminal">
          <span>ascend</span>
          <b>@learning</b>
          <i>:~$</i>
        </Link>
        <nav aria-label="终端方案导航">
          <p>./views</p>
          <Link aria-current={view === "home" ? "page" : undefined} href="/proposals/terminal">
            ├── overview
          </Link>
          <Link aria-current={view === "day" ? "page" : undefined} href="/proposals/terminal/day">
            ├── day/2026-08-01
          </Link>
          <Link href="/proposals">└── proposals</Link>
          <p>./signals</p>
          <span>├── due [{home.dueReviews + home.dueMistakes}]</span>
          <span>├── streak [{home.streak}d]</span>
          <span>└── weak [{analytics.weakPoints.length}]</span>
        </nav>
        <button onClick={() => setPalette(true)} type="button">
          <kbd>⌘K</kbd> command
        </button>
      </aside>
      <div className={styles.screen}>
        <header>
          <div>
            <i />
            <i />
            <i />
          </div>
          <span>ascend-cli — {view === "home" ? "overview" : "day --date 2026-08-01"}</span>
          <b>UTF-8</b>
        </header>
        <div className={styles.body}>
          {view === "home" ? (
            <Home focus={focus} done={done} canceled={canceled} setFocus={setFocus} />
          ) : (
            <Day focus={focus} done={done} canceled={canceled} log={log} setFocus={setFocus} />
          )}
        </div>
        <footer>
          <span>
            <b>j/k</b> move
          </span>
          <span>
            <b>space</b> complete
          </span>
          <span>
            <b>x</b> cancel
          </span>
          <span>
            <b>⌘K</b> command
          </span>
        </footer>
      </div>
      {palette ? (
        <div className={styles.overlay} role="presentation" onMouseDown={() => setPalette(false)}>
          <section
            aria-label="命令面板"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <span>:</span>
              <input autoFocus aria-label="输入命令" defaultValue="task." />
              <kbd>esc</kbd>
            </header>
            {["task.create", "task.complete", "review.start", "day.open", "calendar.open"].map((cmd, index) => (
              <button
                key={cmd}
                onClick={() => {
                  setLog((value) => [...value, `${cmd} --interactive`].slice(-4));
                  setPalette(false);
                }}
                type="button"
              >
                <i>{index === 0 ? "›" : " "}</i>
                <strong>{cmd}</strong>
                <span>{["新建任务", "完成当前任务", "开始到期复习", "打开每日工作台", "打开日历"][index]}</span>
              </button>
            ))}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Prompt({ children }: { children: React.ReactNode }) {
  return (
    <p className={styles.prompt}>
      <span>learner@ascend</span>:<b>~</b>$ {children}
    </p>
  );
}
function Home({
  focus,
  done,
  canceled,
  setFocus,
}: {
  focus: number;
  done: string[];
  canceled: string[];
  setFocus: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <>
      <Prompt>ascend status --today</Prompt>
      <section className={styles.status}>
        <div>
          <span>STUDY_MIN</span>
          <b>{home.today.studyMinutes}</b>
        </div>
        <div>
          <span>DUE_QUEUE</span>
          <b>{home.dueReviews + home.dueMistakes}</b>
        </div>
        <div>
          <span>WEEK_PROGRESS</span>
          <b>{capacity.completionPercent}%</b>
        </div>
        <div>
          <span>STREAK</span>
          <b>{home.streak}d</b>
        </div>
      </section>
      <Prompt>task list --date today --sort priority</Prompt>
      <TaskOutput focus={focus} done={done} canceled={canceled} setFocus={setFocus} />
      <Prompt>analytics weak --limit 2</Prompt>
      <div className={styles.output}>
        {analytics.weakPoints.map((point) => (
          <p key={point.id}>
            <i>WARN</i> {point.subjectCode}/{point.title}{" "}
            <span>
              mastery={point.mastery}% mistakes={point.openMistakes}
            </span>
          </p>
        ))}
      </div>
      <Prompt>capacity show --week current</Prompt>
      <div className={styles.meter}>
        <span>[</span>
        <i style={{ width: `${capacity.completionPercent}%` }} />
        <b>
          {"#".repeat(12)}
          {".".repeat(13)}
        </b>
        <span>
          ] {capacity.studiedMinutes}/{capacity.targetMinutes} min
        </span>
      </div>
      <div className={styles.cursor}>
        <span>learner@ascend</span>:<b>~</b>$ <i />
      </div>
    </>
  );
}
function Day({
  focus,
  done,
  canceled,
  log,
  setFocus,
}: {
  focus: number;
  done: string[];
  canceled: string[];
  log: string[];
  setFocus: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <>
      <Prompt>day open 2026-08-01</Prompt>
      <div className={styles.banner}>
        <span>PLAN</span>
        <strong>{dayData.entry.plan}</strong>
        <small>
          due_reviews={dayData.dueReviewsTotal} due_mistakes={dayData.dueMistakesTotal} assets={dayData.assets.length}
        </small>
      </div>
      <Prompt>task list --verbose</Prompt>
      <TaskOutput focus={focus} done={done} canceled={canceled} setFocus={setFocus} />
      <Prompt>review peek --next</Prompt>
      <section className={styles.recall}>
        <header>
          <i>RECALL</i>
          <span>{dayData.dueReviews[0].subject_code}</span>
          <b>mastery {dayData.dueReviews[0].mastery}%</b>
        </header>
        <strong>{dayData.dueReviews[0].title}</strong>
        <p>{dayData.dueReviews[0].prompt}</p>
        <details>
          <summary>cat answer.txt</summary>
          <p>{dayData.dueReviews[0].answer}</p>
        </details>
      </section>
      <Prompt>tail -f activity.log</Prompt>
      <div className={styles.logs}>
        {log.map((item, index) => (
          <p key={`${item}-${index}`}>
            <span>
              08:{40 + index}:0{index}
            </span>{" "}
            INFO {item}
          </p>
        ))}
      </div>
      <div className={styles.cursor}>
        <span>learner@ascend</span>:<b>~/day</b>$ <i />
      </div>
    </>
  );
}
function TaskOutput({
  focus,
  done,
  canceled,
  setFocus,
}: {
  focus: number;
  done: string[];
  canceled: string[];
  setFocus: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <div className={styles.taskOutput}>
      <header>
        <span>SEL</span>
        <span>STATUS</span>
        <span>PRI</span>
        <span>TITLE</span>
        <span>SUBJECT</span>
        <span>EST</span>
      </header>
      {tasks.map((item, index) => (
        <button
          aria-current={focus === index ? "true" : undefined}
          key={item.id}
          onClick={() => setFocus(index)}
          type="button"
        >
          <span>{focus === index ? "›" : " "}</span>
          <i data-status={canceled.includes(item.id) ? "canceled" : done.includes(item.id) ? "done" : "open"}>
            {canceled.includes(item.id) ? "CANCEL" : done.includes(item.id) ? "DONE" : "OPEN"}
          </i>
          <b>P{item.priority}</b>
          <strong>{item.title}</strong>
          <span>{item.subject_code}</span>
          <span>{item.estimated_minutes}m</span>
        </button>
      ))}
    </div>
  );
}
