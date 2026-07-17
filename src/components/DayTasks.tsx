"use client";

import { startTransition, useCallback, useEffect, useLayoutEffect, useOptimistic, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Clock3, Plus, Trash2 } from "lucide-react";
import { addTaskAction, carryOverTasksAction, deleteTaskAction, toggleTaskAction, updateTaskAction } from "@/app/actions/planner";
import { sortDayTasks } from "@/components/day-tasks-sort";
import { EmptyState } from "@/components/EmptyState";
import { useFeedback } from "@/components/FeedbackProvider";
import type { SubjectRow } from "@/lib/repo/knowledge";
import type { DayTask } from "@/lib/repo/planner";

type ClientKey = string | number;
type OptimisticTask = DayTask & { clientKey?: ClientKey; pending?: boolean };
type ExitingTask = { actionDone: boolean; animationDone: boolean; clientKey: ClientKey; task: OptimisticTask };

const PRESENCE_EVENT_GRACE_MS = 50;

export function DayTasks({ day, today, tasks, subjects, carryFrom, carryCount = 0, yesterdayPlan = "" }: {
  day: string;
  today: string;
  tasks: DayTask[];
  subjects: SubjectRow[];
  carryFrom?: string;
  carryCount?: number;
  yesterdayPlan?: string;
}) {
  const { notify } = useFeedback();
  const [title, setTitle] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [priority, setPriority] = useState(2);
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [scheduledStart, setScheduledStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [planAdded, setPlanAdded] = useState(false);
  const [completionOverrides, setCompletionOverrides] = useState<Record<number, boolean>>({});
  const [enteringClientKeys, setEnteringClientKeys] = useState<Set<ClientKey>>(() => new Set());
  const [exitingTasks, setExitingTasks] = useState<ExitingTask[]>([]);
  const tempIdRef = useRef(-1);
  const draftOrderRef = useRef(maxSortOrder(tasks) + 1);
  const pendingDraftKeysRef = useRef(new Set<ClientKey>());
  const taskClientKeysRef = useRef(new Map<number, ClientKey>());
  const [optimisticTasks, addOptimisticTask] = useOptimistic(
    tasks as OptimisticTask[],
    (state: OptimisticTask[], task: OptimisticTask) => sortDayTasks([...state, task]),
  );

  const canonicalDisplayTasks = optimisticTasks.map((task) => completionOverrides[task.id] === undefined
    ? task
    : { ...task, done: completionOverrides[task.id] ? 1 : 0 });
  const exitingById = new Map(exitingTasks.map((entry) => [entry.task.id, entry]));
  const canonicalIds = new Set(canonicalDisplayTasks.map((task) => task.id));
  const displayTasks = sortDayTasks([
    ...canonicalDisplayTasks.filter((task) => !exitingById.get(task.id)?.animationDone),
    ...exitingTasks
      .filter((entry) => !entry.animationDone && !canonicalIds.has(entry.task.id))
      .map((entry) => entry.task),
  ]);
  const done = displayTasks.filter((task) => task.done).length;
  const openCount = displayTasks.length - done;
  const isPast = day < today;
  const isToday = day === today;
  const planText = yesterdayPlan.trim();
  const showPlan = isToday && !planAdded && planText.length > 0 && !displayTasks.some((task) => task.title === planText);
  const showCarry = isToday && carryFrom && carryCount > 0;

  useEffect(() => {
    if (!pendingDraftKeysRef.current.size) draftOrderRef.current = maxSortOrder(tasks) + 1;
  }, [tasks]);

  const finishEntering = useCallback((clientKey: ClientKey) => {
    setEnteringClientKeys((current) => {
      if (!current.has(clientKey)) return current;
      const next = new Set(current);
      next.delete(clientKey);
      return next;
    });
  }, []);

  const finishExiting = useCallback((id: number) => {
    setExitingTasks((current) => current.flatMap((entry) => {
      if (entry.task.id !== id) return [entry];
      if (entry.actionDone) return [];
      return [{ ...entry, animationDone: true }];
    }));
  }, []);

  function buildDraftTask(input: {
    title: string;
    subjectCode: string;
    priority: number;
    estimatedMinutes: number;
    scheduledStart: string | null;
  }): OptimisticTask {
    const id = tempIdRef.current--;
    return {
      id,
      day,
      title: input.title,
      subject_code: input.subjectCode || null,
      done: 0,
      sort_order: draftOrderRef.current++,
      priority: input.priority === 1 || input.priority === 3 ? input.priority : 2,
      estimated_minutes: input.estimatedMinutes,
      scheduled_start: input.scheduledStart,
      notes: "",
      clientKey: `draft-${Math.abs(id)}`,
      pending: true,
    };
  }

  function beginDraft(draft: OptimisticTask) {
    pendingDraftKeysRef.current.add(draft.clientKey!);
    setEnteringClientKeys((current) => new Set(current).add(draft.clientKey!));
  }

  function settleDraft(draft: OptimisticTask, task?: DayTask) {
    pendingDraftKeysRef.current.delete(draft.clientKey!);
    if (task) {
      taskClientKeysRef.current.set(task.id, draft.clientKey!);
      if (!pendingDraftKeysRef.current.size) draftOrderRef.current = task.sort_order + 1;
    }
  }

  function adoptPlan() {
    if (busy || !planText) return;
    const draft = buildDraftTask({ title: planText, subjectCode: "", priority: 2, estimatedMinutes: 30, scheduledStart: null });
    beginDraft(draft);
    setBusy(true);
    startTransition(async () => {
      addOptimisticTask(draft);
      try {
        const result = await addTaskAction({ day, title: planText, subjectCode: "" });
        settleDraft(draft, result.task);
        if (result.ok) setPlanAdded(true);
        report(result);
      } catch {
        settleDraft(draft);
        report({ ok: false, error: "网络异常，操作未保存" });
      } finally {
        setBusy(false);
      }
    });
  }

  function report(result: { ok: boolean; error?: string }) {
    if (!result.ok) notify(result.error || "操作失败", "error");
  }

  function runRefreshAction(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      try {
        report(await action());
      } catch {
        report({ ok: false, error: "网络异常，操作未保存" });
      }
    });
  }

  function setTaskCompletion(id: number, done: boolean) {
    const serverDone = Boolean(tasks.find((task) => task.id === id)?.done);
    setCompletionOverrides((current) => {
      const next = { ...current };
      if (done === serverDone) delete next[id];
      else next[id] = done;
      return next;
    });
  }

  function add() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const draft = buildDraftTask({ title: trimmed, subjectCode, priority, estimatedMinutes, scheduledStart: scheduledStart || null });
    beginDraft(draft);
    setTitle("");
    startTransition(async () => {
      addOptimisticTask(draft);
      try {
        const result = await addTaskAction({ day, title: trimmed, subjectCode, priority, estimatedMinutes, scheduledStart: scheduledStart || null });
        settleDraft(draft, result.task);
        if (!result.ok) setTitle((current) => current || trimmed);
        report(result);
      } catch {
        settleDraft(draft);
        setTitle((current) => current || trimmed);
        report({ ok: false, error: "网络异常，操作未保存" });
      }
    });
  }

  function remove(task: OptimisticTask) {
    if (task.pending || exitingById.has(task.id)) return;
    const clientKey = task.clientKey ?? taskClientKeysRef.current.get(task.id) ?? task.id;
    setExitingTasks((current) => [...current, { actionDone: false, animationDone: false, clientKey, task }]);
    startTransition(async () => {
      try {
        const result = await deleteTaskAction({ id: task.id, day });
        setExitingTasks((current) => current.flatMap((entry) => {
          if (entry.task.id !== task.id) return [entry];
          if (!result.ok || entry.animationDone) return [];
          return [{ ...entry, actionDone: true }];
        }));
        report(result);
      } catch {
        setExitingTasks((current) => current.filter((entry) => entry.task.id !== task.id));
        report({ ok: false, error: "网络异常，操作未保存" });
      }
    });
  }

  return (
    <section className="card dayTasks" aria-label="任务清单">
      <div className="sectionTitle">
        <h2>今日任务</h2>
        <span className="sectionHint">
          {displayTasks.length ? `${done}/${displayTasks.length} 完成` : "列出今天要完成的事"}
        </span>
      </div>

      {showPlan ? (
        <div className="dayPlanEcho">
          <p>昨晚你说，今天第一件事：<strong>「{planText}」</strong></p>
          <button className="secondaryButton" disabled={busy} onClick={() => adoptPlan()} type="button">
            <Plus size={14} />
            转为任务
          </button>
        </div>
      ) : null}

      {showCarry ? (
        <div className="dayCarryHint">
          <p>昨天还剩 <strong>{carryCount}</strong> 条未完成任务。</p>
          <button
            className="secondaryButton"
            onClick={() => runRefreshAction(() => carryOverTasksAction({ fromDay: carryFrom!, toDay: day }))}
            type="button"
          >
            <ArrowRight size={14} />
            顺延到今天
          </button>
        </div>
      ) : null}

      {displayTasks.length ? (
        <div className="taskProgress" role="img" aria-label={`完成 ${done}/${displayTasks.length}`}>
          <span style={{ transform: `scaleX(${done / displayTasks.length})` }} />
        </div>
      ) : null}

      <div className="taskList">
        {displayTasks.map((task) => {
          const exit = exitingById.get(task.id);
          const clientKey = task.clientKey ?? exit?.clientKey ?? taskClientKeysRef.current.get(task.id) ?? task.id;
          return (
            <TaskLine
              clientKey={clientKey}
              day={day}
              entering={enteringClientKeys.has(clientKey)}
              key={clientKey}
              leaving={Boolean(exit)}
              onCompletionChange={setTaskCompletion}
              onEnterComplete={finishEntering}
              onExitComplete={finishExiting}
              onRemove={remove}
              report={report}
              subjects={subjects}
              task={task}
            />
          );
        })}
        {!displayTasks.length ? <EmptyState seal="空" text="还没有任务。加上第一条，例如「特征值 20 题」。" /> : null}
      </div>

      <div className="taskCreate taskComposer">
        <input
          className="taskComposerTitle"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
          placeholder="添加任务，回车确认"
        />
        <select aria-label="科目标签" onChange={(event) => setSubjectCode(event.target.value)} value={subjectCode}>
          <option value="">无科目</option>
          {subjects.map((subject) => (
            <option key={subject.code} value={subject.code}>
              {subject.code} · {subject.name}
            </option>
          ))}
        </select>
        <label className="taskComposerField"><span>优先级</span><select aria-label="任务优先级" onChange={(event) => setPriority(Number(event.target.value))} value={priority}>
          <option value={1}>P1 · 关键</option>
          <option value={2}>P2 · 常规</option>
          <option value={3}>P3 · 弹性</option>
        </select></label>
        <label className="taskComposerField"><span>预计</span><select aria-label="预计时长" onChange={(event) => setEstimatedMinutes(Number(event.target.value))} value={estimatedMinutes}>
          {[15, 25, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} 分钟</option>)}
        </select></label>
        <label className="taskComposerField"><span>开始</span><input aria-label="计划开始时间" onChange={(event) => setScheduledStart(event.target.value)} type="time" value={scheduledStart} /></label>
        <button aria-label="添加任务" className="taskComposerSubmit" disabled={!title.trim()} onClick={() => add()} type="button">
          <Plus size={15} />
          <span>加入计划</span>
        </button>
      </div>

      {isPast && openCount ? (
        <button
          className="secondaryButton carryOver"
          onClick={() => runRefreshAction(() => carryOverTasksAction({ fromDay: day, toDay: today }))}
          type="button"
        >
          <ArrowRight size={14} />
          把 {openCount} 个未完成任务顺延到今天
        </button>
      ) : null}
    </section>
  );
}

function TaskLine({ task, clientKey, day, subjects, report, entering, leaving, onCompletionChange, onEnterComplete, onExitComplete, onRemove }: {
  task: OptimisticTask;
  clientKey: ClientKey;
  day: string;
  subjects: SubjectRow[];
  report: (result: { ok: boolean; error?: string }) => void;
  entering: boolean;
  leaving: boolean;
  onCompletionChange: (id: number, done: boolean) => void;
  onEnterComplete: (clientKey: ClientKey) => void;
  onExitComplete: (id: number) => void;
  onRemove: (task: OptimisticTask) => void;
}) {
  const [pending, setPending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lineRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const done = Boolean(task.done);
  const isDraft = Boolean(task.pending);

  useLayoutEffect(() => {
    resizeTitle(titleRef.current);
  }, [task.title]);

  useEffect(() => {
    if (!entering && !leaving) return;
    const duration = maxAnimationDurationMs(lineRef.current);
    const timeout = window.setTimeout(
      () => leaving ? onExitComplete(task.id) : onEnterComplete(clientKey),
      duration + PRESENCE_EVENT_GRACE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [clientKey, entering, leaving, onEnterComplete, onExitComplete, task.id]);

  function update(input: Parameters<typeof updateTaskAction>[0]) {
    startTransition(async () => {
      try {
        report(await updateTaskAction(input));
      } catch {
        report({ ok: false, error: "网络异常，操作未保存" });
      }
    });
  }

  async function toggle() {
    if (pending || isDraft) return;
    const nextDone = !done;
    setPending(true);
    onCompletionChange(task.id, nextDone);
    try {
      const result = await toggleTaskAction({ id: task.id, day, done: nextDone });
      if (!result.ok) onCompletionChange(task.id, done);
      report(result);
    } catch {
      onCompletionChange(task.id, done);
      report({ ok: false, error: "网络异常，操作未保存" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={`${done ? "taskLine done" : "taskLine"} priority${task.priority}`}
      data-entering={entering ? "" : undefined}
      data-leaving={leaving ? "" : undefined}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (leaving && event.animationName === "taskFallOut") onExitComplete(task.id);
        else if (entering && event.animationName === "taskRiseIn") onEnterComplete(clientKey);
      }}
      ref={lineRef}
    >
      <div className="taskLineMain">
      <button
        aria-checked={done}
        aria-label={done ? "标记为未完成" : "标记为完成"}
        className="taskCheck"
        disabled={pending || isDraft}
        onClick={() => void toggle()}
        role="checkbox"
        type="button"
      >
        {done ? <Check size={13} /> : null}
      </button>
      <textarea
        aria-label="任务内容"
        className="taskTitle"
        defaultValue={task.title}
        key={`${task.id}-${task.title}`}
        onInput={(event) => resizeTitle(event.currentTarget)}
        onBlur={(event) => {
          const next = event.target.value.trim();
          if (!isDraft && next && next !== task.title) {
            update({ id: task.id, day, title: next });
          }
        }}
        readOnly={isDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        ref={titleRef}
        rows={1}
      />
      <span className={`taskPriority priority${task.priority}`}>P{task.priority}</span>
      <span className="taskTiming"><Clock3 size={12} />{task.scheduled_start || "待排"} · {task.estimated_minutes}m</span>
      <select
        aria-label="科目标签"
        className={task.subject_code ? "taskSubject tagged" : "taskSubject"}
        disabled={isDraft}
        onChange={(event) => update({ id: task.id, day, subjectCode: event.target.value || null })}
        value={task.subject_code || ""}
      >
        <option value="">无科目</option>
        {subjects.map((subject) => (
          <option key={subject.code} value={subject.code}>
            {subject.code} · {subject.name}
          </option>
        ))}
      </select>
      <button aria-expanded={expanded} aria-label="编辑任务详情" className="taskExpand" disabled={isDraft} onClick={() => setExpanded((value) => !value)} type="button"><ChevronDown size={14} /></button>
      <button
        aria-label="删除任务"
        className="iconDanger"
        disabled={isDraft || leaving}
        onClick={() => onRemove(task)}
        type="button"
      >
        <Trash2 size={13} />
      </button>
      </div>
      {expanded ? <div className="taskLineDetails">
        <label><span>优先级</span><select defaultValue={task.priority} onChange={(event) => update({ id: task.id, day, priority: Number(event.target.value) })}>
          <option value={1}>P1 · 关键</option><option value={2}>P2 · 常规</option><option value={3}>P3 · 弹性</option>
        </select></label>
        <label><span>开始时间</span><input defaultValue={task.scheduled_start || ""} onBlur={(event) => update({ id: task.id, day, scheduledStart: event.target.value || null })} type="time" /></label>
        <label><span>预计分钟</span><input defaultValue={task.estimated_minutes} max={480} min={5} onBlur={(event) => update({ id: task.id, day, estimatedMinutes: Number(event.target.value) })} step={5} type="number" /></label>
        <label className="taskNotes"><span>执行备注</span><textarea defaultValue={task.notes} maxLength={500} onBlur={(event) => {
          if (event.target.value !== task.notes) update({ id: task.id, day, notes: event.target.value });
        }} placeholder="写下完成标准、资料位置或训练范围" rows={2} /></label>
      </div> : null}
    </div>
  );
}

function resizeTitle(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function maxSortOrder(tasks: DayTask[]): number {
  return tasks.reduce((max, task) => Math.max(max, task.sort_order), 0);
}

function maxAnimationDurationMs(element: HTMLElement | null): number {
  if (!element) return 0;
  return window.getComputedStyle(element).animationDuration.split(",").reduce((max, duration) => {
    const value = Number.parseFloat(duration);
    const milliseconds = duration.trim().endsWith("ms") ? value : value * 1000;
    return Number.isFinite(milliseconds) ? Math.max(max, milliseconds) : max;
  }, 0);
}
