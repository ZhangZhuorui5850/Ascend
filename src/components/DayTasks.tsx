"use client";

import { startTransition, useCallback, useEffect, useLayoutEffect, useOptimistic, useRef, useState } from "react";
import { ArrowRight, Check, Clock3, ExternalLink, Plus, Settings2, Trash2 } from "lucide-react";
import {
  carryDayTasksAction,
  createDayTaskAction,
  deleteDayTaskAction,
  toggleDayTaskAction,
  updateDayTaskAction,
} from "@/app/actions/day-tasks";
import { sortDayTasks } from "@/components/day-tasks-sort";
import { EmptyState } from "@/components/EmptyState";
import { useFeedback } from "@/components/FeedbackProvider";
import type { CaptureSubject } from "@/lib/repo/knowledge";
import type { DayTaskItem } from "@/lib/repo/task-read-model";

type ClientKey = string;
type OptimisticTask = DayTaskItem & { clientKey?: ClientKey; pending?: boolean };
type ExitingTask = { actionDone: boolean; animationDone: boolean; clientKey: ClientKey; task: OptimisticTask };

const PRESENCE_EVENT_GRACE_MS = 50;

export function DayTasks({ day, today, tasks, subjects, carryFrom, carryCount = 0, yesterdayPlan = "" }: {
  day: string;
  today: string;
  tasks: DayTaskItem[];
  subjects: CaptureSubject[];
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
  const [completionOverrides, setCompletionOverrides] = useState<Record<string, boolean>>({});
  const [enteringClientKeys, setEnteringClientKeys] = useState<Set<ClientKey>>(() => new Set());
  const [exitingTasks, setExitingTasks] = useState<ExitingTask[]>([]);
  const draftOrderRef = useRef(maxSortOrder(tasks) + 1);
  const pendingDraftKeysRef = useRef(new Set<ClientKey>());
  const taskClientKeysRef = useRef(new Map<string, ClientKey>());
  const [optimisticTasks, addOptimisticTask] = useOptimistic(
    tasks as OptimisticTask[],
    (state: OptimisticTask[], task: OptimisticTask) => sortDayTasks([...state, task]),
  );

  const canonicalDisplayTasks: OptimisticTask[] = optimisticTasks.map((task) => completionOverrides[task.id] === undefined
    ? task
    : { ...task, done: completionOverrides[task.id] ? 1 as const : 0 as const });
  const exitingById = new Map(exitingTasks.map((entry) => [entry.task.id, entry]));
  const canonicalIds = new Set(canonicalDisplayTasks.map((task) => task.id));
  const displayTasks = sortDayTasks<OptimisticTask>([
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

  const finishExiting = useCallback((id: string) => {
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
    const id = crypto.randomUUID();
    return {
      id,
      version: 0,
      legacy_day_task_id: null,
      day,
      title: input.title,
      subject_code: input.subjectCode || null,
      status: "open",
      done: 0,
      sort_order: draftOrderRef.current++,
      priority: input.priority === 1 || input.priority === 3 ? input.priority : 2,
      estimated_minutes: input.estimatedMinutes,
      scheduled_start: input.scheduledStart,
      notes: "",
      learning_link_version: 0,
      knowledge_point_id: null,
      activity_type: "unspecified",
      completion_criteria: "",
      source_type: "",
      source_id: "",
      actual_minutes: null,
      completion_output: "",
      planned_verification_method: "",
      verification_method: "",
      verification_result: "",
      verification_outcome: "",
      clientKey: id,
      pending: true,
    };
  }

  function beginDraft(draft: OptimisticTask) {
    pendingDraftKeysRef.current.add(draft.clientKey!);
    setEnteringClientKeys((current) => new Set(current).add(draft.clientKey!));
  }

  function settleDraft(draft: OptimisticTask, task?: DayTaskItem) {
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
        const result = await createDayTaskAction({ clientMutationId: crypto.randomUUID(), day, title: planText, subjectCode: null });
        settleDraft(draft, result.task);
        if (result.ok) setPlanAdded(true);
        report(result);
      } catch (error) {
        console.error("转为任务失败", error);
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
      } catch (error) {
        console.error("任务顺延失败", error);
        report({ ok: false, error: "网络异常，操作未保存" });
      }
    });
  }

  function setTaskCompletion(id: string, done: boolean) {
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
        const result = await createDayTaskAction({
          clientMutationId: crypto.randomUUID(),
          day,
          title: trimmed,
          subjectCode: subjectCode || null,
          priority: priority === 1 || priority === 3 ? priority : 2,
          estimatedMinutes,
          scheduledStart: scheduledStart || null,
        });
        settleDraft(draft, result.task);
        if (!result.ok) setTitle((current) => current || trimmed);
        report(result);
      } catch (error) {
        console.error("添加任务失败", error);
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
        const result = await deleteDayTaskAction({
          id: task.id,
          expectedVersion: task.version,
          clientMutationId: crypto.randomUUID(),
          day,
        });
        setExitingTasks((current) => current.flatMap((entry) => {
          if (entry.task.id !== task.id) return [entry];
          if (!result.ok || entry.animationDone) return [];
          return [{ ...entry, actionDone: true }];
        }));
        report(result);
      } catch (error) {
        console.error("删除任务失败", error);
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
            onClick={() => runRefreshAction(() => carryDayTasksAction({ fromDay: carryFrom!, toDay: day }))}
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
          onClick={() => runRefreshAction(() => carryDayTasksAction({ fromDay: day, toDay: today }))}
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
  subjects: CaptureSubject[];
  report: (result: { ok: boolean; error?: string }) => void;
  entering: boolean;
  leaving: boolean;
  onCompletionChange: (id: string, done: boolean) => void;
  onEnterComplete: (clientKey: ClientKey) => void;
  onExitComplete: (id: string) => void;
  onRemove: (task: OptimisticTask) => void;
}) {
  const [pending, setPending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [actualMinutes, setActualMinutes] = useState(task.estimated_minutes);
  const [completionOutput, setCompletionOutput] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("");
  const [verificationResult, setVerificationResult] = useState("");
  const [verificationOutcome, setVerificationOutcome] = useState<DayTaskItem["verification_outcome"]>("");
  const [scheduleRetest, setScheduleRetest] = useState(false);
  const [retestAfterDays, setRetestAfterDays] = useState(1);
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

  function update(input: Omit<Parameters<typeof updateDayTaskAction>[0], "id" | "expectedVersion" | "linkExpectedVersion" | "day">) {
    startTransition(async () => {
      try {
        report(await updateDayTaskAction({
          id: task.id,
          expectedVersion: task.version,
          linkExpectedVersion: task.learning_link_version,
          day,
          ...input,
        }));
      } catch (error) {
        console.error("更新任务失败", error);
        report({ ok: false, error: "网络异常，操作未保存" });
      }
    });
  }

  async function persistCompletion(
    nextDone: boolean,
    evidence: {
      actualMinutes?: number | null;
      completionOutput?: string;
      verificationMethod?: string;
      verificationResult?: string;
      verificationOutcome?: DayTaskItem["verification_outcome"];
      scheduleRetestAfterDays?: number;
    } = {},
  ) {
    if (pending || isDraft) return;
    setPending(true);
    onCompletionChange(task.id, nextDone);
    try {
      const result = await toggleDayTaskAction({
        id: task.id,
        expectedVersion: task.version,
        clientMutationId: crypto.randomUUID(),
        day,
        done: nextDone,
        evidence: nextDone && Object.keys(evidence).some((key) => key !== "scheduleRetestAfterDays")
          ? {
              actualMinutes: evidence.actualMinutes,
              output: evidence.completionOutput,
              verificationMethod: evidence.verificationMethod,
              verificationResult: evidence.verificationResult,
              verificationOutcome: evidence.verificationOutcome,
            }
          : undefined,
        scheduleRetestAfterDays: evidence.scheduleRetestAfterDays,
      });
      if (!result.ok) onCompletionChange(task.id, done);
      if (result.ok) setCompleting(false);
      report(result);
    } catch (error) {
      console.error("切换任务完成状态失败", error);
      onCompletionChange(task.id, done);
      report({ ok: false, error: "网络异常，操作未保存" });
    } finally {
      setPending(false);
    }
  }

  function toggle() {
    if (pending || isDraft) return;
    if (done) {
      void persistCompletion(false);
      return;
    }
    setActualMinutes(task.estimated_minutes);
    setCompletionOutput("");
    setVerificationMethod(task.planned_verification_method);
    setVerificationResult("");
    setVerificationOutcome("");
    setScheduleRetest(Boolean(task.knowledge_point_id && task.source_type && task.source_type !== "training_retest"));
    setRetestAfterDays(1);
    setCompleting(true);
  }

  return (
    <div
      className={`${done ? "taskLine done" : "taskLine"} priority${task.priority}`}
      data-entering={entering ? "" : undefined}
      data-leaving={leaving ? "" : undefined}
      id={!isDraft ? `task-${task.id}` : undefined}
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
        onClick={toggle}
        role="checkbox"
        type="button"
      >
        {done ? <Check size={13} /> : null}
      </button>
      <div className="taskBody">
        <textarea
          aria-label="任务内容"
          className="taskTitle"
          defaultValue={task.title}
          key={`${task.id}-${task.title}`}
          onInput={(event) => resizeTitle(event.currentTarget)}
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (!isDraft && next && next !== task.title) {
              update({ title: next });
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
        <TaskMetaRow task={task} />
        {task.source_type === "plugin:algorithms" && /^\d+$/.test(task.source_id) ? (
          <a
            className="taskSourceLink"
            href={`/practice/algorithms?problem=${encodeURIComponent(task.source_id)}&task=${task.id}#algorithm-problem-${encodeURIComponent(task.source_id)}`}
          >
            打开算法训练 <ExternalLink size={12} />
          </a>
        ) : null}
      </div>
      <button aria-expanded={expanded} aria-label="任务详细设置" className="taskExpand" disabled={isDraft} onClick={() => setExpanded((value) => !value)} title="详细设置" type="button"><Settings2 size={14} /></button>
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
      {completing && !done ? (
        <div className="taskCompletionPanel" aria-label="记录任务完成证据">
          <div className="taskCompletionFields">
            <label>
              <span>实际分钟</span>
              <input
                max={1440}
                min={1}
                onChange={(event) => setActualMinutes(Number(event.target.value))}
                step={5}
                type="number"
                value={actualMinutes}
              />
            </label>
            <label className="taskCompletionOutput">
              <span>完成产出</span>
              <textarea
                maxLength={1000}
                onChange={(event) => setCompletionOutput(event.target.value)}
                placeholder="如：完成 20 题，错 3 题；写出一页推导"
                rows={2}
                value={completionOutput}
              />
            </label>
            <label>
              <span>验证方法</span>
              <input
                maxLength={200}
                onChange={(event) => setVerificationMethod(event.target.value)}
                placeholder="如：闭卷回忆 / 同类小测"
                value={verificationMethod}
              />
            </label>
            <label>
              <span>验证结果</span>
              <input
                maxLength={200}
                onChange={(event) => setVerificationResult(event.target.value)}
                placeholder="如：8/10；仍卡在边界条件"
                value={verificationResult}
              />
            </label>
            <label>
              <span>{task.source_type === "training_retest" ? "相对训练前" : "验证结论"}</span>
              <select
                aria-label="验证结论"
                onChange={(event) => setVerificationOutcome(event.target.value as DayTaskItem["verification_outcome"])}
                value={verificationOutcome}
              >
                <option value="">未记录</option>
                <option value="improved">改善</option>
                <option value="unchanged">持平</option>
                <option value="regressed">退步</option>
                <option value="unknown">无法判断</option>
              </select>
            </label>
          </div>
          {task.knowledge_point_id && task.source_type && task.source_type !== "training_retest" ? (
            <div className="taskRetestSchedule">
              <label className="taskRecordAsStudy">
                <input checked={scheduleRetest} onChange={(event) => setScheduleRetest(event.target.checked)} type="checkbox" />
                <span>完成后安排短复测，验证训练是否改善</span>
              </label>
              {scheduleRetest ? (
                <label><span>间隔</span><select onChange={(event) => setRetestAfterDays(Number(event.target.value))} value={retestAfterDays}><option value={1}>1 天后</option><option value={3}>3 天后</option><option value={7}>7 天后</option></select></label>
              ) : null}
            </div>
          ) : null}
          <div className="taskCompletionActions">
            <button
              className="textButton"
              disabled={pending}
              onClick={() => setCompleting(false)}
              type="button"
            >
              取消
            </button>
            <button
              className="secondaryButton"
              disabled={pending}
              onClick={() => void persistCompletion(true)}
              type="button"
            >
              仅标记完成
            </button>
            <button
              className="primaryButton"
              disabled={pending || actualMinutes < 1 || actualMinutes > 1440 || (task.source_type === "training_retest" && !verificationOutcome)}
              onClick={() => void persistCompletion(true, {
                actualMinutes,
                completionOutput,
                verificationMethod,
                verificationResult,
                verificationOutcome,
                scheduleRetestAfterDays: scheduleRetest ? retestAfterDays : undefined,
              })}
              type="button"
            >
              保存证据并完成
            </button>
          </div>
        </div>
      ) : null}
      {expanded ? <div className="taskLineDetails">
        <label><span>科目</span><select defaultValue={task.subject_code || ""} onChange={(event) => update({ subjectCode: event.target.value || null })}>
          <option value="">无科目</option>
          {subjects.map((subject) => (
            <option key={subject.code} value={subject.code}>
              {subject.code} · {subject.name}
            </option>
          ))}
        </select></label>
        <label><span>知识点</span><select defaultValue={task.knowledge_point_id || ""} onChange={(event) => update({ knowledgePointId: event.target.value || null })}>
          <option value="">不关联知识点</option>
          {subjects.map((subject) => (
            <optgroup key={subject.code} label={`${subject.code} · ${subject.name}`}>
              {subject.chapters.flatMap((chapter) => chapter.points.map((point) => (
                <option key={point.id} value={point.id}>{chapter.title} / {point.title}</option>
              )))}
            </optgroup>
          ))}
        </select></label>
        <label><span>活动类型</span><select defaultValue={task.activity_type} onChange={(event) => update({ activityType: event.target.value as DayTaskItem["activity_type"] })}>
          <option value="unspecified">未指定</option>
          <option value="study">学习</option>
          <option value="practice">练习</option>
          <option value="recall">回忆</option>
          <option value="review">复习</option>
          <option value="mock">模考</option>
          <option value="mixed">混合</option>
        </select></label>
        <label><span>优先级</span><select defaultValue={task.priority} onChange={(event) => update({ priority: Number(event.target.value) as 1 | 2 | 3 })}>
          <option value={1}>P1 · 关键</option><option value={2}>P2 · 常规</option><option value={3}>P3 · 弹性</option>
        </select></label>
        <label><span>开始时间</span><input defaultValue={task.scheduled_start || ""} onBlur={(event) => update({ scheduledStart: event.target.value || null })} type="time" /></label>
        <label><span>预计分钟</span><input defaultValue={task.estimated_minutes} max={480} min={5} onBlur={(event) => update({ estimatedMinutes: Number(event.target.value) })} step={5} type="number" /></label>
        <label className="taskNotes"><span>执行备注</span><textarea defaultValue={task.notes} maxLength={500} onBlur={(event) => {
          if (event.target.value !== task.notes) update({ notes: event.target.value });
        }} placeholder="写下完成标准、资料位置或训练范围" rows={2} /></label>
        <label className="taskNotes"><span>完成标准</span><textarea defaultValue={task.completion_criteria} maxLength={500} onBlur={(event) => {
          if (event.target.value !== task.completion_criteria) update({ completionCriteria: event.target.value });
        }} placeholder="达到什么结果才算完成，例如：20 题并订正全部错题" rows={2} /></label>
        <label className="taskNotes"><span>计划验证方法</span><input defaultValue={task.planned_verification_method} maxLength={200} onBlur={(event) => {
          if (event.target.value !== task.planned_verification_method) update({ plannedVerificationMethod: event.target.value });
        }} placeholder="例如：闭卷回忆、同类小测、独立重做" /></label>
      </div> : null}
    </div>
  );
}

/** 只展示用户明确标记过的信息：默认优先级 P2、默认 30 分钟、无科目、无备注时一律不渲染 */
function TaskMetaRow({ task }: { task: OptimisticTask }) {
  const showPriority = task.priority !== 2;
  const timing = task.scheduled_start
    ? `${task.scheduled_start} · ${task.estimated_minutes}m`
    : task.estimated_minutes !== 30
      ? `${task.estimated_minutes}m`
      : "";
  const hasNotes = task.notes.trim().length > 0;
  const activityLabel = task.activity_type === "unspecified" ? "" : ({
    study: "学习",
    practice: "练习",
    recall: "回忆",
    review: "复习",
    mock: "模考",
    mixed: "混合",
  } as Record<string, string>)[task.activity_type] || "";
  const hasCriteria = task.completion_criteria.trim().length > 0;
  const hasVerificationPlan = task.planned_verification_method.trim().length > 0;
  const hasEvidence = task.actual_minutes !== null
    || task.completion_output.trim().length > 0
    || task.verification_method.trim().length > 0
    || task.verification_result.trim().length > 0;
  if (
    !showPriority
    && !timing
    && !task.subject_code
    && !task.knowledge_point_id
    && !hasNotes
    && !activityLabel
    && !hasCriteria
    && !hasVerificationPlan
    && !hasEvidence
  ) return null;
  return (
    <div className="taskMetaRow">
      {showPriority ? (
        <span className={`taskPriority priority${task.priority}`}>{task.priority === 1 ? "P1 · 关键" : "P3 · 弹性"}</span>
      ) : null}
      {timing ? <span className="taskTiming"><Clock3 size={11} />{timing}</span> : null}
      {task.subject_code ? <span className="taskSubjectChip">{task.subject_code}</span> : null}
      {task.knowledge_point_id ? <span className="taskPointFlag">知识点</span> : null}
      {activityLabel ? <span className="taskActivityFlag">{activityLabel}</span> : null}
      {hasCriteria ? <span className="taskCriteriaFlag">有完成标准</span> : null}
      {hasVerificationPlan ? <span className="taskCriteriaFlag">有验证计划</span> : null}
      {hasEvidence ? <span className="taskEvidenceFlag">有完成证据</span> : null}
      {hasNotes ? <span className="taskNoteFlag">备注</span> : null}
    </div>
  );
}

function resizeTitle(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function maxSortOrder(tasks: DayTaskItem[]): number {
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
