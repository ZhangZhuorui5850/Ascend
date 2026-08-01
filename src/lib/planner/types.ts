export type PlannerTaskStatus = "open" | "waiting" | "completed" | "canceled";
export type PlannerPriority = 1 | 2 | 3;
export type TaskSeriesGenerationMode = "fixed_schedule" | "after_completion";
export type PlannerEventKind = "event" | "class" | "exam" | "meeting" | "focus" | "milestone";
export type PlannerBusyStatus = "busy" | "free";
export type PlannerCalendarVisibility = "visible" | "hidden";
export type PlannerReminderEntityType = "task" | "event";
export type PlannerReminderAnchor = "due" | "scheduled_start" | "event_start" | "exact";
export type PlannerReminderChannel = "in_app" | "web_push";
export type PlannerReminderStatus = "pending" | "leased" | "sent" | "failed" | "canceled";
export type RecurrenceExceptionKind = "override" | "cancel";

export type PlannerActionConflict<T> = {
  entityId: string;
  expectedVersion: number;
  actualVersion: number;
  latest: T;
};

export type PlannerActionResult<T> = {
  ok: boolean;
  entity?: T;
  conflict?: PlannerActionConflict<T>;
  error?: string;
};

export type TaskList = {
  id: string;
  workspace_id: string;
  name: string;
  color_token: string;
  icon: string;
  sort_order: number;
  is_inbox: 0 | 1;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlannerTask = {
  id: string;
  workspace_id: string;
  list_id: string;
  parent_task_id: string | null;
  depth: 0 | 1 | 2 | 3;
  title: string;
  notes: string;
  subject_code: string | null;
  status: PlannerTaskStatus;
  priority: PlannerPriority;
  due_date: string | null;
  due_at: string | null;
  due_timezone: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  scheduled_timezone: string | null;
  scheduled_all_day: 0 | 1;
  estimated_minutes: number;
  series_id: string | null;
  occurrence_key: string | null;
  sort_order: number;
  deleted_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  version: number;
  legacy_day_task_id: number | null;
  created_at: string;
  updated_at: string;
};

export type PlannerCalendar = {
  id: string;
  workspace_id: string;
  name: string;
  color_token: string;
  is_default: 0 | 1;
  visibility: PlannerCalendarVisibility;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarEvent = {
  id: string;
  workspace_id: string;
  calendar_id: string;
  title: string;
  description: string;
  location: string;
  url: string;
  subject_code: string | null;
  kind: PlannerEventKind;
  busy_status: PlannerBusyStatus;
  start_at: string | null;
  end_at: string | null;
  timezone: string | null;
  start_date: string | null;
  end_date_exclusive: string | null;
  all_day: 0 | 1;
  recurrence_rule: string | null;
  recurrence_until: string | null;
  recurring_event_id: string | null;
  original_start_at: string | null;
  exception_kind: RecurrenceExceptionKind | null;
  migration_key: string | null;
  deleted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type TaskSeries = {
  id: string;
  workspace_id: string;
  rrule: string;
  timezone: string;
  generation_mode: TaskSeriesGenerationMode;
  template_json: string;
  next_occurrence_at: string | null;
  active: 0 | 1;
  generated_count: number;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

export type PlannerReminder = {
  id: string;
  workspace_id: string;
  entity_type: PlannerReminderEntityType;
  entity_id: string;
  anchor: PlannerReminderAnchor;
  offset_minutes: number | null;
  exact_at: string | null;
  channel: PlannerReminderChannel;
  status: PlannerReminderStatus;
  next_attempt_at: string;
  attempt_count: number;
  leased_until: string | null;
  lease_owner: string | null;
  sent_at: string | null;
  last_error: string;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

export type PlannerNotification = {
  id: string;
  workspace_id: string;
  reminder_id: string;
  title: string;
  body: string;
  target_path: string;
  read_at: string | null;
  created_at: string;
};

export type PushSubscriptionRecord = {
  id: string;
  workspace_id: string;
  user_id: string;
  endpoint_hash: string;
  endpoint_ciphertext: string;
  p256dh_ciphertext: string;
  auth_ciphertext: string;
  device_name: string;
  last_success_at: string | null;
  expired_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlannerLabel = {
  id: string;
  workspace_id: string;
  name: string;
  color_token: string;
  created_at: string;
};

export type PlannerTimeRange = {
  startAt: string;
  endAt: string;
};

export type AllDayRange = {
  startDate: string;
  endDateExclusive: string;
};

export type FullCalendarPlannerEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  classNames: string[];
  extendedProps: {
    entityType: "task" | "event";
    entityId: string;
    completed?: boolean;
    kind?: PlannerEventKind;
  };
};
