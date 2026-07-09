"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { addTaskAction, carryOverTasksAction, deleteTaskAction, toggleTaskAction, updateTaskAction } from "@/app/actions/planner";
import type { SubjectRow } from "@/lib/repo/knowledge";
import type { DayTask } from "@/lib/repo/planner";

export function DayTasks({ day, today, tasks, subjects }: {
  day: string;
  today: string;
  tasks: DayTask[];
  subjects: SubjectRow[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const done = tasks.filter((task) => task.done).length;
  const openCount = tasks.length - done;
  const isPast = day < today;

  function report(result: { ok: boolean; error?: string }) {
    setError(result.ok ? "" : result.error || "操作失败");
    if (result.ok) router.refresh();
  }

  async function add() {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const result = await addTaskAction({ day, title: trimmed, subjectCode });
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
      {error ? <p className="formError">{error}</p> : null}

      {tasks.length ? (
        <div className="taskProgress" role="img" aria-label={`完成 ${done}/${tasks.length}`}>
          <span style={{ width: `${tasks.length ? Math.round((done / tasks.length) * 100) : 0}%` }} />
        </div>
      ) : null}

      <div className="taskList">
        {tasks.map((task) => (
          <TaskLine day={day} key={task.id} report={report} subjects={subjects} task={task} />
        ))}
        {!tasks.length ? <p className="empty inset">还没有任务。加上第一条，例如「特征值 20 题」。</p> : null}
      </div>

      <div className="taskCreate">
        <input
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
              {subject.code}
            </option>
          ))}
        </select>
        <button aria-label="添加任务" disabled={busy || !title.trim()} onClick={() => void add()} type="button">
          <Plus size={15} />
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

  async function toggle() {
    if (pending) return;
    setPending(true);
    report(await toggleTaskAction({ id: task.id, day, done: !task.done }));
    setPending(false);
  }

  return (
    <div className={task.done ? "taskLine done" : "taskLine"}>
      <button
        aria-checked={Boolean(task.done)}
        aria-label={task.done ? "标记为未完成" : "标记为完成"}
        className="taskCheck"
        disabled={pending}
        onClick={() => void toggle()}
        role="checkbox"
        type="button"
      >
        {task.done ? <Check size={13} /> : null}
      </button>
      <input
        aria-label="任务内容"
        className="taskTitle"
        defaultValue={task.title}
        key={`${task.id}-${task.title}`}
        onBlur={(event) => {
          const next = event.target.value.trim();
          if (next && next !== task.title) {
            void updateTaskAction({ id: task.id, day, title: next }).then(report);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
      />
      <select
        aria-label="科目标签"
        className={task.subject_code ? "taskSubject tagged" : "taskSubject"}
        onChange={(event) => void updateTaskAction({ id: task.id, day, subjectCode: event.target.value || null }).then(report)}
        value={task.subject_code || ""}
      >
        <option value="">—</option>
        {subjects.map((subject) => (
          <option key={subject.code} value={subject.code}>
            {subject.code}
          </option>
        ))}
      </select>
      <button
        aria-label="删除任务"
        className="iconDanger"
        onClick={() => void deleteTaskAction({ id: task.id, day }).then(report)}
        type="button"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
