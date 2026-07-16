import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { assertDateKey } from "../dates";

export type MockExamBreakdown = { label: string; score: number; maxScore: number };
export type MockExamRecord = {
  id: number;
  day: string;
  name: string;
  subject_code: string | null;
  score: number;
  max_score: number;
  duration_minutes: number;
  notes: string;
  breakdown: MockExamBreakdown[];
  percent: number;
};

export type MockExamDashboard = {
  exams: MockExamRecord[];
  averagePercent: number;
  bestPercent: number;
  changePercent: number | null;
  weakAreas: Array<{ label: string; percent: number; attempts: number }>;
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
    notes?: string;
    breakdown?: MockExamBreakdown[];
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
  if (subjectCode) {
    const exists = db.prepare("SELECT 1 FROM subjects WHERE workspace_id = ? AND code = ?")
      .get(scope.workspaceId, subjectCode);
    if (!exists) throw new Error("科目不存在");
  }
  const breakdown = (input.breakdown || []).map(cleanBreakdown).filter((item): item is MockExamBreakdown => Boolean(item));
  const result = db.prepare(`
    INSERT INTO mock_exams
      (workspace_id, day, name, subject_code, score, max_score, duration_minutes, breakdown_json, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scope.workspaceId,
    day,
    name,
    subjectCode,
    score,
    maxScore,
    Math.max(0, Math.min(1440, Math.round(Number(input.durationMinutes) || 0))),
    JSON.stringify(breakdown),
    (input.notes || "").trim().slice(0, 2000),
  );
  return { id: Number(result.lastInsertRowid) };
}

export function getMockExamDashboard(db: Database.Database, scope: WorkspaceScope): MockExamDashboard {
  const rows = db.prepare(`
    SELECT id, day, name, subject_code, score, max_score, duration_minutes, breakdown_json, notes
    FROM mock_exams WHERE workspace_id = ? ORDER BY day DESC, created_at DESC
  `).all(scope.workspaceId) as Array<Omit<MockExamRecord, "breakdown" | "percent"> & { breakdown_json: string }>;
  const exams = rows.map((row) => {
    let breakdown: MockExamBreakdown[] = [];
    try {
      const parsed = JSON.parse(row.breakdown_json);
      if (Array.isArray(parsed)) breakdown = parsed.map(cleanBreakdown).filter((item): item is MockExamBreakdown => Boolean(item));
    } catch {
      breakdown = [];
    }
    return { ...row, breakdown, percent: Math.round((row.score / row.max_score) * 1000) / 10 };
  });
  const averagePercent = exams.length ? round1(exams.reduce((sum, exam) => sum + exam.percent, 0) / exams.length) : 0;
  const bestPercent = exams.length ? Math.max(...exams.map((exam) => exam.percent)) : 0;
  const changePercent = exams.length > 1 ? round1(exams[0].percent - exams[1].percent) : null;
  const areas = new Map<string, { score: number; maxScore: number; attempts: number }>();
  for (const exam of exams) {
    for (const item of exam.breakdown) {
      const current = areas.get(item.label) || { score: 0, maxScore: 0, attempts: 0 };
      current.score += item.score;
      current.maxScore += item.maxScore;
      current.attempts += 1;
      areas.set(item.label, current);
    }
  }
  const weakAreas = [...areas.entries()]
    .map(([label, value]) => ({ label, percent: round1((value.score / value.maxScore) * 100), attempts: value.attempts }))
    .sort((a, b) => a.percent - b.percent);
  return { exams, averagePercent, bestPercent, changePercent, weakAreas };
}

function cleanBreakdown(value: unknown): MockExamBreakdown | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<MockExamBreakdown>;
  const label = String(input.label || "").trim().slice(0, 40);
  const score = Number(input.score);
  const maxScore = Number(input.maxScore);
  if (!label || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore) return null;
  return { label, score, maxScore };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
