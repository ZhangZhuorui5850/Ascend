import type Database from "better-sqlite3";
import { storeUploadedFile } from "../assets";
import { assertDateKey } from "../dates";
import { ensureDay } from "./days";
import { LEGACY_WORKSPACE_ID } from "./workspaces";

const legacyScope = { workspaceId: LEGACY_WORKSPACE_ID };

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
  knowledge_titles: string;
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

export function ensureFolderPath(db: Database.Database, pathValue: string): void {
  const normalized = normalizeFolderPath(pathValue);
  if (!normalized) return;
  const segments = normalized.split("/");
  const insert = db.prepare("INSERT OR IGNORE INTO folders (path, name, parent_path) VALUES (?, ?, ?)");
  let parentPath = "";
  for (const segment of segments) {
    const currentPath = parentPath ? `${parentPath}/${segment}` : segment;
    insert.run(currentPath, segment, parentPath);
    parentPath = currentPath;
  }
}

export function createFolder(db: Database.Database, input: { parentPath: string; name: string }): string {
  const parentPath = normalizeFolderPath(input.parentPath);
  const name = assertFolderName(input.name);
  if (parentPath) {
    const parent = db.prepare("SELECT path FROM folders WHERE path = ?").get(parentPath);
    if (!parent) throw new Error("父文件夹不存在");
  }
  const fullPath = parentPath ? `${parentPath}/${name}` : name;
  ensureFolderPath(db, fullPath);
  return fullPath;
}

export function renameFolder(db: Database.Database, input: { path: string; name: string }): string {
  const oldPath = normalizeFolderPath(input.path);
  if (!oldPath) throw new Error("不能重命名根目录");
  const folder = db.prepare("SELECT path, parent_path FROM folders WHERE path = ?").get(oldPath) as
    | { path: string; parent_path: string }
    | undefined;
  if (!folder) throw new Error("文件夹不存在");
  const name = assertFolderName(input.name);
  const newPath = folder.parent_path ? `${folder.parent_path}/${name}` : name;
  if (newPath === oldPath) return oldPath;
  const conflict = db.prepare("SELECT path FROM folders WHERE path = ?").get(newPath);
  if (conflict) throw new Error("同名文件夹已存在");

  rewriteFolderPaths(db, oldPath, newPath, name);
  return newPath;
}

export function moveFolder(db: Database.Database, input: { path: string; newParentPath: string }): string {
  const oldPath = normalizeFolderPath(input.path);
  const newParent = normalizeFolderPath(input.newParentPath);
  if (!oldPath) throw new Error("不能移动根目录");
  const folder = db.prepare("SELECT path, name, parent_path FROM folders WHERE path = ?").get(oldPath) as
    | { path: string; name: string; parent_path: string }
    | undefined;
  if (!folder) throw new Error("文件夹不存在");
  if (newParent === folder.parent_path) return oldPath;
  if (newParent === oldPath || newParent.startsWith(`${oldPath}/`)) throw new Error("不能移动到自己的子目录");
  if (newParent) {
    const parent = db.prepare("SELECT path FROM folders WHERE path = ?").get(newParent);
    if (!parent) throw new Error("目标文件夹不存在");
  }
  const newPath = newParent ? `${newParent}/${folder.name}` : folder.name;
  const conflict = db.prepare("SELECT path FROM folders WHERE path = ?").get(newPath);
  if (conflict) throw new Error("目标位置已有同名文件夹");

  rewriteFolderPaths(db, oldPath, newPath, folder.name);
  return newPath;
}

function rewriteFolderPaths(db: Database.Database, oldPath: string, newPath: string, newName: string): void {
  const prefix = `${oldPath}/`;
  const rewrite = db.transaction(() => {
    const parentPath = newPath.includes("/") ? newPath.slice(0, newPath.lastIndexOf("/")) : "";
    db.prepare("UPDATE folders SET path = ?, name = ?, parent_path = ?, updated_at = CURRENT_TIMESTAMP WHERE path = ?").run(
      newPath,
      newName,
      parentPath,
      oldPath,
    );
    const descendants = db.prepare("SELECT path, parent_path FROM folders WHERE path LIKE ?").all(`${prefix}%`) as Array<{
      path: string;
      parent_path: string;
    }>;
    const updateDescendant = db.prepare("UPDATE folders SET path = ?, parent_path = ? WHERE path = ?");
    for (const descendant of descendants) {
      updateDescendant.run(
        newPath + descendant.path.slice(oldPath.length),
        newPath + descendant.parent_path.slice(oldPath.length),
        descendant.path,
      );
    }
    db.prepare("UPDATE assets SET folder_path = ? WHERE folder_path = ?").run(newPath, oldPath);
    const files = db.prepare("SELECT id, folder_path FROM assets WHERE folder_path LIKE ?").all(`${prefix}%`) as Array<{
      id: number;
      folder_path: string;
    }>;
    const updateFile = db.prepare("UPDATE assets SET folder_path = ? WHERE id = ?");
    for (const file of files) {
      updateFile.run(newPath + file.folder_path.slice(oldPath.length), file.id);
    }
  });
  rewrite();
}

/** 删除空文件夹；含文件或子文件夹时拒绝删除。 */
export function deleteFolder(db: Database.Database, pathValue: string): void {
  const folderPath = normalizeFolderPath(pathValue);
  if (!folderPath) throw new Error("不能删除根目录");
  const folder = db.prepare("SELECT path FROM folders WHERE path = ?").get(folderPath);
  if (!folder) throw new Error("文件夹不存在");
  const childFolder = db.prepare("SELECT path FROM folders WHERE parent_path = ? LIMIT 1").get(folderPath);
  if (childFolder) throw new Error("文件夹内还有子文件夹，先移动或删除它们");
  const file = db.prepare("SELECT id FROM assets WHERE folder_path = ? LIMIT 1").get(folderPath);
  if (file) throw new Error("文件夹内还有文件，先移动或删除它们");
  db.prepare("DELETE FROM folders WHERE path = ?").run(folderPath);
}

export function moveAsset(db: Database.Database, input: { assetId: number; folderPath: string }): void {
  const folderPath = normalizeFolderPath(input.folderPath);
  if (folderPath) {
    const folder = db.prepare("SELECT path FROM folders WHERE path = ?").get(folderPath);
    if (!folder) throw new Error("目标文件夹不存在");
  }
  const result = db.prepare("UPDATE assets SET folder_path = ? WHERE id = ?").run(folderPath, input.assetId);
  if (!result.changes) throw new Error("文件不存在");
}

export function renameAsset(db: Database.Database, input: { assetId: number; name: string }): void {
  const name = input.name.trim();
  if (!name) throw new Error("文件名必填");
  const result = db.prepare("UPDATE assets SET original_name = ? WHERE id = ?").run(name, input.assetId);
  if (!result.changes) throw new Error("文件不存在");
}

/** 删除文件记录并解除全部关联；磁盘上的内容寻址 blob 保留（可被去重复用）。 */
export function deleteAsset(db: Database.Database, assetId: number): void {
  const asset = db.prepare("SELECT id, relative_path FROM assets WHERE id = ?").get(assetId) as
    | { id: number; relative_path: string }
    | undefined;
  if (!asset) throw new Error("文件不存在");
  const remove = db.transaction(() => {
    db.prepare("DELETE FROM asset_links WHERE asset_id = ?").run(assetId);
    db.prepare("DELETE FROM asset_tags WHERE asset_id = ?").run(assetId);
    db.prepare("DELETE FROM asset_knowledge_tags WHERE asset_id = ?").run(assetId);
    db.prepare("DELETE FROM assets WHERE id = ?").run(assetId);
    db.prepare("UPDATE blobs SET ref_count = MAX(0, ref_count - 1) WHERE storage_key = ?").run(asset.relative_path);
  });
  remove();
}

export function getExplorer(db: Database.Database, pathValue: string): ExplorerState {
  const currentPath = normalizeFolderPath(pathValue);
  const exists = !currentPath || Boolean(db.prepare("SELECT path FROM folders WHERE path = ?").get(currentPath));

  const folderRows = db.prepare("SELECT path, name, parent_path FROM folders ORDER BY name ASC").all() as Array<{
    path: string;
    name: string;
    parent_path: string;
  }>;
  const fileCounts = db.prepare("SELECT folder_path AS path, COUNT(*) AS count FROM assets GROUP BY folder_path").all() as Array<{
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
      a.id, a.original_name, a.mime_type, a.size, a.day, a.folder_path, a.created_at,
      MAX(l.subject_code) AS subject_code,
      COALESCE(GROUP_CONCAT(DISTINCT k.title), '') AS knowledge_titles
    FROM assets a
    LEFT JOIN asset_links l ON l.asset_id = a.id
    LEFT JOIN knowledge_points k ON k.id = l.knowledge_point_id
    WHERE a.folder_path = ?
    GROUP BY a.id
    ORDER BY a.original_name COLLATE NOCASE ASC
  `).all(currentPath) as ExplorerFile[];

  const segments = currentPath ? currentPath.split("/") : [];
  const breadcrumbs = segments.map((name, index) => ({
    name,
    path: segments.slice(0, index + 1).join("/"),
  }));

  return { currentPath, exists, breadcrumbs, tree, folders, files, totalFiles };
}

export function searchAssets(db: Database.Database, query: string): ExplorerFile[] {
  const term = query.trim();
  if (!term) return [];
  return db.prepare(`
    SELECT
      a.id, a.original_name, a.mime_type, a.size, a.day, a.folder_path, a.created_at,
      MAX(l.subject_code) AS subject_code,
      COALESCE(GROUP_CONCAT(DISTINCT k.title), '') AS knowledge_titles
    FROM assets a
    LEFT JOIN asset_links l ON l.asset_id = a.id
    LEFT JOIN knowledge_points k ON k.id = l.knowledge_point_id
    WHERE a.original_name LIKE ? ESCAPE '\\'
    GROUP BY a.id
    ORDER BY a.created_at DESC
    LIMIT 100
  `).all(`%${term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`) as ExplorerFile[];
}

export async function createAssetFromUpload(
  db: Database.Database,
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
  const day = assertDateKey(input.day || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }));
  ensureDay(db, legacyScope, day);
  const stored = await storeUploadedFile({ file: input.file, day, uploadRoot: input.uploadRoot });
  const folderPath = normalizeFolderPath(input.folderPath || "");

  const mimeType = input.file.type || "application/octet-stream";
  db.prepare(`
    INSERT INTO blobs (id, sha256, size, mime_type, storage_key, ref_count)
    VALUES (@id, @sha256, @size, @mimeType, @storageKey, 0)
    ON CONFLICT(id) DO UPDATE SET ref_count = ref_count
  `).run({
    id: stored.sha256,
    sha256: stored.sha256,
    size: stored.size,
    mimeType,
    storageKey: stored.relativePath,
  });

  const result = db.prepare(`
    INSERT INTO assets (day, original_name, safe_name, relative_path, mime_type, size, category, folder_path, note)
    VALUES (@day, @originalName, @safeName, @relativePath, @mimeType, @size, @category, @folderPath, @note)
  `).run({
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
  db.prepare("UPDATE blobs SET ref_count = ref_count + 1 WHERE id = ?").run(stored.sha256);
  ensureFolderPath(db, folderPath);
  linkAsset(db, {
    assetId,
    subjectCode: input.subjectCode,
    chapterId: input.chapterId,
    knowledgePointIds: input.knowledgePointIds,
  });
  return { id: assetId };
}

export function linkAsset(
  db: Database.Database,
  input: { assetId: number; subjectCode?: string; chapterId?: string; knowledgePointIds?: string[] },
): void {
  const subjectCode = input.subjectCode?.trim() || null;
  const chapterId = input.chapterId?.trim() || null;
  const pointIds = (input.knowledgePointIds || []).map((id) => id.trim()).filter(Boolean);
  if (!subjectCode && !chapterId && !pointIds.length) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO asset_links (asset_id, subject_code, chapter_id, knowledge_point_id)
    VALUES (?, ?, ?, ?)
  `);
  if (!pointIds.length) {
    insert.run(input.assetId, subjectCode, chapterId, null);
    return;
  }
  const lookupPoint = db.prepare("SELECT subject_code, chapter_id FROM knowledge_points WHERE id = ?");
  for (const pointId of pointIds) {
    const point = lookupPoint.get(pointId) as { subject_code: string; chapter_id: string | null } | undefined;
    if (!point) continue;
    insert.run(input.assetId, point.subject_code, point.chapter_id, pointId);
  }
}

function normalizeAssetCategory(value?: string): string {
  const category = String(value || "knowledge").trim();
  return ["knowledge", "mistake", "note"].includes(category) ? category : "knowledge";
}
