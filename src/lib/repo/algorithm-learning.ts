import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { createMistake } from "./reviews";
import { requirePluginEnabled } from "./plugins";

export type AlgorithmReflection = {
  attemptId: number;
  errorCategory: string;
  correctionRule: string;
  complexityTime: string;
  complexitySpace: string;
  takeaway: string;
  updatedAt: string;
};

export type AlgorithmErrorCase = {
  id: number;
  attemptId: number;
  mistakeId: number | null;
  status: "candidate" | "confirmed" | "dismissed";
  errorCategory: string;
  correctionRule: string;
};

export type AlgorithmLearningState = {
  reflection: AlgorithmReflection | null;
  errorCase: AlgorithmErrorCase | null;
};

type AttemptContext = {
  id: number;
  problem_id: number;
  day: string;
  title: string;
  outcome: string;
};

export function getAlgorithmLearningState(
  db: Database.Database,
  scope: WorkspaceScope,
  attemptId: number,
): AlgorithmLearningState {
  requirePluginEnabled(db, scope, "algorithms");
  requireAttemptContext(db, scope, attemptId);
  const reflection = db.prepare(`
    SELECT attempt_id, error_category, correction_rule, complexity_time,
           complexity_space, takeaway, updated_at
    FROM algorithm_reflections
    WHERE workspace_id = ? AND attempt_id = ?
  `).get(scope.workspaceId, normalizeId(attemptId)) as {
    attempt_id: number;
    error_category: string;
    correction_rule: string;
    complexity_time: string;
    complexity_space: string;
    takeaway: string;
    updated_at: string;
  } | undefined;
  const errorCase = db.prepare(`
    SELECT id, attempt_id, mistake_id, status, error_category, correction_rule
    FROM algorithm_error_cases
    WHERE workspace_id = ? AND attempt_id = ?
  `).get(scope.workspaceId, normalizeId(attemptId)) as {
    id: number;
    attempt_id: number;
    mistake_id: number | null;
    status: string;
    error_category: string;
    correction_rule: string;
  } | undefined;
  return {
    reflection: reflection ? {
      attemptId: reflection.attempt_id,
      errorCategory: reflection.error_category,
      correctionRule: reflection.correction_rule,
      complexityTime: reflection.complexity_time,
      complexitySpace: reflection.complexity_space,
      takeaway: reflection.takeaway,
      updatedAt: reflection.updated_at,
    } : null,
    errorCase: errorCase ? {
      id: errorCase.id,
      attemptId: errorCase.attempt_id,
      mistakeId: errorCase.mistake_id,
      status: normalizeErrorCaseStatus(errorCase.status),
      errorCategory: errorCase.error_category,
      correctionRule: errorCase.correction_rule,
    } : null,
  };
}

export function saveAlgorithmReflection(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    attemptId: number;
    errorCategory?: string;
    correctionRule?: string;
    complexityTime?: string;
    complexitySpace?: string;
    takeaway?: string;
  },
): AlgorithmLearningState {
  requirePluginEnabled(db, scope, "algorithms");
  const attempt = requireAttemptContext(db, scope, input.attemptId);
  if (attempt.outcome === "in_progress") throw new Error("评测完成后才能保存复盘");
  const errorCategory = boundedText(input.errorCategory, 80);
  const correctionRule = boundedText(input.correctionRule, 2_000);
  const complexityTime = boundedText(input.complexityTime, 120);
  const complexitySpace = boundedText(input.complexitySpace, 120);
  const takeaway = boundedText(input.takeaway, 2_000);
  if (![errorCategory, correctionRule, complexityTime, complexitySpace, takeaway].some(Boolean)) {
    throw new Error("至少填写一项复盘内容");
  }
  db.transaction(() => {
    db.prepare(`
      INSERT INTO algorithm_reflections
        (workspace_id, attempt_id, error_category, correction_rule,
         complexity_time, complexity_space, takeaway)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, attempt_id) DO UPDATE SET
        error_category = excluded.error_category,
        correction_rule = excluded.correction_rule,
        complexity_time = excluded.complexity_time,
        complexity_space = excluded.complexity_space,
        takeaway = excluded.takeaway,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      scope.workspaceId,
      attempt.id,
      errorCategory,
      correctionRule,
      complexityTime,
      complexitySpace,
      takeaway,
    );
    db.prepare(`
      UPDATE algorithm_attempts
      SET error_category = CASE WHEN ? != '' THEN ? ELSE error_category END,
          reflection = CASE WHEN ? != '' THEN ? ELSE reflection END
      WHERE workspace_id = ? AND id = ?
    `).run(
      errorCategory,
      errorCategory,
      takeaway,
      takeaway,
      scope.workspaceId,
      attempt.id,
    );
    db.prepare(`
      UPDATE algorithm_error_cases
      SET error_category = CASE WHEN ? != '' THEN ? ELSE error_category END,
          correction_rule = CASE WHEN ? != '' THEN ? ELSE correction_rule END,
          updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND attempt_id = ?
    `).run(
      errorCategory,
      errorCategory,
      correctionRule,
      correctionRule,
      scope.workspaceId,
      attempt.id,
    );
  })();
  return getAlgorithmLearningState(db, scope, attempt.id);
}

export function resolveAlgorithmErrorCase(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { attemptId: number; decision: "confirm" | "dismiss" },
): AlgorithmLearningState {
  requirePluginEnabled(db, scope, "algorithms");
  const attempt = requireAttemptContext(db, scope, input.attemptId);
  const errorCase = db.prepare(`
    SELECT id, mistake_id, status, error_category, correction_rule
    FROM algorithm_error_cases
    WHERE workspace_id = ? AND attempt_id = ?
  `).get(scope.workspaceId, attempt.id) as {
    id: number;
    mistake_id: number | null;
    status: string;
    error_category: string;
    correction_rule: string;
  } | undefined;
  if (!errorCase) throw new Error("本次训练没有可确认的算法错误案例");
  if (input.decision === "dismiss") {
    if (errorCase.mistake_id) throw new Error("已进入错题本的案例不能忽略");
    db.prepare(`
      UPDATE algorithm_error_cases
      SET status = 'dismissed', updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ?
    `).run(scope.workspaceId, errorCase.id);
    return getAlgorithmLearningState(db, scope, attempt.id);
  }
  if (errorCase.mistake_id) return getAlgorithmLearningState(db, scope, attempt.id);
  if (!errorCase.error_category.trim()) throw new Error("确认前请填写错误类别");
  if (errorCase.correction_rule.trim().length < 5) throw new Error("确认前请写出可执行的纠正规则");
  db.transaction(() => {
    const mistake = createMistake(db, scope, {
      day: attempt.day,
      title: `算法：${attempt.title}`,
      cause: `${errorCase.error_category}；${errorCase.correction_rule}`,
      causeCategory: `算法/${errorCase.error_category}`.slice(0, 80),
    });
    db.prepare(`
      UPDATE algorithm_error_cases
      SET mistake_id = ?, status = 'confirmed', updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ? AND mistake_id IS NULL
    `).run(mistake.id, scope.workspaceId, errorCase.id);
  })();
  return getAlgorithmLearningState(db, scope, attempt.id);
}

function requireAttemptContext(
  db: Database.Database,
  scope: WorkspaceScope,
  attemptId: number,
): AttemptContext {
  const row = db.prepare(`
    SELECT a.id, a.problem_id, a.day, a.outcome, p.title
    FROM algorithm_attempts a
    JOIN algorithm_problems p
      ON p.workspace_id = a.workspace_id AND p.id = a.problem_id
    WHERE a.workspace_id = ? AND a.id = ?
  `).get(scope.workspaceId, normalizeId(attemptId)) as AttemptContext | undefined;
  if (!row) throw new Error("算法训练记录不存在");
  return row;
}

function normalizeId(value: number): number {
  const id = Math.round(Number(value));
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("训练记录 ID 无效");
  return id;
}

function boundedText(value: string | undefined, maxLength: number): string {
  return (value || "").trim().slice(0, maxLength);
}

function normalizeErrorCaseStatus(value: string): AlgorithmErrorCase["status"] {
  if (value === "confirmed" || value === "dismissed") return value;
  return "candidate";
}
