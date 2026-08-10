"use client";

import { Trash2 } from "lucide-react";
import { AnimatePresence, LayoutGroup } from "motion/react";
import {
  FormEvent,
  startTransition,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  batchPlannerTasksAction,
  createPlannerTaskSeriesAction,
  createPlannerTaskAction,
  deletePlannerTaskAction,
  purgePlannerTrashAction,
  restorePlannerTaskAction,
  updatePlannerTaskLabelsAction,
  updatePlannerTaskAction,
} from "@/app/actions/planner-tasks";
import {
  cancelPlannerReminderAction,
  createPlannerReminderAction,
} from "@/app/actions/planner-reminders";
import { createPlannerLabelAction, createTaskListAction } from "@/app/actions/planner-lists";
import { useFeedback } from "@/components/FeedbackProvider";
import { PlannerBatchBar } from "@/components/planner/PlannerBatchBar";
import { PlannerQuickCapture } from "@/components/planner/PlannerQuickCapture";
import { PlannerSidebar, PlannerMobileNavigation } from "@/components/planner/PlannerSidebar";
import { PlannerTaskGroups } from "@/components/planner/PlannerTaskGroups";
import { PlannerTaskInspector } from "@/components/planner/PlannerTaskInspector";
import { PlannerTaskSheet } from "@/components/planner/PlannerTaskSheet";
import {
  plannerOptimisticReducer,
  reconcilePlannerSelection,
} from "@/components/planner/planner-optimistic";
import { runPlannerMutation } from "@/components/planner/planner-mutations";
import { MotionProvider } from "@/components/ui/MotionProvider";
import type { PlannerMutationStatus } from "@/components/ui/PlannerStatusIndicator";
import type {
  PlannerLabel,
  PlannerReminder,
  PlannerTask,
  TaskList,
} from "@/lib/planner/types";
import type { PlannerTaskView } from "@/lib/repo/planner-tasks";
import styles from "@/styles/planner/tasks.module.css";

type PlannerViewport = "desktop" | "tablet" | "mobile";

export function PlannerTasksWorkspace({
  initialTaskLabelIds,
  initialReminders,
  initialTasks,
  labels,
  lists,
  timeZone,
  view,
}: {
  initialTaskLabelIds: Record<string, string[]>;
  initialReminders: PlannerReminder[];
  initialTasks: PlannerTask[];
  labels: PlannerLabel[];
  lists: TaskList[];
  timeZone: string;
  view: PlannerTaskView;
}) {
  const { confirm, notify } = useFeedback();
  const [tasks, applyOptimistic] = useOptimistic(initialTasks, plannerOptimisticReducer);
  const [title, setTitle] = useState("");
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialTasks[0]?.id ?? null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [error, setError] = useState("");
  const [newListName, setNewListName] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [plannerLabels, setPlannerLabels] = useState(labels);
  const [taskLabelIds, setTaskLabelIds] = useState(initialTaskLabelIds);
  const [reminders, setReminders] = useState(initialReminders);
  const [mutationStatus, setMutationStatus] = useState<PlannerMutationStatus>("idle");
  const [viewport, setViewport] = useState<PlannerViewport>("desktop");
  const [detailOpen, setDetailOpen] = useState(false);
  const [inspectorDirtyKey, setInspectorDirtyKey] = useState<string | null>(null);
  const [capturePending, startCaptureTransition] = useTransition();
  const captureSubmissionRef = useRef(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const selected = tasks.find((task) => task.id === selectedId) ?? null;
  const selectedTaskKey = selected ? `${selected.id}:${selected.version}` : null;
  const inspectorDirty = selectedTaskKey !== null && inspectorDirtyKey === selectedTaskKey;
  const grouped = useMemo(() => groupTasks(tasks), [tasks]);

  useEffect(() => {
    const updateViewport = () => {
      const next: PlannerViewport = window.innerWidth <= 760
        ? "mobile"
        : window.innerWidth < 1180
          ? "tablet"
          : "desktop";
      setViewport(next);
      if (next === "desktop") setDetailOpen(false);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (!capturePending) captureSubmissionRef.current = false;
  }, [capturePending]);

  function mutationFailure(message: string, conflict = false): void {
    setMutationStatus(conflict ? "conflict" : "restored");
    setError(message);
    notify(message, conflict ? "conflict" : "error");
  }

  function openTask(taskId: string, trigger: HTMLButtonElement): void {
    triggerRef.current = trigger;
    setSelectedId(taskId);
    setMutationStatus("idle");
    if (viewport !== "desktop") setDetailOpen(true);
  }

  function handleDetailOpenChange(nextOpen: boolean): void {
    setDetailOpen(nextOpen);
    if (!nextOpen) {
      queueMicrotask(() => {
        if (triggerRef.current?.isConnected) {
          triggerRef.current.focus({ preventScroll: true });
        }
      });
    }
  }

  function checkTask(taskId: string, value: boolean): void {
    setChecked((current) => {
      const next = new Set(current);
      if (value) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  }

  function navigateTasks(taskId: string, direction: -1 | 1): void {
    const index = tasks.findIndex((task) => task.id === taskId);
    const next = tasks[Math.min(Math.max(index + direction, 0), tasks.length - 1)];
    if (!next) return;
    setSelectedId(next.id);
    requestAnimationFrame(() => {
      const buttons = document.querySelectorAll<HTMLButtonElement>("[data-planner-task-open]");
      [...buttons].find((button) => button.dataset.plannerTaskId === next.id)?.focus();
    });
  }

  function addTask(event: FormEvent<HTMLFormElement>, parentTaskId?: string): void {
    event.preventDefault();
    const isQuickCapture = parentTaskId === undefined;
    if (isQuickCapture && (captureSubmissionRef.current || capturePending)) return;
    const nextTitle = parentTaskId
      ? String(new FormData(event.currentTarget).get("subtask") ?? "").trim()
      : title.trim();
    if (!nextTitle || !listId) return;
    const submittedListId = listId;
    const submittedDueDate = isQuickCapture ? dueDate : "";
    const temporaryId = `draft:${crypto.randomUUID()}`;
    const clientMutationId = crypto.randomUUID();
    const draft = draftTask({
      id: temporaryId,
      listId: submittedListId,
      parentTaskId: parentTaskId ?? null,
      title: nextTitle,
      dueDate: isQuickCapture ? submittedDueDate || null : null,
      depth: parentTaskId ? Math.min((selected?.depth ?? 0) + 1, 3) as 1 | 2 | 3 : 0,
    });
    if (isQuickCapture) {
      captureSubmissionRef.current = true;
      setTitle("");
      setDueDate("");
    }
    setError("");
    setMutationStatus("optimistic");
    const submit = async () => {
      applyOptimistic({ type: "add", task: draft });
      const result = await runPlannerMutation(() => createPlannerTaskAction({
        clientMutationId,
        listId: submittedListId,
        parentTaskId,
        title: nextTitle,
        dueDate: isQuickCapture ? submittedDueDate || null : null,
      }), "网络异常，任务草稿已恢复");
      if (result.ok && result.entity) {
        applyOptimistic({ type: "replace", temporaryId, task: result.entity });
        setSelectedId(result.entity.id);
        setMutationStatus("saved");
      } else {
        const rollback = { type: "remove", id: temporaryId } as const;
        applyOptimistic(rollback);
        mutationFailure(result.error ?? "创建任务失败", Boolean(result.conflict));
        if (isQuickCapture) {
          setTitle(nextTitle);
          setDueDate(submittedDueDate);
        }
      }
    };
    if (isQuickCapture) startCaptureTransition(submit);
    else startTransition(submit);
    if (!isQuickCapture) event.currentTarget.reset();
  }

  function toggleTask(task: PlannerTask): void {
    const status = task.status === "completed" ? "open" : "completed";
    setError("");
    setMutationStatus("optimistic");
    startTransition(async () => {
      applyOptimistic({ type: "patch", id: task.id, patch: { status } });
      const result = await runPlannerMutation(() => updatePlannerTaskAction({
        id: task.id,
        expectedVersion: task.version,
        status,
      }), "网络异常，任务状态已恢复");
      if (result.ok && result.entity) {
        applyOptimistic({ type: "patch", id: task.id, patch: result.entity });
        setMutationStatus("saved");
      } else {
        const rollback = { type: "patch", id: task.id, patch: task } as const;
        applyOptimistic(rollback);
        mutationFailure(result.error ?? "更新任务失败", Boolean(result.conflict));
      }
    });
  }

  function removeTask(task: PlannerTask): void {
    const index = tasks.findIndex((item) => item.id === task.id);
    setError("");
    setMutationStatus("optimistic");
    setSelectedId(reconcilePlannerSelection(
      tasks.filter((item) => item.id !== task.id),
      selectedId,
      index,
    ));
    startTransition(async () => {
      applyOptimistic({ type: "remove", id: task.id });
      const result = await runPlannerMutation(() => deletePlannerTaskAction({
        id: task.id,
        expectedVersion: task.version,
        clientMutationId: crypto.randomUUID(),
      }), "网络异常，任务已恢复");
      if (result.ok && result.entity) {
        setMutationStatus("saved");
        const deleted = result.entity;
        notify(`已将“${task.title}”移入回收站`, "success", {
          actionLabel: "撤销",
          undo: () => undoDelete(task, deleted, index),
        });
      } else {
        const rollback = { type: "restore", task, index } as const;
        applyOptimistic(rollback);
        setSelectedId(task.id);
        mutationFailure(result.error ?? "删除任务失败", Boolean(result.conflict));
      }
    });
  }

  function undoDelete(original: PlannerTask, deleted: PlannerTask, index: number): void {
    const restoredDraft = { ...original, version: deleted.version, deleted_at: null };
    setMutationStatus("optimistic");
    setSelectedId(original.id);
    startTransition(async () => {
      applyOptimistic({ type: "restore", task: restoredDraft, index });
      const result = await runPlannerMutation(() => restorePlannerTaskAction({
        id: deleted.id,
        expectedVersion: deleted.version,
        clientMutationId: crypto.randomUUID(),
      }), "网络异常，撤销操作已恢复");
      if (result.ok && result.entity) {
        applyOptimistic({ type: "patch", id: result.entity.id, patch: result.entity });
        setMutationStatus("saved");
        notify(`已恢复“${original.title}”`);
      } else {
        applyOptimistic({ type: "remove", id: original.id });
        mutationFailure(result.error ?? "撤销删除失败", Boolean(result.conflict));
      }
    });
  }

  function restoreTask(task: PlannerTask): void {
    const index = tasks.findIndex((item) => item.id === task.id);
    setError("");
    setMutationStatus("optimistic");
    startTransition(async () => {
      applyOptimistic({ type: "remove", id: task.id });
      const result = await runPlannerMutation(() => restorePlannerTaskAction({
        id: task.id,
        expectedVersion: task.version,
        clientMutationId: crypto.randomUUID(),
      }), "网络异常，任务仍保留在回收站");
      if (result.ok && result.entity) {
        setMutationStatus("saved");
        notify(`已恢复“${task.title}”`);
      } else {
        const rollback = { type: "restore", task, index } as const;
        applyOptimistic(rollback);
        mutationFailure(result.error ?? "恢复任务失败", Boolean(result.conflict));
      }
    });
  }

  async function purgeTrash(): Promise<void> {
    const confirmed = await confirm({
      title: "清理回收站",
      description: "永久清理 30 天前且没有学习证据的任务；含学习记录或仍有关联子任务的项目会保留。",
      confirmLabel: "永久清理",
      danger: true,
    });
    if (!confirmed) return;
    setError("");
    setMutationStatus("pending");
    startTransition(async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = await runPlannerMutation(
        () => purgePlannerTrashAction({ deletedBefore: cutoff, confirm: true }),
        "网络异常，回收站内容保持原状",
      );
      if (result.ok) {
        for (const id of result.purgedTaskIds ?? []) applyOptimistic({ type: "remove", id });
        setMutationStatus("saved");
        notify(`已永久清理 ${result.purged ?? 0} 项，因学习记录或关联保留 ${result.retained ?? 0} 项`);
      } else {
        mutationFailure(result.error ?? "清理回收站失败");
      }
    });
  }

  function runBatch(patch: { status?: "completed"; listId?: string; deleted?: boolean }): void {
    const selectedTasks = tasks.filter((task) => checked.has(task.id));
    if (!selectedTasks.length) return;
    const rollback = selectedTasks.map((task) => ({
      index: tasks.findIndex((item) => item.id === task.id),
      task,
    }));
    setError("");
    setMutationStatus("optimistic");
    startTransition(async () => {
      for (const task of selectedTasks) {
        if (patch.deleted) applyOptimistic({ type: "remove", id: task.id });
        else applyOptimistic({
          type: "patch",
          id: task.id,
          patch: {
            status: patch.status ?? task.status,
            list_id: patch.listId ?? task.list_id,
          },
        });
      }
      const result = await runPlannerMutation(() => batchPlannerTasksAction({
        clientMutationId: crypto.randomUUID(),
        tasks: selectedTasks.map((task) => ({ id: task.id, expectedVersion: task.version })),
        patch,
      }), "网络异常，批量更改已恢复");
      if (result.ok && result.entities) {
        for (const entity of result.entities) applyOptimistic({ type: "patch", id: entity.id, patch: entity });
        setChecked(new Set());
        setSelectionMode(false);
        setMutationStatus("saved");
      } else {
        for (const { index, task } of rollback) {
          applyOptimistic(patch.deleted
            ? { type: "restore", task, index }
            : { type: "patch", id: task.id, patch: task });
        }
        mutationFailure(result.error ?? "批量操作失败", Boolean(result.conflict));
      }
    });
  }

  function saveTask(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const nextTitle = String(data.get("title") ?? "").trim();
    const scheduledDate = String(data.get("scheduledDate") ?? "");
    const scheduledStart = String(data.get("scheduledStart") ?? "");
    const estimatedMinutes = Number(data.get("estimatedMinutes") ?? selected.estimated_minutes);
    const optimisticPatch: Partial<PlannerTask> = {
      title: nextTitle,
      notes: String(data.get("notes") ?? ""),
      list_id: String(data.get("listId") ?? selected.list_id),
      status: String(data.get("status")) as PlannerTask["status"],
      priority: Number(data.get("priority")) as 1 | 2 | 3,
      due_date: String(data.get("dueDate") ?? "") || null,
      estimated_minutes: estimatedMinutes,
    };
    setError("");
    setMutationStatus("optimistic");
    startTransition(async () => {
      applyOptimistic({ type: "patch", id: selected.id, patch: optimisticPatch });
      const result = await runPlannerMutation(() => updatePlannerTaskAction({
        id: selected.id,
        expectedVersion: selected.version,
        title: nextTitle,
        notes: String(data.get("notes") ?? ""),
        listId: String(data.get("listId") ?? selected.list_id),
        status: String(data.get("status")) as PlannerTask["status"],
        priority: Number(data.get("priority")) as 1 | 2 | 3,
        dueDate: String(data.get("dueDate") ?? "") || null,
        scheduledDate: scheduledDate || null,
        scheduledStart: scheduledStart || null,
        estimatedMinutes,
      }), "网络异常，任务字段已恢复");
      if (result.ok && result.entity) {
        applyOptimistic({ type: "patch", id: selected.id, patch: result.entity });
        setMutationStatus("saved");
      } else {
        applyOptimistic({ type: "patch", id: selected.id, patch: selected });
        mutationFailure(result.error ?? "保存任务失败", Boolean(result.conflict));
      }
    });
  }

  function createList(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await runPlannerMutation(
        () => createTaskListAction({ name }),
        "网络异常，清单创建失败",
      );
      if (result.ok && result.entity) {
        setListId(result.entity.id);
        setNewListName("");
        notify(`已创建清单“${result.entity.name}”`);
      } else {
        mutationFailure(result.error ?? "创建清单失败");
      }
    });
  }

  function saveLabels(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selected) return;
    const labelIds = new FormData(event.currentTarget).getAll("labelId").map(String);
    const previousLabelIds = taskLabelIds[selected.id] ?? [];
    setTaskLabelIds((current) => ({ ...current, [selected.id]: labelIds }));
    setMutationStatus("optimistic");
    startTransition(async () => {
      const result = await runPlannerMutation(() => updatePlannerTaskLabelsAction({
        id: selected.id,
        expectedVersion: selected.version,
        labelIds,
      }), "网络异常，标签选择已恢复");
      if (result.ok && result.entity) {
        applyOptimistic({ type: "patch", id: selected.id, patch: result.entity });
        setTaskLabelIds((current) => ({ ...current, [selected.id]: labelIds }));
        setMutationStatus("saved");
      } else {
        setTaskLabelIds((current) => ({ ...current, [selected.id]: previousLabelIds }));
        mutationFailure(result.error ?? "保存标签失败", Boolean(result.conflict));
      }
    });
  }

  function createLabel(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = newLabelName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await runPlannerMutation(
        () => createPlannerLabelAction({ name }),
        "网络异常，标签创建失败",
      );
      if (result.ok && result.entity) {
        setPlannerLabels((current) => [...current, result.entity!]);
        setNewLabelName("");
        notify(`已创建标签“${result.entity.name}”`);
      } else {
        mutationFailure(result.error ?? "创建标签失败");
      }
    });
  }

  function addReminder(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const anchor = String(data.get("anchor")) as "due" | "scheduled_start";
    const channel = String(data.get("channel")) as "in_app" | "web_push";
    const offsetMinutes = Number(data.get("offsetMinutes"));
    setMutationStatus("pending");
    startTransition(async () => {
      const result = await runPlannerMutation(() => createPlannerReminderAction({
        clientMutationId: crypto.randomUUID(),
        entityType: "task",
        entityId: selected.id,
        anchor,
        offsetMinutes,
        channel,
      }), "网络异常，提醒创建失败");
      if (result.ok && result.entity) {
        setReminders((current) => [...current, result.entity!]);
        setMutationStatus("saved");
      } else {
        mutationFailure(result.error ?? "创建提醒失败");
      }
    });
  }

  function cancelReminder(reminder: PlannerReminder): void {
    setMutationStatus("pending");
    startTransition(async () => {
      const result = await runPlannerMutation(() => cancelPlannerReminderAction({
        id: reminder.id,
        entityType: "task",
      }), "网络异常，提醒保持启用");
      if (result.ok && result.entity) {
        setReminders((current) => current.map((item) => item.id === reminder.id ? result.entity! : item));
        setMutationStatus("saved");
      } else {
        mutationFailure(result.error ?? "取消提醒失败");
      }
    });
  }

  function createSeries(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    setMutationStatus("pending");
    startTransition(async () => {
      const result = await runPlannerMutation(() => createPlannerTaskSeriesAction({
        clientMutationId: crypto.randomUUID(),
        rrule: String(data.get("rrule") ?? ""),
        generationMode: String(data.get("generationMode")) as "fixed_schedule" | "after_completion",
        listId: selected.list_id,
        title: selected.title,
        notes: selected.notes,
        priority: selected.priority,
        estimatedMinutes: selected.estimated_minutes,
        firstDate: String(data.get("firstDate") ?? ""),
        firstTime: String(data.get("firstTime") ?? ""),
      }), "网络异常，重复任务创建失败");
      if (result.ok && result.entity) {
        applyOptimistic({ type: "add", task: result.entity });
        setMutationStatus("saved");
        notify("重复任务系列已创建");
      } else {
        mutationFailure(result.error ?? "创建重复任务失败");
      }
    });
  }

  async function enablePush(): Promise<void> {
    try {
      const configuration = await fetch("/api/planner/push-subscription", { cache: "no-store" });
      const config = await configuration.json() as { available: boolean; publicKey?: string };
      if (!config.available || !config.publicKey) throw new Error("服务器 Push 凭据尚未配置");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("浏览器通知权限未开启");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });
      const response = await fetch("/api/planner/push-subscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...subscription.toJSON(),
          deviceName: navigator.userAgent.slice(0, 120),
        }),
      });
      if (!response.ok) throw new Error("Push 订阅保存失败");
      notify("此设备已启用 Push 提醒");
    } catch (pushError) {
      mutationFailure(pushError instanceof Error ? pushError.message : "Push 订阅失败");
    }
  }

  const inspectorProps = {
    activeLabelIds: selected ? taskLabelIds[selected.id] ?? [] : [],
    dirty: inspectorDirty,
    labels: plannerLabels,
    lists,
    mutationStatus,
    onAddReminder: addReminder,
    onAddSubtask: (event: FormEvent<HTMLFormElement>) => {
      if (selected) addTask(event, selected.id);
    },
    onCancelReminder: cancelReminder,
    onCreateSeries: createSeries,
    onDirtyChange: () => setInspectorDirtyKey(selectedTaskKey),
    onEnablePush: () => void enablePush(),
    onSaveLabels: saveLabels,
    onSaveTask: saveTask,
    reminders,
    scheduled: selected ? scheduledParts(selected, timeZone) : { date: "", time: "" },
    task: selected,
    view,
  };

  return (
    <MotionProvider>
      <PlannerMobileNavigation view={view} />
      <div className={styles.workspace} data-planner-workspace="tasks">
        <PlannerSidebar
          labels={plannerLabels}
          lists={lists}
          newLabelName={newLabelName}
          newListName={newListName}
          onCreateLabel={createLabel}
          onCreateList={createList}
          onLabelNameChange={setNewLabelName}
          onListNameChange={setNewListName}
          view={view}
        />
        <main className={styles.main}>
          <div className={styles.taskToolbar}>
            {selectionMode ? <span aria-live="polite">已选 {checked.size} 项</span> : null}
            <button aria-pressed={selectionMode} onClick={() => { setSelectionMode((current) => !current); setChecked(new Set()); }} type="button">
              {selectionMode ? "退出选择" : "选择"}
            </button>
          </div>
          {view === "trash" ? (
            <div className={styles.trashHeader}>
              <span>含学习证据的任务将保留，其他任务可在 30 天后清理</span>
              <button onClick={() => void purgeTrash()} type="button">
                <Trash2 size={15} />
                清理 30 天前任务
              </button>
            </div>
          ) : null}
          <PlannerQuickCapture
            pending={capturePending}
            dueDate={dueDate}
            listId={listId}
            lists={lists}
            onDueDateChange={setDueDate}
            onListChange={setListId}
            onSubmit={addTask}
            onTitleChange={setTitle}
            title={title}
          />
          <PlannerBatchBar
            count={checked.size}
            lists={lists}
            onComplete={() => runBatch({ status: "completed" })}
            onDelete={() => runBatch({ deleted: true })}
            onMove={(nextListId) => runBatch({ listId: nextListId })}
          />
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <LayoutGroup id="planner-task-selection">
            <AnimatePresence initial={false} mode="popLayout">
              <PlannerTaskGroups
                checked={checked}
                groups={grouped}
                key={view}
                onCheck={checkTask}
                onOpen={openTask}
                onNavigate={navigateTasks}
                onRemove={removeTask}
                onRestore={restoreTask}
                onToggle={toggleTask}
                selectedId={selectedId}
                selectionMode={selectionMode}
                taskMeta={(task) => taskMeta(task, timeZone)}
                trash={view === "trash"}
              />
            </AnimatePresence>
          </LayoutGroup>
        </main>
        <aside aria-label="任务详情" className={styles.inspector}>
          <PlannerTaskInspector {...inspectorProps} />
        </aside>
      </div>
      {viewport !== "desktop" ? (
        <PlannerTaskSheet
          inspector={inspectorProps}
          onOpenChange={handleDetailOpenChange}
          open={detailOpen}
          triggerRef={triggerRef}
          viewport={viewport}
        />
      ) : null}
    </MotionProvider>
  );
}

function groupTasks(tasks: PlannerTask[]): Array<[string, PlannerTask[]]> {
  const groups = new Map<string, PlannerTask[]>();
  for (const task of tasks) {
    const key = task.scheduled_start_at
      ? "已排期"
      : task.due_date || task.due_at
        ? "有到期"
        : "待安排";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(task);
  }
  return [...groups.entries()];
}

function taskMeta(task: PlannerTask, timeZone: string): string {
  const parts = scheduledParts(task, timeZone);
  if (parts.date) return `计划 ${parts.date} ${parts.time} · ${task.estimated_minutes} 分钟`;
  if (task.due_date) return `到期 ${task.due_date} · ${task.estimated_minutes} 分钟`;
  if (task.due_at) return `定时到期 · ${task.estimated_minutes} 分钟`;
  return `${TASK_STATUS_LABELS[task.status]} · ${task.estimated_minutes} 分钟`;
}

const TASK_STATUS_LABELS = {
  open: "进行中",
  waiting: "等待",
  completed: "已完成",
  canceled: "已取消",
} satisfies Record<PlannerTask["status"], string>;

function scheduledParts(task: PlannerTask, timeZone: string): { date: string; time: string } {
  if (!task.scheduled_start_at) return { date: "", time: "" };
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: task.scheduled_timezone ?? timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(task.scheduled_start_at))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function draftTask(input: {
  id: string;
  listId: string;
  parentTaskId: string | null;
  title: string;
  dueDate: string | null;
  depth: 0 | 1 | 2 | 3;
}): PlannerTask {
  const now = new Date().toISOString();
  return {
    id: input.id,
    workspace_id: "optimistic",
    list_id: input.listId,
    parent_task_id: input.parentTaskId,
    depth: input.depth,
    title: input.title,
    notes: "",
    subject_code: null,
    status: "open",
    priority: 2,
    due_date: input.dueDate,
    due_at: null,
    due_timezone: null,
    scheduled_start_at: null,
    scheduled_end_at: null,
    scheduled_timezone: null,
    scheduled_all_day: 0,
    estimated_minutes: 30,
    series_id: null,
    occurrence_key: null,
    sort_order: 0,
    deleted_at: null,
    completed_at: null,
    canceled_at: null,
    version: 0,
    legacy_day_task_id: null,
    created_at: now,
    updated_at: now,
  };
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
