import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { assertDateKey } from "../dates";

export type MockExamBreakdownEvidenceType = "group" | "self_assessment";
export type MockExamBreakdownInput = {
  label: string;
  score: number;
  maxScore: number;
  evidenceType?: MockExamBreakdownEvidenceType;
  knowledgePointId?: string | null;
  questionType?: string;
  durationMinutes?: number | null;
  causeCategory?: string;
  guessedCorrect?: boolean | null;
};
export type MockExamBreakdown = {
  label: string;
  score: number;
  maxScore: number;
  evidenceType: MockExamBreakdownEvidenceType;
  knowledgePointId: string | null;
  questionType: string;
  durationMinutes: number | null;
  causeCategory: string;
  guessedCorrect: boolean | null;
};
export type MockExamDiagnosisStatus =
  | "quick"
  | "partial"
  | "complete"
  | "evidence_partial"
  | "evidence_complete"
  | "legacy";
export type MockExamDifficulty = "" | "foundation" | "standard" | "challenge";
export type MockExamRecord = {
  id: number;
  day: string;
  name: string;
  subject_code: string | null;
  score: number;
  max_score: number;
  duration_minutes: number;
  scope_label: string;
  difficulty: MockExamDifficulty;
  notes: string;
  breakdown: MockExamBreakdown[];
  diagnosis_status: MockExamDiagnosisStatus;
  percent: number;
};

export type MockExamDashboard = {
  exams: MockExamRecord[];
  averagePercent: number;
  bestPercent: number;
  changePercent: number | null;
  comparison: {
    subjectCode: string | null;
    scopeLabel: string;
    difficulty: MockExamDifficulty;
    sampleCount: number;
    comparable: boolean;
  } | null;
  weakAreas: Array<{
    key: string;
    label: string;
    percent: number;
    attempts: number;
    evidenceGroups: number;
    knowledgePointId: string | null;
    questionTypes: string[];
    causeCategories: string[];
    subjectCode: string | null;
    scopeLabel: string;
    difficulty: MockExamDifficulty;
  }>;
};

export function createMockExam(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    day: string;
    name: string;
    subjectCode?: string;
    score: number;
    maxScore: number;
    durationMinutes?: number;
    scopeLabel?: string;
    difficulty?: MockExamDifficulty;
    notes?: string;
    breakdown?: MockExamBreakdownInput[];
    diagnosisComplete?: boolean;
    evidenceComplete?: boolean;
  },
): { id: number } {
  const day = assertDateKey(input.day);
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("模考名称必填");
  const score = Number(input.score);
  const maxScore = Number(input.maxScore);
  if (!Number.isFinite(maxScore) || maxScore <= 0) throw new Error("满分需大于 0");
  if (!Number.isFinite(score) || score < 0 || score > maxScore) throw new Error("得分需在 0 到满分之间");
  const subjectCode = input.subjectCode?.trim() || null;
  const scopeLabel = (input.scopeLabel || "").trim().slice(0, 80);
  const difficulty = cleanDifficulty(input.difficulty);
  if (subjectCode) {
    const exists = db.prepare("SELECT 1 FROM subjects WHERE workspace_id = ? AND code = ?")
      .get(scope.workspaceId, subjectCode);
    if (!exists) throw new Error("科目不存在");
  }
  const breakdownInput = input.breakdown || [];
  const breakdown = normalizeMockExamBreakdown(breakdownInput);
  if (breakdown.length !== breakdownInput.length) throw new Error("题组或考后感受的得分无效");
  validateBreakdownLinks(db, scope, subjectCode, breakdown);
  const diagnosisStatus = diagnosisStatusForInput(
    breakdown,
    Boolean(input.diagnosisComplete),
    Boolean(input.evidenceComplete),
    { score, maxScore },
  );
  const result = db.prepare(`
    INSERT INTO mock_exams
      (workspace_id, day, name, subject_code, score, max_score, duration_minutes,
       scope_label, difficulty, breakdown_json, diagnosis_status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scope.workspaceId,
    day,
    name,
    subjectCode,
    score,
    maxScore,
    Math.max(0, Math.min(1440, Math.round(Number(input.durationMinutes) || 0))),
    scopeLabel,
    difficulty,
    JSON.stringify(breakdown),
    diagnosisStatus,
    (input.notes || "").trim().slice(0, 2000),
  );
  return { id: Number(result.lastInsertRowid) };
}

export function getMockExamDashboard(db: Database.Database, scope: WorkspaceScope): MockExamDashboard {
  const rows = db.prepare(`
    SELECT id, day, name, subject_code, score, max_score, duration_minutes,
           scope_label, difficulty, breakdown_json, diagnosis_status, notes
    FROM mock_exams WHERE workspace_id = ? ORDER BY day DESC, created_at DESC
  `).all(scope.workspaceId) as Array<Omit<MockExamRecord, "breakdown" | "percent"> & { breakdown_json: string }>;
  const exams = rows.map((row) => {
    let breakdown: MockExamBreakdown[] = [];
    try {
      const parsed = JSON.parse(row.breakdown_json);
      breakdown = normalizeMockExamBreakdown(parsed);
    } catch {
      breakdown = [];
    }
    return { ...row, breakdown, percent: Math.round((row.score / row.max_score) * 1000) / 10 };
  });
  const latest = exams[0];
  const comparable = Boolean(latest?.scope_label && latest.difficulty);
  const comparisonExams = !latest
    ? []
    : comparable
      ? exams.filter((exam) =>
          exam.subject_code === latest.subject_code
          && exam.scope_label === latest.scope_label
          && exam.difficulty === latest.difficulty)
      : [latest];
  const averagePercent = comparisonExams.length
    ? round1(comparisonExams.reduce((sum, exam) => sum + exam.percent, 0) / comparisonExams.length)
    : 0;
  const bestPercent = comparisonExams.length ? Math.max(...comparisonExams.map((exam) => exam.percent)) : 0;
  const changePercent = comparisonExams.length > 1
    ? round1(comparisonExams[0].percent - comparisonExams[1].percent)
    : null;
  const pointDetails = new Map(
    (db.prepare(`
      SELECT id, title, subject_code
      FROM knowledge_points
      WHERE workspace_id = ?
    `).all(scope.workspaceId) as Array<{ id: string; title: string; subject_code: string }>)
      .map((point) => [point.id, point]),
  );
  const areas = new Map<string, {
    label: string;
    score: number;
    maxScore: number;
    evidenceGroups: number;
    examIds: Set<number>;
    knowledgePointId: string | null;
    subjectCode: string | null;
    questionTypes: Set<string>;
    causeCategories: Set<string>;
  }>();
  for (const exam of comparisonExams) {
    for (const item of exam.breakdown) {
      // 主观能力滑块只作为考后感受保留；弱项必须来自题组/题目得分证据。
      if (item.evidenceType !== "group") continue;
      const key = item.knowledgePointId ? `point:${item.knowledgePointId}` : `label:${item.label}`;
      const current = areas.get(key) || {
        label: item.knowledgePointId ? pointDetails.get(item.knowledgePointId)?.title || item.label : item.label,
        score: 0,
        maxScore: 0,
        evidenceGroups: 0,
        examIds: new Set<number>(),
        knowledgePointId: item.knowledgePointId,
        subjectCode: item.knowledgePointId
          ? pointDetails.get(item.knowledgePointId)?.subject_code || exam.subject_code
          : exam.subject_code,
        questionTypes: new Set<string>(),
        causeCategories: new Set<string>(),
      };
      current.score += item.score;
      current.maxScore += item.maxScore;
      current.evidenceGroups += 1;
      current.examIds.add(exam.id);
      if (item.questionType) current.questionTypes.add(item.questionType);
      if (item.causeCategory) current.causeCategories.add(item.causeCategory);
      areas.set(key, current);
    }
  }
  const weakAreas = [...areas.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      percent: round1((value.score / value.maxScore) * 100),
      attempts: value.examIds.size,
      evidenceGroups: value.evidenceGroups,
      knowledgePointId: value.knowledgePointId,
      questionTypes: [...value.questionTypes],
      causeCategories: [...value.causeCategories],
      subjectCode: value.subjectCode,
      scopeLabel: latest?.scope_label ?? "",
      difficulty: latest?.difficulty ?? "",
    }))
    .sort((a, b) => a.percent - b.percent);
  const comparison = latest
    ? {
        subjectCode: latest.subject_code,
        scopeLabel: latest.scope_label,
        difficulty: latest.difficulty,
        sampleCount: comparisonExams.length,
        comparable,
      }
    : null;
  return { exams, averagePercent, bestPercent, changePercent, comparison, weakAreas };
}

export function normalizeMockExamBreakdown(value: unknown): MockExamBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanBreakdownItem).filter((item): item is MockExamBreakdown => Boolean(item));
}

function cleanBreakdownItem(value: unknown): MockExamBreakdown | null {
  if (!value || typeof value !== "object") return null;
  const input = value as {
    label?: unknown;
    score?: unknown;
    maxScore?: unknown;
    evidenceType?: unknown;
    knowledgePointId?: unknown;
    questionType?: unknown;
    durationMinutes?: unknown;
    causeCategory?: unknown;
    guessedCorrect?: unknown;
  };
  const label = String(input.label || "").trim().slice(0, 40);
  if (input.score === null || input.score === undefined || input.score === "") return null;
  if (input.maxScore === null || input.maxScore === undefined || input.maxScore === "") return null;
  const score = Number(input.score);
  const maxScore = Number(input.maxScore);
  if (!label || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore) return null;
  const evidenceType = input.evidenceType === "group" ? "group" : "self_assessment";
  const knowledgePointId = String(input.knowledgePointId || "").trim().slice(0, 120) || null;
  const questionType = String(input.questionType || "").trim().slice(0, 60);
  const causeCategory = String(input.causeCategory || "").trim().slice(0, 60);
  const duration = input.durationMinutes === null || input.durationMinutes === undefined || input.durationMinutes === ""
    ? null
    : Math.round(Number(input.durationMinutes));
  const durationMinutes = duration !== null && Number.isFinite(duration)
    ? Math.max(0, Math.min(1440, duration))
    : null;
  const guessedCorrect = typeof input.guessedCorrect === "boolean" ? input.guessedCorrect : null;
  return {
    label,
    score,
    maxScore,
    evidenceType,
    knowledgePointId,
    questionType,
    durationMinutes,
    causeCategory,
    guessedCorrect,
  };
}

const COMPLETE_DIAGNOSIS_LABELS = ["概念掌握", "计算准确", "时间控制"] as const;

function diagnosisStatusForInput(
  breakdown: MockExamBreakdown[],
  diagnosisComplete: boolean,
  evidenceComplete: boolean,
  total: { score: number; maxScore: number },
): Exclude<MockExamDiagnosisStatus, "legacy"> {
  const evidenceGroups = breakdown.filter((item) => item.evidenceType === "group");
  if (evidenceComplete && !evidenceGroups.length) {
    throw new Error("完整题组证据至少需要一个题组");
  }
  if (evidenceGroups.length) {
    if (!evidenceComplete) return "evidence_partial";
    const evidenceScore = round1(evidenceGroups.reduce((sum, item) => sum + item.score, 0));
    const evidenceMaxScore = round1(evidenceGroups.reduce((sum, item) => sum + item.maxScore, 0));
    if (Math.abs(evidenceScore - round1(total.score)) > 0.01 || Math.abs(evidenceMaxScore - round1(total.maxScore)) > 0.01) {
      throw new Error("完整题组证据的得分与满分合计需和模考总成绩一致");
    }
    return "evidence_complete";
  }
  if (!breakdown.length) {
    if (diagnosisComplete) throw new Error("完整诊断需要评估三个能力维度");
    return "quick";
  }
  if (!diagnosisComplete) return "partial";
  const labels = new Set(breakdown.map((item) => item.label));
  if (
    breakdown.length !== COMPLETE_DIAGNOSIS_LABELS.length
    || labels.size !== COMPLETE_DIAGNOSIS_LABELS.length
    || !COMPLETE_DIAGNOSIS_LABELS.every((label) => labels.has(label))
  ) {
    throw new Error("完整诊断需要评估三个能力维度");
  }
  return "complete";
}

function validateBreakdownLinks(
  db: Database.Database,
  scope: WorkspaceScope,
  subjectCode: string | null,
  breakdown: MockExamBreakdown[],
): void {
  const linked = breakdown.filter((item) => item.evidenceType === "group" && item.knowledgePointId);
  if (!linked.length) return;
  const ids = [...new Set(linked.map((item) => item.knowledgePointId!))];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db.prepare(`
    SELECT id, subject_code
    FROM knowledge_points
    WHERE workspace_id = ? AND id IN (${placeholders})
  `).all(scope.workspaceId, ...ids) as Array<{ id: string; subject_code: string }>;
  const byId = new Map(rows.map((row) => [row.id, row.subject_code]));
  for (const id of ids) {
    const pointSubject = byId.get(id);
    if (!pointSubject) throw new Error("题组关联的知识点不存在");
    if (subjectCode && pointSubject !== subjectCode) {
      throw new Error("题组知识点与模考科目不一致");
    }
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function cleanDifficulty(value: unknown): MockExamDifficulty {
  return value === "foundation" || value === "standard" || value === "challenge" ? value : "";
}
