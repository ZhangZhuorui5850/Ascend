"use client";

import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import type { DatesSetArg, EventDropArg } from "@fullcalendar/core";
import {
  startTransition,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { addTaskAction, deleteTaskAction, scheduleTaskAction, toggleTaskAction } from "@/app/actions/planner";
import {
  createPlannerEventAction,
  deletePlannerEventAction,
  updatePlannerEventAction,
} from "@/app/actions/planner-events";
import {
  cancelPlannerReminderAction,
  createPlannerReminderAction,
} from "@/app/actions/planner-reminders";
import { useFeedback } from "@/components/FeedbackProvider";
import { CalendarAgenda } from "@/components/calendar/CalendarAgenda";
import { CalendarCanvas } from "@/components/calendar/CalendarCanvas";
import { CalendarContextRail } from "@/components/calendar/CalendarContextRail";
import {
  CalendarDayPopover,
  type CalendarDayPopoverState,
} from "@/components/calendar/CalendarDayPopover";
import {
  CalendarEventComposer,
  type NewCalendarEventDraft,
} from "@/components/calendar/CalendarEventComposer";
import {
  CalendarEventInspector,
  type CalendarEventMetadata,
  type CalendarEventReschedule,
} from "@/components/calendar/CalendarEventInspector";
import { CalendarMobileSheet } from "@/components/calendar/CalendarMobileSheet";
import { CalendarOverview } from "@/components/calendar/CalendarOverview";
import { CalendarTaskInbox } from "@/components/calendar/CalendarTaskInbox";
import {
  type CalendarContext,
  type CalendarDisplayView,
  CalendarToolbar,
} from "@/components/calendar/CalendarToolbar";
import {
  buildCalendarEvents,
  createCalendarRangeGate,
} from "@/components/calendar/calendar-events";
import { runPlannerMutation } from "@/components/planner/planner-mutations";
import { MotionProvider } from "@/components/ui/MotionProvider";
import type { PlannerMutationStatus } from "@/components/ui/PlannerStatusIndicator";
import { localDateTimeToUtc } from "@/lib/planner/time";
import type {
  CalendarEvent,
  PlannerCalendar,
  PlannerBusyStatus,
  PlannerEventKind,
  PlannerReminder,
} from "@/lib/planner/types";
import type { DayTask } from "@/lib/repo/planner";
import type { ExamCountdown } from "@/lib/repo/settings";
import styles from "@/styles/planner/calendar.module.css";

type CalendarViewProps = {
  tasks: DayTask[];
  exams: ExamCountdown[];
  plannerEvents: CalendarEvent[];
  calendars: PlannerCalendar[];
  timeZone: string;
  reminders: PlannerReminder[];
};

type NewEventDraft = NewCalendarEventDraft;

type MutationResult = { ok: boolean; error?: string };
type OptimisticCalendarTask = DayTask & { pending?: boolean };

export function CalendarWorkspace({ tasks, exams, plannerEvents, calendars, timeZone, reminders: initialReminders }: CalendarViewProps) {
  const { confirm, notify } = useFeedback();
  const mobile = useSyncExternalStore(subscribeMobile, readMobile, () => false);
  const [selectedView, setSelectedView] = useState<CalendarDisplayView | null>(null);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [context, setContext] = useState<CalendarContext>("inbox");
  const [contextOpen, setContextOpen] = useState(false);
  const [mutationStatus, setMutationStatus] = useState<PlannerMutationStatus>("idle");
  const [dayPopover, setDayPopover] = useState<CalendarDayPopoverState | null>(null);
  const [completionOverrides, setCompletionOverrides] = useState<Record<number, boolean>>({});
  const [removedIds, setRemovedIds] = useState<Set<number>>(() => new Set());
  const [calendarEvents, setCalendarEvents] = useState(plannerEvents);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [reminders, setReminders] = useState(initialReminders);
  const tempIdRef = useRef(-1);
  const calendarRef = useRef<FullCalendar | null>(null);
  const contextTriggerRef = useRef<HTMLElement | null>(null);
  const rangeGateRef = useRef(createCalendarRangeGate());
  const [optimisticTasks, addOptimisticTask] = useOptimistic(
    tasks as OptimisticCalendarTask[],
    (state: OptimisticCalendarTask[], task: OptimisticCalendarTask) => [...state, task],
  );
  const view = selectedView ?? (mobile ? "agenda" : "month");
  const displayTasks = optimisticTasks
    .filter((task) => !removedIds.has(task.id))
    .map((task) => completionOverrides[task.id] === undefined
      ? task
      : { ...task, done: completionOverrides[task.id] ? 1 : 0 });
  const openTasks = displayTasks.filter((task) => !task.done);
  const inbox = openTasks.filter((task) => !task.scheduled_start).slice(0, 12);
  const scheduledMinutes = openTasks.reduce((sum, task) => sum + (task.scheduled_start ? task.estimated_minutes : 0), 0);
  const events = buildCalendarEvents({
    tasks: displayTasks,
    exams,
    plannerEvents: calendarEvents,
    calendars,
  });
  const selectedEvent = calendarEvents.find((event) => event.id === selectedEventId) ?? null;

  useEffect(() => {
    const updateViewport = () => {
      const next = window.innerWidth <= 760
        ? "mobile"
        : window.innerWidth < 1180
          ? "tablet"
          : "desktop";
      setViewport(next);
      if (next === "desktop") setContextOpen(false);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (view === "agenda") return;
    const fullCalendarView = view === "week"
      ? "timeGridWeek"
      : view === "day"
        ? "timeGridDay"
        : "dayGridMonth";
    calendarRef.current?.getApi().changeView(fullCalendarView);
  }, [view]);

  function closePopover() {
    setDayPopover(null);
  }

  function openDay(day: string, anchorElement: HTMLElement) {
    setDayPopover({
      day,
      anchorElement,
    });
  }

  function openContext(next: Exclude<CalendarContext, "event">, trigger: HTMLButtonElement): void {
    contextTriggerRef.current = trigger;
    setContext(next);
    setMutationStatus("idle");
    if (viewport !== "desktop") setContextOpen(true);
  }

  function openEvent(eventId: string, trigger: HTMLElement): void {
    contextTriggerRef.current = trigger;
    setSelectedEventId(eventId);
    setContext("event");
    setMutationStatus("idle");
    if (viewport !== "desktop") setContextOpen(true);
  }

  function handleContextOpenChange(nextOpen: boolean): void {
    setContextOpen(nextOpen);
    if (!nextOpen) {
      queueMicrotask(() => {
        if (contextTriggerRef.current?.isConnected) {
          contextTriggerRef.current.focus({ preventScroll: true });
        }
      });
    }
  }

  function navigateCalendar(action: "prev" | "next" | "today"): void {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (action === "prev") api.prev();
    else if (action === "next") api.next();
    else api.today();
  }

  async function toggleTask(task: DayTask, done: boolean): Promise<MutationResult> {
    const previousDone = Boolean(task.done);
    setTaskCompletion(task.id, done);
    const result = await runPlannerMutation(
      () => toggleTaskAction({ id: task.id, day: task.day, done }),
      "网络异常，任务状态已恢复",
    );
    if (!result.ok) {
      setTaskCompletion(task.id, previousDone);
      notify(result.error || "任务状态更新失败", "error");
    }
    return result;
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

  // 弹窗内快速添加：乐观插入草稿行，action 的 revalidatePath 回流会带回真实任务
  function addDayTask(day: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const draft: OptimisticCalendarTask = {
      id: tempIdRef.current--,
      day,
      title: trimmed,
      subject_code: null,
      done: 0,
      sort_order: 0,
      priority: 2,
      estimated_minutes: 30,
      scheduled_start: null,
      notes: "",
      pending: true,
    };
    startTransition(async () => {
      addOptimisticTask(draft);
      const result = await runPlannerMutation(
        () => addTaskAction({ day, title: trimmed }),
        "网络异常，任务草稿将在刷新后清除",
      );
      if (!result.ok) notify(result.error || "添加任务失败", "error");
    });
  }

  async function removeDayTask(task: DayTask): Promise<MutationResult> {
    const result = await runPlannerMutation(
      () => deleteTaskAction({ id: task.id, day: task.day }),
      "网络异常，任务保持原状",
    );
    if (result.ok) setRemovedIds((current) => new Set(current).add(task.id));
    else notify(result.error || "删除任务失败", "error");
    return result;
  }

  async function moveTask(info: EventDropArg) {
    if (info.event.extendedProps.kind !== "task" || !info.event.start) return;
    setMutationStatus("optimistic");
    const result = await runPlannerMutation(
      () => scheduleTaskAction({
        id: Number(info.event.extendedProps.taskId),
        previousDay: String(info.event.extendedProps.previousDay),
        day: localDateKey(info.event.start!),
        scheduledStart: info.event.allDay ? null : localTimeKey(info.event.start!),
      }),
      "网络异常，任务已恢复原时间",
    );
    if (!result.ok) {
      info.revert();
      setMutationStatus("restored");
      notify(result.error || "任务改期失败", "error");
      return;
    }
    setMutationStatus("saved");
    notify("任务时间已更新", "success");
  }

  async function moveEvent(info: EventDropArg | EventResizeDoneArg) {
    const eventId = String(info.event.extendedProps.eventId);
    const previous = calendarEvents.find((event) => event.id === eventId);
    if (!previous || !info.event.start) return;
    setMutationStatus("optimistic");
    const patch = info.event.allDay
      ? {
          allDay: true as const,
          startDate: info.event.startStr.slice(0, 10),
          endDateExclusive: info.event.endStr
            ? info.event.endStr.slice(0, 10)
            : shiftLocalDate(info.event.startStr.slice(0, 10), 1),
        }
      : {
          allDay: false as const,
          startAt: info.event.start.toISOString(),
          endAt: (info.event.end ?? new Date(info.event.start.getTime() + 60 * 60 * 1000)).toISOString(),
          timezone: previous.timezone ?? timeZone,
        };
    setCalendarEvents((current) => current.map((event) => event.id === eventId
      ? { ...event, ...eventPatchToEntity(patch) }
      : event));
    const result = await runPlannerMutation(
      () => updatePlannerEventAction({
        id: eventId,
        expectedVersion: previous.version,
        ...patch,
      }),
      "网络异常，事件已恢复原时间",
    );
    if (result.ok && result.entity) {
      setCalendarEvents((current) => current.map((event) => event.id === eventId ? result.entity! : event));
      setMutationStatus("saved");
      notify("事件时间已更新", "success");
      return;
    }
    setCalendarEvents((current) => current.map((event) => event.id === eventId ? previous : event));
    info.revert();
    setMutationStatus(result.conflict ? "conflict" : "restored");
    notify(result.error || "事件时间更新失败", "error");
  }

  async function resizeTask(info: EventResizeDoneArg) {
    if (info.event.extendedProps.entityType === "event") {
      await moveEvent(info);
      return;
    }
    if (info.event.extendedProps.kind !== "task" || !info.event.start || !info.event.end) return;
    setMutationStatus("optimistic");
    const estimatedMinutes = Math.max(5, Math.round((info.event.end.getTime() - info.event.start.getTime()) / 60000));
    const result = await runPlannerMutation(
      () => scheduleTaskAction({
        id: Number(info.event.extendedProps.taskId),
        previousDay: String(info.event.extendedProps.previousDay),
        day: localDateKey(info.event.start!),
        scheduledStart: localTimeKey(info.event.start!),
        estimatedMinutes,
      }),
      "网络异常，任务时长已恢复",
    );
    if (!result.ok) {
      info.revert();
      setMutationStatus("restored");
      notify(result.error || "任务时长更新失败", "error");
      return;
    }
    setMutationStatus("saved");
    notify(`时间预算已调整为 ${estimatedMinutes} 分钟`, "success");
  }

  async function loadEventRange(info: DatesSetArg): Promise<void> {
    const requestId = rangeGateRef.current.issue();
    const params = new URLSearchParams({
      start: info.start.toISOString(),
      end: info.end.toISOString(),
      startDate: info.startStr.slice(0, 10),
      endDateExclusive: info.endStr.slice(0, 10),
    });
    try {
      const response = await fetch(`/api/planner/events?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("事件范围加载失败");
      const body = await response.json() as { events: CalendarEvent[] };
      if (!rangeGateRef.current.accepts(requestId)) return;
      setCalendarEvents(body.events);
      setSelectedEventId((current) => body.events.some((event) => event.id === current) ? current : null);
    } catch {
      notify("日历事件刷新失败", "error");
    }
  }

  function addEvent(input: NewEventDraft): void {
    const temporaryId = `draft:${crypto.randomUUID()}`;
    const optimistic = draftCalendarEvent(temporaryId, input, timeZone);
    setCalendarEvents((current) => [...current, optimistic]);
    setMutationStatus("optimistic");
    startTransition(async () => {
      const result = await runPlannerMutation(() => createPlannerEventAction(input.allDay
        ? {
            clientMutationId: crypto.randomUUID(),
            calendarId: input.calendarId,
            title: input.title,
            description: input.description,
            location: input.location,
            kind: input.kind,
            busyStatus: input.busyStatus,
            recurrenceRule: input.recurrenceRule || null,
            allDay: true,
            startDate: input.startDate,
            endDateExclusive: input.endDate,
          }
        : {
            clientMutationId: crypto.randomUUID(),
            calendarId: input.calendarId,
            title: input.title,
            description: input.description,
            location: input.location,
            kind: input.kind,
            busyStatus: input.busyStatus,
            recurrenceRule: input.recurrenceRule || null,
            allDay: false,
            startDate: input.startDate,
            startTime: input.startTime,
            endDate: input.endDate,
            endTime: input.endTime,
          }), "网络异常，事件草稿已恢复");
      if (result.ok && result.entity) {
        setCalendarEvents((current) => current.map((event) => event.id === temporaryId ? result.entity! : event));
        setSelectedEventId(result.entity.id);
        setContext("event");
        setMutationStatus("saved");
      } else {
        setCalendarEvents((current) => current.filter((event) => event.id !== temporaryId));
        setMutationStatus(result.conflict ? "conflict" : "restored");
        notify(result.error || "创建事件失败", "error");
      }
    });
  }

  function saveEvent(input: {
    title: string;
    description: string;
    location: string;
    calendarId: string;
    kind: PlannerEventKind;
    busyStatus: PlannerBusyStatus;
    recurrenceRule: string | null;
  }): void {
    if (!selectedEvent) return;
    const previous = selectedEvent;
    const targetId = previous.recurring_event_id ?? previous.id;
    setCalendarEvents((current) => current.map((event) => (
      event.id === previous.id || event.recurring_event_id === targetId
        ? {
            ...event,
            title: input.title,
            description: input.description,
            location: input.location,
            calendar_id: input.calendarId,
            kind: input.kind,
            busy_status: input.busyStatus,
          }
        : event
    )));
    setMutationStatus("optimistic");
    startTransition(async () => {
      const result = await runPlannerMutation(() => updatePlannerEventAction({
        id: targetId,
        expectedVersion: previous.version,
        ...input,
      }), "网络异常，事件字段已恢复");
      if (result.ok && result.entity) {
        setCalendarEvents((current) => current.map((event) => (
          event.id === previous.id || event.recurring_event_id === targetId
            ? { ...event, version: result.entity!.version, recurrence_rule: input.recurrenceRule }
            : event
        )));
        setMutationStatus("saved");
      } else {
        setCalendarEvents((current) => current.map((event) => event.id === previous.id ? previous : event));
        setMutationStatus(result.conflict ? "conflict" : "restored");
        notify(result.error || "保存事件失败", "error");
      }
    });
  }

  function rescheduleEvent(input: CalendarEventReschedule): void {
    if (!selectedEvent) return;
    const previous = selectedEvent;
    const targetId = previous.recurring_event_id ?? previous.id;
    const patch = input.allDay
      ? {
          allDay: true as const,
          startDate: input.startDate,
          endDateExclusive: input.endDate > input.startDate
            ? input.endDate
            : shiftLocalDate(input.startDate, 1),
        }
      : {
          allDay: false as const,
          startAt: localDateTimeToUtc({
            date: input.startDate,
            time: input.startTime,
            timeZone,
          }),
          endAt: localDateTimeToUtc({
            date: input.endDate,
            time: input.endTime,
            timeZone,
          }),
          timezone: timeZone,
        };
    setCalendarEvents((current) => current.map((event) => (
      event.id === previous.id
        ? { ...event, ...eventPatchToEntity(patch) }
        : event
    )));
    setMutationStatus("optimistic");
    startTransition(async () => {
      const result = await runPlannerMutation(() => updatePlannerEventAction({
        id: targetId,
        expectedVersion: previous.version,
        ...patch,
      }), "网络异常，事件时间已恢复");
      if (result.ok && result.entity) {
        setCalendarEvents((current) => current.map((event) => (
          event.id === previous.id ? result.entity! : event
        )));
        setMutationStatus("saved");
        notify("事件日期与时间已更新");
      } else {
        setCalendarEvents((current) => current.map((event) => (
          event.id === previous.id ? previous : event
        )));
        setMutationStatus(result.conflict ? "conflict" : "restored");
        notify(result.error || "事件改期失败", result.conflict ? "conflict" : "error");
      }
    });
  }

  async function confirmRemoveEvent(): Promise<void> {
    const approved = await confirm({
      title: "删除事件",
      description: "这个事件将进入回收状态。",
      confirmLabel: "删除事件",
      danger: true,
    });
    if (approved) removeEvent();
  }

  function removeEvent(): void {
    if (!selectedEvent) return;
    const previous = selectedEvent;
    const targetId = previous.recurring_event_id ?? previous.id;
    setCalendarEvents((current) => current.filter((event) => (
      event.id !== previous.id && event.recurring_event_id !== targetId
    )));
    setSelectedEventId(null);
    setContext("inbox");
    setMutationStatus("optimistic");
    startTransition(async () => {
      const result = await runPlannerMutation(() => deletePlannerEventAction({
        id: targetId,
        expectedVersion: previous.version,
        clientMutationId: crypto.randomUUID(),
      }), "网络异常，事件已恢复");
      if (!result.ok) {
        setCalendarEvents((current) => [...current, previous]);
        setSelectedEventId(previous.id);
        setContext("event");
        setMutationStatus(result.conflict ? "conflict" : "restored");
        notify(result.error || "删除事件失败", "error");
      } else {
        setMutationStatus("saved");
      }
    });
  }

  function addEventReminder(input: { offsetMinutes: number; channel: "in_app" | "web_push" }): void {
    if (!selectedEvent) return;
    const entityId = selectedEvent.recurring_event_id ?? selectedEvent.id;
    startTransition(async () => {
      const result = await runPlannerMutation(() => createPlannerReminderAction({
        clientMutationId: crypto.randomUUID(),
        entityType: "event",
        entityId,
        anchor: "event_start",
        offsetMinutes: input.offsetMinutes,
        channel: input.channel,
      }), "网络异常，事件提醒创建失败");
      if (result.ok && result.entity) {
        setReminders((current) => [...current, result.entity!]);
      } else {
        notify(result.error || "创建事件提醒失败", "error");
      }
    });
  }

  function cancelEventReminder(reminder: PlannerReminder): void {
    startTransition(async () => {
      const result = await runPlannerMutation(
        () => cancelPlannerReminderAction({ id: reminder.id, entityType: "event" }),
        "网络异常，事件提醒保持启用",
      );
      if (result.ok && result.entity) {
        setReminders((current) => current.map((item) => item.id === reminder.id ? result.entity! : item));
      } else {
        notify(result.error || "取消事件提醒失败", "error");
      }
    });
  }

  const activeContext: CalendarContext = context === "event" && !selectedEvent
    ? "inbox"
    : context;

  function renderContext(titleInputRef?: React.RefObject<HTMLInputElement | null>) {
    if (activeContext === "composer") {
      return (
        <CalendarEventComposer
          calendars={calendars}
          onCreate={addEvent}
          timeZone={timeZone}
          titleInputRef={titleInputRef}
        />
      );
    }
    if (activeContext === "event" && selectedEvent) {
      return (
        <CalendarEventInspector
          calendars={calendars}
          event={selectedEvent}
          mutationStatus={mutationStatus}
          onAddReminder={addEventReminder}
          onCancelReminder={cancelEventReminder}
          onDelete={() => void confirmRemoveEvent()}
          onReschedule={rescheduleEvent}
          onSave={saveEvent as (input: CalendarEventMetadata) => void}
          reminders={reminders.filter((reminder) => (
            reminder.entity_type === "event"
            && reminder.entity_id === (selectedEvent.recurring_event_id ?? selectedEvent.id)
          ))}
          timeZone={timeZone}
          titleInputRef={titleInputRef}
        />
      );
    }
    return <CalendarTaskInbox tasks={inbox} timeZone={timeZone} />;
  }

  return (
    <MotionProvider>
      <div className={styles.workspace} data-planner-workspace="calendar">
        <CalendarOverview
          completed={displayTasks.filter((task) => task.done).length}
          exams={exams.length}
          inbox={inbox.length}
          scheduledMinutes={scheduledMinutes}
        />
        <div className={styles.layout}>
          <section className={styles.canvasColumn}>
            <CalendarToolbar
              activeContext={activeContext}
              activeView={view}
              onContext={openContext}
              onNavigate={navigateCalendar}
              onView={setSelectedView}
            />
            {view === "agenda" ? (
              <CalendarAgenda
                events={calendarEvents}
                exams={exams}
                onOpenDay={(day, trigger) => openDay(day, trigger)}
                tasks={displayTasks}
              />
            ) : (
              <CalendarCanvas
                calendarRef={calendarRef}
                events={events}
                onDateClick={(info) => openDay(info.dateStr.slice(0, 10), info.dayEl)}
                onDatesSet={(info) => void loadEventRange(info)}
                onEventClick={(info) => {
                  if (info.event.extendedProps.entityType === "event") {
                    openEvent(String(info.event.extendedProps.eventId), info.el);
                    return;
                  }
                  const day = info.event.start
                    ? localDateKey(info.event.start)
                    : info.event.startStr.slice(0, 10);
                  openDay(day, info.el);
                }}
                onEventDrop={(info) => void (
                  info.event.extendedProps.entityType === "event"
                    ? moveEvent(info)
                    : moveTask(info)
                )}
                onEventResize={(info) => void resizeTask(info)}
                timeZone={timeZone}
              />
            )}
            {dayPopover ? <CalendarDayPopover
              exams={exams.filter((exam) => exam.date === dayPopover.day)}
              key={dayPopover.day}
              onAdd={(title) => addDayTask(dayPopover.day, title)}
              onClose={closePopover}
              onRemove={removeDayTask}
              onToggle={toggleTask}
              popover={dayPopover}
              tasks={displayTasks.filter((task) => task.day === dayPopover.day)}
            /> : null}
          </section>
          <CalendarContextRail context={activeContext} mutationStatus={mutationStatus}>
            {renderContext()}
          </CalendarContextRail>
        </div>
      </div>
      {viewport !== "desktop" ? (
        <CalendarMobileSheet
          context={activeContext}
          mutationStatus={mutationStatus}
          onOpenChange={handleContextOpenChange}
          open={contextOpen}
          triggerRef={contextTriggerRef}
          viewport={viewport}
        >
          {(initialFocus) => renderContext(initialFocus)}
        </CalendarMobileSheet>
      ) : null}
    </MotionProvider>
  );
}

function draftCalendarEvent(id: string, input: NewEventDraft, timeZone: string): CalendarEvent {
  const now = new Date().toISOString();
  const startAt = input.allDay ? null : localDateTimeToUtc({
    date: input.startDate,
    time: input.startTime,
    timeZone,
  });
  const endAt = input.allDay ? null : localDateTimeToUtc({
    date: input.endDate,
    time: input.endTime,
    timeZone,
  });
  return {
    id,
    workspace_id: "optimistic",
    calendar_id: input.calendarId,
    title: input.title,
    description: input.description,
    location: input.location,
    url: "",
    subject_code: null,
    kind: input.kind,
    busy_status: input.busyStatus,
    start_at: startAt,
    end_at: endAt,
    timezone: input.allDay ? null : timeZone,
    start_date: input.allDay ? input.startDate : null,
    end_date_exclusive: input.allDay ? input.endDate : null,
    all_day: input.allDay ? 1 : 0,
    recurrence_rule: input.recurrenceRule || null,
    recurrence_until: null,
    recurring_event_id: null,
    original_start_at: null,
    exception_kind: null,
    migration_key: null,
    deleted_at: null,
    version: 0,
    created_at: now,
    updated_at: now,
  };
}

function eventPatchToEntity(patch: (
  | { allDay: true; startDate: string; endDateExclusive: string }
  | { allDay: false; startAt: string; endAt: string; timezone: string }
)): Partial<CalendarEvent> {
  if (patch.allDay) {
    return {
      all_day: 1,
      start_date: patch.startDate,
      end_date_exclusive: patch.endDateExclusive,
      start_at: null,
      end_at: null,
      timezone: null,
    };
  }
  return {
    all_day: 0,
    start_at: patch.startAt,
    end_at: patch.endAt,
    timezone: patch.timezone,
    start_date: null,
    end_date_exclusive: null,
  };
}

function shiftLocalDate(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTimeKey(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 760px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function readMobile() {
  return window.matchMedia("(max-width: 760px)").matches;
}
