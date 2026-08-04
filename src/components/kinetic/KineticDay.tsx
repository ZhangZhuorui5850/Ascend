"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight, ArrowUpRight, BookOpenCheck, Brain, CalendarDays, Check,
  ChevronLeft, ChevronRight, Circle, Clock3, FileText, Flame, History,
  Layers3, Lightbulb, Orbit, Plus, Sparkles, TimerReset, Zap,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPlannerTaskAction, updatePlannerTaskAction } from "@/app/actions/planner-tasks";
import { DayJournal } from "@/components/DayJournal";
import { DayNotes } from "@/components/DayNotes";
import { QuickLog } from "@/components/QuickLog";
import { ReviewQueue } from "@/components/ReviewQueue";
import { RichText } from "@/components/RichText";
import { assetFileUrl } from "@/lib/asset-url";
import { shiftDateKey } from "@/lib/dates";
import { utcToZonedDateTime } from "@/lib/planner/time";
import type { PlannerTask, TaskList } from "@/lib/planner/types";
import type { DayData } from "@/lib/repo/days";
import type { CaptureSubject } from "@/lib/repo/knowledge";
import { PRE_CONFIDENCE_LABELS } from "@/lib/review-evidence";
import styles from "./KineticDay.module.css";

type DayMode = "execute" | "recall" | "reflect";

const MODES: Array<{ key: DayMode; label: string; caption: string; icon: typeof Zap }> = [
  { key: "execute", label: "执行场", caption: "DO", icon: Zap },
  { key: "recall", label: "回声场", caption: "RECALL", icon: Brain },
  { key: "reflect", label: "沉淀场", caption: "REFLECT", icon: Lightbulb },
];

export function KineticDay({
  captureHierarchy,
  dailyReviewLimit,
  date,
  day,
  isToday,
  lists,
  offlineScope,
  recentCauses,
  sprintSubjectCodes,
  tasks: initialTasks,
  timeZone,
  today,
  yesterdayPlan,
}: {
  captureHierarchy: CaptureSubject[];
  dailyReviewLimit: number;
  date: string;
  day: DayData;
  isToday: boolean;
  lists: TaskList[];
  offlineScope: string;
  recentCauses: string[];
  sprintSubjectCodes: string[];
  tasks: PlannerTask[];
  timeZone: string;
  today: string;
  yesterdayPlan: string;
}) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<DayMode>("execute");
  const [tasks, setTasks] = useState(initialTasks);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toastTimer = useRef<number | null>(null);
  const inboxId = lists.find((list) => list.is_inbox)?.id ?? lists[0]?.id ?? "";
  const doneTasks = tasks.filter((task) => task.status === "completed").length;
  const studyMinutes = day.sessions.reduce((total, session) => total + session.duration_minutes, 0);
  const queueCount = day.dueReviews.length + day.dueMistakes.length;
  const activityCount = day.sessions.length + day.reviews.length + day.mistakes.length;
  const dateLabel = formatDayTitle(date, timeZone);
  const completion = tasks.length ? Math.round(doneTasks / tasks.length * 100) : 0;

  const timeline = useMemo(() => [
    ...day.sessions.map((item) => ({
      id: `session-${item.id}`,
      kind: "SESSION",
      title: item.title,
      meta: `${item.duration_minutes || 0} 分钟${item.subject_code ? ` · ${item.subject_code}` : ""}`,
      detail: item.output,
      tone: "mint",
    })),
    ...day.reviews.map((item) => ({
      id: `review-${item.id}`,
      kind: item.event_type === "mistake_reattempt" ? "RETRY" : "RECALL",
      title: item.knowledge_title || item.note || "知识回声",
      meta: item.attempt_mode === "unknown"
        ? `历史评分 ${item.score}/3`
        : `揭晓前${PRE_CONFIDENCE_LABELS[item.pre_confidence ?? 0]} · 结果 ${item.score}/3`,
      detail: "",
      tone: "violet",
    })),
    ...day.mistakes.map((item) => ({
      id: `mistake-${item.id}`,
      kind: "ERROR",
      title: item.title,
      meta: item.graduated ? "已毕业" : item.next_review ? `下次回炉 ${item.next_review}` : "等待排期",
      detail: item.cause,
      tone: "orange",
    })),
  ], [day.mistakes, day.reviews, day.sessions]);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash === "#day-reviews") setMode("recall");
      if (["#day-notes", "#day-journal"].includes(window.location.hash)) setMode("reflect");
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const toggleTask = (task: PlannerTask) => {
    const status = task.status === "completed" ? "open" : "completed";
    const previous = tasks;
    setTasks((items) => items.map((item) => item.id === task.id ? { ...item, status } : item));
    startTransition(async () => {
      const result = await updatePlannerTaskAction({ id: task.id, expectedVersion: task.version, status });
      if (!result.ok || !result.entity) {
        setTasks(previous);
        notify(result.conflict ? "任务已在另一处改变，请刷新后重试" : result.error || "任务更新失败");
        return;
      }
      setTasks((items) => items.map((item) => item.id === task.id ? result.entity! : item));
      notify(status === "completed" ? "轨迹闭合 · 今日势能已更新" : "任务重新进入执行场");
    });
  };

  const createTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("title") ?? "").trim();
    const listId = String(formData.get("listId") ?? inboxId);
    const scheduledStart = String(formData.get("scheduledStart") ?? "");
    const estimatedMinutes = Number(formData.get("estimatedMinutes") ?? 30);
    if (!title || !listId) return;
    form.reset();
    startTransition(async () => {
      const result = await createPlannerTaskAction({
        clientMutationId: crypto.randomUUID(),
        listId,
        title,
        dueDate: date,
        scheduledDate: scheduledStart ? date : null,
        scheduledStart: scheduledStart || null,
        estimatedMinutes,
        priority: 2,
      });
      if (!result.ok || !result.entity) {
        notify(result.error || "任务未能进入今日轨道");
        return;
      }
      setTasks((items) => [...items, result.entity!]);
      notify("新任务已进入今日执行场");
    });
  };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroSignal} aria-hidden="true">
          <i /><i /><i />
          <span>{String(new Date(`${date}T12:00:00Z`).getUTCDate()).padStart(2, "0")}</span>
        </div>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><Orbit size={13} /><span>{isToday ? "LIVE DAY FIELD" : "DAY ARCHIVE"}</span><i /><span>{date}</span></div>
          <h1>{isToday ? <>今天不是清单，<br />是一块<span>正在发生的场。</span></> : <>{dateLabel}<br /><span>留下的学习轨迹。</span></>}</h1>
          <p>{yesterdayPlan || (isToday ? "把行动、无提示提取与证据复盘放进同一条时间流。先推进，再验证，最后留下可复用的理解。" : "这里只展示当天真实发生的任务、学习、复习、错题与沉淀，不用今天的状态回写过去。")}</p>
        </div>
        <nav className={styles.dayNav} aria-label="日期导航">
          <Link aria-label="前一天" href={`/kinetic/day/${shiftDateKey(date, -1)}`}><ChevronLeft size={18} /></Link>
          {!isToday ? <Link className={styles.todayLink} href={`/kinetic/day/${today}`}>回到今天</Link> : <span className={styles.todayLink}>TODAY</span>}
          <Link aria-label="后一天" href={`/kinetic/day/${shiftDateKey(date, 1)}`}><ChevronRight size={18} /></Link>
        </nav>
        <div className={styles.heroStats}>
          <div><small>TRAJECTORY</small><strong>{doneTasks}<span>/{tasks.length}</span></strong><p>任务闭合</p></div>
          <div><small>DEEP WORK</small><strong>{studyMinutes}<span>m</span></strong><p>真实学习</p></div>
          <div><small>RECALL</small><strong>{isToday ? queueCount : day.reviews.length}</strong><p>{isToday ? "等待提取" : "当日完成"}</p></div>
          <div><small>EVIDENCE</small><strong>{activityCount}</strong><p>证据事件</p></div>
        </div>
      </header>

      <section className={styles.modeRail} aria-label="工作台模式">
        <div className={styles.progressTrack}><motion.i initial={reduceMotion ? false : { scaleX: 0 }} animate={{ scaleX: completion / 100 }} /><span>{completion}% CLOSED</span></div>
        <div className={styles.modeTabs}>
          {MODES.map((item) => {
            const Icon = item.icon;
            return <button aria-pressed={mode === item.key} className={mode === item.key ? styles.modeActive : ""} key={item.key} onClick={() => setMode(item.key)} type="button">
              {mode === item.key ? <motion.i layoutId="kinetic-day-mode" /> : null}
              <Icon size={15} /><span><small>{item.caption}</small>{item.label}</span>
            </button>;
          })}
        </div>
        <Link href="/kinetic/calendar"><CalendarDays size={15} />日历全景<ArrowUpRight size={14} /></Link>
      </section>

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          className={styles.stage}
          exit={reduceMotion ? undefined : { opacity: 0, y: -10, filter: "blur(8px)" }}
          initial={reduceMotion ? false : { opacity: 0, y: 18, filter: "blur(10px)" }}
          key={mode}
        >
          {mode === "execute" ? (
            <ExecuteField
              inboxId={inboxId}
              lists={lists}
              onCreate={createTask}
              onToggle={toggleTask}
              pending={pending}
              tasks={tasks}
              timeZone={timeZone}
              timeline={timeline}
            />
          ) : null}

          {mode === "recall" ? (
            <section className={styles.recallLayout} id="day-reviews">
              <div className={styles.fieldIntro}>
                <span>02 / ACTIVE RECALL</span>
                <h2>不要确认“看懂了”，<br />去测试<span>能否重建。</span></h2>
                <p>先写出自己的答案与信心，再揭晓提示。系统记录的是提取证据，而不是熟悉感。</p>
                <div><Brain size={22} /><strong>{queueCount}</strong><span>条回声等待处理</span></div>
              </div>
              <div className={styles.legacySurface}>
                {isToday ? (
                  <ReviewQueue
                    dailyLimit={dailyReviewLimit}
                    day={date}
                    doneToday={day.reviews.length}
                    dueMistakes={day.dueMistakes}
                    dueMistakesTotal={day.dueMistakesTotal}
                    dueReviews={day.dueReviews}
                    dueReviewsTotal={day.dueReviewsTotal}
                    offlineScope={offlineScope}
                    sprintSubjectCodes={sprintSubjectCodes}
                  />
                ) : (
                  <div className={styles.historyRecall}>
                    <History size={28} />
                    <span>ARCHIVED EVIDENCE</span>
                    <h3>当天完成了 {day.reviews.length} 次提取</h3>
                    <p>历史页面不使用现在的排期回推过去队列；具体证据保留在下方轨迹中。</p>
                    {timeline.filter((item) => item.kind === "RECALL" || item.kind === "RETRY").map((item) => <article key={item.id}><strong>{item.title}</strong><small>{item.meta}</small></article>)}
                  </div>
                )}
              </div>
              <EvidenceAside date={date} day={day} timeline={timeline} />
            </section>
          ) : null}

          {mode === "reflect" ? (
            <section className={styles.reflectLayout}>
              <div className={styles.fieldIntro}>
                <span>03 / CONSOLIDATION</span>
                <h2>把流过脑海的东西，<br />压缩成<span>下一次的起点。</span></h2>
                <p>学习记录回答“做了什么”，随笔保存过程中的想法，复盘只留下今天真正改变了什么。</p>
              </div>
              <div className={`${styles.legacySurface} ${styles.captureSurface}`}>
                <QuickLog day={date} recentCauses={recentCauses} subjects={captureHierarchy} />
              </div>
              <div className={`${styles.legacySurface} ${styles.notesSurface}`} id="day-notes"><DayNotes day={date} notes={day.notes} /></div>
              <div className={`${styles.legacySurface} ${styles.journalSurface}`} id="day-journal"><DayJournal date={date} entry={day.entry} key={date} /></div>
              <AssetField assets={day.assets} />
            </section>
          ) : null}
        </motion.main>
      </AnimatePresence>

      <AnimatePresence>{toast ? <motion.div animate={{ opacity: 1, y: 0, scale: 1 }} className={styles.toast} exit={{ opacity: 0, y: 12, scale: .96 }} initial={{ opacity: 0, y: 24, scale: .94 }} role="status"><Sparkles size={15} />{toast}</motion.div> : null}</AnimatePresence>
    </div>
  );
}

type TimelineItem = { id: string; kind: string; title: string; meta: string; detail: string; tone: string };

function ExecuteField({ inboxId, lists, onCreate, onToggle, pending, tasks, timeZone, timeline }: {
  inboxId: string;
  lists: TaskList[];
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onToggle: (task: PlannerTask) => void;
  pending: boolean;
  tasks: PlannerTask[];
  timeZone: string;
  timeline: TimelineItem[];
}) {
  const active = tasks.filter((task) => task.status !== "completed");
  return <section className={styles.executeLayout} id="day-tasks">
    <div className={styles.fieldIntro}>
      <span>01 / EXECUTION FIELD</span>
      <h2>一次只推进一条<br /><span>可验证的轨迹。</span></h2>
      <p>今日任务来自 Planner v2。完成会同步到首页、日历与任务中心，不再经过 legacy 任务结构。</p>
      <Link href="/kinetic/tasks?view=today">打开任务控制台 <ArrowRight size={15} /></Link>
    </div>

    <section className={styles.taskField}>
      <header><div><small>LIVE TRAJECTORIES</small><h3>今日执行流</h3></div><span>{active.length} ACTIVE</span></header>
      <div className={styles.taskList}>
        {tasks.map((task, index) => <motion.article className={task.status === "completed" ? styles.taskDone : ""} layout key={task.id}>
          <button aria-label={task.status === "completed" ? `恢复 ${task.title}` : `完成 ${task.title}`} disabled={pending} onClick={() => onToggle(task)} type="button">{task.status === "completed" ? <Check size={15} /> : <Circle size={15} />}<i /></button>
          <span className={styles.taskIndex}>{String(index + 1).padStart(2, "0")}</span>
          <div><small>{task.subject_code || lists.find((list) => list.id === task.list_id)?.name || "GENERAL"}</small><h4>{task.title}</h4>{task.notes ? <p>{task.notes}</p> : null}</div>
          <span className={styles.taskTime}><Clock3 size={13} />{taskTime(task, timeZone)}</span>
          <span className={styles.taskDuration}>{task.estimated_minutes}m</span>
          <span className={styles.taskPriority} data-priority={task.priority}>{task.priority === 1 ? "DEEP" : task.priority === 2 ? "FLOW" : "LIGHT"}</span>
        </motion.article>)}
        {!tasks.length ? <div className={styles.emptyTasks}><Orbit size={28} /><h3>今日轨道还是空的</h3><p>从一个 25 分钟内可以验证的动作开始。</p></div> : null}
      </div>
      <form className={styles.quickTask} onSubmit={onCreate}>
        <Plus size={17} />
        <input autoComplete="off" name="title" placeholder="放入一条可以完成的轨迹…" required />
        <select aria-label="任务清单" defaultValue={inboxId} name="listId">{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select>
        <label><span>AT</span><input aria-label="开始时间" name="scheduledStart" type="time" /></label>
        <label><span>MIN</span><input defaultValue="30" min="5" name="estimatedMinutes" step="5" type="number" /></label>
        <button disabled={pending} type="submit">发射 <ArrowUpRight size={14} /></button>
      </form>
    </section>

    <aside className={styles.liveAside}>
      <header><span>LIVE EVIDENCE</span><Flame size={17} /></header>
      {timeline.slice(0, 5).map((item) => <article data-tone={item.tone} key={item.id}><i /><small>{item.kind}</small><strong>{item.title}</strong><span>{item.meta}</span></article>)}
      {!timeline.length ? <div className={styles.emptyAside}><TimerReset size={22} /><p>完成一次学习记录后，证据流会在这里点亮。</p></div> : null}
      <button onClick={() => window.location.hash = "day-journal"} type="button">记录一条学习证据 <ArrowRight size={14} /></button>
    </aside>
  </section>;
}

function EvidenceAside({ date, day, timeline }: { date: string; day: DayData; timeline: TimelineItem[] }) {
  const evidence = timeline.filter((item) => item.kind === "RECALL" || item.kind === "RETRY" || item.kind === "ERROR");
  return <aside className={styles.evidenceAside}>
    <header><span>EVIDENCE LEDGER</span><BookOpenCheck size={18} /></header>
    <div className={styles.evidenceMeter}><i style={{ transform: `scaleX(${Math.min(1, day.reviews.length / 12)})` }} /><strong>{day.reviews.length}</strong><span>次有证据提取</span></div>
    {evidence.slice(0, 6).map((item) => <article key={item.id}><small>{item.kind}</small><strong><RichText text={item.title} /></strong><span>{item.meta}</span></article>)}
    {!evidence.length ? <p>今天还没有复习或错题证据。完成一次无提示提取后，这里会形成记录。</p> : null}
    <Link href={`/kinetic/analytics?day=${date}`}>查看学习分析 <ArrowUpRight size={14} /></Link>
  </aside>;
}

function AssetField({ assets }: { assets: DayData["assets"] }) {
  return <section className={styles.assetField}>
    <header><div><small>ARTIFACTS</small><h3>当日产物</h3></div><Link href="/kinetic/assets">资料库 <ArrowUpRight size={14} /></Link></header>
    <div>{assets.map((asset) => <a href={assetFileUrl(asset.id)} key={asset.id} rel="noopener" target="_blank"><FileText size={18} /><span><strong>{asset.original_name}</strong><small>{asset.folder_path || "根目录"} · {formatSize(asset.size)}</small></span><ArrowUpRight size={14} /></a>)}
      {!assets.length ? <p><Layers3 size={23} />今天还没有归档资料；可使用顶部收纳入口导入文件或截图。</p> : null}
    </div>
  </section>;
}

function taskTime(task: PlannerTask, timeZone: string): string {
  if (task.scheduled_start_at) {
    const zoned = utcToZonedDateTime(task.scheduled_start_at, task.scheduled_timezone || timeZone);
    return zoned.time;
  }
  return task.due_date ? "DUE" : "FLEX";
}

function formatDayTitle(date: string, timeZone: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long", timeZone })
    .format(new Date(`${date}T12:00:00Z`));
}

function formatSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}
