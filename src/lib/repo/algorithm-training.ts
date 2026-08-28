import type Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import type { WorkspaceScope } from "../access-context";
import { assertDateKey, shiftDateKey } from "../dates";
import { completeTask, createTask, deleteTask, rescheduleTask } from "../application/tasks/commands";
import { listAlgorithmLibrary, moveAlgorithmLibraryProblem, type AlgorithmLibrary } from "./algorithm-library";
import { getPlannerTask } from "./planner-tasks";
import { requirePluginEnabled } from "./plugins";
import { recordAlgorithmAttempt } from "./algorithms";

export type AlgorithmCourseMembership = {
  problemId: number;
  courseKey: string;
  courseName: string;
  stageKey: string;
  sortOrder: number;
};

export type AlgorithmCourse = {
  key: string;
  name: string;
  stages: Array<{ key: string; problemCount: number }>;
  problemCount: number;
};

export type PlannedAlgorithmProblem = {
  taskId: string;
  problemId: number;
  day: string;
  sortOrder: number;
  status: "open" | "waiting" | "completed" | "canceled";
  version: number;
};

export type AlgorithmTrainingRelations = {
  plans: PlannedAlgorithmProblem[];
  courses: AlgorithmCourse[];
  courseMemberships: AlgorithmCourseMembership[];
  library: AlgorithmLibrary;
};

const REVIEW_INTERVALS = [3, 7, 14, 30, 60] as const;

export function getAlgorithmTrainingRelations(
  db: Database.Database,
  scope: WorkspaceScope,
): AlgorithmTrainingRelations {
  requirePluginEnabled(db, scope, "algorithms");
  const courseMemberships = db.prepare(`
    SELECT problem_id AS problemId, course_key AS courseKey, course_name AS courseName,
           stage_key AS stageKey, sort_order AS sortOrder
    FROM algorithm_course_memberships
    WHERE workspace_id = ?
    ORDER BY course_name, stage_key, sort_order, problem_id
  `).all(scope.workspaceId) as AlgorithmCourseMembership[];
  const coursesByKey = new Map<string, AlgorithmCourse>();
  for (const membership of courseMemberships) {
    const course = coursesByKey.get(membership.courseKey) ?? {
      key: membership.courseKey,
      name: membership.courseName,
      stages: [],
      problemCount: 0,
    };
    course.problemCount += 1;
    const stage = course.stages.find((item) => item.key === membership.stageKey);
    if (stage) stage.problemCount += 1;
    else course.stages.push({ key: membership.stageKey || "未分阶段", problemCount: 1 });
    coursesByKey.set(membership.courseKey, course);
  }
  const plans = db.prepare(`
    SELECT t.id AS taskId, CAST(l.source_id AS INTEGER) AS problemId,
           COALESCE(t.due_date, substr(t.scheduled_start_at, 1, 10)) AS day,
           t.sort_order AS sortOrder, t.status, t.version
    FROM planner_tasks t
    JOIN learning_task_links l
      ON l.workspace_id = t.workspace_id AND l.task_id = t.id
    JOIN algorithm_problems p
      ON p.workspace_id = t.workspace_id AND p.id = CAST(l.source_id AS INTEGER)
    WHERE t.workspace_id = ?
      AND t.deleted_at IS NULL
      AND l.source_type = 'plugin:algorithms'
      AND COALESCE(t.due_date, substr(t.scheduled_start_at, 1, 10)) IS NOT NULL
    ORDER BY day, t.sort_order, t.created_at
    LIMIT 2000
  `).all(scope.workspaceId) as PlannedAlgorithmProblem[];
  return {
    plans,
    courses: [...coursesByKey.values()],
    courseMemberships,
    library: listAlgorithmLibrary(db, scope),
  };
}

export function scheduleAlgorithmProblems(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { problemIds: number[]; day: string },
): PlannedAlgorithmProblem[] {
  requirePluginEnabled(db, scope, "algorithms");
  const day = assertDateKey(input.day);
  const problemIds = normalizeProblemIds(input.problemIds);
  const rows = db.prepare(`
    SELECT id, title FROM algorithm_problems
    WHERE workspace_id = ? AND id IN (${problemIds.map(() => "?").join(",")})
  `).all(scope.workspaceId, ...problemIds) as Array<{ id: number; title: string }>;
  if (rows.length !== problemIds.length) throw new Error("计划中包含已移除的算法题");
  const existing = new Set(
    (db.prepare(`
      SELECT CAST(l.source_id AS INTEGER) AS problemId
      FROM planner_tasks t
      JOIN learning_task_links l ON l.workspace_id = t.workspace_id AND l.task_id = t.id
      WHERE t.workspace_id = ? AND t.deleted_at IS NULL AND t.status IN ('open', 'waiting')
        AND l.source_type = 'plugin:algorithms' AND t.due_date = ?
    `).all(scope.workspaceId, day) as Array<{ problemId: number }>).map((row) => row.problemId),
  );
  for (const problem of rows) {
    if (existing.has(problem.id)) continue;
    createTask(db, scope, {
      clientMutationId: `algorithm-plan:${day}:${problem.id}:${randomUUID()}`,
      title: problem.title,
      dueDate: day,
      estimatedMinutes: 35,
      learning: {
        expectedVersion: 0,
        activityType: "practice",
        completionCriteria: "完成算法训练并记录结果",
        plannedVerificationMethod: "代码运行或人工确认",
        sourceType: "plugin:algorithms",
        sourceId: String(problem.id),
      },
    });
  }
  return getAlgorithmTrainingRelations(db, scope).plans.filter((item) => item.day === day);
}

export function removeAlgorithmPlan(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { taskId: string; expectedVersion: number },
): void {
  assertAlgorithmTask(db, scope, input.taskId);
  const result = deleteTask(db, scope, {
    id: input.taskId,
    expectedVersion: input.expectedVersion,
    clientMutationId: `algorithm-plan-remove:${input.taskId}:v${input.expectedVersion}`,
  });
  if (result.conflict) throw new Error("计划已经更新，请刷新后重试");
}

export function continueAlgorithmPlanTomorrow(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { taskId: string; expectedVersion: number; day: string },
): void {
  assertAlgorithmTask(db, scope, input.taskId);
  const result = rescheduleTask(db, scope, {
    id: input.taskId,
    expectedVersion: input.expectedVersion,
    schedule: { kind: "none" },
    dueDate: shiftDateKey(assertDateKey(input.day), 1),
  });
  if (result.conflict) throw new Error("计划已经更新，请刷新后重试");
}

export function completeAlgorithmPlan(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    taskId: string;
    expectedVersion: number;
    problemId: number;
    day: string;
    review: boolean;
  },
): void {
  requirePluginEnabled(db, scope, "algorithms");
  const day = assertDateKey(input.day);
  const linkedProblemId = assertAlgorithmTask(db, scope, input.taskId);
  if (linkedProblemId !== input.problemId) throw new Error("题目与训练计划不一致");
  const problem = db.prepare(`
    SELECT review_step AS reviewStep FROM algorithm_problems WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, input.problemId) as { reviewStep: number } | undefined;
  if (!problem) throw new Error("算法题不存在");
  db.transaction(() => {
    recordAlgorithmAttempt(db, scope, {
      operationId: `algorithm-plan-complete:${input.taskId}:v${input.expectedVersion}`,
      problemId: input.problemId,
      day,
      verdict: "AC",
      maxHintLevel: 0,
      reviewKind: problem.reviewStep > 0 ? "original_retest" : "initial",
    });
    const step = Math.min(Math.max(problem.reviewStep, 0), REVIEW_INTERVALS.length - 1);
    db.prepare(`
      UPDATE algorithm_problems
      SET review_enabled = ?, review_step = ?, next_review = ?, material_status = 'done',
          updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ?
    `).run(
      input.review ? 1 : 0,
      input.review ? Math.min(step + 1, REVIEW_INTERVALS.length) : problem.reviewStep,
      input.review ? shiftDateKey(day, REVIEW_INTERVALS[step]) : null,
      scope.workspaceId,
      input.problemId,
    );
    const result = completeTask(db, scope, {
      id: input.taskId,
      expectedVersion: input.expectedVersion,
      clientMutationId: `algorithm-plan-complete:${input.taskId}:v${input.expectedVersion}`,
      day,
      evidence: {
        activityType: "practice",
        outcome: "completed",
        verificationMethod: "algorithm_attempt",
        verificationResult: "AC",
        verificationOutcome: "passed",
        sourceType: "plugin:algorithms",
        sourceId: String(input.problemId),
      },
    });
    if (result.conflict) throw new Error("计划已经更新，请刷新后重试");
  })();
}

export function finishDueAlgorithmReview(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { problemId: number; day: string; choice: "review" | "tomorrow" | "stop-review" },
): void {
  requirePluginEnabled(db, scope, "algorithms");
  const day = assertDateKey(input.day);
  const problem = db.prepare(`
    SELECT review_step AS reviewStep FROM algorithm_problems
    WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, input.problemId) as { reviewStep: number } | undefined;
  if (!problem) throw new Error("算法题不存在");
  if (input.choice === "tomorrow") {
    db.prepare(`
      UPDATE algorithm_problems SET review_enabled = 1, next_review = ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ?
    `).run(shiftDateKey(day, 1), scope.workspaceId, input.problemId);
    return;
  }
  db.transaction(() => {
    recordAlgorithmAttempt(db, scope, {
      operationId: `algorithm-review:${input.problemId}:${day}:${input.choice}`,
      problemId: input.problemId,
      day,
      verdict: "AC",
      maxHintLevel: 0,
      reviewKind: "original_retest",
    });
    const step = Math.min(Math.max(problem.reviewStep, 0), REVIEW_INTERVALS.length - 1);
    const keepReview = input.choice === "review";
    db.prepare(`
      UPDATE algorithm_problems
      SET review_enabled = ?, review_step = ?, next_review = ?, material_status = 'done',
          updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ?
    `).run(
      keepReview ? 1 : 0,
      keepReview ? Math.min(step + 1, REVIEW_INTERVALS.length) : problem.reviewStep,
      keepReview ? shiftDateKey(day, REVIEW_INTERVALS[step]) : null,
      scope.workspaceId,
      input.problemId,
    );
  })();
}

export function reorderAlgorithmPlans(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { day: string; taskIds: string[] },
): void {
  requirePluginEnabled(db, scope, "algorithms");
  const day = assertDateKey(input.day);
  const taskIds = [...new Set(input.taskIds.map((value) => value.trim()).filter(Boolean))];
  if (!taskIds.length || taskIds.length > 200) throw new Error("训练排序数量无效");
  const update = db.prepare(`
    UPDATE planner_tasks SET sort_order = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1
    WHERE workspace_id = ? AND id = ? AND due_date = ? AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM learning_task_links l
        WHERE l.workspace_id = planner_tasks.workspace_id AND l.task_id = planner_tasks.id
          AND l.source_type = 'plugin:algorithms'
      )
  `);
  db.transaction(() => taskIds.forEach((taskId, index) => {
    const result = update.run(index + 1, scope.workspaceId, taskId, day);
    if (result.changes !== 1) throw new Error("训练计划已经更新，请刷新后重试");
  }))();
}

export function setAlgorithmCourseMemberships(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { problemIds: number[]; courseName: string; stageKey: string },
): void {
  requirePluginEnabled(db, scope, "algorithms");
  const problemIds = normalizeProblemIds(input.problemIds);
  const courseName = boundedText(input.courseName, 80, "课程名称");
  const stageKey = boundedText(input.stageKey || "未分阶段", 40, "阶段");
  const courseKey = createHash("sha256").update(courseName.normalize("NFKC").toLowerCase()).digest("hex").slice(0, 24);
  const statement = db.prepare(`
    INSERT INTO algorithm_course_memberships
      (workspace_id, problem_id, course_key, course_name, stage_key, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, problem_id, course_key) DO UPDATE SET
      course_name = excluded.course_name, stage_key = excluded.stage_key,
      sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP
  `);
  db.transaction(() => problemIds.forEach((problemId, index) => {
    assertProblem(db, scope, problemId);
    statement.run(scope.workspaceId, problemId, courseKey, courseName, stageKey, index + 1);
  }))();
}

export function moveAlgorithmProblemsToFolder(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { problemIds: number[]; folderId: string | null },
): void {
  for (const problemId of normalizeProblemIds(input.problemIds)) {
    moveAlgorithmLibraryProblem(db, scope, { problemId, targetFolderId: input.folderId });
  }
}

function assertAlgorithmTask(db: Database.Database, scope: WorkspaceScope, taskId: string): number {
  const task = getPlannerTask(db, scope, taskId);
  if (!task || task.deleted_at) throw new Error("算法训练计划不存在");
  const link = db.prepare(`
    SELECT source_id AS sourceId FROM learning_task_links
    WHERE workspace_id = ? AND task_id = ? AND source_type = 'plugin:algorithms'
  `).get(scope.workspaceId, taskId) as { sourceId: string } | undefined;
  const problemId = Number(link?.sourceId);
  if (!Number.isSafeInteger(problemId) || problemId < 1) throw new Error("任务缺少算法题关联");
  return problemId;
}

function normalizeProblemIds(values: number[]): number[] {
  const ids = [...new Set(values.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0))];
  if (!ids.length || ids.length > 200) throw new Error("请选择 1 到 200 道题");
  return ids;
}

function assertProblem(db: Database.Database, scope: WorkspaceScope, problemId: number): void {
  const row = db.prepare("SELECT 1 FROM algorithm_problems WHERE workspace_id = ? AND id = ?")
    .get(scope.workspaceId, problemId);
  if (!row) throw new Error("算法题不存在");
}

function boundedText(value: string, maxLength: number, label: string): string {
  const result = value.trim();
  if (!result) throw new Error(`${label}必填`);
  if (result.length > maxLength) throw new Error(`${label}过长`);
  return result;
}

/* ---------- 资料库「算法训练」虚拟树 ----------
   与网盘共用一棵树：课程 → 阶段 → 题目（hasAsset 表示该题已挂参考 CPP 资产）。
   消费方：资料库资源管理器侧栏；点击题目跳算法训练详情。 */

export type AlgorithmTrainingTreeProblem = {
  id: number;
  title: string;
  label: string;
  hasAsset: boolean;
};

export type AlgorithmTrainingTree = {
  problemTotal: number;
  courses: Array<{
    key: string;
    name: string;
    total: number;
    stages: Array<{
      key: string;
      name: string;
      total: number;
      problems: AlgorithmTrainingTreeProblem[];
    }>;
  }>;
};

function treeProviderLabel(providerId: string): string {
  const labels: Record<string, string> = {
    bailian: "百炼",
    openjudge: "OpenJudge",
    poj: "POJ",
    luogu: "洛谷",
    "zgca-official": "中关村学院机试",
    "local-import": "本地题库",
    ascend: "Ascend 原创",
  };
  return labels[providerId] || "外部题目";
}

export function getAlgorithmTrainingTree(
  db: Database.Database,
  scope: WorkspaceScope,
): AlgorithmTrainingTree {
  requirePluginEnabled(db, scope, "algorithms");
  const rows = db
    .prepare(
      `
      SELECT m.course_key AS courseKey, m.course_name AS courseName,
             m.stage_key AS stageKey, m.sort_order AS sortOrder,
             p.id, p.title, p.provider_id AS providerId,
             EXISTS(
               SELECT 1 FROM algorithm_problem_assets a
               WHERE a.workspace_id = p.workspace_id AND a.problem_id = p.id
             ) AS hasAsset
      FROM algorithm_course_memberships m
      JOIN algorithm_problems p ON p.workspace_id = m.workspace_id AND p.id = m.problem_id
      WHERE m.workspace_id = ?
      ORDER BY m.course_name, m.stage_key, m.sort_order, p.id
    `,
    )
    .all(scope.workspaceId) as Array<{
    courseKey: string;
    courseName: string;
    stageKey: string;
    sortOrder: number;
    id: number;
    title: string;
    providerId: string;
    hasAsset: number;
  }>;

  const collator = new Intl.Collator("zh-Hans-CN", { numeric: true });
  const courses = new Map<
    string,
    {
      key: string;
      name: string;
      total: number;
      stages: Map<string, { key: string; name: string; total: number; problems: AlgorithmTrainingTreeProblem[] }>;
    }
  >();
  for (const row of rows) {
    let course = courses.get(row.courseKey);
    if (!course) {
      course = { key: row.courseKey, name: row.courseName, total: 0, stages: new Map() };
      courses.set(row.courseKey, course);
    }
    const stageKey = row.stageKey.trim() || "未分阶段";
    let stage = course.stages.get(stageKey);
    if (!stage) {
      stage = { key: stageKey, name: stageKey, total: 0, problems: [] };
      course.stages.set(stageKey, stage);
    }
    course.total += 1;
    stage.total += 1;
    stage.problems.push({
      id: row.id,
      title: row.title,
      label: treeProviderLabel(row.providerId),
      hasAsset: Boolean(row.hasAsset),
    });
  }
  return {
    problemTotal: rows.length,
    courses: [...courses.values()]
      .sort((left, right) => collator.compare(left.name, right.name))
      .map((course) => ({
        key: course.key,
        name: course.name,
        total: course.total,
        stages: [...course.stages.values()]
          .sort((left, right) => collator.compare(left.key, right.key))
          .map((stage) => ({ key: stage.key, name: stage.name, total: stage.total, problems: stage.problems })),
      })),
  };
}
