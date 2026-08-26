import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { requirePluginEnabled } from "./plugins";

export type AlgorithmProblemAsset = {
  id: number;
  name: string;
  mimeType: string;
  size: number;
  role: string;
  createdAt: string;
};

export function listAlgorithmProblemAssets(
  db: Database.Database,
  scope: WorkspaceScope,
  problemId: number,
): AlgorithmProblemAsset[] {
  requirePluginEnabled(db, scope, "algorithms");
  requireProblem(db, scope, problemId);
  return db
    .prepare(
      `
    SELECT a.id, a.original_name AS name, a.mime_type AS mimeType, a.size,
           l.role, a.created_at AS createdAt
    FROM algorithm_problem_assets l
    JOIN assets a ON a.workspace_id = l.workspace_id AND a.id = l.asset_id
    WHERE l.workspace_id = ? AND l.problem_id = ?
    ORDER BY a.created_at DESC, a.id DESC
  `,
    )
    .all(scope.workspaceId, problemId) as AlgorithmProblemAsset[];
}

export function linkAlgorithmProblemAsset(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { problemId: number; assetId: number; role?: string },
): void {
  requirePluginEnabled(db, scope, "algorithms");
  requireProblem(db, scope, input.problemId);
  const asset = db
    .prepare(
      `
    SELECT id FROM assets WHERE workspace_id = ? AND id = ?
  `,
    )
    .get(scope.workspaceId, input.assetId);
  if (!asset) throw new Error("资料文件不存在");
  const role = normalizeRole(input.role);
  db.prepare(
    `
    INSERT OR IGNORE INTO algorithm_problem_assets
      (workspace_id, problem_id, asset_id, role)
    VALUES (?, ?, ?, ?)
  `,
  ).run(scope.workspaceId, input.problemId, input.assetId, role);
}

function requireProblem(db: Database.Database, scope: WorkspaceScope, problemId: number): void {
  const id = Math.round(Number(problemId));
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("题目 ID 无效");
  const row = db
    .prepare(
      `
    SELECT id FROM algorithm_problems WHERE workspace_id = ? AND id = ?
  `,
    )
    .get(scope.workspaceId, id);
  if (!row) throw new Error("算法题不存在");
}

function normalizeRole(value: string | undefined): string {
  const allowed = new Set(["reference", "statement", "note", "solution", "counterexample"]);
  return allowed.has(value || "") ? value! : "reference";
}
