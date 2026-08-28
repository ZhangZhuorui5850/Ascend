import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { requirePluginEnabled } from "./plugins";

export type AlgorithmLibraryFolder = {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
};

export type AlgorithmLibraryItem = {
  problemId: number;
  folderId: string | null;
  sortOrder: number;
  libraryNumber: number;
};

export type AlgorithmLibrary = {
  folders: AlgorithmLibraryFolder[];
  items: AlgorithmLibraryItem[];
};

export type AlgorithmLibraryMove =
  | {
      kind: "problem";
      id: number;
      targetFolderId?: string | null;
      afterProblemId?: number | null;
      placeFirst?: boolean;
    }
  | {
      kind: "folder";
      id: string;
      targetFolderId?: string | null;
      afterFolderId?: string | null;
      placeFirst?: boolean;
      direction?: "up" | "down" | "first";
    };

export function listAlgorithmLibrary(db: Database.Database, scope: WorkspaceScope): AlgorithmLibrary {
  requirePluginEnabled(db, scope, "algorithms");
  ensureAlgorithmLibraryItems(db, scope);
  const folders = db
    .prepare(
      `
      SELECT id, parent_id AS parentId, name, sort_order AS sortOrder
      FROM algorithm_library_folders
      WHERE workspace_id = ?
      ORDER BY parent_id, sort_order, name COLLATE NOCASE, id
    `,
    )
    .all(scope.workspaceId) as AlgorithmLibraryFolder[];
  const items = db
    .prepare(
      `
      SELECT problem_id AS problemId, folder_id AS folderId,
             sort_order AS sortOrder, library_number AS libraryNumber
      FROM algorithm_library_items
      WHERE workspace_id = ?
      ORDER BY folder_id, sort_order, library_number
    `,
    )
    .all(scope.workspaceId) as AlgorithmLibraryItem[];
  return { folders, items };
}

export function createAlgorithmLibraryFolder(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { name: string; parentId?: string | null },
): AlgorithmLibraryFolder {
  requirePluginEnabled(db, scope, "algorithms");
  const name = normalizeFolderName(input.name);
  const parentId = normalizeFolderId(input.parentId);
  assertFolderExists(db, scope, parentId);
  assertFolderNameAvailable(db, scope, parentId, name);
  const sortOrder = nextFolderSortOrder(db, scope, parentId);
  const id = randomUUID();
  db.prepare(
    `
    INSERT INTO algorithm_library_folders
      (workspace_id, id, parent_id, name, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(scope.workspaceId, id, parentId, name, sortOrder);
  return getFolder(db, scope, id);
}

export function renameAlgorithmLibraryFolder(
  db: Database.Database,
  scope: WorkspaceScope,
  folderId: string,
  nameInput: string,
): AlgorithmLibraryFolder {
  requirePluginEnabled(db, scope, "algorithms");
  const folder = getFolder(db, scope, folderId);
  const name = normalizeFolderName(nameInput);
  assertFolderNameAvailable(db, scope, folder.parentId, name, folder.id);
  db.prepare(
    `
    UPDATE algorithm_library_folders
    SET name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND id = ?
  `,
  ).run(name, scope.workspaceId, folder.id);
  return getFolder(db, scope, folder.id);
}

export function deleteAlgorithmLibraryFolder(
  db: Database.Database,
  scope: WorkspaceScope,
  folderId: string,
  options: { promoteContents?: boolean } = {},
): void {
  requirePluginEnabled(db, scope, "algorithms");
  const folder = getFolder(db, scope, folderId);
  const content = db
    .prepare(
      `
      SELECT
        EXISTS(SELECT 1 FROM algorithm_library_folders WHERE workspace_id = ? AND parent_id = ?) AS hasFolders,
        EXISTS(SELECT 1 FROM algorithm_library_items WHERE workspace_id = ? AND folder_id = ?) AS hasProblems
    `,
    )
    .get(scope.workspaceId, folder.id, scope.workspaceId, folder.id) as {
    hasFolders: number;
    hasProblems: number;
  };
  if ((content.hasFolders || content.hasProblems) && !options.promoteContents) {
    throw new Error("文件夹包含题目或子文件夹，请先移动其中内容");
  }
  db.transaction(() => {
    if (options.promoteContents) promoteFolderContents(db, scope, folder);
    db.prepare("DELETE FROM algorithm_library_folders WHERE workspace_id = ? AND id = ?").run(
      scope.workspaceId,
      folder.id,
    );
    normalizeFolderOrder(db, scope, folder.parentId);
    normalizeProblemOrder(db, scope, folder.parentId);
  })();
}

/**
 * 沿目录段逐级查找或创建（大小写不敏感），返回最末层文件夹。
 * 供导入链路把题目自动放进「课程/阶段」层级，保证网盘、
 * 算法训练与 VS Code 插件看到同一棵树。
 */
export function ensureAlgorithmLibraryFolderPath(
  db: Database.Database,
  scope: WorkspaceScope,
  segments: readonly string[],
): AlgorithmLibraryFolder | null {
  let parentId: string | null = null;
  let folder: AlgorithmLibraryFolder | null = null;
  for (const rawName of segments) {
    const name = rawName.trim();
    if (!name) continue;
    const existing = db
      .prepare(
        `
        SELECT id, parent_id AS parentId, name, sort_order AS sortOrder
        FROM algorithm_library_folders
        WHERE workspace_id = ? AND parent_id IS ? AND name = ? COLLATE NOCASE
      `,
      )
      .get(scope.workspaceId, parentId, name) as AlgorithmLibraryFolder | undefined;
    folder = existing ?? createAlgorithmLibraryFolder(db, scope, { name, parentId });
    parentId = folder.id;
  }
  return folder;
}

export function moveAlgorithmLibraryProblem(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    problemId: number;
    targetFolderId?: string | null;
    afterProblemId?: number | null;
    placeFirst?: boolean;
  },
): AlgorithmLibraryItem {
  requirePluginEnabled(db, scope, "algorithms");
  ensureAlgorithmLibraryItems(db, scope);
  const problemId = normalizeProblemId(input.problemId);
  const targetFolderId = normalizeFolderId(input.targetFolderId);
  assertFolderExists(db, scope, targetFolderId);
  const current = getLibraryItem(db, scope, problemId);
  const siblings = db
    .prepare(
      `
      SELECT problem_id AS problemId
      FROM algorithm_library_items
      WHERE workspace_id = ? AND folder_id IS ? AND problem_id != ?
      ORDER BY sort_order, library_number
    `,
    )
    .all(scope.workspaceId, targetFolderId, problemId) as Array<{ problemId: number }>;
  let insertionIndex = input.placeFirst ? 0 : siblings.length;
  if (!input.placeFirst && input.afterProblemId !== undefined && input.afterProblemId !== null) {
    const afterProblemId = normalizeProblemId(input.afterProblemId);
    const targetIndex = siblings.findIndex((item) => item.problemId === afterProblemId);
    if (targetIndex < 0) throw new Error("目标题目与目标文件夹不一致");
    insertionIndex = targetIndex + 1;
  }
  const ordered = siblings.map((item) => item.problemId);
  ordered.splice(insertionIndex, 0, problemId);
  db.transaction(() => {
    db.prepare(
      `
      UPDATE algorithm_library_items
      SET folder_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND problem_id = ?
    `,
    ).run(targetFolderId, scope.workspaceId, problemId);
    const update = db.prepare(
      `
      UPDATE algorithm_library_items
      SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND problem_id = ?
    `,
    );
    ordered.forEach((id, index) => update.run(index + 1, scope.workspaceId, id));
    if (current.folderId !== targetFolderId) normalizeProblemOrder(db, scope, current.folderId);
  })();
  return getLibraryItem(db, scope, problemId);
}

export function moveAlgorithmLibraryEntries(
  db: Database.Database,
  scope: WorkspaceScope,
  entries: AlgorithmLibraryMove[],
): void {
  requirePluginEnabled(db, scope, "algorithms");
  if (!entries.length || entries.length > 200) throw new Error("题目库批量移动数量无效");
  db.transaction(() => {
    for (const entry of entries) {
      if (entry.kind === "problem") {
        moveAlgorithmLibraryProblem(db, scope, {
          problemId: entry.id,
          targetFolderId: entry.targetFolderId,
          afterProblemId: entry.afterProblemId,
          placeFirst: entry.placeFirst,
        });
      } else if (entry.direction) {
        reorderAlgorithmLibraryFolder(db, scope, { folderId: entry.id, direction: entry.direction });
      } else {
        moveAlgorithmLibraryFolder(db, scope, {
          folderId: entry.id,
          targetParentId: entry.targetFolderId,
          afterFolderId: entry.afterFolderId,
          placeFirst: entry.placeFirst,
        });
      }
    }
  })();
}

export function moveAlgorithmLibraryFolder(
  db: Database.Database,
  scope: WorkspaceScope,
  input: {
    folderId: string;
    targetParentId?: string | null;
    afterFolderId?: string | null;
    placeFirst?: boolean;
  },
): AlgorithmLibraryFolder {
  requirePluginEnabled(db, scope, "algorithms");
  const folder = getFolder(db, scope, input.folderId);
  const targetParentId = normalizeFolderId(input.targetParentId);
  assertFolderExists(db, scope, targetParentId);
  assertFolderMoveHasNoCycle(db, scope, folder.id, targetParentId);
  assertFolderNameAvailable(db, scope, targetParentId, folder.name, folder.id);
  const siblings = db
    .prepare(
      `
      SELECT id FROM algorithm_library_folders
      WHERE workspace_id = ? AND parent_id IS ? AND id != ?
      ORDER BY sort_order, name COLLATE NOCASE, id
    `,
    )
    .all(scope.workspaceId, targetParentId, folder.id) as Array<{ id: string }>;
  let insertionIndex = input.placeFirst ? 0 : siblings.length;
  if (!input.placeFirst && input.afterFolderId) {
    const afterFolderId = normalizeFolderId(input.afterFolderId);
    const targetIndex = siblings.findIndex((item) => item.id === afterFolderId);
    if (targetIndex < 0) throw new Error("目标文件夹与目标位置不一致");
    insertionIndex = targetIndex + 1;
  }
  siblings.splice(insertionIndex, 0, { id: folder.id });
  const update = db.prepare(
    `
    UPDATE algorithm_library_folders
    SET parent_id = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND id = ?
  `,
  );
  db.transaction(() => {
    siblings.forEach((item, index) => update.run(targetParentId, index + 1, scope.workspaceId, item.id));
    if (folder.parentId !== targetParentId) normalizeFolderOrder(db, scope, folder.parentId);
  })();
  return getFolder(db, scope, folder.id);
}

export function reorderAlgorithmLibraryFolder(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { folderId: string; direction: "up" | "down" | "first" },
): AlgorithmLibraryFolder {
  requirePluginEnabled(db, scope, "algorithms");
  const folder = getFolder(db, scope, input.folderId);
  const siblings = db
    .prepare(
      `
      SELECT id FROM algorithm_library_folders
      WHERE workspace_id = ? AND parent_id IS ?
      ORDER BY sort_order, name COLLATE NOCASE, id
    `,
    )
    .all(scope.workspaceId, folder.parentId) as Array<{ id: string }>;
  const currentIndex = siblings.findIndex((item) => item.id === folder.id);
  const targetIndex =
    input.direction === "first"
      ? 0
      : input.direction === "up"
        ? Math.max(0, currentIndex - 1)
        : Math.min(siblings.length - 1, currentIndex + 1);
  const [moved] = siblings.splice(currentIndex, 1);
  siblings.splice(targetIndex, 0, moved);
  const update = db.prepare(
    "UPDATE algorithm_library_folders SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id = ?",
  );
  db.transaction(() => {
    siblings.forEach((item, index) => update.run(index + 1, scope.workspaceId, item.id));
  })();
  return getFolder(db, scope, folder.id);
}

function promoteFolderContents(db: Database.Database, scope: WorkspaceScope, folder: AlgorithmLibraryFolder): void {
  const children = db
    .prepare(
      `
      SELECT id, parent_id AS parentId, name, sort_order AS sortOrder
      FROM algorithm_library_folders
      WHERE workspace_id = ? AND parent_id = ?
      ORDER BY sort_order, name COLLATE NOCASE, id
    `,
    )
    .all(scope.workspaceId, folder.id) as AlgorithmLibraryFolder[];
  children.forEach((child) => assertFolderNameAvailable(db, scope, folder.parentId, child.name, child.id));
  let folderOrder = nextFolderSortOrder(db, scope, folder.parentId, folder.id);
  const moveFolder = db.prepare(
    `
    UPDATE algorithm_library_folders
    SET parent_id = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND id = ?
  `,
  );
  children.forEach((child) => moveFolder.run(folder.parentId, folderOrder++, scope.workspaceId, child.id));

  const items = db
    .prepare(
      `
      SELECT problem_id AS problemId FROM algorithm_library_items
      WHERE workspace_id = ? AND folder_id = ?
      ORDER BY sort_order, library_number
    `,
    )
    .all(scope.workspaceId, folder.id) as Array<{ problemId: number }>;
  const currentMaximum = db
    .prepare(
      `
      SELECT COALESCE(MAX(sort_order), 0) AS value FROM algorithm_library_items
      WHERE workspace_id = ? AND folder_id IS ?
    `,
    )
    .get(scope.workspaceId, folder.parentId) as { value: number };
  const moveProblem = db.prepare(
    `
    UPDATE algorithm_library_items
    SET folder_id = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND problem_id = ?
  `,
  );
  items.forEach((item, index) =>
    moveProblem.run(folder.parentId, currentMaximum.value + index + 1, scope.workspaceId, item.problemId),
  );
}

function ensureAlgorithmLibraryItems(db: Database.Database, scope: WorkspaceScope): void {
  const missing = db
    .prepare(
      `
      SELECT p.id
      FROM algorithm_problems p
      LEFT JOIN algorithm_library_items i
        ON i.workspace_id = p.workspace_id AND i.problem_id = p.id
      WHERE p.workspace_id = ? AND i.problem_id IS NULL
      ORDER BY p.id
    `,
    )
    .all(scope.workspaceId) as Array<{ id: number }>;
  if (!missing.length) return;
  db.transaction(() => {
    const maximum = db
      .prepare(
        `
        SELECT COALESCE(MAX(library_number), 0) AS libraryNumber,
               COALESCE(MAX(CASE WHEN folder_id IS NULL THEN sort_order END), 0) AS sortOrder
        FROM algorithm_library_items WHERE workspace_id = ?
      `,
      )
      .get(scope.workspaceId) as { libraryNumber: number; sortOrder: number };
    const insert = db.prepare(
      `
      INSERT OR IGNORE INTO algorithm_library_items
        (workspace_id, problem_id, folder_id, sort_order, library_number)
      VALUES (?, ?, NULL, ?, ?)
    `,
    );
    missing.forEach((problem, index) => {
      insert.run(scope.workspaceId, problem.id, maximum.sortOrder + index + 1, maximum.libraryNumber + index + 1);
    });
  })();
}

function getFolder(db: Database.Database, scope: WorkspaceScope, folderId: string): AlgorithmLibraryFolder {
  const row = db
    .prepare(
      `
      SELECT id, parent_id AS parentId, name, sort_order AS sortOrder
      FROM algorithm_library_folders WHERE workspace_id = ? AND id = ?
    `,
    )
    .get(scope.workspaceId, folderId) as AlgorithmLibraryFolder | undefined;
  if (!row) throw new Error("题目文件夹不存在");
  return row;
}

function getLibraryItem(db: Database.Database, scope: WorkspaceScope, problemId: number): AlgorithmLibraryItem {
  const row = db
    .prepare(
      `
      SELECT problem_id AS problemId, folder_id AS folderId,
             sort_order AS sortOrder, library_number AS libraryNumber
      FROM algorithm_library_items WHERE workspace_id = ? AND problem_id = ?
    `,
    )
    .get(scope.workspaceId, problemId) as AlgorithmLibraryItem | undefined;
  if (!row) throw new Error("算法题不存在");
  return row;
}

function assertFolderExists(db: Database.Database, scope: WorkspaceScope, folderId: string | null): void {
  if (folderId === null) return;
  getFolder(db, scope, folderId);
}

function assertFolderNameAvailable(
  db: Database.Database,
  scope: WorkspaceScope,
  parentId: string | null,
  name: string,
  excludedId = "",
): void {
  const existing = db
    .prepare(
      `
      SELECT 1 FROM algorithm_library_folders
      WHERE workspace_id = ? AND parent_id IS ? AND name = ? COLLATE NOCASE AND id != ?
    `,
    )
    .get(scope.workspaceId, parentId, name, excludedId);
  if (existing) throw new Error("同级文件夹中已经存在这个名称");
}

function assertFolderMoveHasNoCycle(
  db: Database.Database,
  scope: WorkspaceScope,
  folderId: string,
  targetParentId: string | null,
): void {
  let cursor = targetParentId;
  while (cursor) {
    if (cursor === folderId) throw new Error("文件夹不能移动到自身或其子文件夹中");
    const row = db
      .prepare("SELECT parent_id AS parentId FROM algorithm_library_folders WHERE workspace_id = ? AND id = ?")
      .get(scope.workspaceId, cursor) as { parentId: string | null } | undefined;
    cursor = row?.parentId ?? null;
  }
}

function nextFolderSortOrder(
  db: Database.Database,
  scope: WorkspaceScope,
  parentId: string | null,
  excludedId = "",
): number {
  const row = db
    .prepare(
      `
      SELECT COALESCE(MAX(sort_order), 0) + 1 AS value
      FROM algorithm_library_folders
      WHERE workspace_id = ? AND parent_id IS ? AND id != ?
    `,
    )
    .get(scope.workspaceId, parentId, excludedId) as { value: number };
  return row.value;
}

function normalizeProblemOrder(db: Database.Database, scope: WorkspaceScope, folderId: string | null): void {
  const rows = db
    .prepare(
      `
      SELECT problem_id AS problemId FROM algorithm_library_items
      WHERE workspace_id = ? AND folder_id IS ?
      ORDER BY sort_order, library_number
    `,
    )
    .all(scope.workspaceId, folderId) as Array<{ problemId: number }>;
  const update = db.prepare(
    "UPDATE algorithm_library_items SET sort_order = ? WHERE workspace_id = ? AND problem_id = ?",
  );
  rows.forEach((row, index) => update.run(index + 1, scope.workspaceId, row.problemId));
}

function normalizeFolderOrder(db: Database.Database, scope: WorkspaceScope, parentId: string | null): void {
  const rows = db
    .prepare(
      `
      SELECT id FROM algorithm_library_folders
      WHERE workspace_id = ? AND parent_id IS ?
      ORDER BY sort_order, name COLLATE NOCASE, id
    `,
    )
    .all(scope.workspaceId, parentId) as Array<{ id: string }>;
  const update = db.prepare("UPDATE algorithm_library_folders SET sort_order = ? WHERE workspace_id = ? AND id = ?");
  rows.forEach((row, index) => update.run(index + 1, scope.workspaceId, row.id));
}

function normalizeFolderName(value: string): string {
  const name = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
  if (!name) throw new Error("文件夹名称必填");
  if (name === "." || name === ".." || /[\\/\u0000-\u001f]/.test(name)) {
    throw new Error("文件夹名称包含无效字符");
  }
  return name;
}

function normalizeFolderId(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  const id = String(value).trim();
  if (!/^[A-Za-z0-9:_-]{8,80}$/.test(id)) throw new Error("题目文件夹编号无效");
  return id;
}

function normalizeProblemId(value: number): number {
  const id = Math.round(Number(value));
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("算法题编号无效");
  return id;
}
