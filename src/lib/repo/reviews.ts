import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { assertDateKey, shiftDateKey } from "../dates";
import {
  normalizeReviewEvidence,
  type ReviewEvidenceInput,
} from "../review-evidence";
import { nextIntervalStep, nextReviewDate } from "../review-schedule";
import { ensureDay } from "./days";
import { deriveStatus } from "./mastery";

export type MistakeListItem = {
  id: number;
  day: string;
  title: string;
  cause: string;
  next_review: string | null;
  graduated: number;
  subject_code: string | null;
  knowledge_point_id: string | null;
  knowledge_title: string | null;
  pass_count: number;
  cause_category: string;
};

export type MistakeBook = {
  due: MistakeListItem[];
  open: MistakeListItem[];
  graduated: MistakeListItem[];
};

/** @deprecated Compatibility/test helper. Runtime writes must use application/learning/record-study. */
export function createStudySession(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { day: string; title: string; durationMinutes?: number; subjectCode?: string; knowledgePointId?: string; output?: string },
): void {
  const day = assertDateKey(input.day);
  const title = input.title.trim();
  if (!title) throw new Error("学习记录标题必填");
  const knowledgePointId = input.knowledgePointId?.trim() || null;
  db.transaction(() => {
    ensureDay(db, scope, day);
    let subjectCode = input.subjectCode?.trim() || null;
    if (knowledgePointId) {
      const point = db.prepare(`
        SELECT subject_code FROM knowledge_points WHERE workspace_id = ? AND id = ?
      `).get(scope.workspaceId, knowledgePointId) as { subject_code: string } | undefined;
      if (!point) throw new Error("知识点不存在");
      subjectCode = point.subject_code;
    }
    db.prepare(`
      INSERT INTO study_sessions
        (workspace_id, day, subject_code, knowledge_point_id, title, duration_minutes, output)
      VALUES (@workspaceId, @day, @subjectCode, @knowledgePointId, @title, @durationMinutes, @output)
    `).run({
      workspaceId: scope.workspaceId,
      day,
      subjectCode,
      knowledgePointId,
      title,
      durationMinutes: Math.max(0, Math.round(Number(input.durationMinutes) || 0)),
      output: (input.output || "").trim(),
    });
    if (knowledgePointId) markPointLearned(db, scope, { knowledgePointId, day });
  })();
}

export function createMistake(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    day: string;
    title: string;
    cause?: string;
    causeCategory?: string;
    subjectCode?: string;
    knowledgePointId?: string;
    clientMutationId?: string;
  },
): { id: number } {
  const day = assertDateKey(input.day);
  const title = input.title.trim();
  if (!title) throw new Error("错题标题必填");
  const knowledgePointId = input.knowledgePointId?.trim() || null;
  const clientMutationId = input.clientMutationId?.trim() || null;
  const opId = clientMutationId ? `capture-mistake:${scope.workspaceId}:${clientMutationId}` : null;
  return db.transaction(() => {
    if (opId) {
      const replay = db.prepare(`
        SELECT entity_id, patch_json FROM entity_changes
        WHERE workspace_id = ? AND op_id = ? AND entity_type = 'mistake'
      `).get(scope.workspaceId, opId) as { entity_id: string; patch_json: string } | undefined;
      if (replay) {
        if (replay.patch_json !== JSON.stringify(input)) throw new Error("错题幂等键载荷冲突");
        return { id: Number(replay.entity_id) };
      }
    }
    ensureDay(db, scope, day);
    let subjectCode = input.subjectCode?.trim() || null;
    if (knowledgePointId) {
      const point = db.prepare(`
        SELECT subject_code FROM knowledge_points WHERE workspace_id = ? AND id = ?
      `).get(scope.workspaceId, knowledgePointId) as { subject_code: string } | undefined;
      if (!point) throw new Error("知识点不存在");
      subjectCode = point.subject_code;
    }
    const result = db.prepare(`
      INSERT INTO mistakes
        (workspace_id, day, subject_code, knowledge_point_id, title, cause, cause_category, next_review)
      VALUES
        (@workspaceId, @day, @subjectCode, @knowledgePointId, @title, @cause, @causeCategory, @nextReview)
    `).run({
      workspaceId: scope.workspaceId,
      day,
      subjectCode,
      knowledgePointId,
      title,
      cause: (input.cause || "").trim(),
      causeCategory: (input.causeCategory || "").trim(),
      nextReview: nextReviewDate(day, 0),
    });
    const id = Number(result.lastInsertRowid);
    if (knowledgePointId) applyMistakeOutcome(db, scope, { knowledgePointId, day });
    if (opId) {
      db.prepare(`
        INSERT INTO entity_changes
          (workspace_id, op_id, entity_type, entity_id, op, patch_json, snapshot_json)
        VALUES (?, ?, 'mistake', ?, 'create', ?, ?)
      `).run(
        scope.workspaceId,
        opId,
        String(id),
        JSON.stringify(input),
        JSON.stringify({ id, workspaceId: scope.workspaceId, day, title }),
      );
    }
    return { id };
  })();
}

export function listRecentMistakeCauses(db: Database.Database, scope: WorkspaceScope, limit = 6): string[] {
  const rows = db.prepare(`
    SELECT cause, MAX(created_at) AS latest
    FROM mistakes
    WHERE workspace_id = ? AND cause != ''
    GROUP BY cause
    ORDER BY latest DESC
    LIMIT ?
  `).all(scope.workspaceId, Math.max(1, limit)) as Array<{ cause: string }>;
  return rows.map((row) => row.cause);
}

export type PointSnapshot = {
  reviews: number;
  mastery: number;
  last_review: string | null;
  next_review: string | null;
  status: string;
  interval_step: number;
  lapse_count: number;
  last_score: number | null;
};

export type ReviewUndo = {
  eventId: number;
  knowledgePointId: string | null;
  pointSnapshot: PointSnapshot | null;
};

export type MistakeUndo = {
  mistakeId: number;
  mistakeSnapshot: {
    graduated: number;
    next_review: string | null;
    pass_count: number;
    last_pass_day: string | null;
  };
  eventId: number | null;
  knowledgePointId: string | null;
  pointSnapshot: PointSnapshot | null;
};

function readPointSnapshot(db: Database.Database, scope: WorkspaceScope, knowledgePointId: string): PointSnapshot | null {
  const row = db.prepare(`
    SELECT reviews, mastery, last_review, next_review, status, interval_step, lapse_count, last_score
    FROM knowledge_points WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, knowledgePointId) as PointSnapshot | undefined;
  return row ?? null;
}

function restorePointSnapshot(
  db: Database.Database,
  scope: WorkspaceScope,
  knowledgePointId: string,
  snapshot: PointSnapshot,
): void {
  db.prepare(`
    UPDATE knowledge_points
    SET reviews = @reviews,
        mastery = @mastery,
        last_review = @last_review,
        next_review = @next_review,
        status = @status,
        interval_step = @interval_step,
        lapse_count = @lapse_count,
        last_score = @last_score
    WHERE workspace_id = @workspaceId AND id = @id
  `).run({
    workspaceId: scope.workspaceId,
    id: knowledgePointId,
    reviews: Math.max(0, Math.round(Number(snapshot.reviews) || 0)),
    mastery: clamp(Math.round(Number(snapshot.mastery) || 0), 0, 100),
    last_review: snapshot.last_review || null,
    next_review: snapshot.next_review || null,
    status: String(snapshot.status || "未学"),
    interval_step: Math.max(0, Math.round(Number(snapshot.interval_step) || 0)),
    lapse_count: Math.max(0, Math.round(Number(snapshot.lapse_count) || 0)),
    last_score: snapshot.last_score === null ? null : Math.max(0, Math.min(3, Math.round(snapshot.last_score))),
  });
}

export function createReviewEvent(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    day: string;
    knowledgePointId?: string;
    score: number;
    note?: string;
    operationId?: string;
  } & ReviewEvidenceInput,
): ReviewUndo {
  const day = assertDateKey(input.day);
  const knowledgePointId = input.knowledgePointId?.trim() || null;
  const score = clamp(Math.round(Number(input.score) || 0), 0, 3);
  return db.transaction(() => {
    const operationId = input.operationId?.trim() || null;
    if (operationId) {
      const existing = db.prepare(`
        SELECT id FROM review_events WHERE workspace_id = ? AND operation_id = ?
      `).get(scope.workspaceId, operationId) as { id: number } | undefined;
      if (existing) return { eventId: existing.id, knowledgePointId: null, pointSnapshot: null };
    }
    ensureDay(db, scope, day);
    const evidence = normalizeReviewEvidence(input);
    const pointSnapshot = knowledgePointId ? readPointSnapshot(db, scope, knowledgePointId) : null;
    const result = db.prepare(`
      INSERT INTO review_events
        (workspace_id, day, knowledge_point_id, score, note, operation_id, event_type,
         attempt_mode, attempt_text, attempt_duration_seconds, pre_confidence)
      VALUES
        (@workspaceId, @day, @knowledgePointId, @score, @note, @operationId, 'point_review',
         @attemptMode, @attemptText, @attemptDurationSeconds, @preConfidence)
    `).run({
      workspaceId: scope.workspaceId,
      day,
      knowledgePointId,
      score,
      note: (input.note || "").trim(),
      operationId,
      ...evidence,
    });
    if (knowledgePointId) applyReviewOutcome(db, scope, { knowledgePointId, day, score });
    return { eventId: Number(result.lastInsertRowid), knowledgePointId, pointSnapshot };
  })();
}

export function spreadReviewBacklog(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { day: string; dailyLimit: number; horizonDays?: number },
): { moved: number; throughDate: string } {
  const day = assertDateKey(input.day);
  const dailyLimit = Math.max(1, Math.min(100, Math.round(Number(input.dailyLimit) || 1)));
  const horizonDays = Math.max(2, Math.min(14, Math.round(Number(input.horizonDays) || 7)));
  const items = db.prepare(`
    SELECT 'point' AS kind, id, next_review,
           CASE WHEN exam = 1 THEN 0 ELSE 1 END AS exam_priority,
           CASE tier WHEN 'r' THEN 0 WHEN 'y' THEN 1 ELSE 2 END AS tier_priority,
           mastery AS mastery_priority
    FROM knowledge_points
    WHERE workspace_id = @workspaceId AND next_review IS NOT NULL AND next_review <= @day
    UNION ALL
    SELECT 'mistake' AS kind, CAST(id AS TEXT) AS id, next_review,
           0 AS exam_priority, 0 AS tier_priority, 0 AS mastery_priority
    FROM mistakes
    WHERE workspace_id = @workspaceId AND graduated = 0
      AND next_review IS NOT NULL AND next_review <= @day
    ORDER BY exam_priority, tier_priority, next_review, mastery_priority
  `).all({ workspaceId: scope.workspaceId, day }) as Array<{ kind: "point" | "mistake"; id: string }>;
  const completedToday = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM review_events
    WHERE workspace_id = ? AND day = ?
  `).get(scope.workspaceId, day) as { count: number }).count;
  const remainingCapacity = Math.max(0, dailyLimit - completedToday);
  const overflow = items.slice(remainingCapacity);
  const futureDates = Array.from(
    { length: horizonDays },
    (_, index) => shiftDateKey(day, index + 1),
  );
  const futureEnd = futureDates.at(-1)!;
  const scheduledRows = db.prepare(`
    SELECT next_review AS day, COUNT(*) AS count
    FROM (
      SELECT next_review
      FROM knowledge_points
      WHERE workspace_id = @workspaceId
        AND next_review BETWEEN @futureStart AND @futureEnd
      UNION ALL
      SELECT next_review
      FROM mistakes
      WHERE workspace_id = @workspaceId
        AND graduated = 0
        AND next_review BETWEEN @futureStart AND @futureEnd
    )
    GROUP BY next_review
  `).all({
    workspaceId: scope.workspaceId,
    futureStart: futureDates[0],
    futureEnd,
  }) as Array<{ day: string; count: number }>;
  const scheduledByDay = new Map(scheduledRows.map((row) => [row.day, row.count]));
  const futureSlots = futureDates.flatMap((date) =>
    Array.from(
      { length: Math.max(0, dailyLimit - (scheduledByDay.get(date) || 0)) },
      () => date,
    ));
  const assignments = overflow.slice(0, futureSlots.length);
  let throughDate = day;
  db.transaction(() => {
    assignments.forEach((item, index) => {
      const scheduled = futureSlots[index];
      throughDate = scheduled > throughDate ? scheduled : throughDate;
      if (item.kind === "point") {
        db.prepare("UPDATE knowledge_points SET next_review = ? WHERE workspace_id = ? AND id = ?")
          .run(scheduled, scope.workspaceId, item.id);
      } else {
        db.prepare("UPDATE mistakes SET next_review = ? WHERE workspace_id = ? AND id = ?")
          .run(scheduled, scope.workspaceId, Number(item.id));
      }
    });
    db.prepare(`
      INSERT INTO review_recovery_events (workspace_id, day, moved_count, horizon_days)
      VALUES (?, ?, ?, ?)
    `).run(scope.workspaceId, day, assignments.length, horizonDays);
  })();
  return { moved: assignments.length, throughDate };
}

/** 撤销一次复习评分：删除事件并回写知识点快照。 */
export function undoReviewEvent(db: Database.Database, scope: WorkspaceScope, undo: ReviewUndo): void {
  db.transaction(() => {
    db.prepare("DELETE FROM review_events WHERE workspace_id = ? AND id = ?").run(scope.workspaceId, undo.eventId);
    if (undo.knowledgePointId && undo.pointSnapshot) {
      restorePointSnapshot(db, scope, undo.knowledgePointId, undo.pointSnapshot);
    }
  })();
}

/** 撤销一次错题回炉：回写错题状态、删除事件、回写知识点快照。 */
export function undoReattempt(db: Database.Database, scope: WorkspaceScope, undo: MistakeUndo): void {
  db.transaction(() => {
    db.prepare(`
      UPDATE mistakes
      SET graduated = @graduated, next_review = @nextReview,
          pass_count = @passCount, last_pass_day = @lastPassDay
      WHERE workspace_id = @workspaceId AND id = @id
    `).run({
      workspaceId: scope.workspaceId,
      id: undo.mistakeId,
      graduated: undo.mistakeSnapshot.graduated ? 1 : 0,
      nextReview: undo.mistakeSnapshot.next_review || null,
      passCount: undo.mistakeSnapshot.pass_count,
      lastPassDay: undo.mistakeSnapshot.last_pass_day,
    });
    if (undo.eventId) {
      db.prepare("DELETE FROM review_events WHERE workspace_id = ? AND id = ?").run(scope.workspaceId, undo.eventId);
    }
    if (undo.knowledgePointId && undo.pointSnapshot) {
      restorePointSnapshot(db, scope, undo.knowledgePointId, undo.pointSnapshot);
    }
  })();
}

export function reattemptMistake(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    id: number;
    day: string;
    score: number;
    operationId?: string;
  } & ReviewEvidenceInput,
): { id: number; graduated: number; nextReview: string | null; undo: MistakeUndo | null } {
  const day = assertDateKey(input.day);
  return db.transaction(() => {
    const operationId = input.operationId?.trim() || null;
    const mistake = db.prepare(`
      SELECT id, knowledge_point_id, graduated, next_review, pass_count, last_pass_day
      FROM mistakes WHERE workspace_id = ? AND id = ?
    `).get(scope.workspaceId, input.id) as
      | {
          id: number;
          knowledge_point_id: string | null;
          graduated: number;
          next_review: string | null;
          pass_count: number;
          last_pass_day: string | null;
        }
      | undefined;
    if (!mistake) throw new Error("错题不存在");
    if (operationId) {
      const existing = db.prepare(`
        SELECT id
        FROM review_events
        WHERE workspace_id = ? AND operation_id = ?
      `).get(scope.workspaceId, operationId) as { id: number } | undefined;
      if (existing) {
        return {
          id: input.id,
          graduated: mistake.graduated,
          nextReview: mistake.next_review,
          undo: null,
        };
      }
    }
    if (mistake.graduated) throw new Error("错题已经毕业");
    if (mistake.next_review && day < mistake.next_review) {
      throw new Error(`错题将在 ${mistake.next_review} 到期`);
    }
    const evidence = normalizeReviewEvidence(input);

    const mistakeSnapshot = {
      graduated: mistake.graduated,
      next_review: mistake.next_review,
      pass_count: mistake.pass_count,
      last_pass_day: mistake.last_pass_day,
    };
    const pointSnapshot = mistake.knowledge_point_id ? readPointSnapshot(db, scope, mistake.knowledge_point_id) : null;

    const score = clamp(Math.round(Number(input.score) || 0), 0, 3);
    const passed = score >= 2;
    const passCount = passed
      ? mistake.last_pass_day === day ? mistake.pass_count : mistake.pass_count + 1
      : 0;
    const graduated = passCount >= 2 ? 1 : 0;
    const nextReview = graduated ? null : passed ? shiftDateKey(day, 4) : nextReviewDate(day, 0);
    const lastPassDay = passed ? day : null;
    db.prepare(`
      UPDATE mistakes
      SET graduated = @graduated, next_review = @nextReview,
          pass_count = @passCount, last_pass_day = @lastPassDay
      WHERE workspace_id = @workspaceId AND id = @id
    `).run({
      workspaceId: scope.workspaceId,
      id: input.id,
      graduated,
      nextReview,
      passCount,
      lastPassDay,
    });

    ensureDay(db, scope, day);
    const inserted = db.prepare(`
      INSERT INTO review_events
        (workspace_id, day, knowledge_point_id, score, note, operation_id, event_type,
         attempt_mode, attempt_text, attempt_duration_seconds, pre_confidence)
      VALUES
        (@workspaceId, @day, @knowledgePointId, @score, '错题回炉', @operationId, 'mistake_reattempt',
         @attemptMode, @attemptText, @attemptDurationSeconds, @preConfidence)
    `).run({
      workspaceId: scope.workspaceId,
      day,
      knowledgePointId: mistake.knowledge_point_id,
      score,
      operationId,
      ...evidence,
    });
    const eventId = Number(inserted.lastInsertRowid);
    if (mistake.knowledge_point_id) {
      applyReviewOutcome(db, scope, { knowledgePointId: mistake.knowledge_point_id, day, score });
    }

    return {
      id: input.id,
      graduated,
      nextReview,
      undo: {
        mistakeId: input.id,
        mistakeSnapshot,
        eventId,
        knowledgePointId: mistake.knowledge_point_id,
        pointSnapshot,
      },
    };
  })();
}

export function getMistakeBook(db: Database.Database, scope: WorkspaceScope, today: string): MistakeBook {
  assertDateKey(today);
  const rows = db.prepare(`
    SELECT m.id, m.day, m.title, m.cause, m.next_review, m.graduated, m.subject_code,
           m.pass_count, m.cause_category,
           m.knowledge_point_id, k.title AS knowledge_title
    FROM mistakes m
    LEFT JOIN knowledge_points k ON k.id = m.knowledge_point_id AND k.workspace_id = m.workspace_id
    WHERE m.workspace_id = ?
    ORDER BY m.created_at DESC
  `).all(scope.workspaceId) as MistakeListItem[];

  const due: MistakeListItem[] = [];
  const open: MistakeListItem[] = [];
  const graduated: MistakeListItem[] = [];
  for (const row of rows) {
    if (row.graduated) graduated.push(row);
    else if (row.next_review && row.next_review <= today) due.push(row);
    else open.push(row);
  }
  due.sort((a, b) => (a.next_review || "").localeCompare(b.next_review || ""));
  return { due, open, graduated };
}

export function applyReviewOutcome(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { knowledgePointId: string; day: string; score: number },
): void {
  const point = db.prepare(`
    SELECT reviews, mastery, interval_step, lapse_count
    FROM knowledge_points WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, input.knowledgePointId) as
    | { reviews: number; mastery: number; interval_step: number; lapse_count: number }
    | undefined;
  if (!point) return;

  const reviews = point.reviews + 1;
  const mastery = clamp(point.mastery + reviewMasteryDelta(input.score), 0, 100);
  const status = deriveStatus(mastery);
  const intervalStep = nextIntervalStep(point.interval_step, input.score);
  const lapseCount = point.lapse_count + (input.score <= 1 ? 1 : 0);
  const nextReview = nextReviewDate(input.day, intervalStep);

  db.prepare(`
    UPDATE knowledge_points
    SET reviews = @reviews,
        mastery = @mastery,
        last_review = @day,
        next_review = @nextReview,
        status = @status,
        interval_step = @intervalStep,
        lapse_count = @lapseCount,
        last_score = @score
    WHERE workspace_id = @workspaceId AND id = @knowledgePointId
  `).run({ workspaceId: scope.workspaceId, ...input, reviews, mastery, status, nextReview, intervalStep, lapseCount });
}

/** 首次学过后进入 D+1 复习；已有排期保持原计划。 */
export function markPointLearned(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { knowledgePointId: string; day: string },
): void {
  const day = assertDateKey(input.day);
  const result = db.prepare(`
    UPDATE knowledge_points
    SET status = CASE WHEN status = '未学' THEN '学习中' ELSE status END,
        next_review = COALESCE(next_review, @nextReview),
        interval_step = CASE WHEN next_review IS NULL THEN 0 ELSE interval_step END
    WHERE workspace_id = @workspaceId AND id = @knowledgePointId
  `).run({
    workspaceId: scope.workspaceId,
    knowledgePointId: input.knowledgePointId,
    nextReview: nextReviewDate(day, 0),
  });
  if (!result.changes) throw new Error("知识点不存在");
}

export function applyMistakeOutcome(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { knowledgePointId: string; day: string },
): void {
  const point = db.prepare("SELECT mastery FROM knowledge_points WHERE workspace_id = ? AND id = ?").get(
    scope.workspaceId,
    input.knowledgePointId,
  ) as
    | { mastery: number }
    | undefined;
  if (!point) return;

  const mastery = clamp(point.mastery - 15, 0, 100);
  db.prepare(`
    UPDATE knowledge_points
    SET mastery = @mastery,
        status = @status,
        next_review = @nextReview
    WHERE workspace_id = @workspaceId AND id = @knowledgePointId
  `).run({
    workspaceId: scope.workspaceId,
    knowledgePointId: input.knowledgePointId,
    mastery,
    status: mastery >= 80 ? "已掌握" : "学习中",
    nextReview: nextReviewDate(input.day, 0),
  });
}

function reviewMasteryDelta(score: number): number {
  if (score >= 3) return 16;
  if (score === 2) return 8;
  if (score === 1) return -4;
  return -12;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
