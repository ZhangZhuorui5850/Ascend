"use client";

import {
  AlarmClock, ArrowRight, CalendarClock, CalendarDays, Check, CheckCircle2,
  ChevronRight, Circle, Clock3, Command, Inbox, Layers3, ListFilter, ListPlus,
  Plus, RotateCcw, Search, Sparkles, Target, Trash2, X, Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  createPlannerTaskAction,
  deletePlannerTaskAction,
  restorePlannerTaskAction,
  updatePlannerTaskAction,
} from "@/app/actions/planner-tasks";
import { createTaskListAction } from "@/app/actions/planner-lists";
import type { PlannerTask, TaskList } from "@/lib/planner/types";
import type { PlannerTaskView } from "@/lib/repo/planner-tasks";
import styles from "./KineticTasks.module.css";

type TaskViewDefinition = {
  key: PlannerTaskView;
  label: string;
  short: string;
  icon: typeof Inbox;
};

const TASK_VIEWS: TaskViewDefinition[] = [
  { key: "inbox", label: "引力收件箱", short: "INBOX", icon: Inbox },
  { key: "today", label: "今日轨迹", short: "TODAY", icon: Target },
  { key: "upcoming", label: "未来航线", short: "UPCOMING", icon: CalendarDays },
  { key: "anytime", label: "自由轨道", short: "ANYTIME", icon: Layers3 },
  { key: "overdue", label: "偏离轨迹", short: "OVERDUE", icon: AlarmClock },
  { key: "waiting", label: "等待信号", short: "WAITING", icon: Clock3 },
  { key: "completed", label: "完成档案", short: "ARCHIVE", icon: CheckCircle2 },
  { key: "trash", label: "回收轨道", short: "TRASH", icon: Trash2 },
];

export function KineticTasks({
  initialListId,
  initialTasks,
  initialView,
  lists: initialLists,
  timeZone,
  today,
}: {
  initialListId: string | null;
  initialTasks: PlannerTask[];
  initialView: PlannerTaskView;
  lists: TaskList[];
  timeZone: string;
  today: string;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [lists, setLists] = useState(initialLists);
  const [view, setView] = useState<PlannerTaskView>(initialView);
  const [activeListId, setActiveListId] = useState<string | null>(initialListId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [captureOpen, setCaptureOpen] = useState(true);
  const [newListOpen, setNewListOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toastTimer = useRef<number | null>(null);
  const inboxId = lists.find((list) => list.is_inbox)?.id ?? lists[0]?.id ?? "";

  const counts = useMemo(() => Object.fromEntries(TASK_VIEWS.map((definition) => [
    definition.key,
    filterTasks(tasks, definition.key, null, today, timeZone, inboxId).length,
  ])) as Record<PlannerTaskView, number>, [inboxId, tasks, timeZone, today]);

  const visibleTasks = useMemo(() => {
    const filtered = filterTasks(tasks, view, activeListId, today, timeZone, inboxId);
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return filtered;
    return filtered.filter((task) => `${task.title} ${task.notes} ${task.subject_code ?? ""}`.toLocaleLowerCase("zh-CN").includes(normalized));
  }, [activeListId, inboxId, query, tasks, timeZone, today, view]);

  const selected = visibleTasks.find((task) => task.id === selectedId) ?? visibleTasks[0] ?? null;
  const openCount = tasks.filter((task) => !task.deleted_at && (task.status === "open" || task.status === "waiting")).length;
  const completedCount = tasks.filter((task) => !task.deleted_at && task.status === "completed").length;
  const scheduledMinutes = tasks.filter((task) => !task.deleted_at && task.status === "open" && task.scheduled_start_at)
    .reduce((sum, task) => sum + task.estimated_minutes, 0);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const selectView = (nextView: PlannerTaskView) => {
    setView(nextView);
    setActiveListId(null);
    setSelectedId(null);
    router.replace(`/kinetic/tasks?view=${nextView}`, { scroll: false });
  };

  const selectList = (listId: string) => {
    setActiveListId(listId);
    setView("all");
    setSelectedId(null);
    router.replace(`/kinetic/tasks?list=${encodeURIComponent(listId)}`, { scroll: false });
  };

  const toggleTask = (task: PlannerTask) => {
    const nextStatus = task.status === "completed" ? "open" : "completed";
    setTasks((items) => items.map((item) => item.id === task.id ? { ...item, status: nextStatus } : item));
    startTransition(async () => {
      const result = await updatePlannerTaskAction({ id: task.id, expectedVersion: task.version, status: nextStatus });
      if (!result.ok || !result.entity) {
        setTasks((items) => items.map((item) => item.id === task.id ? task : item));
        notify(result.error || "任务状态更新失败，轨迹已恢复");
        return;
      }
      setTasks((items) => items.map((item) => item.id === task.id ? result.entity! : item));
      notify(nextStatus === "completed" ? "任务轨迹已闭合" : "任务重新进入运行场");
    });
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button")) return;
      if (!visibleTasks.length) return;
      const currentIndex = Math.max(0, visibleTasks.findIndex((task) => task.id === selected?.id));
      if (event.key.toLowerCase() === "j" || event.key.toLowerCase() === "k") {
        event.preventDefault();
        const delta = event.key.toLowerCase() === "j" ? 1 : -1;
        const next = visibleTasks[Math.max(0, Math.min(visibleTasks.length - 1, currentIndex + delta))];
        setSelectedId(next.id);
        document.querySelector<HTMLElement>(`[data-kinetic-task-id="${next.id}"]`)?.focus({ preventScroll: true });
      }
      if (event.code === "Space" && selected) {
        event.preventDefault();
        toggleTask(selected);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const createTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("title") ?? "").trim();
    const listId = String(formData.get("listId") ?? inboxId);
    if (!title || !listId) return;
    const dueDate = String(formData.get("dueDate") ?? "");
    const scheduledDate = String(formData.get("scheduledDate") ?? "");
    const scheduledStart = String(formData.get("scheduledStart") ?? "");
    const priority = Number(formData.get("priority") ?? 2) as 1 | 2 | 3;
    const estimatedMinutes = Number(formData.get("estimatedMinutes") ?? 30);
    const temporaryId = `draft:${crypto.randomUUID()}`;
    const draft = draftTask({ temporaryId, title, listId, dueDate, scheduledDate, scheduledStart, priority, estimatedMinutes, timeZone });
    setTasks((items) => [draft, ...items]);
    setSelectedId(temporaryId);
    form.reset();
    startTransition(async () => {
      const result = await createPlannerTaskAction({
        clientMutationId: crypto.randomUUID(),
        listId,
        title,
        priority,
        dueDate: dueDate || null,
        scheduledDate: scheduledDate || null,
        scheduledStart: scheduledStart || null,
        estimatedMinutes,
      });
      if (!result.ok || !result.entity) {
        setTasks((items) => items.filter((item) => item.id !== temporaryId));
        notify(result.error || "任务创建失败，草稿已撤回");
        return;
      }
      setTasks((items) => items.map((item) => item.id === temporaryId ? result.entity! : item));
      setSelectedId(result.entity.id);
      notify("新任务已进入轨道");
    });
  };

  const saveTask = (event: FormEvent<HTMLFormElement>, task: PlannerTask) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const scheduledDate = String(formData.get("scheduledDate") ?? "");
    const scheduledStart = String(formData.get("scheduledStart") ?? "");
    startTransition(async () => {
      const result = await updatePlannerTaskAction({
        id: task.id,
        expectedVersion: task.version,
        title: String(formData.get("title") ?? task.title),
        notes: String(formData.get("notes") ?? ""),
        listId: String(formData.get("listId") ?? task.list_id),
        priority: Number(formData.get("priority") ?? task.priority) as 1 | 2 | 3,
        dueDate: String(formData.get("dueDate") ?? "") || null,
        scheduledDate: scheduledDate || null,
        scheduledStart: scheduledStart || null,
        estimatedMinutes: Number(formData.get("estimatedMinutes") ?? task.estimated_minutes),
      });
      if (!result.ok || !result.entity) {
        notify(result.conflict ? "另一台设备已改变任务，请刷新后重试" : result.error || "任务保存失败");
        return;
      }
      setTasks((items) => items.map((item) => item.id === task.id ? result.entity! : item));
      notify("任务参数已同步");
    });
  };

  const changeWaiting = (task: PlannerTask) => {
    const status = task.status === "waiting" ? "open" : "waiting";
    startTransition(async () => {
      const result = await updatePlannerTaskAction({ id: task.id, expectedVersion: task.version, status });
      if (!result.ok || !result.entity) { notify(result.error || "状态更新失败"); return; }
      setTasks((items) => items.map((item) => item.id === task.id ? result.entity! : item));
      notify(status === "waiting" ? "任务已转入等待信号" : "任务已恢复运行");
    });
  };

  const deleteTask = (task: PlannerTask) => {
    const deletedAt = new Date().toISOString();
    setTasks((items) => items.map((item) => item.id === task.id ? { ...item, deleted_at: deletedAt } : item));
    startTransition(async () => {
      const result = await deletePlannerTaskAction({ id: task.id, expectedVersion: task.version, clientMutationId: crypto.randomUUID() });
      if (!result.ok || !result.entity) {
        setTasks((items) => items.map((item) => item.id === task.id ? task : item));
        notify(result.error || "移入回收轨道失败");
        return;
      }
      setTasks((items) => items.map((item) => item.id === task.id ? result.entity! : item));
      setSelectedId(null);
      notify("任务已移入回收轨道");
    });
  };

  const restoreTask = (task: PlannerTask) => {
    startTransition(async () => {
      const result = await restorePlannerTaskAction({ id: task.id, expectedVersion: task.version, clientMutationId: crypto.randomUUID() });
      if (!result.ok || !result.entity) { notify(result.error || "任务恢复失败"); return; }
      setTasks((items) => items.map((item) => item.id === task.id ? result.entity! : item));
      setSelectedId(null);
      notify("任务已恢复到原轨道");
    });
  };

  const createList = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createTaskListAction({ name, colorToken: "summit-blue", icon: "Orbit" });
      if (!result.ok || !result.entity) { notify(result.error || "清单创建失败"); return; }
      setLists((items) => [...items, result.entity!]);
      setActiveListId(result.entity.id);
      setView("all");
      setNewListOpen(false);
      form.reset();
      notify("新清单已经接入任务场");
    });
  };

  const activeTitle = activeListId
    ? lists.find((list) => list.id === activeListId)?.name ?? "任务清单"
    : TASK_VIEWS.find((item) => item.key === view)?.label ?? "全部任务";
  const selectedSchedule = selected ? scheduleParts(selected.scheduled_start_at, timeZone) : null;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div><span>MISSION CONTROL / PLANNER V2</span><h1>让任务形成<span>轨迹，</span><br />而不是堆积。</h1><p>收集、澄清、排期、执行。每一次操作都直接写入真实 Planner v2，旧任务页面继续并行保留。</p></div>
        <div className={styles.heroTelemetry}>
          <div className={styles.telemetryCore} style={{ "--task-ratio": `${Math.min(100, Math.round(completedCount / Math.max(1, completedCount + openCount) * 100))}%` } as React.CSSProperties}><small>FIELD LOAD</small><strong>{openCount}</strong><span>OPEN VECTORS</span></div>
          <dl><div><dt>完成档案</dt><dd>{completedCount}</dd></div><div><dt>已排时间</dt><dd>{scheduledMinutes}<small>m</small></dd></div><div><dt>清单节点</dt><dd>{lists.length}</dd></div></dl>
        </div>
      </header>

      <section className={styles.controlDeck}>
        <button className={styles.captureToggle} onClick={() => setCaptureOpen((open) => !open)} type="button"><Plus size={17} /><span>{captureOpen ? "收起发射台" : "发射新任务"}</span><i /></button>
        <label className={styles.search}><Search size={15} /><input aria-label="搜索当前任务轨迹" onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务、笔记、科目……" value={query} />{query ? <button aria-label="清空搜索" onClick={() => setQuery("")} type="button"><X size={14} /></button> : <kbd>⌘F</kbd>}</label>
        <div className={styles.keyboardHint}><Command size={14} /><span>J / K 导航</span><i /><span>SPACE 完成</span></div>
      </section>

      {captureOpen ? <form className={styles.capture} onSubmit={createTask}>
        <div className={styles.captureTitle}><span><Zap size={16} />QUICK LAUNCH</span><input aria-label="新任务标题" autoComplete="off" name="title" placeholder="输入一个可以执行的动作……" required /></div>
        <div className={styles.captureFields}>
          <label><span>清单</span><select aria-label="新任务清单" defaultValue={activeListId ?? inboxId} name="listId">{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
          <label><span>到期</span><input aria-label="新任务到期日期" name="dueDate" type="date" /></label>
          <label><span>排期日</span><input aria-label="新任务排期日期" name="scheduledDate" type="date" /></label>
          <label><span>开始</span><input aria-label="新任务开始时间" name="scheduledStart" type="time" /></label>
          <label><span>强度</span><select aria-label="新任务优先级" defaultValue="2" name="priority"><option value="1">深潜</option><option value="2">稳定</option><option value="3">轻量</option></select></label>
          <label><span>分钟</span><input aria-label="新任务预计分钟" defaultValue="30" max="1440" min="5" name="estimatedMinutes" step="5" type="number" /></label>
          <button disabled={pending} type="submit"><span>注入任务场</span><ArrowRight size={17} /></button>
        </div>
      </form> : null}

      <div className={styles.workspace}>
        <aside className={styles.navigator}>
          <header><span>ORBIT FILTERS</span><ListFilter size={15} /></header>
          <nav aria-label="任务视图">
            {TASK_VIEWS.map((definition) => { const Icon = definition.icon; return <button aria-current={!activeListId && view === definition.key ? "page" : undefined} key={definition.key} onClick={() => selectView(definition.key)} type="button"><i><Icon size={15} /></i><span><small>{definition.short}</small>{definition.label}</span><b>{counts[definition.key] ?? 0}</b></button>; })}
          </nav>
          <div className={styles.listHeader}><span>MISSION LISTS</span><button aria-label="新建任务清单" onClick={() => setNewListOpen((open) => !open)} type="button"><ListPlus size={14} /></button></div>
          {newListOpen ? <form className={styles.newList} onSubmit={createList}><input aria-label="清单名称" autoFocus name="name" placeholder="新清单名称" required /><button disabled={pending} type="submit"><Check size={14} /></button></form> : null}
          <div className={styles.listNav}>{lists.map((list, index) => <button aria-current={activeListId === list.id ? "page" : undefined} key={list.id} onClick={() => selectList(list.id)} type="button"><i style={{ "--list-index": index } as React.CSSProperties} /><span>{list.name}</span><b>{tasks.filter((task) => !task.deleted_at && task.list_id === list.id && task.status !== "completed").length}</b></button>)}</div>
        </aside>

        <main className={styles.taskField}>
          <header><div><span>{activeListId ? "MISSION LIST" : "ACTIVE ORBIT"}</span><h2>{activeTitle}</h2></div><p>{visibleTasks.length} 条信号</p></header>
          <div className={styles.taskStream}>
            {visibleTasks.map((task, index) => {
              const list = lists.find((item) => item.id === task.list_id);
              const localSchedule = scheduleParts(task.scheduled_start_at, timeZone);
              const isSelected = selected?.id === task.id;
              return <article className={`${styles.taskRow} ${task.status === "completed" ? styles.taskCompleted : ""} ${isSelected ? styles.taskSelected : ""}`} key={task.id} style={{ "--row-index": index } as React.CSSProperties}>
                <button aria-label={task.status === "completed" ? `恢复 ${task.title}` : `完成 ${task.title}`} className={styles.taskCheck} disabled={pending || task.id.startsWith("draft:")} onClick={() => toggleTask(task)} type="button">{task.status === "completed" ? <Check size={15} /> : <Circle size={15} />}<i /></button>
                <button className={styles.taskOpen} data-kinetic-task-id={task.id} onClick={() => setSelectedId(task.id)} type="button"><span><small>{list?.name ?? "TASK"} · {priorityLabel(task.priority)}</small><strong>{task.title}</strong></span><p>{task.notes || task.subject_code || "没有补充说明"}</p></button>
                <div className={styles.taskTime}>{localSchedule ? <><CalendarClock size={13} /><span>{localSchedule.date === today ? "今天" : localSchedule.date}<b>{localSchedule.time}</b></span></> : task.due_date ? <><CalendarDays size={13} /><span>到期<b>{task.due_date}</b></span></> : <><Sparkles size={13} /><span>自由<b>{task.estimated_minutes}m</b></span></>}</div>
                <span className={styles.taskState} data-state={task.status}>{statusLabel(task.status)}</span>
                <button aria-label={`查看 ${task.title} 详情`} className={styles.taskArrow} onClick={() => setSelectedId(task.id)} type="button"><ChevronRight size={16} /></button>
              </article>;
            })}
            {!visibleTasks.length ? <div className={styles.empty}><div><i /><i /><i /><Sparkles size={24} /></div><h3>这条轨道现在很安静</h3><p>{query ? "没有匹配当前搜索的任务。" : "从上方发射台注入一个明确、可执行的动作。"}</p><button onClick={() => setCaptureOpen(true)} type="button"><Plus size={15} />建立任务</button></div> : null}
          </div>
        </main>

        <aside className={styles.inspector}>
          {selected ? <form key={`${selected.id}:${selected.version}`} onSubmit={(event) => saveTask(event, selected)}>
            <header><span>VECTOR INSPECTOR</span><button aria-label="关闭任务详情" onClick={() => setSelectedId(null)} type="button"><X size={15} /></button></header>
            <div className={styles.inspectorIndex}><span>{String(Math.max(0, visibleTasks.findIndex((task) => task.id === selected.id)) + 1).padStart(2, "0")}</span><i /></div>
            <label className={styles.titleField}><span>任务</span><textarea aria-label="任务标题" defaultValue={selected.title} name="title" required rows={2} /></label>
            <label><span>说明</span><textarea aria-label="任务说明" defaultValue={selected.notes} name="notes" placeholder="背景、完成标准、输出……" rows={4} /></label>
            <div className={styles.inspectorGrid}>
              <label><span>清单</span><select aria-label="任务清单" defaultValue={selected.list_id} name="listId">{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
              <label><span>强度</span><select aria-label="任务优先级" defaultValue={String(selected.priority)} name="priority"><option value="1">深潜</option><option value="2">稳定</option><option value="3">轻量</option></select></label>
              <label><span>到期</span><input aria-label="任务到期日期" defaultValue={selected.due_date ?? ""} name="dueDate" type="date" /></label>
              <label><span>预计分钟</span><input aria-label="任务预计分钟" defaultValue={selected.estimated_minutes} max="1440" min="5" name="estimatedMinutes" step="5" type="number" /></label>
              <label><span>排期日</span><input aria-label="任务排期日期" defaultValue={selectedSchedule?.date ?? ""} name="scheduledDate" type="date" /></label>
              <label><span>开始时间</span><input aria-label="任务开始时间" defaultValue={selectedSchedule?.time ?? ""} name="scheduledStart" type="time" /></label>
            </div>
            <div className={styles.inspectorActions}>
              {selected.deleted_at ? <button className={styles.restoreAction} disabled={pending} onClick={() => restoreTask(selected)} type="button"><RotateCcw size={15} />恢复任务</button> : <><button disabled={pending} type="submit"><Zap size={15} />同步参数</button><button className={styles.waitAction} disabled={pending} onClick={() => changeWaiting(selected)} type="button"><Clock3 size={15} />{selected.status === "waiting" ? "恢复运行" : "等待信号"}</button><button aria-label="移入回收轨道" className={styles.deleteAction} disabled={pending} onClick={() => deleteTask(selected)} type="button"><Trash2 size={15} /></button></>}
            </div>
            <footer><span>VERSION {selected.version}</span><span>{selected.series_id ? "REPEATING VECTOR" : "SINGLE VECTOR"}</span></footer>
          </form> : <div className={styles.inspectorEmpty}><div><i /><i /><Target size={24} /></div><span>VECTOR INSPECTOR</span><h3>选择一条任务轨迹</h3><p>在这里调整到期、排期、强度、清单和预计时长。</p></div>}
        </aside>
      </div>

      {toast ? <div className={styles.toast} role="status"><Sparkles size={15} />{toast}</div> : null}
    </div>
  );
}

function filterTasks(tasks: PlannerTask[], view: PlannerTaskView, listId: string | null, today: string, timeZone: string, inboxId: string) {
  return tasks.filter((task) => {
    if (listId && task.list_id !== listId) return false;
    if (view === "trash") return Boolean(task.deleted_at);
    if (task.deleted_at) return false;
    if (view === "completed") return task.status === "completed";
    if (view === "waiting") return task.status === "waiting";
    if (view === "all") return true;
    if (task.status === "completed" || task.status === "canceled") return false;
    const scheduledDate = scheduleParts(task.scheduled_start_at, timeZone)?.date ?? null;
    if (view === "inbox") return task.list_id === inboxId;
    if (view === "today") return scheduledDate === today || task.due_date === today;
    if (view === "upcoming") return Boolean((scheduledDate && scheduledDate > today) || (task.due_date && task.due_date > today));
    if (view === "overdue") return Boolean((scheduledDate && scheduledDate < today) || (task.due_date && task.due_date < today));
    if (view === "anytime") return !scheduledDate && !task.due_date;
    return true;
  }).sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (b.status === "completed" && a.status !== "completed") return -1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (a.scheduled_start_at ?? a.due_date ?? a.updated_at).localeCompare(b.scheduled_start_at ?? b.due_date ?? b.updated_at);
  });
}

function scheduleParts(instant: string | null, timeZone: string): { date: string; time: string } | null {
  if (!instant) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}

function draftTask(input: { temporaryId: string; title: string; listId: string; dueDate: string; scheduledDate: string; scheduledStart: string; priority: 1 | 2 | 3; estimatedMinutes: number; timeZone: string }): PlannerTask {
  const now = new Date().toISOString();
  const scheduled = input.scheduledDate && input.scheduledStart ? new Date(`${input.scheduledDate}T${input.scheduledStart}:00`).toISOString() : null;
  return {
    id: input.temporaryId, workspace_id: "", list_id: input.listId, parent_task_id: null, depth: 0,
    title: input.title, notes: "", subject_code: null, status: "open", priority: input.priority,
    due_date: input.dueDate || null, due_at: null, due_timezone: null,
    scheduled_start_at: scheduled, scheduled_end_at: scheduled ? new Date(Date.parse(scheduled) + input.estimatedMinutes * 60_000).toISOString() : null,
    scheduled_timezone: scheduled ? input.timeZone : null, scheduled_all_day: 0, estimated_minutes: input.estimatedMinutes,
    series_id: null, occurrence_key: null, sort_order: 0, deleted_at: null, completed_at: null, canceled_at: null,
    version: 0, legacy_day_task_id: null, created_at: now, updated_at: now,
  };
}

function priorityLabel(priority: 1 | 2 | 3) { return priority === 1 ? "DEEP" : priority === 2 ? "STEADY" : "LIGHT"; }
function statusLabel(status: PlannerTask["status"]) { return status === "open" ? "运行中" : status === "waiting" ? "等待" : status === "completed" ? "完成" : "取消"; }
