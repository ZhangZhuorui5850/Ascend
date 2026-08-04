"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronLeft,
  ChevronRight, Circle, Clock3, Command, Focus, GripVertical, Layers3,
  MapPin, Orbit, Plus, Radar, Sparkles, Target, Trash2, X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useRef, useState, useTransition } from "react";
import {
  createPlannerEventAction,
  deletePlannerEventAction,
  updatePlannerEventAction,
} from "@/app/actions/planner-events";
import { createPlannerTaskAction, updatePlannerTaskAction } from "@/app/actions/planner-tasks";
import { localDateTimeToUtc, utcToZonedDateTime } from "@/lib/planner/time";
import type { CalendarEvent, PlannerCalendar, PlannerEventKind, PlannerTask, TaskList } from "@/lib/planner/types";
import type { ExamCountdown } from "@/lib/repo/settings";
import styles from "./KineticCalendar.module.css";

type CalendarMode = "month" | "agenda" | "focus";
type DragSignal = { type: "task" | "event"; id: string };

const EVENT_KINDS: Array<{ value: PlannerEventKind; label: string }> = [
  { value: "event", label: "事件" },
  { value: "class", label: "课程" },
  { value: "exam", label: "考试" },
  { value: "meeting", label: "会议" },
  { value: "focus", label: "专注" },
  { value: "milestone", label: "里程碑" },
];

export function KineticCalendar({ calendars, events: initialEvents, exams, lists, tasks: initialTasks, timeZone, today }: {
  calendars: PlannerCalendar[];
  events: CalendarEvent[];
  exams: ExamCountdown[];
  lists: TaskList[];
  tasks: PlannerTask[];
  timeZone: string;
  today: string;
}) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<CalendarMode>("month");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  const [tasks, setTasks] = useState(initialTasks);
  const [events, setEvents] = useState(initialEvents);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerAllDay, setComposerAllDay] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dragSignal, setDragSignal] = useState<DragSignal | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toastTimer = useRef<number | null>(null);
  const inboxId = lists.find((list) => list.is_inbox)?.id ?? lists[0]?.id ?? "";
  const defaultCalendarId = calendars.find((calendar) => calendar.is_default)?.id ?? calendars[0]?.id ?? "";
  const cells = useMemo(() => calendarCells(month), [month]);
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  const selectedItems = useMemo(() => itemsForDay(selectedDay, tasks, events, timeZone), [events, selectedDay, tasks, timeZone]);
  const monthItems = useMemo(() => itemsForMonth(month, tasks, events, timeZone), [events, month, tasks, timeZone]);
  const scheduledMinutes = tasks.filter((task) => !task.deleted_at && task.status !== "completed" && task.scheduled_start_at)
    .reduce((sum, task) => sum + task.estimated_minutes, 0);
  const collisionDays = cells.filter((day) => itemsForDay(day, tasks, events, timeZone).length >= 4).length;

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const moveMonth = (amount: number) => {
    const value = new Date(`${month}-15T12:00:00Z`);
    value.setUTCMonth(value.getUTCMonth() + amount);
    setMonth(value.toISOString().slice(0, 7));
  };

  const goToday = () => {
    setMonth(today.slice(0, 7));
    setSelectedDay(today);
  };

  const toggleTask = (task: PlannerTask) => {
    const status = task.status === "completed" ? "open" : "completed";
    const previous = tasks;
    setTasks((items) => items.map((item) => item.id === task.id ? { ...item, status } : item));
    startTransition(async () => {
      const result = await updatePlannerTaskAction({ id: task.id, expectedVersion: task.version, status });
      if (!result.ok || !result.entity) {
        setTasks(previous);
        notify(result.error || "任务状态更新失败");
        return;
      }
      setTasks((items) => items.map((item) => item.id === task.id ? result.entity! : item));
      notify(status === "completed" ? "任务轨迹已闭合" : "任务重新进入时间场");
    });
  };

  const createTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const start = String(data.get("start") ?? "09:00");
    if (!title || !inboxId) return;
    form.reset();
    startTransition(async () => {
      const result = await createPlannerTaskAction({
        clientMutationId: crypto.randomUUID(),
        listId: inboxId,
        title,
        scheduledDate: selectedDay,
        scheduledStart: start || "09:00",
        dueDate: selectedDay,
        estimatedMinutes: 30,
        priority: 2,
      });
      if (!result.ok || !result.entity) return notify(result.error || "任务创建失败");
      setTasks((items) => [...items, result.entity!]);
      notify("任务已进入所选日期");
    });
  };

  const createEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const calendarId = String(data.get("calendarId") ?? defaultCalendarId);
    const kind = String(data.get("kind") ?? "event") as PlannerEventKind;
    const startDate = String(data.get("startDate") ?? selectedDay);
    const endDate = String(data.get("endDate") ?? startDate);
    const startTime = String(data.get("startTime") ?? "09:00");
    const endTime = String(data.get("endTime") ?? "10:00");
    if (!title || !calendarId) return;
    startTransition(async () => {
      const result = await createPlannerEventAction(composerAllDay ? {
        clientMutationId: crypto.randomUUID(), calendarId, title, kind, busyStatus: "busy",
        description: String(data.get("description") ?? ""), location: String(data.get("location") ?? ""),
        allDay: true, startDate, endDateExclusive: shiftDate(endDate, 1),
      } : {
        clientMutationId: crypto.randomUUID(), calendarId, title, kind, busyStatus: "busy",
        description: String(data.get("description") ?? ""), location: String(data.get("location") ?? ""),
        allDay: false, startDate, startTime, endDate, endTime,
      });
      if (!result.ok || !result.entity) return notify(result.error || "事件创建失败");
      setEvents((items) => [...items, result.entity!]);
      setComposerOpen(false);
      setSelectedEventId(result.entity.id);
      notify("时间事件已写入日历");
    });
  };

  const saveEvent = (event: FormEvent<HTMLFormElement>, item: CalendarEvent) => {
    event.preventDefault();
    if (item.recurring_event_id) return notify("重复事件实例请在原始日历规则中调整");
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? item.title).trim();
    const date = String(data.get("date") ?? eventDate(item, timeZone));
    const startTime = String(data.get("startTime") ?? eventTime(item, timeZone));
    const endTime = String(data.get("endTime") ?? eventEndTime(item, timeZone));
    const patch = item.all_day ? {
      allDay: true as const,
      startDate: date,
      endDateExclusive: shiftDate(date, Math.max(1, dateDistance(item.start_date!, item.end_date_exclusive!))),
    } : {
      allDay: false as const,
      startAt: localDateTimeToUtc({ date, time: startTime, timeZone }),
      endAt: localDateTimeToUtc({ date, time: endTime, timeZone }),
      timezone: timeZone,
    };
    startTransition(async () => {
      const result = await updatePlannerEventAction({ id: item.id, expectedVersion: item.version, title, ...patch });
      if (!result.ok || !result.entity) return notify(result.error || "事件保存失败");
      setEvents((items) => items.map((current) => current.id === item.id ? result.entity! : current));
      notify("事件参数已同步");
    });
  };

  const removeEvent = (item: CalendarEvent) => {
    if (item.recurring_event_id) return notify("重复事件实例需从原始规则删除");
    startTransition(async () => {
      const result = await deletePlannerEventAction({ id: item.id, expectedVersion: item.version, clientMutationId: crypto.randomUUID() });
      if (!result.ok) return notify(result.error || "事件删除失败");
      setEvents((items) => items.filter((current) => current.id !== item.id));
      setSelectedEventId(null);
      notify("事件已移出当前时间场");
    });
  };

  const dropOnDay = (day: string) => {
    if (!dragSignal) return;
    if (dragSignal.type === "task") {
      const task = tasks.find((item) => item.id === dragSignal.id);
      if (!task) return;
      const time = task.scheduled_start_at
        ? utcToZonedDateTime(task.scheduled_start_at, task.scheduled_timezone || timeZone).time.slice(0, 5)
        : "09:00";
      startTransition(async () => {
        const result = await updatePlannerTaskAction({ id: task.id, expectedVersion: task.version, dueDate: day, scheduledDate: day, scheduledStart: time });
        if (!result.ok || !result.entity) return notify(result.error || "任务改期失败");
        setTasks((items) => items.map((current) => current.id === task.id ? result.entity! : current));
        notify(`任务已移动到 ${day}`);
      });
    } else {
      const item = events.find((event) => event.id === dragSignal.id);
      if (!item) return;
      if (item.recurring_event_id) return notify("重复事件实例不能直接拖动");
      const patch = item.all_day ? {
        allDay: true as const,
        startDate: day,
        endDateExclusive: shiftDate(day, Math.max(1, dateDistance(item.start_date!, item.end_date_exclusive!))),
      } : {
        allDay: false as const,
        startAt: localDateTimeToUtc({ date: day, time: eventTime(item, timeZone), timeZone }),
        endAt: localDateTimeToUtc({ date: day, time: eventEndTime(item, timeZone), timeZone }),
        timezone: timeZone,
      };
      startTransition(async () => {
        const result = await updatePlannerEventAction({ id: item.id, expectedVersion: item.version, ...patch });
        if (!result.ok || !result.entity) return notify(result.error || "事件改期失败");
        setEvents((items) => items.map((current) => current.id === item.id ? result.entity! : current));
        notify(`事件已移动到 ${day}`);
      });
    }
    setDragSignal(null);
  };

  return <div className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}><span><Radar size={14} />TEMPORAL GRAVITY FIELD</span><h1>时间不是格子，<br />是<span>注意力的引力场。</span></h1><p>任务、课程、考试与深度工作共同竞争有限认知带宽。拖动轨迹改变日期；点击任意一天，下钻到真实的执行与学习证据。</p></div>
      <div className={styles.heroOrbit} aria-hidden="true"><i /><i /><i /><strong>{month.slice(5)}</strong><small>{month.slice(0,4)}</small></div>
      <div className={styles.metrics}>
        <div><small>SCHEDULED</small><strong>{scheduledMinutes}<span>m</span></strong><p>已排任务预算</p></div>
        <div><small>EVENTS</small><strong>{monthItems.events}</strong><p>本月时间事件</p></div>
        <div><small>COLLISION</small><strong>{collisionDays}</strong><p>高密度日期</p></div>
        <div><small>MILESTONE</small><strong>{exams.filter((exam) => exam.date.slice(0,7) === month).length}</strong><p>考试节点</p></div>
      </div>
    </header>

    <section className={styles.controlRail}>
      <div className={styles.monthControl}><button aria-label="上个月" onClick={() => moveMonth(-1)} type="button"><ChevronLeft size={17} /></button><button onClick={goToday} type="button">TODAY</button><button aria-label="下个月" onClick={() => moveMonth(1)} type="button"><ChevronRight size={17} /></button><strong>{formatMonth(month, timeZone)}</strong></div>
      <div className={styles.modeControl}>{(["month","agenda","focus"] as CalendarMode[]).map((item) => <button aria-pressed={mode === item} className={mode === item ? styles.modeActive : ""} key={item} onClick={() => setMode(item)} type="button">{mode === item ? <motion.i layoutId="kinetic-calendar-mode" /> : null}<span>{item === "month" ? "月场" : item === "agenda" ? "议程" : "负载"}</span></button>)}</div>
      <button className={styles.createButton} onClick={() => { setComposerOpen(true); setSelectedEventId(null); }} type="button"><Plus size={15} />新建事件<Command size={13} /></button>
    </section>

    <AnimatePresence mode="wait" initial={false}>
      <motion.main animate={{opacity:1,y:0,filter:"blur(0px)"}} className={styles.stage} exit={reduceMotion ? undefined : {opacity:0,y:-12,filter:"blur(8px)"}} initial={reduceMotion ? false : {opacity:0,y:18,filter:"blur(10px)"}} key={mode}>
        {mode === "month" ? <MonthField cells={cells} events={events} month={month} onDrag={setDragSignal} onDrop={dropOnDay} onOpenEvent={setSelectedEventId} onSelect={setSelectedDay} selectedDay={selectedDay} tasks={tasks} timeZone={timeZone} today={today} /> : null}
        {mode === "agenda" ? <AgendaField events={events} onOpenEvent={setSelectedEventId} onSelect={setSelectedDay} tasks={tasks} timeZone={timeZone} today={today} /> : null}
        {mode === "focus" ? <LoadField events={events} month={month} onSelect={(day) => {setSelectedDay(day);setMode("month");}} tasks={tasks} timeZone={timeZone} /> : null}
      </motion.main>
    </AnimatePresence>

    <aside className={styles.dayInspector}>
      <header><div><small>SELECTED DAY</small><h2>{formatSelectedDay(selectedDay,timeZone)}</h2></div><Link href={`/kinetic/day/${selectedDay}`}>进入工作台 <ArrowUpRight size={15} /></Link></header>
      <div className={styles.dayPulse}><i style={{transform:`scaleX(${Math.min(1,selectedItems.length/6)})`}} /><strong>{selectedItems.length}</strong><span>条时间信号</span></div>
      <div className={styles.inspectorItems}>{selectedItems.map((item) => item.type === "task" ? <article data-kind="task" key={item.id}><button aria-label={item.task.status === "completed" ? `恢复 ${item.title}` : `完成 ${item.title}`} onClick={() => toggleTask(item.task)} type="button">{item.task.status === "completed" ? <Check size={13}/> : <Circle size={13}/>}</button><div><small>{item.time} · TASK</small><strong>{item.title}</strong></div><GripVertical size={14}/></article> : <button data-kind={item.event.kind} key={item.id} onClick={() => setSelectedEventId(item.event.id)} type="button"><span><EventIcon kind={item.event.kind}/></span><div><small>{item.time} · {item.event.kind.toUpperCase()}</small><strong>{item.title}</strong></div><ArrowRight size={14}/></button>)}</div>
      <form className={styles.quickTask} onSubmit={createTask}><Plus size={15}/><input name="title" placeholder="在这一天放入任务…" required/><input aria-label="任务时间" defaultValue="09:00" name="start" type="time"/><button disabled={pending} type="submit">加入</button></form>
    </aside>

    <AnimatePresence>{composerOpen ? <EventComposer allDay={composerAllDay} calendars={calendars} defaultCalendarId={defaultCalendarId} onAllDay={setComposerAllDay} onClose={() => setComposerOpen(false)} onSubmit={createEvent} pending={pending} selectedDay={selectedDay}/> : null}</AnimatePresence>
    <AnimatePresence>{selectedEvent ? <EventInspector event={selectedEvent} onClose={() => setSelectedEventId(null)} onDelete={() => removeEvent(selectedEvent)} onSubmit={(submitEvent) => saveEvent(submitEvent,selectedEvent)} pending={pending} timeZone={timeZone}/> : null}</AnimatePresence>
    <AnimatePresence>{toast ? <motion.div animate={{opacity:1,y:0,scale:1}} className={styles.toast} exit={{opacity:0,y:12,scale:.95}} initial={{opacity:0,y:24,scale:.94}} role="status"><Sparkles size={14}/>{toast}</motion.div> : null}</AnimatePresence>
  </div>;
}

type DayItem = { type:"task";id:string;title:string;time:string;task:PlannerTask } | { type:"event";id:string;title:string;time:string;event:CalendarEvent };

function MonthField({cells,events,month,onDrag,onDrop,onOpenEvent,onSelect,selectedDay,tasks,timeZone,today}:{cells:string[];events:CalendarEvent[];month:string;onDrag:(signal:DragSignal)=>void;onDrop:(day:string)=>void;onOpenEvent:(id:string)=>void;onSelect:(day:string)=>void;selectedDay:string;tasks:PlannerTask[];timeZone:string;today:string}) {
  return <section className={styles.monthField}><div className={styles.weekdays}>{["MON","TUE","WED","THU","FRI","SAT","SUN"].map((day)=><span key={day}>{day}</span>)}</div><div className={styles.monthGrid}>{cells.map((day)=>{const items=itemsForDay(day,tasks,events,timeZone);return <article className={day.slice(0,7)!==month?styles.outsideMonth:""} data-selected={day===selectedDay} data-today={day===today} key={day} onDragOver={(event)=>event.preventDefault()} onDrop={()=>onDrop(day)}><header><button aria-label={`选择 ${day}`} onClick={()=>onSelect(day)} type="button">{Number(day.slice(8))}</button>{day===today?<span>NOW</span>:null}</header><div>{items.slice(0,3).map((item)=>item.type==="task"?<button className={styles.taskChip} data-done={item.task.status==="completed"} draggable key={item.id} onClick={()=>onSelect(day)} onDragStart={()=>onDrag({type:"task",id:item.id})} type="button"><i/><span>{item.time}</span><strong>{item.title}</strong></button>:<button className={styles.eventChip} data-kind={item.event.kind} draggable={!item.event.recurring_event_id} key={item.id} onClick={()=>onOpenEvent(item.event.id)} onDragStart={()=>onDrag({type:"event",id:item.id})} type="button"><i/><span>{item.time}</span><strong>{item.title}</strong></button>)}{items.length>3?<button className={styles.moreChip} onClick={()=>onSelect(day)} type="button">+{items.length-3} SIGNALS</button>:null}</div></article>})}</div></section>;
}

function AgendaField({events,onOpenEvent,onSelect,tasks,timeZone,today}:{events:CalendarEvent[];onOpenEvent:(id:string)=>void;onSelect:(day:string)=>void;tasks:PlannerTask[];timeZone:string;today:string}) {
  const days=Array.from({length:21},(_,index)=>shiftDate(today,index));
  return <section className={styles.agendaField}>{days.map((day)=>{const items=itemsForDay(day,tasks,events,timeZone);if(!items.length)return null;return <article key={day}><button className={styles.agendaDate} onClick={()=>onSelect(day)} type="button"><strong>{day.slice(8)}</strong><span>{formatWeekday(day,timeZone)}<small>{day.slice(5,7)} / {day.slice(0,4)}</small></span></button><div>{items.map((item)=><button key={item.id} onClick={()=>item.type==="event"?onOpenEvent(item.event.id):onSelect(day)} type="button"><span>{item.time}</span><i data-kind={item.type==="event"?item.event.kind:"task"}/><strong>{item.title}</strong><small>{item.type==="task"?`${item.task.estimated_minutes}m · TASK`:item.event.kind.toUpperCase()}</small><ArrowUpRight size={14}/></button>)}</div></article>})}</section>;
}

function LoadField({events,month,onSelect,tasks,timeZone}:{events:CalendarEvent[];month:string;onSelect:(day:string)=>void;tasks:PlannerTask[];timeZone:string}) {
  const days=monthDays(month);const loads=days.map((day)=>({day,items:itemsForDay(day,tasks,events,timeZone)}));const max=Math.max(1,...loads.map((item)=>item.items.length));
  return <section className={styles.loadField}><div><span>COGNITIVE LOAD MAP</span><h2>看见时间表背后的<br/><strong>认知拥挤。</strong></h2><p>高度代表同一天的时间信号数量；颜色表示任务、考试与深潜事件的构成。高峰不一定高效，它通常意味着需要重新取舍。</p></div><div className={styles.loadBars}>{loads.map(({day,items})=><button aria-label={`${day}，${items.length} 条信号`} key={day} onClick={()=>onSelect(day)} style={{"--load":Math.max(.04,items.length/max)} as React.CSSProperties} type="button"><span>{items.length}</span><i/><small>{day.slice(8)}</small></button>)}</div><aside><Target size={20}/><small>PEAK DAY</small>{[...loads].sort((a,b)=>b.items.length-a.items.length).slice(0,3).map((item)=><button key={item.day} onClick={()=>onSelect(item.day)} type="button"><span>{item.day}</span><strong>{item.items.length} signals</strong><ArrowRight size={13}/></button>)}</aside></section>;
}

function EventComposer({allDay,calendars,defaultCalendarId,onAllDay,onClose,onSubmit,pending,selectedDay}:{allDay:boolean;calendars:PlannerCalendar[];defaultCalendarId:string;onAllDay:(value:boolean)=>void;onClose:()=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;pending:boolean;selectedDay:string}) {
  return <motion.div animate={{opacity:1}} className={styles.modalBackdrop} exit={{opacity:0}} initial={{opacity:0}}><motion.form aria-label="创建时间事件" aria-modal="true" animate={{y:0,scale:1}} className={styles.modal} initial={{y:28,scale:.97}} onSubmit={onSubmit} role="dialog"><header><div><small>NEW TEMPORAL SIGNAL</small><h2>创建时间事件</h2></div><button aria-label="关闭" onClick={onClose} type="button"><X size={17}/></button></header><label>标题<input autoFocus name="title" placeholder="课程、会议、考试或深度工作…" required/></label><div className={styles.formRow}><label>日历<select defaultValue={defaultCalendarId} name="calendarId">{calendars.map((calendar)=><option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}</select></label><label>类型<select defaultValue="event" name="kind">{EVENT_KINDS.map((kind)=><option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label></div><label className={styles.checkLabel}><input checked={allDay} onChange={(event)=>onAllDay(event.target.checked)} type="checkbox"/>全天事件</label><div className={styles.formRow}><label>开始日期<input defaultValue={selectedDay} name="startDate" type="date" required/></label><label>结束日期<input defaultValue={selectedDay} name="endDate" type="date" required/></label></div>{!allDay?<div className={styles.formRow}><label>开始时间<input defaultValue="09:00" name="startTime" type="time" required/></label><label>结束时间<input defaultValue="10:00" name="endTime" type="time" required/></label></div>:null}<label>地点<input name="location" placeholder="可选"/></label><label>描述<textarea name="description" placeholder="目标、议程或准备材料…" rows={3}/></label><footer><button onClick={onClose} type="button">取消</button><button disabled={pending} type="submit">写入时间场 <ArrowUpRight size={14}/></button></footer></motion.form></motion.div>;
}

function EventInspector({event,onClose,onDelete,onSubmit,pending,timeZone}:{event:CalendarEvent;onClose:()=>void;onDelete:()=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;pending:boolean;timeZone:string}) {
  return <motion.div animate={{opacity:1}} className={styles.modalBackdrop} exit={{opacity:0}} initial={{opacity:0}}><motion.form aria-label="事件参数" aria-modal="true" animate={{x:0}} className={`${styles.modal} ${styles.inspectorModal}`} initial={{x:40}} onSubmit={onSubmit} role="dialog"><header><div><small>{event.kind.toUpperCase()} / EVENT SIGNAL</small><h2>事件参数</h2></div><button aria-label="关闭" onClick={onClose} type="button"><X size={17}/></button></header>{event.recurring_event_id?<p className={styles.ruleNotice}>这是重复事件实例，当前为只读；请调整原始重复规则。</p>:null}<label>标题<input defaultValue={event.title} disabled={Boolean(event.recurring_event_id)} name="title" required/></label><label>日期<input defaultValue={eventDate(event,timeZone)} disabled={Boolean(event.recurring_event_id)} name="date" type="date" required/></label>{!event.all_day?<div className={styles.formRow}><label>开始<input defaultValue={eventTime(event,timeZone)} disabled={Boolean(event.recurring_event_id)} name="startTime" type="time"/></label><label>结束<input defaultValue={eventEndTime(event,timeZone)} disabled={Boolean(event.recurring_event_id)} name="endTime" type="time"/></label></div>:null}<div className={styles.eventFacts}><span><EventIcon kind={event.kind}/>{event.kind}</span>{event.location?<span><MapPin size={14}/>{event.location}</span>:null}<span><Clock3 size={14}/>{event.all_day?"全天":`${eventTime(event,timeZone)}–${eventEndTime(event,timeZone)}`}</span></div>{event.description?<p className={styles.eventDescription}>{event.description}</p>:null}<footer><button className={styles.deleteButton} disabled={pending||Boolean(event.recurring_event_id)} onClick={onDelete} type="button"><Trash2 size={14}/>删除</button><button disabled={pending||Boolean(event.recurring_event_id)} type="submit">保存事件 <ArrowUpRight size={14}/></button></footer></motion.form></motion.div>;
}

function EventIcon({kind}:{kind:PlannerEventKind}) { if(kind==="exam"||kind==="milestone")return <Target size={14}/>;if(kind==="focus")return <Focus size={14}/>;if(kind==="class")return <Layers3 size={14}/>;if(kind==="meeting")return <Orbit size={14}/>;return <CalendarDays size={14}/>; }

function itemsForDay(day:string,tasks:PlannerTask[],events:CalendarEvent[],timeZone:string):DayItem[]{const taskItems:DayItem[]=tasks.filter((task)=>!task.deleted_at&&(taskDate(task,timeZone)===day||task.due_date===day)).map((task)=>({type:"task",id:task.id,title:task.title,time:taskTime(task,timeZone),task}));const eventItems:DayItem[]=events.filter((event)=>eventCoversDay(event,day,timeZone)).map((event)=>({type:"event",id:event.id,title:event.title,time:event.all_day?"ALL":eventTime(event,timeZone),event}));return [...eventItems,...taskItems].sort((a,b)=>a.time.localeCompare(b.time)||a.title.localeCompare(b.title));}
function itemsForMonth(month:string,tasks:PlannerTask[],events:CalendarEvent[],timeZone:string){return {events:events.filter((event)=>eventDate(event,timeZone).slice(0,7)===month).length,tasks:tasks.filter((task)=>taskDate(task,timeZone)?.slice(0,7)===month).length};}
function taskDate(task:PlannerTask,timeZone:string){return task.scheduled_start_at?utcToZonedDateTime(task.scheduled_start_at,task.scheduled_timezone||timeZone).date:task.due_date;}
function taskTime(task:PlannerTask,timeZone:string){return task.scheduled_start_at?utcToZonedDateTime(task.scheduled_start_at,task.scheduled_timezone||timeZone).time.slice(0,5):"DUE";}
function eventDate(event:CalendarEvent,timeZone:string){return event.all_day?event.start_date!:utcToZonedDateTime(event.start_at!,event.timezone||timeZone).date;}
function eventTime(event:CalendarEvent,timeZone:string){return event.all_day?"ALL":utcToZonedDateTime(event.start_at!,event.timezone||timeZone).time.slice(0,5);}
function eventEndTime(event:CalendarEvent,timeZone:string){return event.all_day?"ALL":utcToZonedDateTime(event.end_at!,event.timezone||timeZone).time.slice(0,5);}
function eventCoversDay(event:CalendarEvent,day:string,timeZone:string){if(event.all_day)return event.start_date!<=day&&event.end_date_exclusive!>day;return eventDate(event,timeZone)===day;}
function calendarCells(month:string){const first=new Date(`${month}-01T12:00:00Z`);const mondayOffset=(first.getUTCDay()+6)%7;const start=new Date(first);start.setUTCDate(first.getUTCDate()-mondayOffset);return Array.from({length:42},(_,index)=>{const value=new Date(start);value.setUTCDate(start.getUTCDate()+index);return value.toISOString().slice(0,10);});}
function monthDays(month:string){const value=new Date(`${month}-01T12:00:00Z`);const result=[];while(value.toISOString().slice(0,7)===month){result.push(value.toISOString().slice(0,10));value.setUTCDate(value.getUTCDate()+1);}return result;}
function shiftDate(day:string,amount:number){const value=new Date(`${day}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+amount);return value.toISOString().slice(0,10);}
function dateDistance(start:string,end:string){return Math.round((Date.parse(`${end}T12:00:00Z`)-Date.parse(`${start}T12:00:00Z`))/86400000);}
function formatMonth(month:string,timeZone:string){return new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"long",timeZone}).format(new Date(`${month}-15T12:00:00Z`));}
function formatSelectedDay(day:string,timeZone:string){return new Intl.DateTimeFormat("zh-CN",{month:"long",day:"numeric",weekday:"short",timeZone}).format(new Date(`${day}T12:00:00Z`));}
function formatWeekday(day:string,timeZone:string){return new Intl.DateTimeFormat("zh-CN",{weekday:"long",timeZone}).format(new Date(`${day}T12:00:00Z`));}
