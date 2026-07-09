import { describe, expect, it } from "vitest";
import {
  createFolder,
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
import { createTestDb, seedSubjectWithChapter } from "./testing";

function insertAsset(db: ReturnType<typeof createTestDb>, name: string, folder: string): number {
  const result = db.prepare(`
    INSERT INTO assets (day, original_name, safe_name, relative_path, size, folder_path)
    VALUES ('2026-07-01', ?, ?, ?, 10, ?)
  `).run(name, name, `blobs/xx/${name}-${Math.random().toString(36).slice(2)}`, folder);
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
    createFolder(db, { parentPath: "", name: "M1" });
    createFolder(db, { parentPath: "M1", name: "特征值" });
    insertAsset(db, "notes.pdf", "M1/特征值");

    const root = getExplorer(db, "");
    expect(root.folders.map((folder) => folder.name)).toEqual(["M1"]);
    expect(root.folders[0].fileCount).toBe(1);
    expect(root.totalFiles).toBe(1);

    const child = getExplorer(db, "M1/特征值");
    expect(child.exists).toBe(true);
    expect(child.breadcrumbs).toEqual([
      { name: "M1", path: "M1" },
      { name: "特征值", path: "M1/特征值" },
    ]);
    expect(child.files.map((file) => file.original_name)).toEqual(["notes.pdf"]);
  });

  it("renames a folder and rewrites descendant paths and files", () => {
    const db = createTestDb();
    createFolder(db, { parentPath: "", name: "M1" });
    createFolder(db, { parentPath: "M1", name: "旧章" });
    createFolder(db, { parentPath: "M1/旧章", name: "深层" });
    insertAsset(db, "a.png", "M1/旧章");
    insertAsset(db, "b.png", "M1/旧章/深层");

    const newPath = renameFolder(db, { path: "M1/旧章", name: "新章" });

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
    createFolder(db, { parentPath: "", name: "A" });
    createFolder(db, { parentPath: "", name: "B" });
    createFolder(db, { parentPath: "A", name: "inner" });
    insertAsset(db, "x.md", "A/inner");

    moveFolder(db, { path: "A/inner", newParentPath: "B" });
    expect(db.prepare("SELECT folder_path FROM assets WHERE original_name = 'x.md'").get()).toMatchObject({
      folder_path: "B/inner",
    });

    expect(() => moveFolder(db, { path: "B", newParentPath: "B/inner" })).toThrow("子目录");
  });

  it("refuses to delete non-empty folders", () => {
    const db = createTestDb();
    createFolder(db, { parentPath: "", name: "M1" });
    insertAsset(db, "a.png", "M1");

    expect(() => deleteFolder(db, "M1")).toThrow("文件");

    moveAsset(db, { assetId: 1, folderPath: "" });
    deleteFolder(db, "M1");
    expect(db.prepare("SELECT COUNT(*) c FROM folders").get()).toMatchObject({ c: 0 });
  });

  it("renames and deletes assets with blob ref bookkeeping", () => {
    const db = createTestDb();
    const id = insertAsset(db, "old.png", "");
    const relative = (db.prepare("SELECT relative_path FROM assets WHERE id = ?").get(id) as { relative_path: string })
      .relative_path;
    db.prepare("INSERT INTO blobs (id, sha256, size, storage_key, ref_count) VALUES ('h', 'h', 10, ?, 1)").run(relative);

    renameAsset(db, { assetId: id, name: "new.png" });
    expect(db.prepare("SELECT original_name FROM assets WHERE id = ?").get(id)).toMatchObject({
      original_name: "new.png",
    });

    deleteAsset(db, id);
    expect(db.prepare("SELECT COUNT(*) c FROM assets").get()).toMatchObject({ c: 0 });
    expect(db.prepare("SELECT ref_count FROM blobs WHERE id = 'h'").get()).toMatchObject({ ref_count: 0 });
  });

  it("links assets to knowledge points via their subject and chapter", () => {
    const db = createTestDb();
    seedSubjectWithChapter(db);
    const id = insertAsset(db, "notes.md", "");

    linkAsset(db, { assetId: id, knowledgePointIds: ["kp1", "missing"] });

    const links = db.prepare("SELECT subject_code, chapter_id, knowledge_point_id FROM asset_links").all();
    expect(links).toEqual([{ subject_code: "M1", chapter_id: "chapter:M1:matrix", knowledge_point_id: "kp1" }]);
  });

  it("searches files by name with escaped patterns", () => {
    const db = createTestDb();
    insertAsset(db, "线代_总结 100%.pdf", "");
    insertAsset(db, "other.txt", "");

    expect(searchAssets(db, "100%").map((file) => file.original_name)).toEqual(["线代_总结 100%.pdf"]);
    expect(searchAssets(db, "总结")).toHaveLength(1);
    expect(searchAssets(db, "")).toEqual([]);
  });
});
