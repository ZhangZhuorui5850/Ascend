import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { initializeDatabase } from "../db";
import { runMigrations } from "../migrations";
import { ensureWorkspaceForUser, LEGACY_WORKSPACE_ID } from "./workspaces";

/** 内存数据库，用于测试：与生产同一套建表 + 迁移流程。 */
export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  initializeDatabase(db);
  runMigrations(db);
  return db;
}

export function createTestWorkspace(
  db: Database.Database,
  input: { userId?: string; email?: string; displayName?: string } = {},
): { userId: string; workspaceId: string } {
  const userId = input.userId ?? randomUUID();
  const displayName = input.displayName ?? "测试用户";
  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, role, status)
    VALUES (?, ?, 'test-password-hash', ?, 'user', 'active')
  `).run(userId, input.email ?? `${userId}@example.com`, displayName);
  const { workspaceId } = ensureWorkspaceForUser(db, { id: userId, displayName });
  return { userId, workspaceId };
}

export function seedTestManagedAlgorithmProblems(
  db: Database.Database,
  scope: { workspaceId: string },
): { sourceProblemId: number; targetProblemId: number } {
  const insert = db.prepare(`
    INSERT INTO algorithm_problems
      (workspace_id, provider_id, external_problem_id, source_url, title,
       difficulty_band, tags_json, problem_mode, statement_markdown,
       input_specification, output_specification, examples_json,
       judge_problem_ref, supported_languages_json, hint_ladder_json,
       license_metadata_json, metadata_json, content_mode, evaluation_mode)
    VALUES
      (@workspaceId, 'test-managed', @ref, @sourceUrl, @title,
       'foundation', @tagsJson, 'managed', @statement,
       '测试输入', '测试输出', @examplesJson,
       @ref, '["cpp17","python3"]', @hintsJson,
       '{"license":"CC0-1.0","origin":"test fixture","redistribution":true}',
       @metadataJson, 'managed', 'judge')
  `);
  const hints = JSON.stringify([
    { level: 1, title: "测试提示 1", body: "检查输入。" },
    { level: 2, title: "测试提示 2", body: "识别模型。" },
    { level: 3, title: "测试提示 3", body: "列出步骤。" },
    { level: 4, title: "测试提示 4", body: "完成实现。" },
  ]);
  const metadata = JSON.stringify({
    starterCode: { cpp17: "int main() { return 0; }\n", python3: "# test fixture\n" },
    transferGroup: "test-managed-transfer",
  });
  const source = insert.run({
    workspaceId: scope.workspaceId,
    ref: "test:managed:source:v1",
    sourceUrl: "test-managed://source/v1",
    title: "测试托管题 A",
    tagsJson: JSON.stringify(["test-skill", "shared-skill"]),
    statement: "测试托管题 A 的题面。",
    examplesJson: JSON.stringify([{ input: "1 2\n", output: "3\n" }]),
    hintsJson: hints,
    metadataJson: metadata,
  });
  const target = insert.run({
    workspaceId: scope.workspaceId,
    ref: "test:managed:target:v1",
    sourceUrl: "test-managed://target/v1",
    title: "测试托管题 B",
    tagsJson: JSON.stringify(["shared-skill", "test-variant"]),
    statement: "测试托管题 B 的题面。",
    examplesJson: JSON.stringify([{ input: "1 3\n", output: "6\n" }]),
    hintsJson: hints,
    metadataJson: metadata,
  });
  return {
    sourceProblemId: Number(source.lastInsertRowid),
    targetProblemId: Number(target.lastInsertRowid),
  };
}

export function seedSubjectWithChapter(
  db: Database.Database,
  scope: { workspaceId: string } = { workspaceId: LEGACY_WORKSPACE_ID },
) {
  db.prepare(`
    INSERT INTO subjects (workspace_id, code, name, description)
    VALUES (?, 'M1', '线性代数', '')
  `).run(scope.workspaceId);
  db.prepare(`
    INSERT INTO subject_chapters (workspace_id, id, subject_code, title, sort_order)
    VALUES (?, 'chapter:M1:matrix', 'M1', '矩阵', 1)
  `).run(scope.workspaceId);
  db.prepare(`
    INSERT INTO knowledge_points
      (workspace_id, id, subject_code, subject_name, submodule, tier, tier_name, title,
       exam, status, mastery, reviews, chapter_id, sort_order)
    VALUES
      (?, 'kp1', 'M1', '线性代数', '矩阵', 'r', '精通', '矩阵乘法',
       1, '未学', 0, 0, 'chapter:M1:matrix', 1)
  `).run(scope.workspaceId);
}
