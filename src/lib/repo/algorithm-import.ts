import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import type { AlgorithmImportScan } from "../algorithm-import";
import type { ParsedAlgorithmExercise } from "../algorithm-import-parser";
import { requirePluginEnabled } from "./plugins";

export type AlgorithmCollection = {
  id: string;
  sourceKey: string;
  name: string;
  description: string;
  kind: string;
  problemCount: number;
  openCount: number;
};

export type AlgorithmImportSource = {
  id: string;
  name: string;
  sourceKind: string;
  rootLocator: string;
  itemCount: number;
  status: string;
  warningCount: number;
  lastScannedAt: string | null;
  lastImportedAt: string | null;
};

export type AlgorithmImportResult = {
  sourceId: string;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  warningCount: number;
  collectionCount: number;
};

export function listAlgorithmCollections(db: Database.Database, scope: WorkspaceScope): AlgorithmCollection[] {
  requirePluginEnabled(db, scope, "algorithms");
  return db
    .prepare(
      `
    SELECT c.id, c.source_key AS sourceKey, c.name, c.description,
           c.collection_kind AS kind,
           COUNT(i.problem_id) AS problemCount,
           COALESCE(SUM(CASE WHEN p.evidence_status IN ('unseen', 'attempted', 'guided_completed') THEN 1 ELSE 0 END), 0) AS openCount
    FROM algorithm_collections c
    LEFT JOIN algorithm_collection_items i
      ON i.workspace_id = c.workspace_id AND i.collection_id = c.id
    LEFT JOIN algorithm_problems p
      ON p.workspace_id = i.workspace_id AND p.id = i.problem_id
    WHERE c.workspace_id = ?
    GROUP BY c.workspace_id, c.id
    ORDER BY c.sort_order, c.name
  `,
    )
    .all(scope.workspaceId) as AlgorithmCollection[];
}

export function listAlgorithmImportSources(db: Database.Database, scope: WorkspaceScope): AlgorithmImportSource[] {
  requirePluginEnabled(db, scope, "algorithms");
  const rows = db
    .prepare(
      `
    SELECT id, name, source_kind AS sourceKind, root_locator AS rootLocator,
           item_count AS itemCount, status, errors_json AS errorsJson,
           last_scanned_at AS lastScannedAt, last_imported_at AS lastImportedAt
    FROM algorithm_import_sources
    WHERE workspace_id = ?
    ORDER BY COALESCE(last_imported_at, last_scanned_at, created_at) DESC, name
  `,
    )
    .all(scope.workspaceId) as Array<{
    id: string;
    name: string;
    sourceKind: string;
    rootLocator: string;
    itemCount: number;
    status: string;
    errorsJson: string;
    lastScannedAt: string | null;
    lastImportedAt: string | null;
  }>;
  return rows.map(({ errorsJson, ...row }) => ({
    ...row,
    warningCount: parseImportWarnings(errorsJson).length,
  }));
}

export function importAlgorithmScan(
  db: Database.Database,
  scope: WorkspaceScope,
  scan: AlgorithmImportScan,
): AlgorithmImportResult {
  requirePluginEnabled(db, scope, "algorithms");
  const sourceId = stableId("algorithm-source", `${scope.workspaceId}:${scan.rootPath}`);
  const existingItems = new Map(
    (
      db
        .prepare(
          `
      SELECT source_path, content_sha256
      FROM algorithm_import_items
      WHERE workspace_id = ? AND source_id = ?
    `,
        )
        .all(scope.workspaceId, sourceId) as Array<{ source_path: string; content_sha256: string }>
    ).map((row) => [row.source_path, row.content_sha256]),
  );
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const collectionIds = new Set<string>();

  db.transaction(() => {
    db.prepare(
      `
      INSERT INTO algorithm_import_sources
        (workspace_id, id, name, source_kind, root_locator, content_sha256,
         item_count, status, errors_json, last_scanned_at, last_imported_at)
      VALUES (?, ?, ?, 'local_folder', ?, ?, ?, 'ready', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id, id) DO UPDATE SET
        name = excluded.name,
        root_locator = excluded.root_locator,
        content_sha256 = excluded.content_sha256,
        item_count = excluded.item_count,
        status = excluded.status,
        errors_json = excluded.errors_json,
        last_scanned_at = CURRENT_TIMESTAMP,
        last_imported_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `,
    ).run(
      scope.workspaceId,
      sourceId,
      scan.rootName,
      scan.rootPath,
      scan.contentSha256,
      scan.exercises.length,
      JSON.stringify(
        scan.exercises.flatMap((item) =>
          item.warnings.map((warning) => ({
            path: item.sourcePath,
            warning,
          })),
        ),
      ),
    );

    scan.exercises.forEach((exercise, index) => {
      const priorHash = existingItems.get(exercise.sourcePath);
      if (priorHash === exercise.contentSha256) unchanged += 1;
      else if (priorHash) updated += 1;
      else created += 1;
      const problemId = upsertImportedProblem(db, scope, sourceId, exercise, scan.templateSourceCode);
      upsertImportItem(db, scope, sourceId, problemId, exercise);
      const collectionKeys = [
        { key: `phase:${exercise.phase}`, name: exercise.phase, kind: "phase" },
        ...exercise.origins.map((origin) => ({ key: `origin:${origin}`, name: originLabel(origin), kind: "source" })),
        ...pathCollections(exercise.sourcePath),
      ];
      for (const collection of collectionKeys) {
        const collectionId = ensureCollection(db, scope, collection);
        collectionIds.add(collectionId);
        db.prepare(
          `
          INSERT INTO algorithm_collection_items
            (workspace_id, collection_id, problem_id, sort_order)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(workspace_id, collection_id, problem_id) DO UPDATE SET
            sort_order = excluded.sort_order
        `,
        ).run(scope.workspaceId, collectionId, problemId, index + 1);
      }
    });
  })();

  return {
    sourceId,
    total: scan.exercises.length,
    created,
    updated,
    unchanged,
    warningCount: scan.warningCount,
    collectionCount: collectionIds.size,
  };
}

function upsertImportedProblem(
  db: Database.Database,
  scope: WorkspaceScope,
  sourceId: string,
  exercise: ParsedAlgorithmExercise,
  templateSourceCode: string,
): number {
  const sourceUrl = /^https?:\/\//i.test(exercise.sourceUrl)
    ? exercise.sourceUrl
    : `ascend://import/${encodeURIComponent(sourceId)}/${exercise.sourcePath.split("/").map(encodeURIComponent).join("/")}`;
  const metadataJson = JSON.stringify({
    starterCode: { cpp17: templateSourceCode },
    referenceCode: { cpp17: exercise.sourceCode },
    import: {
      sourceId,
      sourcePath: exercise.sourcePath,
      origins: exercise.origins,
      statementConfidence: exercise.statementConfidence,
      verified: exercise.verified,
      fetched: exercise.fetched,
    },
  });
  db.prepare(
    `
    INSERT INTO algorithm_problems
      (workspace_id, provider_id, external_problem_id, source_url, title,
       difficulty_band, tags_json, notes, problem_mode, statement_markdown,
       input_specification, output_specification, examples_json, judge_problem_ref,
       time_limit_ms, memory_limit_kb, supported_languages_json, hint_ladder_json,
       license_metadata_json, metadata_json, content_mode, evaluation_mode,
       material_status, priority_band, phase_key)
    VALUES
      (?, ?, ?, ?, ?, '', ?, '', 'imported', ?, ?, ?, ?, '',
       2000, 262144, '["cpp17"]', '[]', ?, ?, 'imported_private', 'manual', ?, ?, ?)
    ON CONFLICT(workspace_id, provider_id, external_problem_id) DO UPDATE SET
      source_url = excluded.source_url,
      title = excluded.title,
      tags_json = excluded.tags_json,
      problem_mode = 'imported',
      statement_markdown = excluded.statement_markdown,
      input_specification = excluded.input_specification,
      output_specification = excluded.output_specification,
      examples_json = excluded.examples_json,
      supported_languages_json = excluded.supported_languages_json,
      license_metadata_json = excluded.license_metadata_json,
      metadata_json = excluded.metadata_json,
      content_mode = excluded.content_mode,
      evaluation_mode = excluded.evaluation_mode,
      material_status = excluded.material_status,
      priority_band = excluded.priority_band,
      phase_key = excluded.phase_key,
      updated_at = CURRENT_TIMESTAMP
  `,
  ).run(
    scope.workspaceId,
    exercise.providerId,
    exercise.externalProblemId,
    sourceUrl,
    exercise.title.slice(0, 160),
    JSON.stringify(exercise.topics),
    exercise.statementMarkdown,
    exercise.inputSpecification,
    exercise.outputSpecification,
    JSON.stringify(exercise.examples),
    JSON.stringify({
      access: "private_workspace",
      source: exercise.sourceUrl,
      redistribution: false,
    }),
    metadataJson,
    exercise.materialStatus,
    exercise.priority,
    exercise.phase,
  );
  const row = db
    .prepare(
      `
    SELECT id FROM algorithm_problems
    WHERE workspace_id = ? AND provider_id = ? AND external_problem_id = ?
  `,
    )
    .get(scope.workspaceId, exercise.providerId, exercise.externalProblemId) as { id: number };
  for (const topic of exercise.topics) {
    db.prepare(
      `
      INSERT OR IGNORE INTO algorithm_problem_skills
        (workspace_id, problem_id, skill_key, role, confidence)
      VALUES (?, ?, ?, 'primary', 1)
    `,
    ).run(scope.workspaceId, row.id, topic);
  }
  return row.id;
}

function upsertImportItem(
  db: Database.Database,
  scope: WorkspaceScope,
  sourceId: string,
  problemId: number,
  exercise: ParsedAlgorithmExercise,
): void {
  db.prepare(
    `
    INSERT INTO algorithm_import_items
      (workspace_id, source_id, source_path, problem_id, content_sha256,
       import_status, metadata_json)
    VALUES (?, ?, ?, ?, ?, 'imported', ?)
    ON CONFLICT(workspace_id, source_id, source_path) DO UPDATE SET
      problem_id = excluded.problem_id,
      content_sha256 = excluded.content_sha256,
      import_status = excluded.import_status,
      metadata_json = excluded.metadata_json,
      imported_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `,
  ).run(
    scope.workspaceId,
    sourceId,
    exercise.sourcePath,
    problemId,
    exercise.contentSha256,
    JSON.stringify({ warnings: exercise.warnings }),
  );
}

function ensureCollection(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { key: string; name: string; kind: string },
): string {
  const sourceKey = `import:${input.key}`;
  const id = stableId("algorithm-collection", `${scope.workspaceId}:${sourceKey}`);
  const sortOrder = input.kind === "phase" ? phaseSortOrder(input.name) : 100;
  db.prepare(
    `
    INSERT INTO algorithm_collections
      (workspace_id, id, source_key, name, description, collection_kind, sort_order)
    VALUES (?, ?, ?, ?, '', ?, ?)
    ON CONFLICT(workspace_id, source_key) DO UPDATE SET
      name = excluded.name,
      collection_kind = excluded.collection_kind,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `,
  ).run(scope.workspaceId, id, sourceKey, input.name, input.kind, sortOrder);
  const row = db
    .prepare(
      `
    SELECT id FROM algorithm_collections WHERE workspace_id = ? AND source_key = ?
  `,
    )
    .get(scope.workspaceId, sourceKey) as { id: string };
  return row.id;
}

function stableId(prefix: string, input: string): string {
  return `${prefix}:${createHash("sha256").update(input).digest("hex").slice(0, 24)}`;
}

function parseImportWarnings(value: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function phaseSortOrder(phase: string): number {
  const match = phase.match(/^W(\d+)/i);
  return match ? Number(match[1]) : 90;
}

function originLabel(origin: string): string {
  const labels: Record<string, string> = {
    "fixed-list": "固定题单",
    "fixed-list-optional": "固定题单·选做",
    "fixed-list-corrected": "固定题单·校正版",
    "guowei-assignment": "郭炜课程作业",
    "guowei-example": "郭炜课程例题",
    "personal-practice-variant": "个人变式",
  };
  return labels[origin] || origin;
}

function pathCollections(sourcePath: string): Array<{ key: string; name: string; kind: string }> {
  const official = sourcePath.match(/^exercises\/official\/([^/]+)\//);
  if (official) {
    const labels: Record<string, string> = {
      "2025-spring": "中关村学院 2025 春季机试",
      "2025-summer": "中关村学院 2025 夏季机试",
      "2025-autumn": "中关村学院 2025 秋季机试",
      "2026-winter": "中关村学院 2026 冬令营机试",
    };
    return [{ key: `official:${official[1]}`, name: labels[official[1]] || official[1], kind: "exam" }];
  }
  if (sourcePath.startsWith("exercises/practice/")) {
    return [{ key: "source:personal-practice", name: "个人练习", kind: "source" }];
  }
  return [];
}

// Kept for future upload imports where a random source identifier is preferable.
export function createAlgorithmImportSourceId(): string {
  return `algorithm-source:${randomUUID()}`;
}
