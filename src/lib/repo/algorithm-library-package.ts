import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import type { WorkspaceScope } from "../access-context";
import { ensureAlgorithmCurriculumProblem } from "./algorithm-curriculum";
import { ensureAlgorithmLibraryItems, listAlgorithmLibrary } from "./algorithm-library";
import { requirePluginEnabled } from "./plugins";

export const ALGORITHM_LIBRARY_PACKAGE_SCHEMA = "ascend.algorithm-library";
export const ALGORITHM_LIBRARY_PACKAGE_VERSION = 1;
export const ALGORITHM_LIBRARY_PACKAGE_MAX_BYTES = 20 * 1024 * 1024;
export const ALGORITHM_LIBRARY_PACKAGE_MAX_PROBLEMS = 1_000;

const languageSchema = z.enum(["cpp17", "python3"]);
const codeSchema = z
  .object({
    cpp17: z
      .string()
      .max(512 * 1024)
      .optional(),
    python3: z
      .string()
      .max(512 * 1024)
      .optional(),
  })
  .strict();
const exampleSchema = z
  .object({
    input: z.string().max(10_000),
    output: z.string().max(10_000),
    explanation: z.string().max(2_000).optional(),
  })
  .strict();
const courseSchema = z
  .object({
    key: z.string().trim().min(1).max(160),
    name: z.string().trim().min(1).max(80),
    stage: z.string().trim().max(40),
    sortOrder: z.number().int().min(0).max(1_000_000),
  })
  .strict();
const collectionSchema = z
  .object({
    key: z.string().trim().min(1).max(160),
    name: z.string().trim().min(1).max(80),
    kind: z.string().trim().min(1).max(40),
    sortOrder: z.number().int().min(0).max(1_000_000),
  })
  .strict();
const curriculumSchema = z
  .object({
    curriculumKey: z.string().trim().min(1).max(120),
    chapterKey: z.string().trim().min(1).max(120),
    membershipKind: z.enum(["primary", "supplementary"]),
    sortOrder: z.number().int().min(0).max(1_000_000),
  })
  .strict();
const packageProblemSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9:_-]{3,120}$/),
    sourceLibraryNumber: z.number().int().positive().max(1_000_000),
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
    identity: z
      .object({
        providerId: z.string().trim().min(1).max(40),
        externalProblemId: z.string().trim().min(1).max(120),
        sourceUrl: z.string().trim().min(1).max(2_000),
      })
      .strict(),
    content: z
      .object({
        title: z.string().trim().min(1).max(160),
        difficultyBand: z.enum(["", "foundation", "standard", "challenge"]),
        tags: z.array(z.string().trim().min(1).max(40)).max(32),
        phaseKey: z.string().trim().max(40),
        statementMarkdown: z.string().max(256 * 1024),
        inputSpecification: z.string().max(64 * 1024),
        outputSpecification: z.string().max(64 * 1024),
        examples: z.array(exampleSchema).max(12),
        evaluationMode: z.enum(["manual", "sample"]),
        timeLimitMs: z.number().int().min(100).max(60_000),
        memoryLimitKb: z
          .number()
          .int()
          .min(1_024)
          .max(4 * 1024 * 1024),
        supportedLanguages: z.array(languageSchema).max(2),
        starterCode: codeSchema,
        referenceCode: codeSchema,
        license: z.record(z.string(), z.unknown()),
      })
      .strict(),
    organization: z
      .object({
        folderPath: z.array(z.string().trim().min(1).max(80)).max(12),
        courses: z.array(courseSchema).max(32),
        collections: z.array(collectionSchema).max(64),
        curriculum: z.array(curriculumSchema).max(24),
      })
      .strict(),
  })
  .strict();

export const algorithmLibraryPackageSchema = z
  .object({
    schema: z.literal(ALGORITHM_LIBRARY_PACKAGE_SCHEMA),
    schemaVersion: z.literal(ALGORITHM_LIBRARY_PACKAGE_VERSION),
    package: z
      .object({
        id: z.string().regex(/^[A-Za-z0-9:_-]{8,80}$/),
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(500),
        exportedAt: z.string().datetime(),
        problemCount: z.number().int().min(1).max(ALGORITHM_LIBRARY_PACKAGE_MAX_PROBLEMS),
      })
      .strict(),
    problems: z.array(packageProblemSchema).min(1).max(ALGORITHM_LIBRARY_PACKAGE_MAX_PROBLEMS),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.package.problemCount !== value.problems.length) {
      context.addIssue({ code: "custom", message: "题库包题目数量与清单不一致", path: ["package", "problemCount"] });
    }
    const ids = new Set<string>();
    const identities = new Set<string>();
    for (const [index, problem] of value.problems.entries()) {
      if (ids.has(problem.id)) {
        context.addIssue({ code: "custom", message: "题库包包含重复题目编号", path: ["problems", index, "id"] });
      }
      ids.add(problem.id);
      const identity = `${problem.identity.providerId}\0${problem.identity.externalProblemId}`;
      if (identities.has(identity)) {
        context.addIssue({ code: "custom", message: "题库包包含重复平台题号", path: ["problems", index, "identity"] });
      }
      identities.add(identity);
      if (problem.contentSha256 !== hashContent(problem.content)) {
        context.addIssue({ code: "custom", message: "题目内容校验失败", path: ["problems", index, "contentSha256"] });
      }
    }
  });

export type AlgorithmLibraryPackage = z.infer<typeof algorithmLibraryPackageSchema>;

export type AlgorithmLibraryPackagePreview = {
  packageId: string;
  name: string;
  description: string;
  total: number;
  created: number;
  updated: number;
  reused: number;
  unchanged: number;
  numberCollisions: number;
  warningCount: number;
  warnings: string[];
};

export type AlgorithmLibraryPackageImportResult = AlgorithmLibraryPackagePreview & {
  rootFolderId: string | null;
  collectionId: string;
};

type ExportProblemRow = {
  id: number;
  providerId: string;
  externalProblemId: string;
  sourceUrl: string;
  title: string;
  difficultyBand: string;
  tagsJson: string;
  phaseKey: string;
  statementMarkdown: string;
  inputSpecification: string;
  outputSpecification: string;
  examplesJson: string;
  evaluationMode: string;
  timeLimitMs: number;
  memoryLimitKb: number;
  supportedLanguagesJson: string;
  licenseJson: string;
  metadataJson: string;
  folderId: string | null;
  libraryNumber: number;
};

type ImportMatch = {
  problemId: number;
  managedByPackage: boolean;
  priorHash: string;
};

export class AlgorithmLibraryPackageError extends Error {
  readonly status = 400;
}

export function parseAlgorithmLibraryPackage(raw: string): AlgorithmLibraryPackage {
  if (Buffer.byteLength(raw, "utf8") > ALGORITHM_LIBRARY_PACKAGE_MAX_BYTES) {
    throw new AlgorithmLibraryPackageError("题库包不能超过 20 MB");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AlgorithmLibraryPackageError("题库包不是有效的 JSON 文件");
  }
  const result = algorithmLibraryPackageSchema.safeParse(value);
  if (!result.success) {
    throw new AlgorithmLibraryPackageError(result.error.issues[0]?.message || "题库包格式无效");
  }
  return result.data;
}

export function buildAlgorithmLibraryPackage(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { problemIds: number[]; name: string; description?: string; exportedAt?: string },
): AlgorithmLibraryPackage {
  requirePluginEnabled(db, scope, "algorithms");
  const problemIds = normalizeProblemIds(input.problemIds);
  const name = boundedText(input.name, 80, "题库名称");
  const description = String(input.description || "")
    .trim()
    .slice(0, 500);
  listAlgorithmLibrary(db, scope);
  const placeholders = problemIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
    SELECT p.id, p.provider_id AS providerId, p.external_problem_id AS externalProblemId,
           p.source_url AS sourceUrl, COALESCE(o.title, p.title) AS title,
           COALESCE(o.difficulty_band, p.difficulty_band) AS difficultyBand,
           COALESCE(o.tags_json, p.tags_json) AS tagsJson,
           COALESCE(o.phase_key, p.phase_key) AS phaseKey,
           p.statement_markdown AS statementMarkdown,
           p.input_specification AS inputSpecification,
           p.output_specification AS outputSpecification,
           p.examples_json AS examplesJson, p.evaluation_mode AS evaluationMode,
           p.time_limit_ms AS timeLimitMs, p.memory_limit_kb AS memoryLimitKb,
           p.supported_languages_json AS supportedLanguagesJson,
           p.license_metadata_json AS licenseJson, p.metadata_json AS metadataJson,
           l.folder_id AS folderId, l.library_number AS libraryNumber
    FROM algorithm_problems p
    LEFT JOIN algorithm_problem_overrides o
      ON o.workspace_id = p.workspace_id AND o.problem_id = p.id
    JOIN algorithm_library_items l
      ON l.workspace_id = p.workspace_id AND l.problem_id = p.id
    WHERE p.workspace_id = ? AND p.id IN (${placeholders})
    ORDER BY l.library_number
  `,
    )
    .all(scope.workspaceId, ...problemIds) as ExportProblemRow[];
  if (rows.length !== problemIds.length) throw new AlgorithmLibraryPackageError("导出范围包含无效题目");

  const folders = db
    .prepare(
      `
    SELECT id, parent_id AS parentId, name FROM algorithm_library_folders WHERE workspace_id = ?
  `,
    )
    .all(scope.workspaceId) as Array<{ id: string; parentId: string | null; name: string }>;
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const courses = groupRows(
    db
      .prepare(
        `
    SELECT problem_id AS problemId, course_key AS key, course_name AS name,
           stage_key AS stage, sort_order AS sortOrder
    FROM algorithm_course_memberships
    WHERE workspace_id = ? AND problem_id IN (${placeholders}) AND course_key NOT LIKE 'package:%'
    ORDER BY problem_id, sort_order, course_name
  `,
      )
      .all(scope.workspaceId, ...problemIds) as Array<z.infer<typeof courseSchema> & { problemId: number }>,
  );
  const collections = groupRows(
    db
      .prepare(
        `
    SELECT i.problem_id AS problemId, c.source_key AS key, c.name, c.collection_kind AS kind,
           i.sort_order AS sortOrder
    FROM algorithm_collection_items i
    JOIN algorithm_collections c ON c.workspace_id = i.workspace_id AND c.id = i.collection_id
    WHERE i.workspace_id = ? AND i.problem_id IN (${placeholders}) AND c.collection_kind != 'package'
    ORDER BY i.problem_id, i.sort_order, c.name
  `,
      )
      .all(scope.workspaceId, ...problemIds) as Array<z.infer<typeof collectionSchema> & { problemId: number }>,
  );
  const curriculum = groupRows(
    db
      .prepare(
        `
    SELECT problem_id AS problemId, curriculum_key AS curriculumKey, chapter_key AS chapterKey,
           membership_kind AS membershipKind, sort_order AS sortOrder
    FROM algorithm_curriculum_items
    WHERE workspace_id = ? AND problem_id IN (${placeholders})
    ORDER BY problem_id, sort_order, chapter_key
  `,
      )
      .all(scope.workspaceId, ...problemIds) as Array<z.infer<typeof curriculumSchema> & { problemId: number }>,
  );

  const problems = rows.map((row, index) => {
    const metadata = parseRecord(row.metadataJson);
    const content = {
      title: row.title,
      difficultyBand: normalizeDifficulty(row.difficultyBand),
      tags: parseStringArray(row.tagsJson, 32, 40),
      phaseKey: row.phaseKey || "",
      statementMarkdown: row.statementMarkdown,
      inputSpecification: row.inputSpecification,
      outputSpecification: row.outputSpecification,
      examples: parseExamples(row.examplesJson),
      evaluationMode: row.evaluationMode === "sample" ? ("sample" as const) : ("manual" as const),
      timeLimitMs: Math.min(60_000, Math.max(100, row.timeLimitMs)),
      memoryLimitKb: Math.min(4 * 1024 * 1024, Math.max(1_024, row.memoryLimitKb)),
      supportedLanguages: parseLanguages(row.supportedLanguagesJson),
      starterCode: parseCode(metadata.starterCode),
      referenceCode: parseCode(metadata.referenceCode),
      license: parseRecord(row.licenseJson),
    };
    return {
      id: `problem-${index + 1}`,
      sourceLibraryNumber: row.libraryNumber,
      contentSha256: hashContent(content),
      identity: {
        providerId: row.providerId,
        externalProblemId: row.externalProblemId,
        sourceUrl: row.sourceUrl,
      },
      content,
      organization: {
        folderPath: folderPath(folderById, row.folderId),
        courses: courses.get(row.id) ?? [],
        collections: collections.get(row.id) ?? [],
        curriculum: curriculum.get(row.id) ?? [],
      },
    };
  });
  return parseAlgorithmLibraryPackage(
    JSON.stringify({
      schema: ALGORITHM_LIBRARY_PACKAGE_SCHEMA,
      schemaVersion: ALGORITHM_LIBRARY_PACKAGE_VERSION,
      package: {
        id: `pkg_${randomUUID().replaceAll("-", "")}`,
        name,
        description,
        exportedAt: input.exportedAt ?? new Date().toISOString(),
        problemCount: problems.length,
      },
      problems,
    }),
  );
}

export function previewAlgorithmLibraryPackage(
  db: Database.Database,
  scope: WorkspaceScope,
  pkg: AlgorithmLibraryPackage,
): AlgorithmLibraryPackagePreview {
  requirePluginEnabled(db, scope, "algorithms");
  ensureAlgorithmLibraryItems(db, scope);
  const matches = resolveMatches(db, scope, pkg);
  const usedNumbers = new Set(
    (
      db
        .prepare("SELECT library_number AS number FROM algorithm_library_items WHERE workspace_id = ?")
        .all(scope.workspaceId) as Array<{ number: number }>
    ).map((row) => row.number),
  );
  let created = 0;
  let updated = 0;
  let reused = 0;
  let unchanged = 0;
  let numberCollisions = 0;
  const warnings: string[] = [];
  for (const problem of pkg.problems) {
    const match = matches.get(problem.id);
    if (!match) {
      created += 1;
      if (usedNumbers.has(problem.sourceLibraryNumber)) numberCollisions += 1;
    } else if (!match.managedByPackage) {
      reused += 1;
    } else if (match.priorHash === problem.contentSha256) {
      unchanged += 1;
    } else {
      updated += 1;
    }
    if (!problem.content.statementMarkdown.trim()) warnings.push(`${problem.content.title}：题面为空`);
    if (!problem.content.examples.length) warnings.push(`${problem.content.title}：样例为空`);
    if (!Object.values(problem.content.referenceCode).some(Boolean))
      warnings.push(`${problem.content.title}：参考代码为空`);
  }
  return {
    packageId: pkg.package.id,
    name: pkg.package.name,
    description: pkg.package.description,
    total: pkg.problems.length,
    created,
    updated,
    reused,
    unchanged,
    numberCollisions,
    warningCount: warnings.length,
    warnings: warnings.slice(0, 30),
  };
}

export function importAlgorithmLibraryPackage(
  db: Database.Database,
  scope: WorkspaceScope,
  pkg: AlgorithmLibraryPackage,
  input: { packageSha256: string; targetFolderId?: string | null; createPackageFolder?: boolean },
): AlgorithmLibraryPackageImportResult {
  requirePluginEnabled(db, scope, "algorithms");
  const preview = previewAlgorithmLibraryPackage(db, scope, pkg);
  const targetFolderId = normalizeTargetFolder(db, scope, input.targetFolderId);
  const sourceId = stableId("algorithm-source", `${scope.workspaceId}:package:${pkg.package.id}`);
  const collectionSourceKey = `package:${pkg.package.id}`;
  const collectionId = stableId("algorithm-collection", `${scope.workspaceId}:${collectionSourceKey}`);
  let rootFolderId: string | null = targetFolderId;

  db.transaction(() => {
    if (input.createPackageFolder !== false) {
      rootFolderId = ensurePackageFolder(db, scope, pkg.package.id, pkg.package.name, targetFolderId);
    }
    db.prepare(
      `
      INSERT INTO algorithm_import_sources
        (workspace_id, id, name, source_kind, root_locator, content_sha256,
         item_count, status, errors_json, last_scanned_at, last_imported_at)
      VALUES (?, ?, ?, 'portable_package', ?, ?, ?, 'ready', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id, id) DO UPDATE SET
        name = excluded.name, content_sha256 = excluded.content_sha256,
        item_count = excluded.item_count, status = 'ready', errors_json = excluded.errors_json,
        last_scanned_at = CURRENT_TIMESTAMP, last_imported_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `,
    ).run(
      scope.workspaceId,
      sourceId,
      pkg.package.name,
      `ascend-library:${pkg.package.id}`,
      input.packageSha256,
      pkg.problems.length,
      JSON.stringify(preview.warnings),
    );
    db.prepare(
      `
      INSERT INTO algorithm_collections
        (workspace_id, id, source_key, name, description, collection_kind, sort_order)
      VALUES (?, ?, ?, ?, ?, 'package', 0)
      ON CONFLICT(workspace_id, source_key) DO UPDATE SET
        name = excluded.name, description = excluded.description,
        collection_kind = 'package', updated_at = CURRENT_TIMESTAMP
    `,
    ).run(scope.workspaceId, collectionId, collectionSourceKey, pkg.package.name, pkg.package.description);
    db.prepare("DELETE FROM algorithm_collection_items WHERE workspace_id = ? AND collection_id = ?").run(
      scope.workspaceId,
      collectionId,
    );
    const packageCourseKey = `package:${pkg.package.id}`;
    db.prepare("DELETE FROM algorithm_course_memberships WHERE workspace_id = ? AND course_key = ?").run(
      scope.workspaceId,
      packageCourseKey,
    );

    const matches = resolveMatches(db, scope, pkg);
    const usedNumbers = new Set(
      (
        db
          .prepare("SELECT library_number AS number FROM algorithm_library_items WHERE workspace_id = ?")
          .all(scope.workspaceId) as Array<{ number: number }>
      ).map((row) => row.number),
    );
    let nextNumber = Math.max(0, ...usedNumbers) + 1;
    const importedProblemIds = new Set<number>();
    for (const [index, problem] of pkg.problems.entries()) {
      const match = matches.get(problem.id);
      const managedByPackage = match?.managedByPackage ?? true;
      let problemId = match?.problemId;
      if (!problemId) {
        problemId = insertPackageProblem(db, scope, pkg.package.id, problem);
        const folderId = ensureProblemFolderPath(
          db,
          scope,
          pkg.package.id,
          rootFolderId,
          problem.organization.folderPath,
        );
        const preferred = problem.sourceLibraryNumber;
        const libraryNumber = usedNumbers.has(preferred) ? nextAvailableNumber(usedNumbers, nextNumber) : preferred;
        usedNumbers.add(libraryNumber);
        nextNumber = Math.max(nextNumber, libraryNumber + 1);
        const sortOrder = (
          db
            .prepare(
              `
          SELECT COALESCE(MAX(sort_order), 0) + 1 AS value FROM algorithm_library_items
          WHERE workspace_id = ? AND folder_id IS ?
        `,
            )
            .get(scope.workspaceId, folderId) as { value: number }
        ).value;
        db.prepare(
          `
          INSERT INTO algorithm_library_items
            (workspace_id, problem_id, folder_id, sort_order, library_number)
          VALUES (?, ?, ?, ?, ?)
        `,
        ).run(scope.workspaceId, problemId, folderId, sortOrder, libraryNumber);
        applyPackageCurriculum(db, scope, problemId, problem.organization.curriculum);
      } else if (managedByPackage && match?.priorHash !== problem.contentSha256) {
        updatePackageProblem(db, scope, pkg.package.id, problemId, problem);
      }
      importedProblemIds.add(problemId);
      addProblemSkills(db, scope, problemId, problem.content.tags);
      db.prepare(
        `
        INSERT INTO algorithm_import_items
          (workspace_id, source_id, source_path, problem_id, content_sha256, import_status, metadata_json)
        VALUES (?, ?, ?, ?, ?, 'imported', ?)
        ON CONFLICT(workspace_id, source_id, source_path) DO UPDATE SET
          problem_id = excluded.problem_id, content_sha256 = excluded.content_sha256,
          import_status = 'imported', metadata_json = excluded.metadata_json,
          imported_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      `,
      ).run(
        scope.workspaceId,
        sourceId,
        problem.id,
        problemId,
        problem.contentSha256,
        JSON.stringify({ managedByPackage }),
      );
      db.prepare(
        `
        INSERT INTO algorithm_collection_items (workspace_id, collection_id, problem_id, sort_order)
        VALUES (?, ?, ?, ?)
      `,
      ).run(scope.workspaceId, collectionId, problemId, index + 1);
      upsertCourseMembership(db, scope, problemId, {
        key: packageCourseKey,
        name: pkg.package.name,
        stage: "全部",
        sortOrder: index + 1,
      });
      for (const course of problem.organization.courses) upsertCourseMembership(db, scope, problemId, course);
      for (const collection of problem.organization.collections) {
        upsertPackageCollection(db, scope, pkg.package.id, problemId, collection);
      }
    }
    const knownPaths = pkg.problems.map((problem) => problem.id);
    if (knownPaths.length) {
      db.prepare(
        `
        DELETE FROM algorithm_import_items
        WHERE workspace_id = ? AND source_id = ?
          AND source_path NOT IN (${knownPaths.map(() => "?").join(",")})
      `,
      ).run(scope.workspaceId, sourceId, ...knownPaths);
    }
    if (importedProblemIds.size !== pkg.problems.length) throw new Error("题库包导入数量校验失败");
  })();

  return { ...preview, rootFolderId, collectionId };
}

function resolveMatches(
  db: Database.Database,
  scope: WorkspaceScope,
  pkg: AlgorithmLibraryPackage,
): Map<string, ImportMatch> {
  const sourceId = stableId("algorithm-source", `${scope.workspaceId}:package:${pkg.package.id}`);
  const mappedRows = db
    .prepare(
      `
    SELECT i.source_path AS sourcePath, i.problem_id AS problemId,
           i.content_sha256 AS contentSha256, i.metadata_json AS metadataJson
    FROM algorithm_import_items i
    JOIN algorithm_problems p ON p.workspace_id = i.workspace_id AND p.id = i.problem_id
    WHERE i.workspace_id = ? AND i.source_id = ?
  `,
    )
    .all(scope.workspaceId, sourceId) as Array<{
    sourcePath: string;
    problemId: number;
    contentSha256: string;
    metadataJson: string;
  }>;
  const mapped = new Map(mappedRows.map((row) => [row.sourcePath, row]));
  const byIdentity = db.prepare(`
    SELECT id FROM algorithm_problems
    WHERE workspace_id = ? AND provider_id = ? AND external_problem_id = ?
  `);
  const byUrl = db.prepare("SELECT id FROM algorithm_problems WHERE workspace_id = ? AND source_url = ?");
  const matches = new Map<string, ImportMatch>();
  for (const problem of pkg.problems) {
    const prior = mapped.get(problem.id);
    if (prior) {
      matches.set(problem.id, {
        problemId: prior.problemId,
        managedByPackage: parseRecord(prior.metadataJson).managedByPackage === true,
        priorHash: prior.contentSha256,
      });
      continue;
    }
    const identity = byIdentity.get(
      scope.workspaceId,
      problem.identity.providerId,
      problem.identity.externalProblemId,
    ) as { id: number } | undefined;
    const url = identity
      ? undefined
      : (byUrl.get(scope.workspaceId, problem.identity.sourceUrl) as { id: number } | undefined);
    const existing = identity ?? url;
    if (existing) matches.set(problem.id, { problemId: existing.id, managedByPackage: false, priorHash: "" });
  }
  return matches;
}

function insertPackageProblem(
  db: Database.Database,
  scope: WorkspaceScope,
  packageId: string,
  problem: AlgorithmLibraryPackage["problems"][number],
): number {
  const content = problem.content;
  const metadata = packageMetadata({}, packageId, problem);
  const result = db
    .prepare(
      `
    INSERT INTO algorithm_problems
      (workspace_id, provider_id, external_problem_id, source_url, title,
       difficulty_band, tags_json, notes, evidence_status, problem_mode,
       statement_markdown, input_specification, output_specification, examples_json,
       judge_problem_ref, time_limit_ms, memory_limit_kb, supported_languages_json,
       hint_ladder_json, license_metadata_json, metadata_json, content_mode,
       evaluation_mode, material_status, priority_band, phase_key)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, '', 'unseen', 'imported', ?, ?, ?, ?, '', ?, ?, ?, '[]', ?, ?,
       'imported_private', ?, 'todo', '', ?)
  `,
    )
    .run(
      scope.workspaceId,
      problem.identity.providerId,
      problem.identity.externalProblemId,
      problem.identity.sourceUrl,
      content.title,
      content.difficultyBand,
      JSON.stringify(content.tags),
      content.statementMarkdown,
      content.inputSpecification,
      content.outputSpecification,
      JSON.stringify(content.examples),
      content.timeLimitMs,
      content.memoryLimitKb,
      JSON.stringify(content.supportedLanguages),
      JSON.stringify(content.license),
      JSON.stringify(metadata),
      content.evaluationMode,
      content.phaseKey,
    );
  return Number(result.lastInsertRowid);
}

function updatePackageProblem(
  db: Database.Database,
  scope: WorkspaceScope,
  packageId: string,
  problemId: number,
  problem: AlgorithmLibraryPackage["problems"][number],
): void {
  const current = db
    .prepare(
      `
    SELECT metadata_json AS metadataJson FROM algorithm_problems WHERE workspace_id = ? AND id = ?
  `,
    )
    .get(scope.workspaceId, problemId) as { metadataJson: string };
  const content = problem.content;
  db.prepare(
    `
    UPDATE algorithm_problems
    SET provider_id = ?, external_problem_id = ?, source_url = ?, title = ?, difficulty_band = ?,
        tags_json = ?, statement_markdown = ?, input_specification = ?, output_specification = ?,
        examples_json = ?, time_limit_ms = ?, memory_limit_kb = ?, supported_languages_json = ?,
        license_metadata_json = ?, metadata_json = ?, evaluation_mode = ?, phase_key = ?,
        problem_mode = 'imported', content_mode = 'imported_private', updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND id = ?
  `,
  ).run(
    problem.identity.providerId,
    problem.identity.externalProblemId,
    problem.identity.sourceUrl,
    content.title,
    content.difficultyBand,
    JSON.stringify(content.tags),
    content.statementMarkdown,
    content.inputSpecification,
    content.outputSpecification,
    JSON.stringify(content.examples),
    content.timeLimitMs,
    content.memoryLimitKb,
    JSON.stringify(content.supportedLanguages),
    JSON.stringify(content.license),
    JSON.stringify(packageMetadata(parseRecord(current.metadataJson), packageId, problem)),
    content.evaluationMode,
    content.phaseKey,
    scope.workspaceId,
    problemId,
  );
}

function packageMetadata(
  current: Record<string, unknown>,
  packageId: string,
  problem: AlgorithmLibraryPackage["problems"][number],
): Record<string, unknown> {
  return {
    ...current,
    starterCode: problem.content.starterCode,
    referenceCode: problem.content.referenceCode,
    packageImport: { packageId, problemId: problem.id },
  };
}

function applyPackageCurriculum(
  db: Database.Database,
  scope: WorkspaceScope,
  problemId: number,
  memberships: AlgorithmLibraryPackage["problems"][number]["organization"]["curriculum"],
): void {
  ensureAlgorithmCurriculumProblem(db, scope, problemId);
  const chapterExists = db.prepare(`
    SELECT 1 FROM algorithm_curriculum_chapters
    WHERE workspace_id = ? AND curriculum_key = ? AND chapter_key = ?
  `);
  const removePrimary = db.prepare(`
    DELETE FROM algorithm_curriculum_items
    WHERE workspace_id = ? AND curriculum_key = ? AND problem_id = ? AND membership_kind = 'primary'
  `);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO algorithm_curriculum_items
      (workspace_id, curriculum_key, chapter_key, problem_id, membership_kind, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const membership of memberships) {
    if (!chapterExists.get(scope.workspaceId, membership.curriculumKey, membership.chapterKey)) continue;
    if (membership.membershipKind === "primary") {
      removePrimary.run(scope.workspaceId, membership.curriculumKey, problemId);
    }
    insert.run(
      scope.workspaceId,
      membership.curriculumKey,
      membership.chapterKey,
      problemId,
      membership.membershipKind,
      membership.sortOrder,
    );
  }
}

function addProblemSkills(db: Database.Database, scope: WorkspaceScope, problemId: number, tags: string[]): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO algorithm_problem_skills
      (workspace_id, problem_id, skill_key, role, confidence)
    VALUES (?, ?, ?, 'primary', 1)
  `);
  for (const tag of tags) insert.run(scope.workspaceId, problemId, tag);
}

function upsertCourseMembership(
  db: Database.Database,
  scope: WorkspaceScope,
  problemId: number,
  course: z.infer<typeof courseSchema>,
): void {
  db.prepare(
    `
    INSERT INTO algorithm_course_memberships
      (workspace_id, problem_id, course_key, course_name, stage_key, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, problem_id, course_key) DO UPDATE SET
      course_name = excluded.course_name, stage_key = excluded.stage_key,
      sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP
  `,
  ).run(scope.workspaceId, problemId, course.key, course.name, course.stage || "未分阶段", course.sortOrder);
}

function upsertPackageCollection(
  db: Database.Database,
  scope: WorkspaceScope,
  packageId: string,
  problemId: number,
  collection: z.infer<typeof collectionSchema>,
): void {
  const sourceKey = `package:${packageId}:collection:${collection.key}`;
  const id = stableId("algorithm-collection", `${scope.workspaceId}:${sourceKey}`);
  db.prepare(
    `
    INSERT INTO algorithm_collections
      (workspace_id, id, source_key, name, description, collection_kind, sort_order)
    VALUES (?, ?, ?, ?, '', ?, ?)
    ON CONFLICT(workspace_id, source_key) DO UPDATE SET
      name = excluded.name, collection_kind = excluded.collection_kind,
      sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP
  `,
  ).run(scope.workspaceId, id, sourceKey, collection.name, collection.kind, collection.sortOrder);
  db.prepare(
    `
    INSERT INTO algorithm_collection_items (workspace_id, collection_id, problem_id, sort_order)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(workspace_id, collection_id, problem_id) DO UPDATE SET sort_order = excluded.sort_order
  `,
  ).run(scope.workspaceId, id, problemId, collection.sortOrder);
}

function ensurePackageFolder(
  db: Database.Database,
  scope: WorkspaceScope,
  packageId: string,
  name: string,
  parentId: string | null,
): string {
  const id = stableId("algorithm-package-folder", `${scope.workspaceId}:${packageId}`);
  const existing = db
    .prepare(
      `
    SELECT id FROM algorithm_library_folders WHERE workspace_id = ? AND id = ?
  `,
    )
    .get(scope.workspaceId, id) as { id: string } | undefined;
  if (existing) return existing.id;
  const safeName = uniqueFolderName(db, scope, parentId, normalizeFolderSegment(name));
  const sortOrder = nextFolderOrder(db, scope, parentId);
  db.prepare(
    `
    INSERT INTO algorithm_library_folders (workspace_id, id, parent_id, name, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(scope.workspaceId, id, parentId, safeName, sortOrder);
  return id;
}

function ensureProblemFolderPath(
  db: Database.Database,
  scope: WorkspaceScope,
  packageId: string,
  rootFolderId: string | null,
  path: string[],
): string | null {
  let parentId = rootFolderId;
  const accumulated: string[] = [];
  for (const segment of path) {
    accumulated.push(segment);
    const id = stableId("algorithm-package-folder", `${scope.workspaceId}:${packageId}:${accumulated.join("/")}`);
    const existing = db
      .prepare(
        `
      SELECT id FROM algorithm_library_folders WHERE workspace_id = ? AND id = ?
    `,
      )
      .get(scope.workspaceId, id) as { id: string } | undefined;
    if (!existing) {
      const name = uniqueFolderName(db, scope, parentId, normalizeFolderSegment(segment));
      db.prepare(
        `
        INSERT INTO algorithm_library_folders (workspace_id, id, parent_id, name, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `,
      ).run(scope.workspaceId, id, parentId, name, nextFolderOrder(db, scope, parentId));
    }
    parentId = id;
  }
  return parentId;
}

function normalizeTargetFolder(
  db: Database.Database,
  scope: WorkspaceScope,
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const id = value.trim();
  const row = db
    .prepare(
      `
    SELECT id FROM algorithm_library_folders WHERE workspace_id = ? AND id = ?
  `,
    )
    .get(scope.workspaceId, id);
  if (!row) throw new AlgorithmLibraryPackageError("目标文件夹不存在");
  return id;
}

function uniqueFolderName(
  db: Database.Database,
  scope: WorkspaceScope,
  parentId: string | null,
  requested: string,
): string {
  const exists = db.prepare(`
    SELECT 1 FROM algorithm_library_folders
    WHERE workspace_id = ? AND parent_id IS ? AND name = ? COLLATE NOCASE
  `);
  if (!exists.get(scope.workspaceId, parentId, requested)) return requested;
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${requested.slice(0, 74)} (${suffix})`;
    if (!exists.get(scope.workspaceId, parentId, candidate)) return candidate;
  }
  throw new Error("目标位置的同名文件夹过多");
}

function nextFolderOrder(db: Database.Database, scope: WorkspaceScope, parentId: string | null): number {
  return (
    db
      .prepare(
        `
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS value FROM algorithm_library_folders
    WHERE workspace_id = ? AND parent_id IS ?
  `,
      )
      .get(scope.workspaceId, parentId) as { value: number }
  ).value;
}

function nextAvailableNumber(used: Set<number>, start: number): number {
  let candidate = Math.max(1, start);
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

function normalizeProblemIds(values: number[]): number[] {
  const ids = [...new Set(values.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length || ids.length > ALGORITHM_LIBRARY_PACKAGE_MAX_PROBLEMS) {
    throw new AlgorithmLibraryPackageError(`请选择 1 到 ${ALGORITHM_LIBRARY_PACKAGE_MAX_PROBLEMS} 道题`);
  }
  return ids;
}

function boundedText(value: string, max: number, label: string): string {
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
  if (!text) throw new AlgorithmLibraryPackageError(`${label}必填`);
  return text;
}

function normalizeFolderSegment(value: string): string {
  return (
    value
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[\\/\u0000-\u001f]/g, "-")
      .slice(0, 80) || "未命名"
  );
}

function folderPath(
  folders: Map<string, { id: string; parentId: string | null; name: string }>,
  folderId: string | null,
): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let cursor = folderId;
  while (cursor) {
    if (seen.has(cursor)) throw new Error("题库文件夹存在循环关系");
    seen.add(cursor);
    const folder = folders.get(cursor);
    if (!folder) break;
    path.unshift(folder.name);
    cursor = folder.parentId;
  }
  return path;
}

function groupRows<T extends { problemId: number }>(rows: T[]): Map<number, Array<Omit<T, "problemId">>> {
  const grouped = new Map<number, Array<Omit<T, "problemId">>>();
  for (const { problemId, ...row } of rows) {
    const list = grouped.get(problemId) ?? [];
    list.push(row as Omit<T, "problemId">);
    grouped.set(problemId, list);
  }
  return grouped;
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return parseRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseStringArray(value: string, maxItems: number, maxLength: number): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? [
          ...new Set(
            parsed
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim().slice(0, maxLength))
              .filter(Boolean),
          ),
        ].slice(0, maxItems)
      : [];
  } catch {
    return [];
  }
}

function parseLanguages(value: string): Array<"cpp17" | "python3"> {
  return parseStringArray(value, 2, 20).filter(
    (language): language is "cpp17" | "python3" => language === "cpp17" || language === "python3",
  );
}

function parseExamples(value: string): Array<{ input: string; output: string; explanation?: string }> {
  try {
    const parsed = JSON.parse(value);
    const result = z.array(exampleSchema).max(12).safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

function parseCode(value: unknown): { cpp17?: string; python3?: string } {
  const result = codeSchema.safeParse(value);
  return result.success ? result.data : {};
}

function normalizeDifficulty(value: string): "" | "foundation" | "standard" | "challenge" {
  return value === "foundation" || value === "standard" || value === "challenge" ? value : "";
}

function hashContent(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableId(prefix: string, input: string): string {
  return `${prefix}:${createHash("sha256").update(input).digest("hex").slice(0, 24)}`;
}
