import Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

loadLocalEnv();

const dataRoot = path.resolve(process.env.ZGCA_DATA_ROOT || "data");
const uploadRoot = path.resolve(process.env.ZGCA_UPLOAD_ROOT || path.join(dataRoot, "uploads"));
const databasePath = path.join(dataRoot, "workbench.sqlite");
if (!existsSync(databasePath)) throw new Error(`Database not found: ${databasePath}`);

const db = new Database(databasePath, { readonly: true, fileMustExist: true });
const issues = [];
const counts = {};

try {
  const workspaces = new Set(db.prepare("SELECT id FROM workspaces").all().map((row) => row.id));
  const scopedTables = [
    "subjects", "subject_chapters", "knowledge_points", "knowledge_tags", "daily_entries",
    "assets", "folders", "app_settings", "drafts", "tags", "devices", "entity_changes",
    "conflicts", "blobs", "upload_sessions", "asset_tags", "asset_knowledge_tags",
    "asset_links", "study_sessions", "review_events", "mistakes", "day_tasks", "day_notes",
    "task_lists", "planner_tasks", "planner_calendars", "calendar_events", "planner_labels",
    "planner_task_labels", "planner_event_labels",
    "task_series", "planner_reminders", "planner_notifications", "push_subscriptions",
    "learning_task_links", "learning_evidence",
  ];

  for (const table of ["learning_task_links", "learning_evidence"]) {
    if (!tableExists(table)) issues.push({ type: "missing_table", table });
  }
  for (const version of [
    "0031_legacy_learning_backfill",
    "0032_canonical_completion_evidence_backfill",
  ]) {
    const migration = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(version);
    if (!migration) issues.push({ type: "missing_migration", version });
  }

  for (const table of scopedTables) {
    if (!tableExists(table) || !columnExists(table, "workspace_id")) continue;
    const total = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
    const invalid = db.prepare(`
      SELECT COUNT(*) AS count FROM ${table} row
      LEFT JOIN workspaces w ON w.id = row.workspace_id
      WHERE row.workspace_id IS NULL OR w.id IS NULL
    `).get().count;
    counts[table] = { total, invalidWorkspaceRows: invalid };
    if (invalid) issues.push({ type: "invalid_workspace", table, count: invalid });
  }

  const ordinaryUsers = db.prepare(`
    SELECT u.id, u.email, u.status, COUNT(w.id) AS workspace_count
    FROM users u LEFT JOIN workspaces w ON w.owner_user_id = u.id
    WHERE u.role = 'user'
    GROUP BY u.id
  `).all();
  for (const user of ordinaryUsers) {
    const expected = user.status === "invited" ? [0, 1] : [1];
    if (!expected.includes(user.workspace_count)) {
      issues.push({ type: "ordinary_user_workspace_count", userId: user.id, status: user.status, count: user.workspace_count });
    }
  }

  const adminOwned = db.prepare(`
    SELECT u.id, u.email, COUNT(w.id) AS workspace_count
    FROM users u LEFT JOIN workspaces w ON w.owner_user_id = u.id
    WHERE u.role = 'admin'
    GROUP BY u.id HAVING COUNT(w.id) > 0
  `).all();
  for (const admin of adminOwned) issues.push({ type: "admin_owns_workspace", userId: admin.id, count: admin.workspace_count });

  runRelationCheck("chapter_subject", `
    SELECT COUNT(*) AS count FROM subject_chapters c
    LEFT JOIN subjects s ON s.workspace_id = c.workspace_id AND s.code = c.subject_code
    WHERE s.code IS NULL
  `);
  runRelationCheck("point_subject", `
    SELECT COUNT(*) AS count FROM knowledge_points p
    LEFT JOIN subjects s ON s.workspace_id = p.workspace_id AND s.code = p.subject_code
    WHERE s.code IS NULL
  `);
  runRelationCheck("asset_link_asset", `
    SELECT COUNT(*) AS count FROM asset_links l
    LEFT JOIN assets a ON a.workspace_id = l.workspace_id AND a.id = l.asset_id
    WHERE a.id IS NULL
  `);
  runRelationCheck("asset_link_point", `
    SELECT COUNT(*) AS count FROM asset_links l
    LEFT JOIN knowledge_points p ON p.workspace_id = l.workspace_id AND p.id = l.knowledge_point_id
    WHERE l.knowledge_point_id IS NOT NULL AND p.id IS NULL
  `);
  runRelationCheck("planner_task_list", `
    SELECT COUNT(*) AS count FROM planner_tasks t
    LEFT JOIN task_lists l ON l.workspace_id = t.workspace_id AND l.id = t.list_id
    WHERE l.id IS NULL
  `);
  runRelationCheck("planner_event_calendar", `
    SELECT COUNT(*) AS count FROM calendar_events e
    LEFT JOIN planner_calendars c ON c.workspace_id = e.workspace_id AND c.id = e.calendar_id
    WHERE c.id IS NULL
  `);
  if (tableExists("learning_task_links") && tableExists("learning_evidence")) {
    runRelationCheck("learning_link_task", `
      SELECT COUNT(*) AS count FROM learning_task_links l
      LEFT JOIN planner_tasks t ON t.workspace_id = l.workspace_id AND t.id = l.task_id
      WHERE t.id IS NULL
    `);
    runRelationCheck("learning_link_point", `
      SELECT COUNT(*) AS count FROM learning_task_links l
      LEFT JOIN knowledge_points p
        ON p.workspace_id = l.workspace_id AND p.id = l.knowledge_point_id
      WHERE l.knowledge_point_id IS NOT NULL AND p.id IS NULL
    `);
    runRelationCheck("learning_evidence_task", `
      SELECT COUNT(*) AS count FROM learning_evidence e
      LEFT JOIN planner_tasks t ON t.workspace_id = e.workspace_id AND t.id = e.task_id
      WHERE e.task_id IS NOT NULL AND t.id IS NULL
    `);
    runRelationCheck("learning_evidence_point", `
      SELECT COUNT(*) AS count FROM learning_evidence e
      LEFT JOIN knowledge_points p
        ON p.workspace_id = e.workspace_id AND p.id = e.knowledge_point_id
      WHERE e.knowledge_point_id IS NOT NULL AND p.id IS NULL
    `);
    runReferenceCheck("legacy_task_missing_planner_mirror", `
      SELECT d.workspace_id || '/day_task/' || d.id AS ref
      FROM day_tasks d
      LEFT JOIN planner_tasks t
        ON t.workspace_id = d.workspace_id AND t.legacy_day_task_id = d.id
      WHERE t.id IS NULL
      ORDER BY d.workspace_id, d.id
    `);
    runReferenceCheck("legacy_learning_metadata_missing_link", `
      SELECT d.workspace_id || '/day_task/' || d.id AS ref
      FROM day_tasks d
      JOIN planner_tasks t
        ON t.workspace_id = d.workspace_id AND t.legacy_day_task_id = d.id
      LEFT JOIN learning_task_links l
        ON l.workspace_id = d.workspace_id AND l.task_id = t.id
      WHERE l.task_id IS NULL
        AND (
          d.knowledge_point_id IS NOT NULL
          OR d.activity_type != 'unspecified'
          OR TRIM(d.completion_criteria) != ''
          OR TRIM(d.planned_verification_method) != ''
          OR TRIM(d.source_type) != ''
        )
      ORDER BY d.workspace_id, d.id
    `);
    runReferenceCheck("legacy_task_completion_missing_evidence", `
      SELECT d.workspace_id || '/day_task/' || d.id AS ref
      FROM day_tasks d
      JOIN planner_tasks t
        ON t.workspace_id = d.workspace_id AND t.legacy_day_task_id = d.id
      LEFT JOIN study_sessions s
        ON s.workspace_id = d.workspace_id AND s.task_id = d.id
      WHERE (d.done = 1 OR s.id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM learning_evidence e
          WHERE e.workspace_id = d.workspace_id AND e.task_id = t.id
        )
      ORDER BY d.workspace_id, d.id
    `);
    runReferenceCheck("canonical_completed_task_missing_evidence", `
      SELECT t.workspace_id || '/planner_task/' || t.id AS ref
      FROM planner_tasks t
      WHERE t.status = 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM learning_evidence e
          WHERE e.workspace_id = t.workspace_id AND e.task_id = t.id
        )
      ORDER BY t.workspace_id, t.id
    `);
    runReferenceCheck("legacy_manual_session_missing_evidence", `
      SELECT s.workspace_id || '/study_session/' || s.id AS ref
      FROM study_sessions s
      WHERE s.task_id IS NULL
        AND s.source_type != 'learning_evidence'
        AND NOT EXISTS (
          SELECT 1 FROM learning_evidence e
          WHERE e.workspace_id = s.workspace_id
            AND (
              e.id = 'legacy-study-session:' || s.id
              OR e.idempotency_key = 'legacy-study-session:' || s.id
              OR (
                TRIM(s.source_type) != ''
                AND e.source_type = TRIM(s.source_type)
                AND e.source_id = TRIM(s.source_id)
              )
            )
        )
      ORDER BY s.workspace_id, s.id
    `);
  }

  let missingFiles = 0;
  let invalidFileNamespaces = 0;
  if (tableExists("assets")) {
    for (const asset of db.prepare("SELECT id, workspace_id, relative_path FROM assets").all()) {
      const expectedPrefix = `${encodeURIComponent(asset.workspace_id)}/`;
      if (!asset.relative_path.startsWith(expectedPrefix)) {
        invalidFileNamespaces += 1;
        issues.push({ type: "asset_namespace", assetId: asset.id, workspaceId: asset.workspace_id });
        continue;
      }
      const absolute = resolveInside(uploadRoot, asset.relative_path);
      if (!absolute || !existsSync(absolute)) {
        missingFiles += 1;
        issues.push({ type: "missing_asset_file", assetId: asset.id, relativePath: asset.relative_path });
      }
    }
  }

  const report = {
    ok: issues.length === 0,
    databasePath,
    workspaceCount: workspaces.size,
    ordinaryUserCount: ordinaryUsers.length,
    adminCount: db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count,
    invalidFileNamespaces,
    missingFiles,
    scopedTableCounts: counts,
    issues,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  db.close();
}

function runRelationCheck(name, sql) {
  const count = db.prepare(sql).get().count;
  counts[name] = count;
  if (count) issues.push({ type: "cross_workspace_relation", relation: name, count });
}

function runReferenceCheck(type, sql) {
  const rows = db.prepare(sql).all();
  counts[type] = rows.length;
  if (rows.length) issues.push({ type, count: rows.length, refs: rows.slice(0, 20).map((row) => row.ref) });
}

function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function columnExists(table, name) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name);
}

function resolveInside(root, relativePath) {
  const absolute = path.resolve(root, relativePath);
  return absolute.startsWith(`${root}${path.sep}`) ? absolute : null;
}

function loadLocalEnv() {
  const envPath = path.resolve(".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match || process.env[match[1].trim()]) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}
