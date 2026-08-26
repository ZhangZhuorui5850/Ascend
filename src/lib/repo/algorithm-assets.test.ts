import { describe, expect, it } from "vitest";
import { linkAlgorithmProblemAsset, listAlgorithmProblemAssets } from "./algorithm-assets";
import { createAlgorithmProblem } from "./algorithms";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace } from "./testing";

describe("algorithm problem assets", () => {
  it("links a private drive asset to a problem inside one workspace", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const problem = createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/1000/",
      title: "资料关联测试",
    });
    const assetId = Number(
      db
        .prepare(
          `
      INSERT INTO assets
        (workspace_id, day, original_name, safe_name, relative_path, mime_type, size)
      VALUES (?, '2026-08-19', 'note.pdf', 'note.pdf', 'test/blob', 'application/pdf', 128)
    `,
        )
        .run(scope.workspaceId).lastInsertRowid,
    );

    linkAlgorithmProblemAsset(db, scope, { problemId: problem.id, assetId, role: "note" });
    expect(listAlgorithmProblemAssets(db, scope, problem.id)).toEqual([
      expect.objectContaining({ id: assetId, name: "note.pdf", role: "note", size: 128 }),
    ]);
  });
});
