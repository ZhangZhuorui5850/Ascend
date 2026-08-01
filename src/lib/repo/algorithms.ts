import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import type { WorkspaceScope } from "../access-context";
import {
  getAlgorithmProviderDescriptor,
  identifyAlgorithmProvider,
} from "../algorithm-providers";
import { assertDateKey, shiftDateKey } from "../dates";
import type { JudgeLanguage } from "../judge-gateway";
import { requirePluginEnabled } from "./plugins";

export const ALGORITHM_VERDICTS = ["AC", "WA", "CE", "TLE", "MLE", "RE", "OTHER"] as const;
export const ALGORITHM_REVIEW_KINDS = ["initial", "original_retest", "isomorphic_variant", "unseen_variant"] as const;
export const ALGORITHM_DIFFICULTIES = ["", "foundation", "standard", "challenge"] as const;

export type AlgorithmVerdict = (typeof ALGORITHM_VERDICTS)[number];
export type AlgorithmReviewKind = (typeof ALGORITHM_REVIEW_KINDS)[number];
export type AlgorithmDifficulty = (typeof ALGORITHM_DIFFICULTIES)[number];
export type AlgorithmEvidenceStatus =
  | "unseen"
  | "attempted"
  | "guided_completed"
  | "independent_completed"
  | "delayed_stable"
  | "transfer_verified";

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
  problemMode: "external" | "managed";
  statementMarkdown: string;
  inputSpecification: string;
  outputSpecification: string;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  judgeProblemRef: string;
  timeLimitMs: number;
  memoryLimitKb: number;
  supportedLanguages: JudgeLanguage[];
  starterCode: Partial<Record<JudgeLanguage, string>>;
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
};

export function getAlgorithmDashboard(
  db: Database.Database,
  scope: WorkspaceScope,
  today: string,
): AlgorithmDashboard {
  requirePluginEnabled(db, scope, "algorithms");
  assertDateKey(today);
  const problemRows = db.prepare(`
    SELECT id, provider_id, external_problem_id, source_url, title, difficulty_band,
           tags_json, notes, evidence_status, next_review, problem_mode,
           statement_markdown, input_specification, output_specification,
           examples_json, judge_problem_ref, time_limit_ms, memory_limit_kb,
           supported_languages_json, metadata_json
    FROM algorithm_problems
    WHERE workspace_id = ?
    ORDER BY
      CASE WHEN next_review IS NOT NULL AND next_review <= ? THEN 0 ELSE 1 END,
      updated_at DESC,
      id DESC
  `).all(scope.workspaceId, today) as ProblemRow[];
  const attempts = db.prepare(`
    SELECT id, problem_id, day, verdict, duration_minutes, max_hint_level,
           pre_confidence, independent, review_kind, error_category,
           reflection, source_verification, transfer_source_problem_id
    FROM algorithm_attempts
    WHERE workspace_id = ?
      AND outcome NOT IN ('in_progress', 'JE', 'CANCELLED')
    ORDER BY day DESC, id DESC
  `).all(scope.workspaceId) as AttemptRow[];
  const attemptsByProblem = new Map<number, AlgorithmAttempt[]>();
  for (const row of attempts) {
    const list = attemptsByProblem.get(row.problem_id) ?? [];
    list.push(mapAttempt(row));
    attemptsByProblem.set(row.problem_id, list);
  }
  const problems = problemRows.map((row) => mapProblem(row, attemptsByProblem.get(row.id) ?? []));
  return {
    problems,
    dueProblems: problems.filter((problem) => problem.nextReview !== null && problem.nextReview <= today),
    metrics: {
      problemCount: problems.length,
      attemptedCount: problems.filter((problem) => problem.attempts.length > 0).length,
      independentCount: problems.filter((problem) => (
        ["independent_completed", "delayed_stable", "transfer_verified"] as AlgorithmEvidenceStatus[]
      ).includes(problem.evidenceStatus)).length,
      transferCount: problems.filter((problem) => problem.evidenceStatus === "transfer_verified").length,
      dueCount: problems.filter((problem) => problem.nextReview !== null && problem.nextReview <= today).length,
    },
  };
}

export function createAlgorithmProblem(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    sourceUrl: string;
    title: string;
    externalProblemId?: string;
    difficultyBand?: string;
    tags?: string[];
    notes?: string;
  },
): AlgorithmProblem {
  requirePluginEnabled(db, scope, "algorithms");
  const sourceUrl = normalizeSourceUrl(input.sourceUrl);
  const title = input.title.trim().slice(0, 160);
  if (!title) throw new Error("请填写题目名称");
  const providerId = inferProviderId(sourceUrl);
  const externalProblemId = (
    input.externalProblemId
    || inferExternalProblemId(sourceUrl)
    || `url:${createHash("sha256").update(sourceUrl).digest("hex").slice(0, 24)}`
  ).trim().slice(0, 120);
  const difficultyBand = normalizeDifficulty(input.difficultyBand);
  const tags = normalizeTags(input.tags);
  const notes = (input.notes || "").trim().slice(0, 2_000);
  const result = db.prepare(`
    INSERT INTO algorithm_problems
      (workspace_id, provider_id, external_problem_id, source_url, title,
       difficulty_band, tags_json, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scope.workspaceId,
    providerId,
    externalProblemId,
    sourceUrl,
    title,
    difficultyBand,
    JSON.stringify(tags),
    notes,
  );
  return getAlgorithmProblem(db, scope, Number(result.lastInsertRowid));
}

export function recordAlgorithmAttempt(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
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
  },
): AlgorithmAttempt {
  requirePluginEnabled(db, scope, "algorithms");
  const day = assertDateKey(input.day);
  const problemId = Math.round(Number(input.problemId));
  const problem = db.prepare(`
    SELECT id, title FROM algorithm_problems WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, problemId) as { id: number; title: string } | undefined;
  if (!problem) throw new Error("算法题不存在");
  const verdict = normalizeVerdict(input.verdict);
  const durationMinutes = boundedInteger(input.durationMinutes ?? 0, 0, 1_440, "训练时长");
  const maxHintLevel = boundedInteger(input.maxHintLevel ?? 0, 0, 4, "提示级别");
  const preConfidence = input.preConfidence === null || input.preConfidence === undefined
    ? null
    : boundedInteger(input.preConfidence, 0, 3, "作答前信心");
  const reviewKind = normalizeReviewKind(input.reviewKind);
  const transferSource = resolveAlgorithmTransferSource(db, scope, {
    targetProblemId: problemId,
    sourceProblemId: input.transferSourceProblemId,
    reviewKind,
    day,
  });
  const errorCategory = (input.errorCategory || "").trim().slice(0, 80);
  const reflection = (input.reflection || "").trim().slice(0, 2_000);
  const independent = verdict === "AC" && maxHintLevel <= 1;
  const prior = db.prepare(`
    SELECT day FROM algorithm_attempts
    WHERE workspace_id = ? AND problem_id = ?
    ORDER BY day DESC, id DESC
    LIMIT 1
  `).get(scope.workspaceId, problemId) as { day: string } | undefined;
  const evidenceStatus = nextAlgorithmEvidenceStatus({
    verdict,
    independent,
    maxHintLevel,
    reviewKind,
    hasPriorCrossDayAttempt: Boolean(
      (prior && prior.day < day)
      || transferSource?.hasPriorCrossDayAttempt,
    ),
  });
  const nextReview = nextAlgorithmReviewDay(day, {
    verdict,
    independent,
    maxHintLevel,
    evidenceStatus,
  });

  const result = db.transaction(() => {
    const inserted = db.prepare(`
      INSERT INTO algorithm_attempts
        (workspace_id, problem_id, day, verdict, duration_minutes, max_hint_level,
         pre_confidence, independent, review_kind, error_category, reflection,
         transfer_source_problem_id, outcome, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
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
    );
    db.prepare(`
      UPDATE algorithm_problems
      SET evidence_status = ?, next_review = ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ?
    `).run(evidenceStatus, nextReview, scope.workspaceId, problemId);
    const attemptId = Number(inserted.lastInsertRowid);
    completeManualAlgorithmReview(db, scope, {
      attemptId,
      problemId,
      transferSourceProblemId: transferSource?.problemId ?? null,
      reviewKind,
    });
    db.prepare(`
      INSERT OR IGNORE INTO algorithm_reviews
        (workspace_id, problem_id, source_attempt_id, review_kind, due_day)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      scope.workspaceId,
      problemId,
      attemptId,
      nextReviewKind(evidenceStatus),
      nextReview,
    );
    if (durationMinutes > 0) {
      db.prepare(`
        INSERT INTO study_sessions
          (workspace_id, day, title, duration_minutes, output, source_type, source_id)
        VALUES (?, ?, ?, ?, ?, 'plugin:algorithms', ?)
      `).run(
        scope.workspaceId,
        day,
        `算法训练：${problem.title}`,
        durationMinutes,
        `${verdict} · 最高提示 L${maxHintLevel} · ${reviewKind}`,
        String(attemptId),
      );
    }
    return attemptId;
  })();

  const row = db.prepare(`
    SELECT id, problem_id, day, verdict, duration_minutes, max_hint_level,
           pre_confidence, independent, review_kind, error_category,
           reflection, source_verification, transfer_source_problem_id
    FROM algorithm_attempts
    WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, result) as AttemptRow;
  return mapAttempt(row);
}

function getAlgorithmProblem(
  db: Database.Database,
  scope: WorkspaceScope,
  id: number,
): AlgorithmProblem {
  const row = db.prepare(`
    SELECT id, provider_id, external_problem_id, source_url, title, difficulty_band,
           tags_json, notes, evidence_status, next_review, problem_mode,
           statement_markdown, input_specification, output_specification,
           examples_json, judge_problem_ref, time_limit_ms, memory_limit_kb,
           supported_languages_json, metadata_json
    FROM algorithm_problems
    WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, id) as ProblemRow | undefined;
  if (!row) throw new Error("算法题不存在");
  return mapProblem(row, []);
}

function mapProblem(row: ProblemRow, attempts: AlgorithmAttempt[]): AlgorithmProblem {
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
    problemMode: row.problem_mode === "managed" ? "managed" : "external",
    statementMarkdown: row.statement_markdown,
    inputSpecification: row.input_specification,
    outputSpecification: row.output_specification,
    examples: parseExamples(row.examples_json),
    judgeProblemRef: row.judge_problem_ref,
    timeLimitMs: row.time_limit_ms,
    memoryLimitKb: row.memory_limit_kb,
    supportedLanguages: parseJudgeLanguages(row.supported_languages_json),
    starterCode: parseStarterCode(row.metadata_json),
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
  const isTransfer = input.reviewKind === "isomorphic_variant"
    || input.reviewKind === "unseen_variant";
  if (!isTransfer) {
    if (input.sourceProblemId !== undefined && input.sourceProblemId !== null) {
      throw new Error("只有变式训练可以关联迁移来源题");
    }
    return null;
  }
  if (input.sourceProblemId === undefined || input.sourceProblemId === null) {
    throw new Error("变式训练必须选择一道人已独立完成的来源题");
  }
  const sourceProblemId = boundedInteger(
    input.sourceProblemId,
    1,
    Number.MAX_SAFE_INTEGER,
    "迁移来源题",
  );
  if (sourceProblemId === input.targetProblemId) throw new Error("迁移来源题不能与当前题相同");
  const source = db.prepare(`
    SELECT id, tags_json
    FROM algorithm_problems
    WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, sourceProblemId) as {
    id: number;
    tags_json: string;
  } | undefined;
  const target = db.prepare(`
    SELECT id, tags_json
    FROM algorithm_problems
    WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, input.targetProblemId) as {
    id: number;
    tags_json: string;
  } | undefined;
  if (!source || !target) throw new Error("迁移来源题不存在");
  const prior = db.prepare(`
    SELECT day
    FROM algorithm_attempts
    WHERE workspace_id = ? AND problem_id = ? AND verdict = 'AC' AND independent = 1
      AND day <= ?
      AND outcome NOT IN ('in_progress', 'JE', 'CANCELLED')
    ORDER BY day DESC, id DESC
    LIMIT 1
  `).get(scope.workspaceId, sourceProblemId, input.day) as { day: string } | undefined;
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
  const skills = db.prepare(`
    SELECT skill_key
    FROM algorithm_problem_skills
    WHERE workspace_id = ? AND problem_id = ?
  `).all(scope.workspaceId, problemId) as Array<{ skill_key: string }>;
  return new Set([
    ...parseTags(tagsJson),
    ...skills.map((skill) => skill.skill_key),
  ]);
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
  const review = db.prepare(`
    SELECT id
    FROM algorithm_reviews
    WHERE workspace_id = ? AND problem_id = ? AND review_kind = ?
      AND completed_at IS NULL
    ORDER BY due_day ASC, id ASC
    LIMIT 1
  `).get(
    scope.workspaceId,
    reviewedProblemId,
    input.reviewKind,
  ) as { id: number } | undefined;
  if (review) {
    db.prepare(`
      UPDATE algorithm_reviews
      SET completed_at = CURRENT_TIMESTAMP, attempt_id = ?
      WHERE workspace_id = ? AND id = ?
    `).run(input.attemptId, scope.workspaceId, review.id);
  }
  if (input.transferSourceProblemId !== null) {
    db.prepare(`
      UPDATE algorithm_problems
      SET next_review = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ?
    `).run(scope.workspaceId, input.transferSourceProblemId);
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
  return getAlgorithmProviderDescriptor(providerId).label;
}

function normalizeDifficulty(value: string | undefined): AlgorithmDifficulty {
  return ALGORITHM_DIFFICULTIES.includes((value || "") as AlgorithmDifficulty)
    ? (value || "") as AlgorithmDifficulty
    : "";
}

function normalizeVerdict(value: string): AlgorithmVerdict {
  const normalized = value.trim().toUpperCase();
  if (!ALGORITHM_VERDICTS.includes(normalized as AlgorithmVerdict)) throw new Error("未知评测结果");
  return normalized as AlgorithmVerdict;
}

function normalizeReviewKind(value: string | undefined): AlgorithmReviewKind {
  return ALGORITHM_REVIEW_KINDS.includes((value || "initial") as AlgorithmReviewKind)
    ? (value || "initial") as AlgorithmReviewKind
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
  return values.includes(value as AlgorithmEvidenceStatus)
    ? value as AlgorithmEvidenceStatus
    : "unseen";
}

function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags || [])
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.slice(0, 40)))]
    .slice(0, 12);
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? normalizeTags(parsed.filter((tag): tag is string => typeof tag === "string"))
      : [];
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
      return [{
        input: row.input.slice(0, 10_000),
        output: row.output.slice(0, 10_000),
        ...(typeof row.explanation === "string"
          ? { explanation: row.explanation.slice(0, 2_000) }
          : {}),
      }];
    });
  } catch {
    return [];
  }
}

function parseJudgeLanguages(value: string): JudgeLanguage[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((language): language is JudgeLanguage => (
        language === "cpp17" || language === "python3"
      ))
      : [];
  } catch {
    return [];
  }
}

function parseStarterCode(value: string): Partial<Record<JudgeLanguage, string>> {
  try {
    const metadata = JSON.parse(value) as { starterCode?: Record<string, unknown> };
    const result: Partial<Record<JudgeLanguage, string>> = {};
    if (typeof metadata.starterCode?.cpp17 === "string") {
      result.cpp17 = metadata.starterCode.cpp17.slice(0, 64 * 1024);
    }
    if (typeof metadata.starterCode?.python3 === "string") {
      result.python3 = metadata.starterCode.python3.slice(0, 64 * 1024);
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
