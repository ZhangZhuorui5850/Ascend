import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createFolder,
  createAssetFromUpload,
  deleteAsset,
  deleteFolder,
  getExplorer,
  linkAsset,
  moveAsset,
  moveFolder,
  normalizeFolderPath,
  renameAsset,
  renameFolder,
  searchAssets,
} from "./library";
import { createTestDb, createTestWorkspace, seedSubjectWithChapter } from "./testing";
import { LEGACY_WORKSPACE_ID } from "./workspaces";

const legacyScope = { workspaceId: LEGACY_WORKSPACE_ID };

function insertAsset(
  db: ReturnType<typeof createTestDb>,
  name: string,
  folder: string,
  scope = legacyScope,
): number {
  const result = db.prepare(`
    INSERT INTO assets (workspace_id, day, original_name, safe_name, relative_path, size, folder_path)
    VALUES (?, '2026-07-01', ?, ?, ?, 10, ?)
  `).run(scope.workspaceId, name, name, `${scope.workspaceId}/blobs/xx/${name}-${Math.random().toString(36).slice(2)}`, folder);
  return Number(result.lastInsertRowid);
}

describe("library repo", () => {
  it("normalizes folder paths", () => {
    expect(normalizeFolderPath(" M1 / 特征值 ")).toBe("M1/特征值");
    expect(normalizeFolderPath("..\\a//b/./")).toBe("a/b");
    expect(normalizeFolderPath("")).toBe("");
  });

  it("creates nested folders and lists them in the explorer", () => {
    const db = createTestDb();
    createFolder(db, legacyScope, { parentPath: "", name: "M1" });
    createFolder(db, legacyScope, { parentPath: "M1", name: "特征值" });
    insertAsset(db, "notes.pdf", "M1/特征值");

    const root = getExplorer(db, legacyScope, "");
    expect(root.folders.map((folder) => folder.name)).toEqual(["M1"]);
    expect(root.folders[0].fileCount).toBe(1);
    expect(root.totalFiles).toBe(1);

    const child = getExplorer(db, legacyScope, "M1/特征值");
    expect(child.exists).toBe(true);
    expect(child.breadcrumbs).toEqual([
      { name: "M1", path: "M1" },
      { name: "特征值", path: "M1/特征值" },
    ]);
    expect(child.files.map((file) => file.original_name)).toEqual(["notes.pdf"]);
  });

  it("renames a folder and rewrites descendant paths and files", () => {
    const db = createTestDb();
    createFolder(db, legacyScope, { parentPath: "", name: "M1" });
    createFolder(db, legacyScope, { parentPath: "M1", name: "旧章" });
    createFolder(db, legacyScope, { parentPath: "M1/旧章", name: "深层" });
    insertAsset(db, "a.png", "M1/旧章");
    insertAsset(db, "b.png", "M1/旧章/深层");

    const newPath = renameFolder(db, legacyScope, { path: "M1/旧章", name: "新章" });

    expect(newPath).toBe("M1/新章");
    expect(db.prepare("SELECT path FROM folders WHERE path = 'M1/新章/深层'").get()).toBeTruthy();
    expect(db.prepare("SELECT folder_path FROM assets WHERE original_name = 'a.png'").get()).toMatchObject({
      folder_path: "M1/新章",
    });
    expect(db.prepare("SELECT folder_path FROM assets WHERE original_name = 'b.png'").get()).toMatchObject({
      folder_path: "M1/新章/深层",
    });
  });

  it("moves folders and rejects moving into own subtree", () => {
    const db = createTestDb();
    createFolder(db, legacyScope, { parentPath: "", name: "A" });
    createFolder(db, legacyScope, { parentPath: "", name: "B" });
    createFolder(db, legacyScope, { parentPath: "A", name: "inner" });
    insertAsset(db, "x.md", "A/inner");

    moveFolder(db, legacyScope, { path: "A/inner", newParentPath: "B" });
    expect(db.prepare("SELECT folder_path FROM assets WHERE original_name = 'x.md'").get()).toMatchObject({
      folder_path: "B/inner",
    });

    expect(() => moveFolder(db, legacyScope, { path: "B", newParentPath: "B/inner" })).toThrow("子目录");
  });

  it("refuses to delete non-empty folders", () => {
    const db = createTestDb();
    createFolder(db, legacyScope, { parentPath: "", name: "M1" });
    insertAsset(db, "a.png", "M1");

    expect(() => deleteFolder(db, legacyScope, "M1")).toThrow("文件");

    moveAsset(db, legacyScope, { assetId: 1, folderPath: "" });
    deleteFolder(db, legacyScope, "M1");
    expect(db.prepare("SELECT COUNT(*) c FROM folders").get()).toMatchObject({ c: 0 });
  });

  it("renames and deletes assets with blob ref bookkeeping", () => {
    const db = createTestDb();
    const id = insertAsset(db, "old.png", "");
    const relative = (db.prepare("SELECT relative_path FROM assets WHERE id = ?").get(id) as { relative_path: string })
      .relative_path;
    db.prepare(`
      INSERT INTO blobs (workspace_id, id, sha256, size, storage_key, ref_count)
      VALUES (?, ?, 'h', 10, ?, 1)
    `).run(legacyScope.workspaceId, `${legacyScope.workspaceId}:h`, relative);

    renameAsset(db, legacyScope, { assetId: id, name: "new.png" });
    expect(db.prepare("SELECT original_name FROM assets WHERE id = ?").get(id)).toMatchObject({
      original_name: "new.png",
    });

    deleteAsset(db, legacyScope, id);
    expect(db.prepare("SELECT COUNT(*) c FROM assets").get()).toMatchObject({ c: 0 });
    expect(db.prepare("SELECT ref_count FROM blobs WHERE id = ?").get(`${legacyScope.workspaceId}:h`)).toMatchObject({ ref_count: 0 });
  });

  it("links assets to knowledge points via their subject and chapter", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    const id = insertAsset(db, "notes.md", "");

    linkAsset(db, legacyScope, { assetId: id, knowledgePointIds: ["kp1", "missing"] });

    const links = db.prepare("SELECT subject_code, chapter_id, knowledge_point_id FROM asset_links").all();
    expect(links).toEqual([{ subject_code: "M1", chapter_id: "chapter:M1:matrix", knowledge_point_id: "kp1" }]);
  });

  it("searches files by name with escaped patterns", () => {
    const db = createTestDb();
    insertAsset(db, "线代_总结 100%.pdf", "");
    insertAsset(db, "other.txt", "");

    expect(searchAssets(db, legacyScope, "100%").map((file) => file.original_name)).toEqual(["线代_总结 100%.pdf"]);
    expect(searchAssets(db, legacyScope, "总结")).toHaveLength(1);
    expect(searchAssets(db, legacyScope, "")).toEqual([]);
  });

  it("isolates folders, search results, and mutations by workspace", () => {
    const db = createTestDb();
    const alpha = createTestWorkspace(db, { email: "alpha@example.com" });
    const beta = createTestWorkspace(db, { email: "beta@example.com" });
    createFolder(db, alpha, { parentPath: "", name: "资料" });
    createFolder(db, beta, { parentPath: "", name: "资料" });
    const alphaAsset = insertAsset(db, "alpha-notes.pdf", "资料", alpha);
    const betaAsset = insertAsset(db, "beta-notes.pdf", "资料", beta);

    expect(getExplorer(db, alpha, "资料").files.map((file) => file.id)).toEqual([alphaAsset]);
    expect(searchAssets(db, beta, "notes").map((file) => file.id)).toEqual([betaAsset]);
    expect(() => renameAsset(db, beta, { assetId: alphaAsset, name: "stolen.pdf" })).toThrow("文件不存在");
    expect(() => moveAsset(db, beta, { assetId: alphaAsset, folderPath: "资料" })).toThrow("文件不存在");
    expect(() => deleteAsset(db, beta, alphaAsset)).toThrow("文件不存在");
    expect(db.prepare("SELECT original_name FROM assets WHERE id = ?").get(alphaAsset)).toMatchObject({
      original_name: "alpha-notes.pdf",
    });
  });

  it("enforces workspace quotas and stores identical uploads inside each workspace", async () => {
    const db = createTestDb();
    const alpha = createTestWorkspace(db, { email: "quota-alpha@example.com" });
    const beta = createTestWorkspace(db, { email: "quota-beta@example.com" });
    const uploadRoot = mkdtempSync(path.join(os.tmpdir(), "zgca-library-"));
    const file = new File(["same bytes"], "notes.txt", { type: "text/plain" });

    try {
      db.prepare("UPDATE workspaces SET storage_quota_bytes = ? WHERE id = ?").run(file.size - 1, alpha.workspaceId);
      await expect(createAssetFromUpload(db, alpha, { file, uploadRoot })).rejects.toThrow("存储空间已满");

      db.prepare("UPDATE workspaces SET storage_quota_bytes = 1000 WHERE id = ?").run(alpha.workspaceId);
      await createAssetFromUpload(db, alpha, { file, uploadRoot });
      await createAssetFromUpload(db, beta, { file, uploadRoot });

      const rows = db.prepare(`
        SELECT workspace_id, relative_path FROM assets WHERE original_name = 'notes.txt' ORDER BY workspace_id
      `).all() as Array<{ workspace_id: string; relative_path: string }>;
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row.relative_path.startsWith(`${encodeURIComponent(row.workspace_id)}/`)).toBe(true);
    } finally {
      rmSync(uploadRoot, { recursive: true, force: true });
    }
  });
});
