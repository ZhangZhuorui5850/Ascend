import type Database from "better-sqlite3";
import { unlinkSync } from "node:fs";
import type { WorkspaceScope } from "../access-context";
import { MAX_UPLOAD_BYTES, mimeTypeForUpload, storeUploadedFile } from "../assets";
import { assertDateKey } from "../dates";
import { ensureDay } from "./days";

export type ExplorerFolder = {
  name: string;
  path: string;
  fileCount: number;
};

export type ExplorerTreeNode = ExplorerFolder & {
  children: ExplorerTreeNode[];
};

export type ExplorerFile = {
  id: number;
  original_name: string;
  mime_type: string;
  size: number;
  day: string;
  folder_path: string;
  created_at: string;
  subject_code: string | null;
  chapter_id: string | null;
  knowledge_point_ids: string;
  knowledge_titles: string;
  category: string;
  note: string;
};

export type ExplorerState = {
  currentPath: string;
  exists: boolean;
  breadcrumbs: Array<{ name: string; path: string }>;
  tree: ExplorerTreeNode[];
  folders: ExplorerFolder[];
  files: ExplorerFile[];
  totalFiles: number;
};

/** 归一化文件夹路径；空串表示根目录。 */
export function normalizeFolderPath(value: string): string {
  return String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

function assertFolderName(name: string): string {
  const cleaned = name.trim().replace(/[<>:"/\\|?*]/g, "").split("").filter(c => c.charCodeAt(0) >= 32).join("").trim();
  if (!cleaned) throw new Error("文件夹名称无效");
  return cleaned;
}

export function ensureFolderPath(db: Database.Database, scope: WorkspaceScope, pathValue: string): void {
  const normalized = normalizeFolderPath(pathValue);
  if (!normalized) return;
  const segments = normalized.split("/");
  const insert = db.prepare(`
    INSERT OR IGNORE INTO folders (workspace_id, path, name, parent_path) VALUES (?, ?, ?, ?)
  `);
  let parentPath = "";
  for (const segment of segments) {
    const currentPath = parentPath ? `${parentPath}/${segment}` : segment;
    insert.run(scope.workspaceId, currentPath, segment, parentPath);
    parentPath = currentPath;
  }
}

export function createFolder(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { parentPath: string; name: string },
): string {
  const parentPath = normalizeFolderPath(input.parentPath);
  const name = assertFolderName(input.name);
  if (parentPath) {
    const parent = db.prepare("SELECT path FROM folders WHERE workspace_id = ? AND path = ?").get(scope.workspaceId, parentPath);
    if (!parent) throw new Error("父文件夹不存在");
  }
  const fullPath = parentPath ? `${parentPath}/${name}` : name;
  ensureFolderPath(db, scope, fullPath);
  return fullPath;
}

export function renameFolder(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { path: string; name: string },
): string {
  const oldPath = normalizeFolderPath(input.path);
  if (!oldPath) throw new Error("不能重命名根目录");
  const folder = db.prepare("SELECT path, parent_path FROM folders WHERE workspace_id = ? AND path = ?").get(scope.workspaceId, oldPath) as
    | { path: string; parent_path: string }
    | undefined;
  if (!folder) throw new Error("文件夹不存在");
  const name = assertFolderName(input.name);
  const newPath = folder.parent_path ? `${folder.parent_path}/${name}` : name;
  if (newPath === oldPath) return oldPath;
  const conflict = db.prepare("SELECT path FROM folders WHERE workspace_id = ? AND path = ?").get(scope.workspaceId, newPath);
  if (conflict) throw new Error("同名文件夹已存在");

  rewriteFolderPaths(db, scope, oldPath, newPath, name);
  return newPath;
}

export function moveFolder(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { path: string; newParentPath: string },
): string {
  const oldPath = normalizeFolderPath(input.path);
  const newParent = normalizeFolderPath(input.newParentPath);
  if (!oldPath) throw new Error("不能移动根目录");
  const folder = db.prepare("SELECT path, name, parent_path FROM folders WHERE workspace_id = ? AND path = ?").get(scope.workspaceId, oldPath) as
    | { path: string; name: string; parent_path: string }
    | undefined;
  if (!folder) throw new Error("文件夹不存在");
  if (newParent === folder.parent_path) return oldPath;
  if (newParent === oldPath || newParent.startsWith(`${oldPath}/`)) throw new Error("不能移动到自己的子目录");
  if (newParent) {
    const parent = db.prepare("SELECT path FROM folders WHERE workspace_id = ? AND path = ?").get(scope.workspaceId, newParent);
    if (!parent) throw new Error("目标文件夹不存在");
  }
  const newPath = newParent ? `${newParent}/${folder.name}` : folder.name;
  const conflict = db.prepare("SELECT path FROM folders WHERE workspace_id = ? AND path = ?").get(scope.workspaceId, newPath);
  if (conflict) throw new Error("目标位置已有同名文件夹");

  rewriteFolderPaths(db, scope, oldPath, newPath, folder.name);
  return newPath;
}

function rewriteFolderPaths(
  db: Database.Database,
  scope: WorkspaceScope,
  oldPath: string,
  newPath: string,
  newName: string,
): void {
  const prefix = `${oldPath}/`;
  const rewrite = db.transaction(() => {
    const parentPath = newPath.includes("/") ? newPath.slice(0, newPath.lastIndexOf("/")) : "";
    db.prepare(`
      UPDATE folders SET path = ?, name = ?, parent_path = ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND path = ?
    `).run(
      newPath,
      newName,
      parentPath,
      scope.workspaceId,
      oldPath,
    );
    const descendants = db.prepare(`
      SELECT path, parent_path FROM folders WHERE workspace_id = ? AND path LIKE ?
    `).all(scope.workspaceId, `${prefix}%`) as Array<{
      path: string;
      parent_path: string;
    }>;
    const updateDescendant = db.prepare(`
      UPDATE folders SET path = ?, parent_path = ? WHERE workspace_id = ? AND path = ?
    `);
    for (const descendant of descendants) {
      updateDescendant.run(
        newPath + descendant.path.slice(oldPath.length),
        newPath + descendant.parent_path.slice(oldPath.length),
        scope.workspaceId,
        descendant.path,
      );
    }
    db.prepare("UPDATE assets SET folder_path = ? WHERE workspace_id = ? AND folder_path = ?").run(newPath, scope.workspaceId, oldPath);
    const files = db.prepare(`
      SELECT id, folder_path FROM assets WHERE workspace_id = ? AND folder_path LIKE ?
    `).all(scope.workspaceId, `${prefix}%`) as Array<{
      id: number;
      folder_path: string;
    }>;
    const updateFile = db.prepare("UPDATE assets SET folder_path = ? WHERE workspace_id = ? AND id = ?");
    for (const file of files) {
      updateFile.run(newPath + file.folder_path.slice(oldPath.length), scope.workspaceId, file.id);
    }
  });
  rewrite();
}

/** 删除空文件夹；含文件或子文件夹时拒绝删除。 */
export function deleteFolder(db: Database.Database, scope: WorkspaceScope, pathValue: string): void {
  const folderPath = normalizeFolderPath(pathValue);
  if (!folderPath) throw new Error("不能删除根目录");
  const folder = db.prepare("SELECT path FROM folders WHERE workspace_id = ? AND path = ?").get(scope.workspaceId, folderPath);
  if (!folder) throw new Error("文件夹不存在");
  const childFolder = db.prepare("SELECT path FROM folders WHERE workspace_id = ? AND parent_path = ? LIMIT 1").get(scope.workspaceId, folderPath);
  if (childFolder) throw new Error("文件夹内还有子文件夹，先移动或删除它们");
  const file = db.prepare("SELECT id FROM assets WHERE workspace_id = ? AND folder_path = ? LIMIT 1").get(scope.workspaceId, folderPath);
  if (file) throw new Error("文件夹内还有文件，先移动或删除它们");
  db.prepare("DELETE FROM folders WHERE workspace_id = ? AND path = ?").run(scope.workspaceId, folderPath);
}

export function moveAsset(db: Database.Database, scope: WorkspaceScope, input: { assetId: number; folderPath: string }): void {
  const folderPath = normalizeFolderPath(input.folderPath);
  if (folderPath) {
    const folder = db.prepare("SELECT path FROM folders WHERE workspace_id = ? AND path = ?").get(scope.workspaceId, folderPath);
    if (!folder) throw new Error("目标文件夹不存在");
  }
  const result = db.prepare("UPDATE assets SET folder_path = ? WHERE workspace_id = ? AND id = ?").run(folderPath, scope.workspaceId, input.assetId);
  if (!result.changes) throw new Error("文件不存在");
}

export function renameAsset(db: Database.Database, scope: WorkspaceScope, input: { assetId: number; name: string }): void {
  const name = input.name.trim();
  if (!name) throw new Error("文件名必填");
  const result = db.prepare("UPDATE assets SET original_name = ? WHERE workspace_id = ? AND id = ?").run(name, scope.workspaceId, input.assetId);
  if (!result.changes) throw new Error("文件不存在");
}

export function updateAssetMetadata(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    assetId: number;
    day: string;
    category: string;
    note: string;
    subjectCode?: string;
    chapterId?: string;
    knowledgePointIds?: string[];
  },
): void {
  const day = assertDateKey(input.day);
  db.transaction(() => {
    const result = db.prepare(`
      UPDATE assets SET day = ?, category = ?, note = ? WHERE workspace_id = ? AND id = ?
    `).run(day, normalizeAssetCategory(input.category), input.note.trim().slice(0, 4000), scope.workspaceId, input.assetId);
    if (!result.changes) throw new Error("文件不存在");
    db.prepare("DELETE FROM asset_links WHERE workspace_id = ? AND asset_id = ?").run(scope.workspaceId, input.assetId);
    linkAsset(db, scope, input);
    ensureDay(db, scope, day);
  })();
}

export function moveAssets(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { assetIds: number[]; folderPath: string },
): number {
  const ids = [...new Set(input.assetIds.map(Number).filter(Number.isInteger))].slice(0, 500);
  if (!ids.length) return 0;
  const folderPath = normalizeFolderPath(input.folderPath);
  if (folderPath && !db.prepare("SELECT 1 FROM folders WHERE workspace_id = ? AND path = ?").get(scope.workspaceId, folderPath)) {
    throw new Error("目标文件夹不存在");
  }
  return db.transaction(() => {
    const update = db.prepare("UPDATE assets SET folder_path = ? WHERE workspace_id = ? AND id = ?");
    return ids.reduce((count, id) => count + update.run(folderPath, scope.workspaceId, id).changes, 0);
  })();
}

export function deleteAssets(db: Database.Database, scope: WorkspaceScope, assetIds: number[]): number {
  const ids = [...new Set(assetIds.map(Number).filter(Number.isInteger))].slice(0, 500);
  return db.transaction(() => {
    let removed = 0;
    for (const id of ids) {
      const exists = db.prepare("SELECT 1 FROM assets WHERE workspace_id = ? AND id = ?").get(scope.workspaceId, id);
      if (!exists) continue;
      deleteAsset(db, scope, id);
      removed += 1;
    }
    return removed;
  })();
}

/** 删除文件记录并解除全部关联；磁盘上的内容寻址 blob 保留（可被去重复用）。 */
export function deleteAsset(db: Database.Database, scope: WorkspaceScope, assetId: number): void {
  const asset = db.prepare("SELECT id, relative_path FROM assets WHERE workspace_id = ? AND id = ?").get(scope.workspaceId, assetId) as
    | { id: number; relative_path: string }
    | undefined;
  if (!asset) throw new Error("文件不存在");
  const remove = db.transaction(() => {
    db.prepare("DELETE FROM asset_links WHERE workspace_id = ? AND asset_id = ?").run(scope.workspaceId, assetId);
    db.prepare("DELETE FROM asset_tags WHERE workspace_id = ? AND asset_id = ?").run(scope.workspaceId, assetId);
    db.prepare("DELETE FROM asset_knowledge_tags WHERE workspace_id = ? AND asset_id = ?").run(scope.workspaceId, assetId);
    db.prepare("DELETE FROM assets WHERE workspace_id = ? AND id = ?").run(scope.workspaceId, assetId);
    db.prepare("UPDATE blobs SET ref_count = MAX(0, ref_count - 1) WHERE workspace_id = ? AND storage_key = ?").run(
      scope.workspaceId,
      asset.relative_path,
    );
  });
  remove();
}

export function getExplorer(db: Database.Database, scope: WorkspaceScope, pathValue: string): ExplorerState {
  const currentPath = normalizeFolderPath(pathValue);
  const exists = !currentPath || Boolean(db.prepare("SELECT path FROM folders WHERE workspace_id = ? AND path = ?").get(scope.workspaceId, currentPath));

  const folderRows = db.prepare(`
    SELECT path, name, parent_path FROM folders WHERE workspace_id = ? ORDER BY name ASC
  `).all(scope.workspaceId) as Array<{
    path: string;
    name: string;
    parent_path: string;
  }>;
  const fileCounts = db.prepare(`
    SELECT folder_path AS path, COUNT(*) AS count FROM assets WHERE workspace_id = ? GROUP BY folder_path
  `).all(scope.workspaceId) as Array<{
    path: string;
    count: number;
  }>;
  const countByPath = new Map(fileCounts.map((row) => [row.path, row.count]));
  const totalFiles = fileCounts.reduce((total, row) => total + row.count, 0);

  // Subtree file counts: every file contributes to each ancestor folder.
  const subtreeCount = new Map<string, number>();
  for (const [filePath, count] of countByPath) {
    if (!filePath) continue;
    const segments = filePath.split("/");
    for (let index = 1; index <= segments.length; index += 1) {
      const ancestor = segments.slice(0, index).join("/");
      subtreeCount.set(ancestor, (subtreeCount.get(ancestor) || 0) + count);
    }
  }

  const nodes = new Map<string, ExplorerTreeNode>();
  for (const row of folderRows) {
    nodes.set(row.path, {
      name: row.name,
      path: row.path,
      fileCount: subtreeCount.get(row.path) || 0,
      children: [],
    });
  }
  const tree: ExplorerTreeNode[] = [];
  for (const row of folderRows) {
    const node = nodes.get(row.path)!;
    const parent = row.parent_path ? nodes.get(row.parent_path) : undefined;
    if (parent) parent.children.push(node);
    else tree.push(node);
  }

  const folders = folderRows
    .filter((row) => row.parent_path === currentPath)
    .map((row) => nodes.get(row.path)!)
    .map((node) => ({ name: node.name, path: node.path, fileCount: node.fileCount }));

  const files = db.prepare(`
    SELECT
      a.id, a.original_name, a.mime_type, a.size, a.day, a.folder_path, a.created_at, a.category, a.note,
      MAX(l.subject_code) AS subject_code,
      MAX(l.chapter_id) AS chapter_id,
      COALESCE(GROUP_CONCAT(DISTINCT l.knowledge_point_id), '') AS knowledge_point_ids,
      COALESCE(GROUP_CONCAT(DISTINCT k.title), '') AS knowledge_titles
    FROM assets a
    LEFT JOIN asset_links l ON l.asset_id = a.id AND l.workspace_id = a.workspace_id
    LEFT JOIN knowledge_points k ON k.id = l.knowledge_point_id AND k.workspace_id = a.workspace_id
    WHERE a.workspace_id = ? AND a.folder_path = ?
    GROUP BY a.id
    ORDER BY a.original_name COLLATE NOCASE ASC
  `).all(scope.workspaceId, currentPath) as ExplorerFile[];

  const segments = currentPath ? currentPath.split("/") : [];
  const breadcrumbs = segments.map((name, index) => ({
    name,
    path: segments.slice(0, index + 1).join("/"),
  }));

  return { currentPath, exists, breadcrumbs, tree, folders, files, totalFiles };
}

export function searchAssets(db: Database.Database, scope: WorkspaceScope, query: string): ExplorerFile[] {
  const term = query.trim();
  if (!term) return [];
  return db.prepare(`
    SELECT
      a.id, a.original_name, a.mime_type, a.size, a.day, a.folder_path, a.created_at, a.category, a.note,
      MAX(l.subject_code) AS subject_code,
      MAX(l.chapter_id) AS chapter_id,
      COALESCE(GROUP_CONCAT(DISTINCT l.knowledge_point_id), '') AS knowledge_point_ids,
      COALESCE(GROUP_CONCAT(DISTINCT k.title), '') AS knowledge_titles
    FROM assets a
    LEFT JOIN asset_links l ON l.asset_id = a.id AND l.workspace_id = a.workspace_id
    LEFT JOIN knowledge_points k ON k.id = l.knowledge_point_id AND k.workspace_id = a.workspace_id
    LEFT JOIN subject_chapters c ON c.id = l.chapter_id AND c.workspace_id = a.workspace_id
    WHERE a.workspace_id = ? AND (
      a.original_name LIKE ? ESCAPE '\\'
      OR a.note LIKE ? ESCAPE '\\'
      OR a.category LIKE ? ESCAPE '\\'
      OR a.folder_path LIKE ? ESCAPE '\\'
      OR COALESCE(l.subject_code, '') LIKE ? ESCAPE '\\'
      OR COALESCE(c.title, '') LIKE ? ESCAPE '\\'
      OR COALESCE(k.title, '') LIKE ? ESCAPE '\\'
    )
    GROUP BY a.id
    ORDER BY a.created_at DESC
    LIMIT 100
  `).all(scope.workspaceId, ...Array(7).fill(`%${term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`)) as ExplorerFile[];
}

/**
 * 空间用量与配额：按 blob 去重统计（ref_count > 0 的内容寻址块），同一文件多次上传只算一份。
 */
export function getStorageUsage(
  db: Database.Database,
  scope: WorkspaceScope,
): { usedBytes: number; quotaBytes: number } {
  const workspace = db.prepare("SELECT storage_quota_bytes FROM workspaces WHERE id = ?").get(scope.workspaceId) as
    | { storage_quota_bytes: number }
    | undefined;
  if (!workspace) throw new Error("学习空间不存在");
  const usage = db.prepare(
    "SELECT COALESCE(SUM(size), 0) AS bytes FROM blobs WHERE workspace_id = ? AND ref_count > 0",
  ).get(scope.workspaceId) as { bytes: number };
  return { usedBytes: usage.bytes, quotaBytes: workspace.storage_quota_bytes };
}

export async function createAssetFromUpload(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    file: File;
    day?: string;
    subjectCode?: string;
    chapterId?: string;
    knowledgePointIds?: string[];
    folderPath?: string;
    category?: string;
    note?: string;
    uploadRoot?: string;
  },
): Promise<{ id: number }> {
  if (input.file.size > MAX_UPLOAD_BYTES) throw new Error("单个文件不能超过 20MB");
  const { usedBytes, quotaBytes } = getStorageUsage(db, scope);
  if (usedBytes + input.file.size > quotaBytes) throw new Error("存储空间已满");
  const day = assertDateKey(input.day || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }));
  ensureDay(db, scope, day);
  const stored = await storeUploadedFile({
    workspaceId: scope.workspaceId,
    file: input.file,
    day,
    uploadRoot: input.uploadRoot,
  });
  const folderPath = normalizeFolderPath(input.folderPath || "");

  // 服务端按扩展名纠正 MIME，客户端 type 只作候补，防止代码/文本文件被浏览器标错。
  const mimeType = mimeTypeForUpload(input.file.name, input.file.type);
  try {
    return db.transaction(() => {
      const freshUsage = getStorageUsage(db, scope);
      const existingBlob = db.prepare(`
        SELECT ref_count FROM blobs WHERE workspace_id = ? AND id = ?
      `).get(scope.workspaceId, `${scope.workspaceId}:${stored.sha256}`) as { ref_count: number } | undefined;
      if (!existingBlob && freshUsage.usedBytes + stored.size > freshUsage.quotaBytes) throw new Error("存储空间已满");

      db.prepare(`
        INSERT INTO blobs (workspace_id, id, sha256, size, mime_type, storage_key, ref_count)
        VALUES (@workspaceId, @id, @sha256, @size, @mimeType, @storageKey, 0)
        ON CONFLICT(id) DO UPDATE SET ref_count = ref_count
      `).run({
        workspaceId: scope.workspaceId,
        id: `${scope.workspaceId}:${stored.sha256}`,
        sha256: stored.sha256,
        size: stored.size,
        mimeType,
        storageKey: stored.relativePath,
      });

      const result = db.prepare(`
        INSERT INTO assets (workspace_id, day, original_name, safe_name, relative_path, mime_type, size, category, folder_path, note)
        VALUES (@workspaceId, @day, @originalName, @safeName, @relativePath, @mimeType, @size, @category, @folderPath, @note)
      `).run({
        workspaceId: scope.workspaceId,
        day,
        originalName: input.file.name,
        safeName: stored.safeName,
        relativePath: stored.relativePath,
        mimeType,
        size: stored.size,
        category: normalizeAssetCategory(input.category),
        folderPath,
        note: (input.note || "").trim(),
      });
      const assetId = Number(result.lastInsertRowid);
      db.prepare("UPDATE blobs SET ref_count = ref_count + 1 WHERE workspace_id = ? AND id = ?").run(
        scope.workspaceId,
        `${scope.workspaceId}:${stored.sha256}`,
      );
      ensureFolderPath(db, scope, folderPath);
      linkAsset(db, scope, {
        assetId,
        subjectCode: input.subjectCode,
        chapterId: input.chapterId,
        knowledgePointIds: input.knowledgePointIds,
      });
      return { id: assetId };
    })();
  } catch (error) {
    if (stored.created) {
      const referenced = db.prepare(`
        SELECT 1 FROM blobs WHERE workspace_id = ? AND storage_key = ? AND ref_count > 0
      `).get(scope.workspaceId, stored.relativePath);
      if (!referenced) {
        try {
          unlinkSync(stored.absolutePath);
        } catch {
          // GC 会清理极少数无法立即删除的孤立文件。
        }
      }
    }
    throw error;
  }
}

export function linkAsset(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { assetId: number; subjectCode?: string; chapterId?: string; knowledgePointIds?: string[] },
): void {
  let subjectCode = input.subjectCode?.trim() || null;
  const chapterId = input.chapterId?.trim() || null;
  const pointIds = (input.knowledgePointIds || []).map((id) => id.trim()).filter(Boolean);
  if (!subjectCode && !chapterId && !pointIds.length) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO asset_links (workspace_id, asset_id, subject_code, chapter_id, knowledge_point_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  if (!pointIds.length) {
    const asset = db.prepare("SELECT id FROM assets WHERE workspace_id = ? AND id = ?").get(scope.workspaceId, input.assetId);
    if (!asset) throw new Error("文件不存在");
    if (chapterId) {
      const chapter = db.prepare(`
        SELECT subject_code FROM subject_chapters WHERE workspace_id = ? AND id = ?
      `).get(scope.workspaceId, chapterId) as { subject_code: string } | undefined;
      if (!chapter) throw new Error("章节不存在");
      subjectCode = chapter.subject_code;
    } else if (subjectCode && !db.prepare("SELECT 1 FROM subjects WHERE workspace_id = ? AND code = ?").get(scope.workspaceId, subjectCode)) {
      throw new Error("科目不存在");
    }
    insert.run(scope.workspaceId, input.assetId, subjectCode, chapterId, null);
    return;
  }
  const lookupPoint = db.prepare(`
    SELECT subject_code, chapter_id FROM knowledge_points WHERE workspace_id = ? AND id = ?
  `);
  for (const pointId of pointIds) {
    const point = lookupPoint.get(scope.workspaceId, pointId) as { subject_code: string; chapter_id: string | null } | undefined;
    if (!point) throw new Error("知识点不存在");
    insert.run(scope.workspaceId, input.assetId, point.subject_code, point.chapter_id, pointId);
  }
}

function normalizeAssetCategory(value?: string): string {
  const category = String(value || "knowledge").trim();
  return ["knowledge", "mistake", "note"].includes(category) ? category : "knowledge";
}
