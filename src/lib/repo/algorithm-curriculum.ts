import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import {
  ALGORITHM_CURRICULUM,
  ALGORITHM_CURRICULUM_COURSE_KEY,
  ALGORITHM_CURRICULUM_TITLE,
  getAlgorithmCurriculumChapters,
} from "../algorithm-curriculum";
import { requirePluginEnabled } from "./plugins";

export type PersistedAlgorithmCurriculumChapter = {
  curriculumKey: string;
  curriculumName: string;
  key: string;
  name: string;
  weekLabel: string;
  description: string;
  sortOrder: number;
};

export type PersistedAlgorithmCurriculumItem = {
  problemId: number;
  curriculumKey: string;
  chapterKey: string;
  membershipKind: "primary" | "supplementary";
  sortOrder: number;
};

export type PersistedAlgorithmCurriculum = {
  key: string;
  name: string;
  chapters: PersistedAlgorithmCurriculumChapter[];
  items: PersistedAlgorithmCurriculumItem[];
};

export function listAlgorithmCurriculum(
  db: Database.Database,
  scope: WorkspaceScope,
): PersistedAlgorithmCurriculum {
  requirePluginEnabled(db, scope, "algorithms");
  const chapters = db.prepare(`
    SELECT curriculum_key AS curriculumKey, curriculum_name AS curriculumName,
           chapter_key AS key, chapter_name AS name, week_label AS weekLabel,
           description, sort_order AS sortOrder
    FROM algorithm_curriculum_chapters
    WHERE workspace_id = ? AND curriculum_key = ?
    ORDER BY sort_order, chapter_key
  `).all(scope.workspaceId, ALGORITHM_CURRICULUM_COURSE_KEY) as PersistedAlgorithmCurriculumChapter[];
  const items = db.prepare(`
    SELECT i.problem_id AS problemId, i.curriculum_key AS curriculumKey,
           i.chapter_key AS chapterKey, i.membership_kind AS membershipKind,
           i.sort_order AS sortOrder
    FROM algorithm_curriculum_items i
    JOIN algorithm_curriculum_chapters c
      ON c.workspace_id = i.workspace_id AND c.curriculum_key = i.curriculum_key
     AND c.chapter_key = i.chapter_key
    WHERE i.workspace_id = ? AND i.curriculum_key = ?
    ORDER BY c.sort_order, i.sort_order, i.problem_id
  `).all(scope.workspaceId, ALGORITHM_CURRICULUM_COURSE_KEY) as PersistedAlgorithmCurriculumItem[];
  return {
    key: ALGORITHM_CURRICULUM_COURSE_KEY,
    name: chapters[0]?.curriculumName ?? ALGORITHM_CURRICULUM_TITLE,
    chapters,
    items,
  };
}

export function ensureAlgorithmCurriculumProblem(
  db: Database.Database,
  scope: WorkspaceScope,
  problemId: number,
): void {
  ensureDefaultChapters(db, scope.workspaceId);
  const primary = db.prepare(`
    SELECT 1 FROM algorithm_curriculum_items
    WHERE workspace_id = ? AND curriculum_key = ? AND problem_id = ? AND membership_kind = 'primary'
  `).get(scope.workspaceId, ALGORITHM_CURRICULUM_COURSE_KEY, problemId);
  if (primary) return;
  const problem = db.prepare(`
    SELECT external_problem_id AS externalProblemId, source_url AS sourceUrl,
           tags_json AS tagsJson, phase_key AS phaseKey
    FROM algorithm_problems
    WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, problemId) as {
    externalProblemId: string;
    sourceUrl: string;
    tagsJson: string;
    phaseKey: string;
  } | undefined;
  if (!problem) throw new Error("算法题不存在");
  const tags = parseTags(problem.tagsJson);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO algorithm_curriculum_items
      (workspace_id, curriculum_key, chapter_key, problem_id, membership_kind, sort_order)
    VALUES (?, ?, ?, ?, ?, COALESCE((
      SELECT MAX(sort_order) + 1 FROM algorithm_curriculum_items
      WHERE workspace_id = ? AND curriculum_key = ? AND chapter_key = ?
    ), 1))
  `);
  getAlgorithmCurriculumChapters({ ...problem, tags }).forEach((chapter, index) => {
    insert.run(
      scope.workspaceId,
      ALGORITHM_CURRICULUM_COURSE_KEY,
      chapter.key,
      problemId,
      index === 0 ? "primary" : "supplementary",
      scope.workspaceId,
      ALGORITHM_CURRICULUM_COURSE_KEY,
      chapter.key,
    );
  });
}

export function setAlgorithmCurriculumChapter(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { problemIds: number[]; chapterKey: string },
): void {
  requirePluginEnabled(db, scope, "algorithms");
  const problemIds = [...new Set(input.problemIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!problemIds.length || problemIds.length > 200) throw new Error("请选择 1 到 200 道题");
  ensureDefaultChapters(db, scope.workspaceId);
  const chapterKey = input.chapterKey.trim();
  const chapter = db.prepare(`
    SELECT 1 FROM algorithm_curriculum_chapters
    WHERE workspace_id = ? AND curriculum_key = ? AND chapter_key = ?
  `).get(scope.workspaceId, ALGORITHM_CURRICULUM_COURSE_KEY, chapterKey);
  if (!chapter) throw new Error("课程章节不存在");
  const found = db.prepare(`
    SELECT COUNT(*) AS count FROM algorithm_problems
    WHERE workspace_id = ? AND id IN (${problemIds.map(() => "?").join(",")})
  `).get(scope.workspaceId, ...problemIds) as { count: number };
  if (found.count !== problemIds.length) throw new Error("题目列表包含无效记录");
  db.transaction(() => {
    const removePrimary = db.prepare(`
      DELETE FROM algorithm_curriculum_items
      WHERE workspace_id = ? AND curriculum_key = ? AND problem_id = ? AND membership_kind = 'primary'
    `);
    const removeTarget = db.prepare(`
      DELETE FROM algorithm_curriculum_items
      WHERE workspace_id = ? AND curriculum_key = ? AND chapter_key = ? AND problem_id = ?
    `);
    const insert = db.prepare(`
      INSERT INTO algorithm_curriculum_items
        (workspace_id, curriculum_key, chapter_key, problem_id, membership_kind, sort_order)
      VALUES (?, ?, ?, ?, 'primary', COALESCE((
        SELECT MAX(sort_order) + 1 FROM algorithm_curriculum_items
        WHERE workspace_id = ? AND curriculum_key = ? AND chapter_key = ?
      ), 1))
    `);
    for (const problemId of problemIds) {
      removePrimary.run(scope.workspaceId, ALGORITHM_CURRICULUM_COURSE_KEY, problemId);
      removeTarget.run(scope.workspaceId, ALGORITHM_CURRICULUM_COURSE_KEY, chapterKey, problemId);
      insert.run(
        scope.workspaceId,
        ALGORITHM_CURRICULUM_COURSE_KEY,
        chapterKey,
        problemId,
        scope.workspaceId,
        ALGORITHM_CURRICULUM_COURSE_KEY,
        chapterKey,
      );
    }
  })();
}

function ensureDefaultChapters(db: Database.Database, workspaceId: string): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO algorithm_curriculum_chapters
      (workspace_id, curriculum_key, curriculum_name, chapter_key, chapter_name,
       week_label, description, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const chapter of ALGORITHM_CURRICULUM) {
    insert.run(
      workspaceId,
      ALGORITHM_CURRICULUM_COURSE_KEY,
      ALGORITHM_CURRICULUM_TITLE,
      chapter.key,
      chapter.title,
      chapter.weekLabel,
      chapter.description,
      chapter.order,
    );
  }
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
