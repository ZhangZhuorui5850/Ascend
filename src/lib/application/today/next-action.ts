import type { PlannerPriority } from "../../planner/types";

export type NextActionSignal = {
  key:
    | "available"
    | "schedule_active"
    | "schedule_soon"
    | "schedule_overdue"
    | "schedule_today"
    | "due_overdue"
    | "due_today"
    | "due_soon"
    | "review_overdue"
    | "review_due"
    | "priority"
    | "exam"
    | "duration_fit";
  points: number;
  reason: string;
};

export type TaskNextActionCandidate = {
  kind: "task";
  id: string;
  title: string;
  version: number;
  priority: PlannerPriority;
  estimatedMinutes: number;
  subjectCode: string | null;
  dueDay: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  href: string;
};

export type ReviewNextActionCandidate = {
  kind: "review";
  id: string;
  title: string;
  subjectCode: string | null;
  dueDay: string;
  estimatedMinutes: number;
  href: string;
};

export type MistakeNextActionCandidate = {
  kind: "mistake_retest";
  id: string;
  title: string;
  subjectCode: string | null;
  dueDay: string;
  estimatedMinutes: number;
  href: string;
};

export type NextActionCandidate =
  | TaskNextActionCandidate
  | ReviewNextActionCandidate
  | MistakeNextActionCandidate;

export type RankedNextAction = NextActionCandidate & {
  generatedAt: string;
  scoreBreakdown: NextActionSignal[];
  reasons: string[];
};

export type NextActionContext = {
  day: string;
  now: string;
  availableMinutes?: number;
  exams?: Array<{ day: string; subjectCode: string | null }>;
};

type RankedCandidate = {
  candidate: NextActionCandidate;
  signals: NextActionSignal[];
  score: number;
  temporalKey: string;
  priority: number;
};

/**
 * Selects one deterministic action. The caller supplies time explicitly so
 * identical inputs always produce the same ranking and explanation.
 */
export function selectNextAction(
  candidates: NextActionCandidate[],
  context: NextActionContext,
): RankedNextAction | null {
  const nowMs = parseInstant(context.now);
  const ranked = candidates.map((candidate) => rankCandidate(candidate, context, nowMs));
  ranked.sort((left, right) => (
    right.score - left.score
    || left.temporalKey.localeCompare(right.temporalKey)
    || left.priority - right.priority
    || stableId(left.candidate).localeCompare(stableId(right.candidate))
  ));
  const winner = ranked[0];
  if (!winner) return null;
  return {
    ...winner.candidate,
    generatedAt: context.now,
    scoreBreakdown: winner.signals,
    reasons: winner.signals
      .filter((signal) => signal.points > 0)
      .sort((left, right) => right.points - left.points || left.key.localeCompare(right.key))
      .slice(0, 3)
      .map((signal) => signal.reason),
  };
}

function rankCandidate(
  candidate: NextActionCandidate,
  context: NextActionContext,
  nowMs: number,
): RankedCandidate {
  const signals = candidate.kind === "task"
    ? rankTask(candidate, context, nowMs)
    : rankReview(candidate, context);
  const temporalKey = candidate.kind === "task"
    ? candidate.scheduledStartAt ?? candidate.dueDay ?? "9999-12-31"
    : candidate.dueDay;
  return {
    candidate,
    signals,
    score: signals.reduce((sum, signal) => sum + signal.points, 0),
    temporalKey,
    priority: candidate.kind === "task" ? candidate.priority : 3,
  };
}

function rankTask(
  candidate: TaskNextActionCandidate,
  context: NextActionContext,
  nowMs: number,
): NextActionSignal[] {
  const signals: NextActionSignal[] = [{
    key: "available",
    points: 10,
    reason: "这项任务现在可以开始",
  }];
  if (candidate.scheduledStartAt) {
    const startMs = parseInstant(candidate.scheduledStartAt);
    const endMs = candidate.scheduledEndAt
      ? parseInstant(candidate.scheduledEndAt)
      : startMs + Math.max(candidate.estimatedMinutes, 1) * 60_000;
    const minutesToStart = Math.ceil((startMs - nowMs) / 60_000);
    if (startMs <= nowMs && nowMs < endMs) {
      signals.push({ key: "schedule_active", points: 1_200, reason: "当前正处在已排定的执行时段" });
    } else if (minutesToStart >= 0 && minutesToStart <= 60) {
      signals.push({
        key: "schedule_soon",
        points: 1_000 + (60 - minutesToStart),
        reason: minutesToStart === 0 ? "已到排定开始时间" : `已排期，${minutesToStart} 分钟后开始`,
      });
    } else if (startMs < nowMs) {
      const overdueMinutes = Math.max(1, Math.floor((nowMs - startMs) / 60_000));
      signals.push({
        key: "schedule_overdue",
        points: 900 + Math.min(180, overdueMinutes),
        reason: `已超过排定开始时间 ${formatDuration(overdueMinutes)}`,
      });
    } else if (candidate.scheduledStartAt.slice(0, 10) === context.day) {
      signals.push({ key: "schedule_today", points: 450, reason: "今天已有明确排期" });
    }
  }
  if (candidate.dueDay) {
    const overdueDays = dayDistance(candidate.dueDay, context.day);
    if (overdueDays > 0) {
      signals.push({
        key: "due_overdue",
        points: 700 + Math.min(180, overdueDays * 20),
        reason: `已逾期 ${overdueDays} 天`,
      });
    } else if (overdueDays === 0) {
      signals.push({ key: "due_today", points: 550, reason: "今天到期" });
    } else if (overdueDays === -1) {
      signals.push({ key: "due_soon", points: 200, reason: "明天到期" });
    }
  }
  const priorityPoints = candidate.priority === 1 ? 160 : candidate.priority === 2 ? 80 : 0;
  if (priorityPoints) {
    signals.push({
      key: "priority",
      points: priorityPoints,
      reason: candidate.priority === 1 ? "标记为高优先级" : "标记为中优先级",
    });
  }
  signals.push(...rankExam(candidate.subjectCode, context));
  signals.push(...rankDuration(candidate.estimatedMinutes, context.availableMinutes));
  return signals;
}

function rankReview(
  candidate: ReviewNextActionCandidate | MistakeNextActionCandidate,
  context: NextActionContext,
): NextActionSignal[] {
  const overdueDays = dayDistance(candidate.dueDay, context.day);
  const signals: NextActionSignal[] = overdueDays > 0
    ? [{
        key: "review_overdue",
        points: 500 + Math.min(360, overdueDays * 30),
        reason: `${candidate.kind === "mistake_retest" ? "错题复测" : "复习"}已逾期 ${overdueDays} 天`,
      }]
    : [{
        key: "review_due",
        points: candidate.kind === "mistake_retest" ? 520 : 500,
        reason: candidate.kind === "mistake_retest" ? "错题今天需要复测" : "今天已到复习日",
      }];
  signals.push(...rankExam(candidate.subjectCode, context));
  signals.push(...rankDuration(candidate.estimatedMinutes, context.availableMinutes));
  return signals;
}

function rankExam(subjectCode: string | null, context: NextActionContext): NextActionSignal[] {
  if (!subjectCode) return [];
  const days = (context.exams ?? [])
    .filter((exam) => exam.subjectCode === subjectCode)
    .map((exam) => -dayDistance(exam.day, context.day))
    .filter((distance) => distance >= 0 && distance <= 14)
    .sort((left, right) => left - right)[0];
  if (days === undefined) return [];
  return [{
    key: "exam",
    points: (15 - days) * 10,
    reason: days === 0 ? "关联科目今天有考试节点" : `关联科目距考试 ${days} 天`,
  }];
}

function rankDuration(estimatedMinutes: number, availableMinutes?: number): NextActionSignal[] {
  if (!availableMinutes || estimatedMinutes <= 0 || estimatedMinutes > availableMinutes) return [];
  return [{
    key: "duration_fit",
    points: 60,
    reason: `预计 ${estimatedMinutes} 分钟，适合当前空档`,
  }];
}

function dayDistance(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
}

function parseInstant(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`无效时间：${value}`);
  return parsed;
}

function stableId(candidate: NextActionCandidate): string {
  return `${candidate.kind}:${candidate.id}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} 小时 ${remainder} 分钟` : `${hours} 小时`;
}
