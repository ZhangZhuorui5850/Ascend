import type Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import type { WorkspaceScope } from "../access-context";
import { getAlgorithmProviderDescriptor, identifyAlgorithmProvider } from "../algorithm-providers";
import { assertDateKey, shiftDateKey } from "../dates";
import type { JudgeLanguage } from "../judge-gateway";
import { requirePluginEnabled } from "./plugins";
import { ensureAlgorithmCurriculumProblem } from "./algorithm-curriculum";

export const ALGORITHM_VERDICTS = ["AC", "WA", "CE", "TLE", "MLE", "RE", "OTHER"] as const;
export const ALGORITHM_REVIEW_KINDS = ["initial", "original_retest", "isomorphic_variant", "unseen_variant"] as const;
export const ALGORITHM_DIFFICULTIES = ["", "foundation", "standard", "challenge"] as const;

export type AlgorithmVerdict = (typeof ALGORITHM_VERDICTS)[number];
export type AlgorithmReviewKind = (typeof ALGORITHM_REVIEW_KINDS)[number];
export type AlgorithmDifficulty = (typeof ALGORITHM_DIFFICULTIES)[number];
export type AlgorithmEvidenceStatus =
  "unseen" | "attempted" | "guided_completed" | "independent_completed" | "delayed_stable" | "transfer_verified";

export type AlgorithmAttempt = {
  id: number;
  problemId: number;
  day: string;
  verdict: AlgorithmVerdict;
  durationMinutes: number;
  maxHintLevel: number;
  preConfidence: number | null;
  independent: boolean;
  reviewKind: AlgorithmReviewKind;
  errorCategory: string;
  reflection: string;
  sourceVerification: "user_reported" | "provider_verified";
  transferSourceProblemId: number | null;
};

export type AlgorithmProblem = {
  id: number;
  providerId: string;
  providerLabel: string;
  externalProblemId: string;
  sourceUrl: string;
  title: string;
  difficultyBand: AlgorithmDifficulty;
  tags: string[];
  notes: string;
  evidenceStatus: AlgorithmEvidenceStatus;
  nextReview: string | null;
  reviewEnabled: boolean;
  reviewStep: number;
  problemMode: "external" | "managed" | "imported";
  contentMode: "external_link" | "managed" | "imported_private";
  evaluationMode: "manual" | "judge" | "sample";
  materialStatus: "todo" | "doing" | "review" | "done";
  priorityBand: "" | "P1" | "P2" | "P3";
  phaseKey: string;
  collectionIds: string[];
  statementMarkdown: string;
  inputSpecification: string;
  outputSpecification: string;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  judgeProblemRef: string;
  timeLimitMs: number;
  memoryLimitKb: number;
  supportedLanguages: JudgeLanguage[];
  starterCode: Partial<Record<JudgeLanguage, string>>;
  referenceCode: Partial<Record<JudgeLanguage, string>>;
  attempts: AlgorithmAttempt[];
};

export type AlgorithmDashboard = {
  problems: AlgorithmProblem[];
  dueProblems: AlgorithmProblem[];
  metrics: {
    problemCount: number;
    attemptedCount: number;
    independentCount: number;
    transferCount: number;
    dueCount: number;
  };
};

export type RecordAlgorithmAttemptInput = {
  problemId: number;
  day: string;
  verdict: string;
  durationMinutes?: number;
  maxHintLevel?: number;
  preConfidence?: number | null;
  reviewKind?: string;
  transferSourceProblemId?: number | null;
  errorCategory?: string;
  reflection?: string;
  /** Stable caller-generated key used to make a manual attempt replay-safe. */
  operationId?: string;
};

type ProblemRow = {
  id: number;
  provider_id: string;
  external_problem_id: string;
  source_url: string;
  title: string;
  difficulty_band: string;
  tags_json: string;
  notes: string;
  evidence_status: string;
  next_review: string | null;
  problem_mode: string;
  statement_markdown: string;
  input_specification: string;
  output_specification: string;
  examples_json: string;
  judge_problem_ref: string;
  time_limit_ms: number;
  memory_limit_kb: number;
  supported_languages_json: string;
  metadata_json: string;
  content_mode: string;
  evaluation_mode: string;
  material_status: string;
  priority_band: string;
  phase_key: string;
  review_enabled: number;
  review_step: number;
};

type AttemptRow = {
  id: number;
  problem_id: number;
  day: string;
  verdict: string;
  duration_minutes: number;
  max_hint_level: number;
  pre_confidence: number | null;
  independent: number;
  review_kind: string;
  error_category: string;
  reflection: string;
  source_verification: string;
  transfer_source_problem_id: number | null;
  outcome: string;
};

export function getAlgorithmDashboard(db: Database.Database, scope: WorkspaceScope, today: string): AlgorithmDashboard {
  requirePluginEnabled(db, scope, "algorithms");
  assertDateKey(today);
  const problemRows = db
    .prepare(
      `
    SELECT p.id, COALESCE(o.provider_id, p.provider_id) AS provider_id,
           COALESCE(o.external_problem_id, p.external_problem_id) AS external_problem_id,
           COALESCE(o.source_url, p.source_url) AS source_url,
           COALESCE(o.title, p.title) AS title,
           COALESCE(o.difficulty_band, p.difficulty_band) AS difficulty_band,
           COALESCE(o.tags_json, p.tags_json) AS tags_json,
           COALESCE(o.notes, p.notes) AS notes,
           p.evidence_status, p.next_review, p.problem_mode,
           COALESCE(o.statement_markdown, p.statement_markdown) AS statement_markdown,
           COALESCE(o.input_specification, p.input_specification) AS input_specification,
           COALESCE(o.output_specification, p.output_specification) AS output_specification,
           COALESCE(o.examples_json, p.examples_json) AS examples_json,
           p.judge_problem_ref,
           COALESCE(o.time_limit_ms, p.time_limit_ms) AS time_limit_ms,
           COALESCE(o.memory_limit_kb, p.memory_limit_kb) AS memory_limit_kb,
           p.supported_languages_json, p.metadata_json, p.content_mode, p.evaluation_mode,
           COALESCE(o.material_status, p.material_status) AS material_status,
           COALESCE(o.priority_band, p.priority_band) AS priority_band,
           COALESCE(o.phase_key, p.phase_key) AS phase_key,
           p.review_enabled, p.review_step
    FROM algorithm_problems p
    LEFT JOIN algorithm_problem_overrides o
      ON o.workspace_id = p.workspace_id AND o.problem_id = p.id
    WHERE p.workspace_id = ?
    ORDER BY
      CASE WHEN p.next_review IS NOT NULL AND p.next_review <= ? THEN 0 ELSE 1 END,
      p.updated_at DESC,
      p.id DESC
  `,
    )
    .all(scope.workspaceId, today) as ProblemRow[];
  const attempts = db
    .prepare(
      `
    SELECT id, problem_id, day, verdict, duration_minutes, max_hint_level,
           pre_confidence, independent, review_kind, error_category,
           reflection, source_verification, transfer_source_problem_id, outcome
    FROM algorithm_attempts
    WHERE workspace_id = ?
      AND outcome NOT IN ('in_progress', 'JE', 'CANCELLED')
    ORDER BY day DESC, id DESC
  `,
    )
    .all(scope.workspaceId) as AttemptRow[];
  const attemptsByProblem = new Map<number, AlgorithmAttempt[]>();
  for (const row of attempts) {
    const list = attemptsByProblem.get(row.problem_id) ?? [];
    list.push(mapAttempt(row));
    attemptsByProblem.set(row.problem_id, list);
  }
  const collectionRows = db
    .prepare(
      `
    SELECT problem_id, collection_id
    FROM algorithm_collection_items
    WHERE workspace_id = ?
  `,
    )
    .all(scope.workspaceId) as Array<{ problem_id: number; collection_id: string }>;
  const collectionsByProblem = new Map<number, string[]>();
  for (const row of collectionRows) {
    const list = collectionsByProblem.get(row.problem_id) ?? [];
    list.push(row.collection_id);
    collectionsByProblem.set(row.problem_id, list);
  }
  const problems = problemRows.map((row) =>
    mapProblem(row, attemptsByProblem.get(row.id) ?? [], collectionsByProblem.get(row.id) ?? []),
  );
  return {
    problems,
    dueProblems: problems.filter(
      (problem) => problem.reviewEnabled && problem.nextReview !== null && problem.nextReview <= today,
    ),
    metrics: {
      problemCount: problems.length,
      attemptedCount: problems.filter((problem) => problem.attempts.length > 0).length,
      independentCount: problems.filter((problem) =>
        (["independent_completed", "delayed_stable", "transfer_verified"] as AlgorithmEvidenceStatus[]).includes(
          problem.evidenceStatus,
        ),
      ).length,
      transferCount: problems.filter((problem) => problem.evidenceStatus === "transfer_verified").length,
      dueCount: problems.filter(
        (problem) => problem.reviewEnabled && problem.nextReview !== null && problem.nextReview <= today,
      ).length,
    },
  };
}

/** Lightweight list model for the Web workbench. Rich content and attempts load per problem. */
export function getAlgorithmDashboardSummary(db: Database.Database, scope: WorkspaceScope, today: string): AlgorithmDashboard {
  requirePluginEnabled(db, scope, "algorithms");
  assertDateKey(today);
  const rows = db.prepare(`
    SELECT p.id, COALESCE(o.provider_id, p.provider_id) AS provider_id,
           COALESCE(o.external_problem_id, p.external_problem_id) AS external_problem_id,
           COALESCE(o.source_url, p.source_url) AS source_url,
           COALESCE(o.title, p.title) AS title,
           COALESCE(o.difficulty_band, p.difficulty_band) AS difficulty_band,
           COALESCE(o.tags_json, p.tags_json) AS tags_json,
           COALESCE(o.notes, p.notes) AS notes,
           p.evidence_status, p.next_review, p.problem_mode,
           '' AS statement_markdown, '' AS input_specification, '' AS output_specification,
           '[]' AS examples_json, p.judge_problem_ref,
           COALESCE(o.time_limit_ms, p.time_limit_ms) AS time_limit_ms,
           COALESCE(o.memory_limit_kb, p.memory_limit_kb) AS memory_limit_kb,
           p.supported_languages_json, '{}' AS metadata_json, p.content_mode, p.evaluation_mode,
           COALESCE(o.material_status, p.material_status) AS material_status,
           COALESCE(o.priority_band, p.priority_band) AS priority_band,
           COALESCE(o.phase_key, p.phase_key) AS phase_key,
           p.review_enabled, p.review_step
    FROM algorithm_problems p
    LEFT JOIN algorithm_problem_overrides o
      ON o.workspace_id = p.workspace_id AND o.problem_id = p.id
    WHERE p.workspace_id = ?
    ORDER BY
      CASE WHEN p.next_review IS NOT NULL AND p.next_review <= ? THEN 0 ELSE 1 END,
      p.updated_at DESC, p.id DESC
  `).all(scope.workspaceId, today) as ProblemRow[];
  const attemptedIds = new Set((db.prepare(`
    SELECT DISTINCT problem_id AS problemId FROM algorithm_attempts
    WHERE workspace_id = ? AND outcome NOT IN ('in_progress', 'JE', 'CANCELLED')
  `).all(scope.workspaceId) as Array<{ problemId: number }>).map((row) => row.problemId));
  const problems = rows.map((row) => mapProblem(row, [], []));
  return {
    problems,
    dueProblems: problems.filter((problem) => problem.reviewEnabled && problem.nextReview !== null && problem.nextReview <= today),
    metrics: {
      problemCount: problems.length,
      attemptedCount: attemptedIds.size,
      independentCount: problems.filter((problem) => (["independent_completed", "delayed_stable", "transfer_verified"] as AlgorithmEvidenceStatus[]).includes(problem.evidenceStatus)).length,
      transferCount: problems.filter((problem) => problem.evidenceStatus === "transfer_verified").length,
      dueCount: problems.filter((problem) => problem.reviewEnabled && problem.nextReview !== null && problem.nextReview <= today).length,
    },
  };
}

export function createAlgorithmProblem(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    sourceUrl?: string;
    title: string;
    externalProblemId?: string;
    difficultyBand?: string;
    tags?: string[];
    notes?: string;
    statementMarkdown?: string;
    inputSpecification?: string;
    outputSpecification?: string;
    examples?: AlgorithmProblem["examples"];
    timeLimitMs?: number;
    memoryLimitKb?: number;
  },
): AlgorithmProblem {
  requirePluginEnabled(db, scope, "algorithms");
  const manualId = randomUUID();
  const sourceUrl = input.sourceUrl?.trim() ? normalizeSourceUrl(input.sourceUrl) : `https://ascend.local/algorithm/${manualId}`;
  const title = input.title.trim().slice(0, 160);
  if (!title) throw new Error("请填写题目名称");
  const providerId = input.sourceUrl?.trim() ? inferProviderId(sourceUrl) : "ascend";
  const externalProblemId = (
    input.externalProblemId ||
    inferExternalProblemId(sourceUrl) ||
    `url:${createHash("sha256").update(sourceUrl).digest("hex").slice(0, 24)}`
  )
    .trim()
    .slice(0, 120);
  const difficultyBand = normalizeDifficulty(input.difficultyBand);
  const tags = normalizeTags(input.tags);
  const notes = (input.notes || "").trim().slice(0, 2_000);
  const result = db
    .prepare(
      `
    INSERT INTO algorithm_problems
      (workspace_id, provider_id, external_problem_id, source_url, title,
       difficulty_band, tags_json, notes, problem_mode, content_mode,
       statement_markdown, input_specification, output_specification, examples_json,
       time_limit_ms, memory_limit_kb)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'managed', 'managed', ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      scope.workspaceId,
      providerId,
      externalProblemId,
      sourceUrl,
      title,
      difficultyBand,
      JSON.stringify(tags),
      notes,
      (input.statementMarkdown || "").slice(0, 200_000),
      (input.inputSpecification || "").slice(0, 50_000),
      (input.outputSpecification || "").slice(0, 50_000),
      JSON.stringify(input.examples ?? []),
      boundedInteger(input.timeLimitMs ?? 1000, 1, 3_600_000, "时间限制"),
      boundedInteger(input.memoryLimitKb ?? 262144, 1024, 16_777_216, "内存限制"),
    );
  const problemId = Number(result.lastInsertRowid);
  ensureAlgorithmCurriculumProblem(db, scope, problemId);
  return getAlgorithmProblem(db, scope, problemId);
}

export function deleteAlgorithmProblems(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { problemIds: number[] },
): void {
  requirePluginEnabled(db, scope, "algorithms");
  const problemIds = [...new Set(input.problemIds)];
  if (!problemIds.length || problemIds.length > 200 || problemIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    throw new Error("请选择 1 到 200 道题");
  }
  const placeholders = problemIds.map(() => "?").join(",");
  db.transaction(() => {
    const existing = db.prepare(`
      SELECT COUNT(*) AS count FROM algorithm_problems
      WHERE workspace_id = ? AND id IN (${placeholders})
    `).get(scope.workspaceId, ...problemIds) as { count: number };
    if (existing.count !== problemIds.length) throw new Error("删除范围包含无效题目");

    db.prepare(`
      UPDATE planner_tasks
      SET deleted_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND deleted_at IS NULL AND id IN (
        SELECT task_id FROM learning_task_links
        WHERE workspace_id = ? AND source_type = 'plugin:algorithms'
          AND source_id IN (${placeholders})
      )
    `).run(scope.workspaceId, scope.workspaceId, ...problemIds.map(String));
    db.prepare(`
      UPDATE algorithm_reviews SET attempt_id = NULL
      WHERE workspace_id = ? AND attempt_id IN (
        SELECT id FROM algorithm_attempts
        WHERE workspace_id = ? AND problem_id IN (${placeholders})
      )
    `).run(scope.workspaceId, scope.workspaceId, ...problemIds);
    db.prepare(`
      UPDATE algorithm_attempts SET transfer_source_problem_id = NULL
      WHERE workspace_id = ? AND transfer_source_problem_id IN (${placeholders})
    `).run(scope.workspaceId, ...problemIds);
    db.prepare(`
      DELETE FROM algorithm_problems
      WHERE workspace_id = ? AND id IN (${placeholders})
    `).run(scope.workspaceId, ...problemIds);
  })();
}

export function updateAlgorithmProblemDetails(
  db: Database.Database,
  scope: WorkspaceScope,
  problemIdInput: number,
  input: {
    title?: string;
    difficultyBand?: string;
    tags?: string[];
    notes?: string;
    materialStatus?: string;
    priorityBand?: string;
    phaseKey?: string;
    nextReview?: string | null;
    sourceUrl?: string;
    externalProblemId?: string;
    statementMarkdown?: string;
    inputSpecification?: string;
    outputSpecification?: string;
    examples?: AlgorithmProblem["examples"];
    timeLimitMs?: number;
    memoryLimitKb?: number;
  },
): AlgorithmProblem {
  requirePluginEnabled(db, scope, "algorithms");
  const problemId = boundedInteger(problemIdInput, 1, Number.MAX_SAFE_INTEGER, "算法题编号");
  const current = getAlgorithmProblem(db, scope, problemId);
  const title = input.title === undefined ? current.title : input.title.trim().slice(0, 160);
  if (!title) throw new Error("题目名称必填");
  const difficultyBand =
    input.difficultyBand === undefined ? current.difficultyBand : normalizeDifficulty(input.difficultyBand);
  const tags = input.tags === undefined ? current.tags : normalizeTags(input.tags);
  const notes = input.notes === undefined ? current.notes : input.notes.trim().slice(0, 2_000);
  const materialStatus =
    input.materialStatus === undefined ? current.materialStatus : normalizeMaterialStatusStrict(input.materialStatus);
  const priorityBand =
    input.priorityBand === undefined ? current.priorityBand : normalizePriorityBandStrict(input.priorityBand);
  const phaseKey = input.phaseKey === undefined ? current.phaseKey : normalizePhaseKey(input.phaseKey);
  const nextReview =
    input.nextReview === undefined
      ? current.nextReview
      : input.nextReview === null || input.nextReview === ""
        ? null
        : assertDateKey(input.nextReview);
  const sourceUrl = input.sourceUrl === undefined ? current.sourceUrl : normalizeSourceUrl(input.sourceUrl);
  const providerId = input.sourceUrl === undefined ? current.providerId : inferProviderId(sourceUrl);
  const externalProblemId = input.externalProblemId === undefined ? current.externalProblemId : input.externalProblemId.trim().slice(0, 120);
  if (!externalProblemId) throw new Error("平台题号必填");
  const statementMarkdown = input.statementMarkdown === undefined ? current.statementMarkdown : input.statementMarkdown.slice(0, 200_000);
  const inputSpecification = input.inputSpecification === undefined ? current.inputSpecification : input.inputSpecification.slice(0, 50_000);
  const outputSpecification = input.outputSpecification === undefined ? current.outputSpecification : input.outputSpecification.slice(0, 50_000);
  const examples = input.examples === undefined ? current.examples : parseExamples(JSON.stringify(input.examples));
  const timeLimitMs = input.timeLimitMs === undefined ? current.timeLimitMs : boundedInteger(input.timeLimitMs, 1, 3_600_000, "时间限制");
  const memoryLimitKb = input.memoryLimitKb === undefined ? current.memoryLimitKb : boundedInteger(input.memoryLimitKb, 1024, 16_777_216, "内存限制");
  db.transaction(() => {
    db.prepare(
      `
      INSERT INTO algorithm_problem_overrides
        (workspace_id, problem_id, title, difficulty_band, tags_json, notes,
         material_status, priority_band, phase_key, provider_id, external_problem_id,
         source_url, statement_markdown, input_specification, output_specification,
         examples_json, time_limit_ms, memory_limit_kb)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, problem_id) DO UPDATE SET
        title = COALESCE(excluded.title, title),
        difficulty_band = COALESCE(excluded.difficulty_band, difficulty_band),
        tags_json = COALESCE(excluded.tags_json, tags_json),
        notes = COALESCE(excluded.notes, notes),
        material_status = COALESCE(excluded.material_status, material_status),
        priority_band = COALESCE(excluded.priority_band, priority_band),
        phase_key = COALESCE(excluded.phase_key, phase_key),
        provider_id = COALESCE(excluded.provider_id, provider_id),
        external_problem_id = COALESCE(excluded.external_problem_id, external_problem_id),
        source_url = COALESCE(excluded.source_url, source_url),
        statement_markdown = COALESCE(excluded.statement_markdown, statement_markdown),
        input_specification = COALESCE(excluded.input_specification, input_specification),
        output_specification = COALESCE(excluded.output_specification, output_specification),
        examples_json = COALESCE(excluded.examples_json, examples_json),
        time_limit_ms = COALESCE(excluded.time_limit_ms, time_limit_ms),
        memory_limit_kb = COALESCE(excluded.memory_limit_kb, memory_limit_kb),
        updated_at = CURRENT_TIMESTAMP
    `,
    ).run(
      scope.workspaceId,
      problemId,
      input.title === undefined ? null : title,
      input.difficultyBand === undefined ? null : difficultyBand,
      input.tags === undefined ? null : JSON.stringify(tags),
      input.notes === undefined ? null : notes,
      input.materialStatus === undefined ? null : materialStatus,
      input.priorityBand === undefined ? null : priorityBand,
      input.phaseKey === undefined ? null : phaseKey,
      input.sourceUrl === undefined ? null : providerId,
      input.externalProblemId === undefined ? null : externalProblemId,
      input.sourceUrl === undefined ? null : sourceUrl,
      input.statementMarkdown === undefined ? null : statementMarkdown,
      input.inputSpecification === undefined ? null : inputSpecification,
      input.outputSpecification === undefined ? null : outputSpecification,
      input.examples === undefined ? null : JSON.stringify(examples),
      input.timeLimitMs === undefined ? null : timeLimitMs,
      input.memoryLimitKb === undefined ? null : memoryLimitKb,
    );
    db.prepare(
      `
      UPDATE algorithm_problems
      SET provider_id = ?, external_problem_id = ?, source_url = ?, title = ?, difficulty_band = ?,
          tags_json = ?, notes = ?, material_status = ?, priority_band = ?, phase_key = ?,
          next_review = ?, statement_markdown = ?, input_specification = ?, output_specification = ?,
          examples_json = ?, time_limit_ms = ?, memory_limit_kb = ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ?
    `,
    ).run(
      providerId,
      externalProblemId,
      sourceUrl,
      title,
      difficultyBand,
      JSON.stringify(tags),
      notes,
      materialStatus,
      priorityBand,
      phaseKey,
      nextReview,
      statementMarkdown,
      inputSpecification,
      outputSpecification,
      JSON.stringify(examples),
      timeLimitMs,
      memoryLimitKb,
      scope.workspaceId,
      problemId,
    );
  })();
  return getAlgorithmProblem(db, scope, problemId);
}

export function recordAlgorithmAttempt(
  db: Database.Database,
  scope: WorkspaceScope,
  input: RecordAlgorithmAttemptInput,
): AlgorithmAttempt {
  requirePluginEnabled(db, scope, "algorithms");
  const day = assertDateKey(input.day);
  const problemId = Math.round(Number(input.problemId));
  const problem = db
    .prepare(
      `
    SELECT id, title FROM algorithm_problems WHERE workspace_id = ? AND id = ?
  `,
    )
    .get(scope.workspaceId, problemId) as { id: number; title: string } | undefined;
  if (!problem) throw new Error("算法题不存在");
  const verdict = normalizeVerdict(input.verdict);
  const durationMinutes = boundedInteger(input.durationMinutes ?? 0, 0, 1_440, "训练时长");
  const maxHintLevel = boundedInteger(input.maxHintLevel ?? 0, 0, 4, "提示级别");
  const preConfidence =
    input.preConfidence === null || input.preConfidence === undefined
      ? null
      : boundedInteger(input.preConfidence, 0, 3, "作答前信心");
  const reviewKind = normalizeReviewKind(input.reviewKind);
  const requestedTransferSourceProblemId = normalizeRequestedTransferSourceProblemId(
    input.transferSourceProblemId,
    reviewKind,
  );
  const errorCategory = (input.errorCategory || "").trim().slice(0, 80);
  const reflection = (input.reflection || "").trim().slice(0, 2_000);
  const independent = verdict === "AC" && maxHintLevel <= 1;
  const operationId = normalizeOperationId(input.operationId);
  let replay: AttemptRow | undefined;
  if (operationId) {
    replay = db
      .prepare(
        `
      SELECT id, problem_id, day, verdict, duration_minutes, max_hint_level,
             pre_confidence, independent, review_kind, error_category,
             reflection, source_verification, transfer_source_problem_id, outcome
      FROM algorithm_attempts
      WHERE workspace_id = ? AND session_id = ?
    `,
      )
      .get(scope.workspaceId, operationId) as AttemptRow | undefined;
    if (replay) {
      if (replay.outcome === "in_progress") {
        if (
          replay.problem_id !== problemId
          || replay.review_kind !== reviewKind
          || (replay.pre_confidence !== null && replay.pre_confidence !== preConfidence)
          || replay.transfer_source_problem_id !== requestedTransferSourceProblemId
          || replay.source_verification !== "user_reported"
        ) {
          throw new Error("同一算法训练会话不能切换题目、日期或训练类型");
        }
      } else {
        if (
          replay.problem_id !== problemId ||
          replay.day !== day ||
          replay.verdict !== verdict ||
          replay.duration_minutes !== durationMinutes ||
          replay.max_hint_level !== maxHintLevel ||
          replay.pre_confidence !== preConfidence ||
          replay.independent !== (independent ? 1 : 0) ||
          replay.review_kind !== reviewKind ||
          replay.error_category !== errorCategory ||
          replay.reflection !== reflection ||
          replay.transfer_source_problem_id !== requestedTransferSourceProblemId ||
          replay.source_verification !== "user_reported"
        ) {
          throw new Error("同一算法训练幂等键不能用于不同请求");
        }
        return mapAttempt(replay);
      }
    }
  }
  const transferSource = resolveAlgorithmTransferSource(db, scope, {
    targetProblemId: problemId,
    sourceProblemId: requestedTransferSourceProblemId,
    reviewKind,
    day,
  });
  const prior = db
    .prepare(
      `
    SELECT day FROM algorithm_attempts
    WHERE workspace_id = ? AND problem_id = ?
    ORDER BY day DESC, id DESC
    LIMIT 1
  `,
    )
    .get(scope.workspaceId, problemId) as { day: string } | undefined;
  const evidenceStatus = nextAlgorithmEvidenceStatus({
    verdict,
    independent,
    maxHintLevel,
    reviewKind,
    hasPriorCrossDayAttempt: Boolean((prior && prior.day < day) || transferSource?.hasPriorCrossDayAttempt),
  });
  const nextReview = nextAlgorithmReviewDay(day, {
    verdict,
    independent,
    maxHintLevel,
    evidenceStatus,
  });

  const result = db.transaction(() => {
    let attemptId: number;
    if (replay?.outcome === "in_progress") {
      db.prepare(`
        UPDATE algorithm_attempts
        SET day = ?, verdict = ?, duration_minutes = MAX(duration_minutes, ?),
            max_hint_level = MAX(max_hint_level, ?),
            pre_confidence = COALESCE(pre_confidence, ?), independent = ?,
            review_kind = ?, error_category = ?, reflection = ?,
            transfer_source_problem_id = ?, outcome = ?, ended_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ? AND id = ? AND outcome = 'in_progress'
      `).run(
        day,
        verdict,
        durationMinutes,
        maxHintLevel,
        preConfidence,
        independent ? 1 : 0,
        reviewKind,
        errorCategory,
        reflection,
        transferSource?.problemId ?? null,
        verdict,
        scope.workspaceId,
        replay.id,
      );
      attemptId = replay.id;
    } else {
      const inserted = db.prepare(`
      INSERT INTO algorithm_attempts
        (workspace_id, problem_id, day, verdict, duration_minutes, max_hint_level,
         pre_confidence, independent, review_kind, error_category, reflection,
         transfer_source_problem_id, outcome, ended_at, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `,
      )
      .run(
        scope.workspaceId,
        problemId,
        day,
        verdict,
        durationMinutes,
        maxHintLevel,
        preConfidence,
        independent ? 1 : 0,
        reviewKind,
        errorCategory,
        reflection,
        transferSource?.problemId ?? null,
        verdict,
        operationId ?? "",
      );
      attemptId = Number(inserted.lastInsertRowid);
    }
    db.prepare(
      `
      UPDATE algorithm_problems
      SET evidence_status = ?, next_review = ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ?
    `,
    ).run(evidenceStatus, nextReview, scope.workspaceId, problemId);
    completeManualAlgorithmReview(db, scope, {
      attemptId,
      problemId,
      transferSourceProblemId: transferSource?.problemId ?? null,
      reviewKind,
    });
    db.prepare(
      `
      INSERT OR IGNORE INTO algorithm_reviews
        (workspace_id, problem_id, source_attempt_id, review_kind, due_day)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run(scope.workspaceId, problemId, attemptId, nextReviewKind(evidenceStatus), nextReview);
    return attemptId;
  })();

  const row = db
    .prepare(
      `
    SELECT id, problem_id, day, verdict, duration_minutes, max_hint_level,
           pre_confidence, independent, review_kind, error_category,
           reflection, source_verification, transfer_source_problem_id, outcome
    FROM algorithm_attempts
    WHERE workspace_id = ? AND id = ?
  `,
    )
    .get(scope.workspaceId, result) as AttemptRow;
  return mapAttempt(row);
}

export function getAlgorithmProblem(db: Database.Database, scope: WorkspaceScope, id: number): AlgorithmProblem {
  const row = db
    .prepare(
      `
    SELECT p.id, COALESCE(o.provider_id, p.provider_id) AS provider_id,
           COALESCE(o.external_problem_id, p.external_problem_id) AS external_problem_id,
           COALESCE(o.source_url, p.source_url) AS source_url,
           COALESCE(o.title, p.title) AS title,
           COALESCE(o.difficulty_band, p.difficulty_band) AS difficulty_band,
           COALESCE(o.tags_json, p.tags_json) AS tags_json,
           COALESCE(o.notes, p.notes) AS notes,
           p.evidence_status, p.next_review, p.problem_mode,
           COALESCE(o.statement_markdown, p.statement_markdown) AS statement_markdown,
           COALESCE(o.input_specification, p.input_specification) AS input_specification,
           COALESCE(o.output_specification, p.output_specification) AS output_specification,
           COALESCE(o.examples_json, p.examples_json) AS examples_json,
           p.judge_problem_ref,
           COALESCE(o.time_limit_ms, p.time_limit_ms) AS time_limit_ms,
           COALESCE(o.memory_limit_kb, p.memory_limit_kb) AS memory_limit_kb,
           p.supported_languages_json, p.metadata_json, p.content_mode, p.evaluation_mode,
           COALESCE(o.material_status, p.material_status) AS material_status,
           COALESCE(o.priority_band, p.priority_band) AS priority_band,
           COALESCE(o.phase_key, p.phase_key) AS phase_key,
           p.review_enabled, p.review_step
    FROM algorithm_problems p
    LEFT JOIN algorithm_problem_overrides o
      ON o.workspace_id = p.workspace_id AND o.problem_id = p.id
    WHERE p.workspace_id = ? AND p.id = ?
  `,
    )
    .get(scope.workspaceId, id) as ProblemRow | undefined;
  if (!row) throw new Error("算法题不存在");
  const collectionIds = db
    .prepare(
      `
    SELECT collection_id FROM algorithm_collection_items
    WHERE workspace_id = ? AND problem_id = ?
    ORDER BY collection_id
  `,
    )
    .all(scope.workspaceId, id)
    .map((item) => (item as { collection_id: string }).collection_id);
  return mapProblem(row, [], collectionIds);
}

export function getAlgorithmProblemDetail(db: Database.Database, scope: WorkspaceScope, id: number): AlgorithmProblem {
  const problem = getAlgorithmProblem(db, scope, id);
  const attempts = db.prepare(`
    SELECT id, problem_id, day, verdict, duration_minutes, max_hint_level,
           pre_confidence, independent, review_kind, error_category,
           reflection, source_verification, transfer_source_problem_id, outcome
    FROM algorithm_attempts
    WHERE workspace_id = ? AND problem_id = ?
      AND outcome NOT IN ('in_progress', 'JE', 'CANCELLED')
    ORDER BY day DESC, id DESC
  `).all(scope.workspaceId, id) as AttemptRow[];
  return { ...problem, attempts: attempts.map(mapAttempt) };
}

function normalizeOperationId(value: string | undefined): string | null {
  if (value === undefined) return null;
  const operationId = value.trim();
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(operationId)) throw new Error("算法训练幂等键无效");
  return operationId;
}

function normalizeRequestedTransferSourceProblemId(
  value: number | null | undefined,
  reviewKind: AlgorithmReviewKind,
): number | null {
  const isTransfer = reviewKind === "isomorphic_variant" || reviewKind === "unseen_variant";
  if (!isTransfer) {
    if (value !== undefined && value !== null) throw new Error("只有变式训练可以关联迁移来源题");
    return null;
  }
  if (value === undefined || value === null) throw new Error("变式训练必须选择一道人已独立完成的来源题");
  return boundedInteger(value, 1, Number.MAX_SAFE_INTEGER, "迁移来源题");
}

function mapProblem(row: ProblemRow, attempts: AlgorithmAttempt[], collectionIds: string[] = []): AlgorithmProblem {
  return {
    id: row.id,
    providerId: row.provider_id,
    providerLabel: providerLabel(row.provider_id),
    externalProblemId: row.external_problem_id,
    sourceUrl: row.source_url,
    title: row.title,
    difficultyBand: normalizeDifficulty(row.difficulty_band),
    tags: parseTags(row.tags_json),
    notes: row.notes,
    evidenceStatus: normalizeEvidenceStatus(row.evidence_status),
    nextReview: row.next_review,
    reviewEnabled: row.review_enabled === 1,
    reviewStep: Math.max(0, row.review_step),
    problemMode: normalizeProblemMode(row.problem_mode),
    contentMode: normalizeContentMode(row.content_mode),
    evaluationMode: normalizeEvaluationMode(row.evaluation_mode),
    materialStatus: normalizeMaterialStatus(row.material_status),
    priorityBand: normalizePriorityBand(row.priority_band),
    phaseKey: row.phase_key || "",
    collectionIds,
    statementMarkdown: row.statement_markdown,
    inputSpecification: row.input_specification,
    outputSpecification: row.output_specification,
    examples: parseExamples(row.examples_json),
    judgeProblemRef: row.judge_problem_ref,
    timeLimitMs: row.time_limit_ms,
    memoryLimitKb: row.memory_limit_kb,
    supportedLanguages: parseJudgeLanguages(row.supported_languages_json),
    starterCode: parseStarterCode(row.metadata_json),
    referenceCode: parseReferenceCode(row.metadata_json),
    attempts,
  };
}

function mapAttempt(row: AttemptRow): AlgorithmAttempt {
  return {
    id: row.id,
    problemId: row.problem_id,
    day: row.day,
    verdict: normalizeVerdict(row.verdict),
    durationMinutes: row.duration_minutes,
    maxHintLevel: row.max_hint_level,
    preConfidence: row.pre_confidence,
    independent: Boolean(row.independent),
    reviewKind: normalizeReviewKind(row.review_kind),
    errorCategory: row.error_category,
    reflection: row.reflection,
    sourceVerification: row.source_verification === "provider_verified" ? "provider_verified" : "user_reported",
    transferSourceProblemId: row.transfer_source_problem_id,
  };
}

export function resolveAlgorithmTransferSource(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    targetProblemId: number;
    sourceProblemId?: number | null;
    reviewKind: AlgorithmReviewKind;
    day: string;
  },
): { problemId: number; hasPriorCrossDayAttempt: boolean } | null {
  const isTransfer = input.reviewKind === "isomorphic_variant" || input.reviewKind === "unseen_variant";
  if (!isTransfer) {
    if (input.sourceProblemId !== undefined && input.sourceProblemId !== null) {
      throw new Error("只有变式训练可以关联迁移来源题");
    }
    return null;
  }
  if (input.sourceProblemId === undefined || input.sourceProblemId === null) {
    throw new Error("变式训练必须选择一道人已独立完成的来源题");
  }
  const sourceProblemId = boundedInteger(input.sourceProblemId, 1, Number.MAX_SAFE_INTEGER, "迁移来源题");
  if (sourceProblemId === input.targetProblemId) throw new Error("迁移来源题不能与当前题相同");
  const source = db
    .prepare(
      `
    SELECT id, tags_json
    FROM algorithm_problems
    WHERE workspace_id = ? AND id = ?
  `,
    )
    .get(scope.workspaceId, sourceProblemId) as
    | {
        id: number;
        tags_json: string;
      }
    | undefined;
  const target = db
    .prepare(
      `
    SELECT id, tags_json
    FROM algorithm_problems
    WHERE workspace_id = ? AND id = ?
  `,
    )
    .get(scope.workspaceId, input.targetProblemId) as
    | {
        id: number;
        tags_json: string;
      }
    | undefined;
  if (!source || !target) throw new Error("迁移来源题不存在");
  const prior = db
    .prepare(
      `
    SELECT day
    FROM algorithm_attempts
    WHERE workspace_id = ? AND problem_id = ? AND verdict = 'AC' AND independent = 1
      AND day <= ?
      AND outcome NOT IN ('in_progress', 'JE', 'CANCELLED')
    ORDER BY day DESC, id DESC
    LIMIT 1
  `,
    )
    .get(scope.workspaceId, sourceProblemId, input.day) as { day: string } | undefined;
  if (!prior) throw new Error("迁移来源题尚无先前独立 AC 证据");
  const sourceSkills = getAlgorithmProblemSkillKeys(db, scope, sourceProblemId, source.tags_json);
  const targetSkills = getAlgorithmProblemSkillKeys(db, scope, input.targetProblemId, target.tags_json);
  if (![...sourceSkills].some((skill) => targetSkills.has(skill))) {
    throw new Error("变式题与来源题至少需要一个共同技能标签");
  }
  return { problemId: sourceProblemId, hasPriorCrossDayAttempt: prior.day < input.day };
}

function getAlgorithmProblemSkillKeys(
  db: Database.Database,
  scope: WorkspaceScope,
  problemId: number,
  tagsJson: string,
): Set<string> {
  const skills = db
    .prepare(
      `
    SELECT skill_key
    FROM algorithm_problem_skills
    WHERE workspace_id = ? AND problem_id = ?
  `,
    )
    .all(scope.workspaceId, problemId) as Array<{ skill_key: string }>;
  return new Set([...parseTags(tagsJson), ...skills.map((skill) => skill.skill_key)]);
}

function completeManualAlgorithmReview(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    attemptId: number;
    problemId: number;
    transferSourceProblemId: number | null;
    reviewKind: AlgorithmReviewKind;
  },
): void {
  if (input.reviewKind === "initial") return;
  const reviewedProblemId = input.transferSourceProblemId ?? input.problemId;
  const review = db
    .prepare(
      `
    SELECT id
    FROM algorithm_reviews
    WHERE workspace_id = ? AND problem_id = ? AND review_kind = ?
      AND completed_at IS NULL
    ORDER BY due_day ASC, id ASC
    LIMIT 1
  `,
    )
    .get(scope.workspaceId, reviewedProblemId, input.reviewKind) as { id: number } | undefined;
  if (review) {
    db.prepare(
      `
      UPDATE algorithm_reviews
      SET completed_at = CURRENT_TIMESTAMP, attempt_id = ?
      WHERE workspace_id = ? AND id = ?
    `,
    ).run(input.attemptId, scope.workspaceId, review.id);
  }
  if (input.transferSourceProblemId !== null) {
    db.prepare(
      `
      UPDATE algorithm_problems
      SET next_review = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ?
    `,
    ).run(scope.workspaceId, input.transferSourceProblemId);
  }
}

function nextReviewKind(status: AlgorithmEvidenceStatus): AlgorithmReviewKind {
  if (status === "delayed_stable") return "unseen_variant";
  return "original_retest";
}

function normalizeSourceUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2_000) throw new Error("请填写有效题目链接");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("请填写有效题目链接");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("题目链接必须使用 HTTP 或 HTTPS，且不能包含账号信息");
  }
  url.hash = "";
  return url.toString();
}

function inferProviderId(sourceUrl: string): string {
  return identifyAlgorithmProvider(sourceUrl).id;
}

function inferExternalProblemId(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  return segments.at(-1)?.slice(0, 120) || "";
}

function providerLabel(providerId: string): string {
  if (providerId === "ascend") return "Ascend 原创";
  if (providerId === "zgca-official") return "中关村学院机试";
  if (providerId === "local-import") return "本地题库";
  if (providerId === "poj") return "POJ";
  return getAlgorithmProviderDescriptor(providerId).label;
}

function normalizeProblemMode(value: string): AlgorithmProblem["problemMode"] {
  if (value === "managed" || value === "imported") return value;
  return "external";
}

function normalizeContentMode(value: string): AlgorithmProblem["contentMode"] {
  if (value === "managed" || value === "imported_private") return value;
  return "external_link";
}

function normalizeEvaluationMode(value: string): AlgorithmProblem["evaluationMode"] {
  if (value === "judge" || value === "sample") return value;
  return "manual";
}

function normalizeMaterialStatus(value: string): AlgorithmProblem["materialStatus"] {
  if (value === "doing" || value === "review" || value === "done") return value;
  return "todo";
}

function normalizePriorityBand(value: string): AlgorithmProblem["priorityBand"] {
  if (value === "P1" || value === "P2" || value === "P3") return value;
  return "";
}

function normalizeMaterialStatusStrict(value: string): AlgorithmProblem["materialStatus"] {
  if (!["todo", "doing", "review", "done"].includes(value)) throw new Error("题目训练状态无效");
  return value as AlgorithmProblem["materialStatus"];
}

function normalizePriorityBandStrict(value: string): AlgorithmProblem["priorityBand"] {
  if (!["", "P1", "P2", "P3"].includes(value)) throw new Error("题目优先级无效");
  return value as AlgorithmProblem["priorityBand"];
}

function normalizePhaseKey(value: string): string {
  const phaseKey = value.trim().slice(0, 40);
  if (phaseKey && !/^[\p{L}\p{N}._-]+$/u.test(phaseKey)) throw new Error("题目阶段格式无效");
  return phaseKey;
}

function normalizeDifficulty(value: string | undefined): AlgorithmDifficulty {
  return ALGORITHM_DIFFICULTIES.includes((value || "") as AlgorithmDifficulty)
    ? ((value || "") as AlgorithmDifficulty)
    : "";
}

function normalizeVerdict(value: string): AlgorithmVerdict {
  const normalized = value.trim().toUpperCase();
  if (!ALGORITHM_VERDICTS.includes(normalized as AlgorithmVerdict)) throw new Error("未知评测结果");
  return normalized as AlgorithmVerdict;
}

function normalizeReviewKind(value: string | undefined): AlgorithmReviewKind {
  return ALGORITHM_REVIEW_KINDS.includes((value || "initial") as AlgorithmReviewKind)
    ? ((value || "initial") as AlgorithmReviewKind)
    : "initial";
}

function normalizeEvidenceStatus(value: string): AlgorithmEvidenceStatus {
  const values: AlgorithmEvidenceStatus[] = [
    "unseen",
    "attempted",
    "guided_completed",
    "independent_completed",
    "delayed_stable",
    "transfer_verified",
  ];
  return values.includes(value as AlgorithmEvidenceStatus) ? (value as AlgorithmEvidenceStatus) : "unseen";
}

function normalizeTags(tags: string[] | undefined): string[] {
  return [
    ...new Set(
      (tags || [])
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => tag.slice(0, 40)),
    ),
  ].slice(0, 12);
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeTags(parsed.filter((tag): tag is string => typeof tag === "string")) : [];
  } catch {
    return [];
  }
}

function parseExamples(value: string): AlgorithmProblem["examples"] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 12).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.input !== "string" || typeof row.output !== "string") return [];
      return [
        {
          input: row.input.slice(0, 10_000),
          output: row.output.slice(0, 10_000),
          ...(typeof row.explanation === "string" ? { explanation: row.explanation.slice(0, 2_000) } : {}),
        },
      ];
    });
  } catch {
    return [];
  }
}

function parseJudgeLanguages(value: string): JudgeLanguage[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((language): language is JudgeLanguage => language === "cpp17" || language === "python3")
      : [];
  } catch {
    return [];
  }
}

function parseStarterCode(value: string): Partial<Record<JudgeLanguage, string>> {
  return parseMetadataCode(value, "starterCode");
}

function parseReferenceCode(value: string): Partial<Record<JudgeLanguage, string>> {
  return parseMetadataCode(value, "referenceCode");
}

function parseMetadataCode(
  value: string,
  key: "starterCode" | "referenceCode",
): Partial<Record<JudgeLanguage, string>> {
  try {
    const metadata = JSON.parse(value) as Record<string, Record<string, unknown> | undefined>;
    const code = metadata[key];
    const result: Partial<Record<JudgeLanguage, string>> = {};
    if (typeof code?.cpp17 === "string") {
      result.cpp17 = code.cpp17.slice(0, 64 * 1024);
    }
    if (typeof code?.python3 === "string") {
      result.python3 = code.python3.slice(0, 64 * 1024);
    }
    return result;
  } catch {
    return {};
  }
}

function boundedInteger(value: number, min: number, max: number, label: string): number {
  const normalized = Math.round(Number(value));
  if (!Number.isFinite(normalized) || normalized < min || normalized > max) {
    throw new Error(`${label}需在 ${min}-${max} 之间`);
  }
  return normalized;
}

export function nextAlgorithmEvidenceStatus(input: {
  verdict: AlgorithmVerdict;
  independent: boolean;
  maxHintLevel: number;
  reviewKind: AlgorithmReviewKind;
  hasPriorCrossDayAttempt: boolean;
}): AlgorithmEvidenceStatus {
  if (input.verdict !== "AC") return "attempted";
  if (!input.independent || input.maxHintLevel >= 2) return "guided_completed";
  if (input.reviewKind === "unseen_variant") return "transfer_verified";
  if (input.reviewKind !== "initial" && input.hasPriorCrossDayAttempt) return "delayed_stable";
  return "independent_completed";
}

export function nextAlgorithmReviewDay(
  day: string,
  input: {
    verdict: AlgorithmVerdict;
    independent: boolean;
    maxHintLevel: number;
    evidenceStatus: AlgorithmEvidenceStatus;
  },
): string {
  if (input.verdict !== "AC") return shiftDateKey(day, 1);
  if (input.evidenceStatus === "transfer_verified") return shiftDateKey(day, 30);
  if (input.evidenceStatus === "delayed_stable") return shiftDateKey(day, 10);
  if (input.independent && input.maxHintLevel <= 1) return shiftDateKey(day, 3);
  return shiftDateKey(day, 1);
}
