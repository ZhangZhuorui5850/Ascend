import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { requirePluginEnabled } from "./plugins";

export type AlgorithmHint = {
  level: 1 | 2 | 3 | 4;
  title: string;
  body: string;
  source: "static";
};

export function revealAlgorithmHint(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    problemId: number;
    sessionId: string;
    level: number;
  },
): AlgorithmHint {
  requirePluginEnabled(db, scope, "algorithms");
  assertSessionId(input.sessionId);
  const level = Math.round(Number(input.level));
  if (![1, 2, 3, 4].includes(level)) throw new Error("提示级别无效");
  const problemId = Math.round(Number(input.problemId));
  const row = db.prepare(`
    SELECT hint_ladder_json
    FROM algorithm_problems
    WHERE workspace_id = ? AND id = ? AND problem_mode = 'managed'
  `).get(scope.workspaceId, problemId) as { hint_ladder_json: string } | undefined;
  if (!row) throw new Error("该题没有 Ascend 分层提示");
  const hint = parseHints(row.hint_ladder_json).find((candidate) => candidate.level === level);
  if (!hint) throw new Error("该级提示不存在");
  db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO algorithm_hint_events
        (workspace_id, problem_id, session_id, hint_level, source)
      VALUES (?, ?, ?, ?, 'static')
    `).run(scope.workspaceId, problemId, input.sessionId, level);
    db.prepare(`
      UPDATE algorithm_attempts
      SET max_hint_level = MAX(max_hint_level, ?)
      WHERE workspace_id = ? AND session_id = ?
    `).run(level, scope.workspaceId, input.sessionId);
  })();
  return hint;
}

export function getSessionMaxHintLevel(
  db: Database.Database,
  scope: WorkspaceScope,
  sessionId: string,
): number {
  assertSessionId(sessionId);
  const row = db.prepare(`
    SELECT COALESCE(MAX(hint_level), 0) AS max_level
    FROM algorithm_hint_events
    WHERE workspace_id = ? AND session_id = ?
  `).get(scope.workspaceId, sessionId) as { max_level: number };
  return row.max_level;
}

function parseHints(value: string): AlgorithmHint[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const level = Math.round(Number(row.level));
      if (![1, 2, 3, 4].includes(level) || typeof row.title !== "string" || typeof row.body !== "string") {
        return [];
      }
      return [{
        level: level as AlgorithmHint["level"],
        title: row.title.slice(0, 120),
        body: row.body.slice(0, 4_000),
        source: "static" as const,
      }];
    });
  } catch {
    return [];
  }
}

function assertSessionId(value: string): void {
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(value)) throw new Error("训练会话 ID 无效");
}

