import Database from "better-sqlite3";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrations";
import { initializeDatabase } from "./db";
import {
  createChapterWithDb,
  createAssetFromUploadWithDb,
  createFolderWithDb,
  createKnowledgeTagWithDb,
  getActiveDayDraftsWithDb,
  getCaptureHierarchyWithDb,
  getFileExplorerWithDb,
  getKnowledgeLibraryWithDb,
  markCommittedDayDraftsWithDb,
  moveAssetToFolderWithDb,
  normalizeFolderPath,
  updateChapterWithDb,
} from "./repository";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("day draft commits", () => {
  it("commits only drafts matching the submitted day snapshot", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    db.prepare(`
      INSERT INTO drafts (id, scope_type, scope_id, field, content, version, status)
      VALUES
        ('day:2026-07-07:plan', 'day', '2026-07-07', 'plan', 'submitted plan', 1, 'active'),
        ('day:2026-07-07:diary', 'day', '2026-07-07', 'diary', 'newer remote diary', 2, 'active')
    `).run();

    markCommittedDayDraftsWithDb(db, "2026-07-07", {
      plan: "submitted plan",
      diary: "older submitted diary",
    });

    expect(db.prepare("SELECT status FROM drafts WHERE id = 'day:2026-07-07:plan'").get()).toEqual({
      status: "committed",
    });
    expect(db.prepare("SELECT status FROM drafts WHERE id = 'day:2026-07-07:diary'").get()).toEqual({
      status: "active",
    });
  });

  it("returns active draft content with versions for reload-safe autosave", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    db.prepare(`
      INSERT INTO drafts (id, scope_type, scope_id, field, content, version, status)
      VALUES
        ('day:2026-07-07:summary', 'day', '2026-07-07', 'summary', 'reopened draft', 4, 'active'),
        ('day:2026-07-07:blockers', 'day', '2026-07-07', 'blockers', 'old blocker', 2, 'committed')
    `).run();

    expect(getActiveDayDraftsWithDb(db, "2026-07-07")).toEqual({
      values: { summary: "reopened draft" },
      versions: { summary: 4 },
    });
  });
});

describe("repository asset uploads", () => {
  it("deduplicates identical file content while keeping separate asset records", async () => {
    const uploadRoot = await mkdtemp(path.join(os.tmpdir(), "zgca-repository-upload-"));
    tempRoots.push(uploadRoot);
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db, { uploadRoot });

    const first = (await createAssetFromUploadWithDb(db, {
      file: new File(["same bytes"], "notes-a.txt", { type: "text/plain" }),
      uploadRoot,
      day: "2026-07-07",
      tags: ["linear algebra"],
    })) as { id: number; relative_path: string; original_name: string };
    const second = (await createAssetFromUploadWithDb(db, {
      file: new File(["same bytes"], "notes-b.txt", { type: "text/plain" }),
      uploadRoot,
      day: "2026-07-07",
      tags: ["linear algebra"],
    })) as { id: number; relative_path: string; original_name: string };

    expect(first.id).not.toBe(second.id);
    expect(first.original_name).toBe("notes-a.txt");
    expect(second.original_name).toBe("notes-b.txt");
    expect(first.relative_path).toBe(second.relative_path);
    expect(existsSync(path.join(uploadRoot, first.relative_path))).toBe(true);

    expect(db.prepare("SELECT COUNT(*) AS count FROM blobs").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT ref_count FROM blobs").get()).toEqual({ ref_count: 2 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM assets").get()).toEqual({ count: 2 });
  });

  it("stores capture classification, folder path, tags, and knowledge point links", async () => {
    const uploadRoot = await mkdtemp(path.join(os.tmpdir(), "zgca-repository-upload-"));
    tempRoots.push(uploadRoot);
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db, { uploadRoot });
    db.prepare("INSERT INTO subjects (code, name, description) VALUES ('M1', '线性代数', '矩阵')");
    db.prepare(`
      INSERT INTO knowledge_points
        (id, subject_code, subject_name, submodule, tier, tier_name, title, exam)
      VALUES
        ('kp-m1-001', 'M1', '线性代数', '矩阵', 'r', '红区', '矩阵乘法', 1)
    `).run();

    const asset = (await createAssetFromUploadWithDb(db, {
      file: new File(["matrix bytes"], "matrix.png", { type: "image/png" }),
      uploadRoot,
      day: "2026-07-07",
      tags: ["线代", "错题", "错题"],
      subjectCode: "M1",
      knowledgePointId: "kp-m1-001",
      folderPath: "/M1/矩阵/错题截图/",
      category: "mistake",
    })) as { id: number; folder_path: string; category: string };

    expect(asset.folder_path).toBe("M1/矩阵/错题截图");
    expect(asset.category).toBe("mistake");
    expect(
      db.prepare("SELECT subject_code, knowledge_point_id FROM asset_links WHERE asset_id = ?").get(asset.id),
    ).toEqual({ subject_code: "M1", knowledge_point_id: "kp-m1-001" });
    expect(
      db.prepare(`
        SELECT t.name
        FROM tags t
        JOIN asset_tags at ON at.tag_id = t.id
        WHERE at.asset_id = ?
        ORDER BY t.name ASC
      `).all(asset.id),
    ).toEqual([{ name: "线代" }, { name: "错题" }]);
  });

  it("binds uploaded files to a chapter and multiple chapter-scoped knowledge tags", async () => {
    const uploadRoot = await mkdtemp(path.join(os.tmpdir(), "zgca-repository-upload-"));
    tempRoots.push(uploadRoot);
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db, { uploadRoot });
    db.prepare("INSERT INTO subjects (code, name, description) VALUES ('M1', '线性代数', '矩阵')");
    const chapter = createChapterWithDb(db, { subjectCode: "M1", title: "矩阵运算" });
    const multiplication = createKnowledgeTagWithDb(db, { chapterId: chapter.id, name: "矩阵乘法" });
    createKnowledgeTagWithDb(db, { chapterId: chapter.id, name: "逆矩阵" });

    const asset = (await createAssetFromUploadWithDb(db, {
      file: new File(["matrix bytes"], "matrix.png", { type: "image/png" }),
      uploadRoot,
      day: "2026-07-07",
      subjectCode: "M1",
      chapterId: chapter.id,
      knowledgeTagNames: ["矩阵乘法", "行列式"],
      folderPath: "错题截图",
    })) as { id: number };

    expect(
      db.prepare("SELECT subject_code, chapter_id FROM asset_links WHERE asset_id = ?").get(asset.id),
    ).toEqual({ subject_code: "M1", chapter_id: chapter.id });
    expect(
      db.prepare(`
        SELECT kt.name
        FROM knowledge_tags kt
        JOIN asset_knowledge_tags akt ON akt.knowledge_tag_id = kt.id
        WHERE akt.asset_id = ?
        ORDER BY kt.name ASC
      `).all(asset.id),
    ).toEqual([{ name: "矩阵乘法" }, { name: "行列式" }]);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM knowledge_tags WHERE chapter_id = ? AND name = ?").get(chapter.id, multiplication.name),
    ).toEqual({ count: 1 });
  });

  it("normalizes folder paths for library-style browsing", () => {
    expect(normalizeFolderPath(" /M1//矩阵/../错题 ")).toBe("M1/矩阵/错题");
    expect(normalizeFolderPath("")).toBe("未归档");
    expect(normalizeFolderPath("../../outside")).toBe("outside");
  });
});

describe("knowledge library", () => {
  it("supports subject chapter CRUD and chapter-scoped reusable knowledge tags", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);
    db.prepare("INSERT INTO subjects (code, name, description) VALUES ('M1', '线性代数', '矩阵')").run();
    db.prepare("INSERT INTO subjects (code, name, description) VALUES ('M2', '概率', '概率论')").run();

    const chapter = createChapterWithDb(db, { subjectCode: "M1", title: "矩阵运算" });
    const renamed = updateChapterWithDb(db, { id: chapter.id, title: "矩阵与向量" });
    const m1Tag = createKnowledgeTagWithDb(db, { chapterId: chapter.id, name: "特征值" });
    const m2Chapter = createChapterWithDb(db, { subjectCode: "M2", title: "随机变量" });
    const m2Tag = createKnowledgeTagWithDb(db, { chapterId: m2Chapter.id, name: "特征值" });

    expect(renamed.title).toBe("矩阵与向量");
    expect(m1Tag.name).toBe(m2Tag.name);
    expect(m1Tag.id).not.toBe(m2Tag.id);
    expect(getCaptureHierarchyWithDb(db)).toMatchObject([
      {
        code: "M1",
        chapters: [{ id: chapter.id, title: "矩阵与向量", knowledgeTags: [{ id: m1Tag.id, name: "特征值" }] }],
      },
      {
        code: "M2",
        chapters: [{ id: m2Chapter.id, title: "随机变量", knowledgeTags: [{ id: m2Tag.id, name: "特征值" }] }],
      },
    ]);
  });

  it("filters assets by subject, knowledge point, tag, and folder", async () => {
    const uploadRoot = await mkdtemp(path.join(os.tmpdir(), "zgca-library-"));
    tempRoots.push(uploadRoot);
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db, { uploadRoot });
    db.prepare("INSERT INTO subjects (code, name, description) VALUES ('M1', '线性代数', '矩阵')");
    db.prepare("INSERT INTO subjects (code, name, description) VALUES ('M2', '概率', '概率论')");
    db.prepare(`
      INSERT INTO knowledge_points
        (id, subject_code, subject_name, submodule, tier, tier_name, title, exam)
      VALUES
        ('kp-m1-001', 'M1', '线性代数', '矩阵', 'r', '红区', '矩阵乘法', 1),
        ('kp-m2-001', 'M2', '概率', '贝叶斯', 'y', '黄区', '条件概率', 1)
    `).run();

    await createAssetFromUploadWithDb(db, {
      file: new File(["a"], "matrix.png", { type: "image/png" }),
      uploadRoot,
      day: "2026-07-07",
      tags: ["错题"],
      subjectCode: "M1",
      knowledgePointId: "kp-m1-001",
      folderPath: "M1/矩阵",
      category: "mistake",
    });
    await createAssetFromUploadWithDb(db, {
      file: new File(["b"], "prob.pdf", { type: "application/pdf" }),
      uploadRoot,
      day: "2026-07-07",
      tags: ["讲义"],
      subjectCode: "M2",
      knowledgePointId: "kp-m2-001",
      folderPath: "M2/概率",
      category: "knowledge",
    });

    const bySubject = getKnowledgeLibraryWithDb(db, { subjectCode: "M1" });
    expect(bySubject.assets.map((asset) => asset.original_name)).toEqual(["matrix.png"]);
    expect(bySubject.folders).toEqual([{ path: "M1/矩阵", assetCount: 1 }]);

    const byPointAndTag = getKnowledgeLibraryWithDb(db, { knowledgePointId: "kp-m1-001", tag: "错题" });
    expect(byPointAndTag.assets.map((asset) => asset.original_name)).toEqual(["matrix.png"]);
    expect(byPointAndTag.activeFilters).toEqual({
      folderPath: "",
      knowledgePointId: "kp-m1-001",
      subjectCode: "",
      tag: "错题",
    });

    const byFolder = getKnowledgeLibraryWithDb(db, { folderPath: "M2/概率" });
    expect(byFolder.assets.map((asset) => asset.original_name)).toEqual(["prob.pdf"]);
  });

  it("lists a Windows-style folder tree and moves files between folders", async () => {
    const uploadRoot = await mkdtemp(path.join(os.tmpdir(), "zgca-folder-tree-"));
    tempRoots.push(uploadRoot);
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db, { uploadRoot });

    createFolderWithDb(db, { path: "M1" });
    createFolderWithDb(db, { path: "M1/矩阵" });
    const asset = (await createAssetFromUploadWithDb(db, {
      file: new File(["a"], "matrix.png", { type: "image/png" }),
      uploadRoot,
      day: "2026-07-07",
      folderPath: "M1/矩阵",
    })) as { id: number };

    expect(getFileExplorerWithDb(db, "")).toMatchObject({
      currentPath: "",
      breadcrumbs: [],
      folders: [{ name: "M1", path: "M1", assetCount: 1 }],
      files: [],
    });
    expect(getFileExplorerWithDb(db, "M1")).toMatchObject({
      currentPath: "M1",
      breadcrumbs: [{ name: "M1", path: "M1" }],
      folders: [{ name: "矩阵", path: "M1/矩阵", assetCount: 1 }],
      files: [],
    });

    moveAssetToFolderWithDb(db, { assetId: asset.id, folderPath: "M1/复盘" });

    expect(getFileExplorerWithDb(db, "M1/复盘").files.map((file) => file.original_name)).toEqual(["matrix.png"]);
    expect(getFileExplorerWithDb(db, "M1").folders.map((folder) => folder.path).sort()).toEqual(["M1/复盘", "M1/矩阵"]);
  });

  it("returns the full folder tree for an explorer navigation rail", async () => {
    const uploadRoot = await mkdtemp(path.join(os.tmpdir(), "zgca-folder-rail-"));
    tempRoots.push(uploadRoot);
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db, { uploadRoot });

    await createAssetFromUploadWithDb(db, {
      file: new File(["a"], "matrix.png", { type: "image/png" }),
      uploadRoot,
      day: "2026-07-07",
      folderPath: "M1/矩阵",
    });
    await createAssetFromUploadWithDb(db, {
      file: new File(["b"], "prob.pdf", { type: "application/pdf" }),
      uploadRoot,
      day: "2026-07-07",
      folderPath: "M2/概率",
    });

    expect(getFileExplorerWithDb(db, "M1/矩阵").tree).toEqual([
      {
        name: "M1",
        path: "M1",
        assetCount: 1,
        children: [{ name: "矩阵", path: "M1/矩阵", assetCount: 1, children: [] }],
      },
      {
        name: "M2",
        path: "M2",
        assetCount: 1,
        children: [{ name: "概率", path: "M2/概率", assetCount: 1, children: [] }],
      },
    ]);
  });
});
