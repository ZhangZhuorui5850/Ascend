"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Clock3, Plus, Trash2 } from "lucide-react";
import { addTaskAction, carryOverTasksAction, deleteTaskAction, toggleTaskAction, updateTaskAction } from "@/app/actions/planner";
import { EmptyState } from "@/components/EmptyState";
import { useFeedback } from "@/components/FeedbackProvider";
import { useOptimisticValue } from "@/components/useOptimisticValue";
import type { SubjectRow } from "@/lib/repo/knowledge";
import type { DayTask } from "@/lib/repo/planner";

export function DayTasks({ day, today, tasks, subjects, carryFrom, carryCount = 0, yesterdayPlan = "" }: {
  day: string;
  today: string;
  tasks: DayTask[];
  subjects: SubjectRow[];
  carryFrom?: string;
  carryCount?: number;
  yesterdayPlan?: string;
}) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [title, setTitle] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [priority, setPriority] = useState(2);
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [scheduledStart, setScheduledStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [planAdded, setPlanAdded] = useState(false);

  const done = tasks.filter((task) => task.done).length;
  const openCount = tasks.length - done;
  const isPast = day < today;
  const isToday = day === today;
  const planText = yesterdayPlan.trim();
  const showPlan = isToday && !planAdded && planText.length > 0 && !tasks.some((task) => task.title === planText);
  const showCarry = isToday && carryFrom && carryCount > 0;

  async function adoptPlan() {
    if (busy || !planText) return;
    setBusy(true);
    const result = await addTaskAction({ day, title: planText, subjectCode: "" });
    if (result.ok) setPlanAdded(true);
    report(result);
    setBusy(false);
  }

  function report(result: { ok: boolean; error?: string }) {
    if (result.ok) router.refresh();
    else notify(result.error || "操作失败", "error");
  }

  async function add() {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const result = await addTaskAction({ day, title: trimmed, subjectCode, priority, estimatedMinutes, scheduledStart: scheduledStart || null });
    if (result.ok) setTitle("");
    report(result);
    setBusy(false);
  }

  return (
    <section className="card dayTasks" aria-label="任务清单">
      <div className="sectionTitle">
        <h2>今日任务</h2>
        <span className="sectionHint">
          {tasks.length ? `${done}/${tasks.length} 完成` : "列出今天要完成的事"}
        </span>
      </div>

      {showPlan ? (
        <div className="dayPlanEcho">
          <p>昨晚你说，今天第一件事：<strong>「{planText}」</strong></p>
          <button className="secondaryButton" disabled={busy} onClick={() => void adoptPlan()} type="button">
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
            onClick={() => void carryOverTasksAction({ fromDay: carryFrom!, toDay: day }).then(report)}
            type="button"
          >
            <ArrowRight size={14} />
            顺延到今天
          </button>
        </div>
      ) : null}

      {tasks.length ? (
        <div className="taskProgress" role="img" aria-label={`完成 ${done}/${tasks.length}`}>
          <span style={{ width: `${tasks.length ? Math.round((done / tasks.length) * 100) : 0}%` }} />
        </div>
      ) : null}

      <div className="taskList">
        {tasks.map((task) => (
          <TaskLine day={day} key={task.id} report={report} subjects={subjects} task={task} />
        ))}
        {!tasks.length ? <EmptyState seal="空" text="还没有任务。加上第一条，例如「特征值 20 题」。" /> : null}
      </div>

      <div className="taskCreate taskComposer">
        <input
          className="taskComposerTitle"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void add();
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
        <button aria-label="添加任务" className="taskComposerSubmit" disabled={busy || !title.trim()} onClick={() => void add()} type="button">
          <Plus size={15} />
          <span>加入计划</span>
        </button>
      </div>

      {isPast && openCount ? (
        <button
          className="secondaryButton carryOver"
          onClick={() => void carryOverTasksAction({ fromDay: day, toDay: today }).then(report)}
          type="button"
        >
          <ArrowRight size={14} />
          把 {openCount} 个未完成任务顺延到今天
        </button>
      ) : null}
    </section>
  );
}

function TaskLine({ task, day, subjects, report }: {
  task: DayTask;
  day: string;
  subjects: SubjectRow[];
  report: (result: { ok: boolean; error?: string }) => void;
}) {
  const [pending, setPending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const { value: done, apply, rollback } = useOptimisticValue(Boolean(task.done));

  useLayoutEffect(() => {
    resizeTitle(titleRef.current);
  }, [task.title]);

  async function toggle() {
    if (pending) return;
    setPending(true);
    apply(!done);
    try {
      const result = await toggleTaskAction({ id: task.id, day, done: !done });
      if (!result.ok) rollback();
      report(result);
    } catch {
      rollback();
      report({ ok: false, error: "网络异常，操作未保存" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`${done ? "taskLine done" : "taskLine"} priority${task.priority}`}>
      <div className="taskLineMain">
      <button
        aria-checked={done}
        aria-label={done ? "标记为未完成" : "标记为完成"}
        className="taskCheck"
        disabled={pending}
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
          if (next && next !== task.title) {
            void updateTaskAction({ id: task.id, day, title: next }).then(report);
          }
        }}
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
        onChange={(event) => void updateTaskAction({ id: task.id, day, subjectCode: event.target.value || null }).then(report)}
        value={task.subject_code || ""}
      >
        <option value="">无科目</option>
        {subjects.map((subject) => (
          <option key={subject.code} value={subject.code}>
            {subject.code} · {subject.name}
          </option>
        ))}
      </select>
      <button aria-expanded={expanded} aria-label="编辑任务详情" className="taskExpand" onClick={() => setExpanded((value) => !value)} type="button"><ChevronDown size={14} /></button>
      <button
        aria-label="删除任务"
        className="iconDanger"
        onClick={() => void deleteTaskAction({ id: task.id, day }).then(report)}
        type="button"
      >
        <Trash2 size={13} />
      </button>
      </div>
      {expanded ? <div className="taskLineDetails">
        <label><span>优先级</span><select defaultValue={task.priority} onChange={(event) => void updateTaskAction({ id: task.id, day, priority: Number(event.target.value) }).then(report)}>
          <option value={1}>P1 · 关键</option><option value={2}>P2 · 常规</option><option value={3}>P3 · 弹性</option>
        </select></label>
        <label><span>开始时间</span><input defaultValue={task.scheduled_start || ""} onBlur={(event) => void updateTaskAction({ id: task.id, day, scheduledStart: event.target.value || null }).then(report)} type="time" /></label>
        <label><span>预计分钟</span><input defaultValue={task.estimated_minutes} max={480} min={5} onBlur={(event) => void updateTaskAction({ id: task.id, day, estimatedMinutes: Number(event.target.value) }).then(report)} step={5} type="number" /></label>
        <label className="taskNotes"><span>执行备注</span><textarea defaultValue={task.notes} maxLength={500} onBlur={(event) => {
          if (event.target.value !== task.notes) void updateTaskAction({ id: task.id, day, notes: event.target.value }).then(report);
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
