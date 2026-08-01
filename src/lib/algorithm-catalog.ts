import type Database from "better-sqlite3";
import type { WorkspaceScope } from "./access-context";
import { EXPANDED_ALGORITHM_CATALOG } from "./algorithm-catalog-expanded";
import { requirePluginEnabled } from "./repo/plugins";

export type ManagedAlgorithmProblemSeed = {
  ref: string;
  title: string;
  difficultyBand: "foundation" | "standard" | "challenge";
  statementMarkdown: string;
  inputSpecification: string;
  outputSpecification: string;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  supportedLanguages: Array<"cpp17" | "python3">;
  hints: Array<{ level: 1 | 2 | 3 | 4; title: string; body: string }>;
  skills: string[];
  timeLimitMs: number;
  memoryLimitKb: number;
  starterCode: Record<"cpp17" | "python3", string>;
  transferGroup?: string;
};

export const MANAGED_ALGORITHM_CATALOG: readonly ManagedAlgorithmProblemSeed[] = [
  {
    ref: "ascend:foundation:sum-two:v1",
    title: "两数求和",
    difficultyBand: "foundation",
    statementMarkdown: "读取两个整数 $a$ 和 $b$，输出它们的和。",
    inputSpecification: "一行包含两个整数 $a$ 和 $b$，以空格分隔。",
    outputSpecification: "输出一个整数，表示 $a+b$。",
    examples: [
      { input: "1 2\n", output: "3\n" },
      { input: "-7 5\n", output: "-2\n", explanation: "需要正确处理负数。" },
    ],
    supportedLanguages: ["cpp17", "python3"],
    hints: [
      { level: 1, title: "输入边界", body: "先确认输入中有几个整数，并检查负数是否能被正常读取。" },
      { level: 2, title: "运算模型", body: "本题只需要一次整数加法，不需要数组或循环。" },
      { level: 3, title: "实现骨架", body: "读取 a、b；计算 sum = a + b；输出 sum。" },
      {
        level: 4,
        title: "参考实现",
        body: "C++：读取两个 long long 后输出相加结果。Python：map(int, input().split()) 后输出两数之和。",
      },
    ],
    skills: ["input-output", "integer-arithmetic", "boundary-negative"],
    timeLimitMs: 1_000,
    memoryLimitKb: 131_072,
    starterCode: {
      cpp17: "#include <iostream>\nusing namespace std;\n\nint main() {\n    // 在这里编写代码\n    return 0;\n}\n",
      python3: "# 在这里编写代码\n",
    },
    transferGroup: "integer-aggregation",
  },
  {
    ref: "ascend:foundation:range-sum:v1",
    title: "区间整数求和",
    difficultyBand: "foundation",
    statementMarkdown: "给定两个整数 $l$ 和 $r$（$l\\le r$），求闭区间 $[l,r]$ 中所有整数的和。",
    inputSpecification: "一行包含两个整数 $l$ 和 $r$，满足 $-10^9\\le l\\le r\\le10^9$。",
    outputSpecification: "输出闭区间内所有整数的和。",
    examples: [
      { input: "1 5\n", output: "15\n" },
      { input: "-2 2\n", output: "0\n" },
    ],
    supportedLanguages: ["cpp17", "python3"],
    hints: [
      { level: 1, title: "复杂度检查", body: "当区间很长时，逐个累加会超时。" },
      { level: 2, title: "等差数列", body: "区间内项数是 r-l+1，可利用首项、末项和项数。" },
      { level: 3, title: "实现骨架", body: "令 n=r-l+1，结果为 (l+r)*n/2；注意整数范围和除法顺序。" },
      {
        level: 4,
        title: "参考实现",
        body: "使用足够宽的整数类型计算 n*(l+r)/2；Python 整数无固定上限，C++ 可使用 long long。",
      },
    ],
    skills: ["complexity", "arithmetic-progression", "integer-overflow"],
    timeLimitMs: 1_000,
    memoryLimitKb: 131_072,
    starterCode: {
      cpp17: "#include <iostream>\nusing namespace std;\n\nint main() {\n    long long l, r;\n    cin >> l >> r;\n    // 在这里计算闭区间的和\n    return 0;\n}\n",
      python3: "l, r = map(int, input().split())\n# 在这里计算闭区间的和\n",
    },
    transferGroup: "integer-aggregation",
  },
  ...EXPANDED_ALGORITHM_CATALOG,
] as const;

export function ensureManagedAlgorithmCatalog(
  db: Database.Database,
  scope: WorkspaceScope,
): void {
  requirePluginEnabled(db, scope, "algorithms");
  const insertProblem = db.prepare(`
    INSERT INTO algorithm_problems
      (workspace_id, provider_id, external_problem_id, source_url, title,
       difficulty_band, tags_json, evidence_status, problem_mode,
       statement_markdown, input_specification, output_specification,
       examples_json, judge_problem_ref, time_limit_ms, memory_limit_kb,
       supported_languages_json, hint_ladder_json, license_metadata_json, metadata_json)
    VALUES
      (@workspaceId, 'ascend', @ref, @sourceUrl, @title,
       @difficultyBand, @tagsJson, 'unseen', 'managed',
       @statementMarkdown, @inputSpecification, @outputSpecification,
       @examplesJson, @ref, @timeLimitMs, @memoryLimitKb,
       @supportedLanguagesJson, @hintLadderJson, @licenseMetadataJson, @metadataJson)
    ON CONFLICT(workspace_id, provider_id, external_problem_id) DO UPDATE SET
      source_url = excluded.source_url,
      title = excluded.title,
      difficulty_band = excluded.difficulty_band,
      tags_json = excluded.tags_json,
      problem_mode = 'managed',
      statement_markdown = excluded.statement_markdown,
      input_specification = excluded.input_specification,
      output_specification = excluded.output_specification,
      examples_json = excluded.examples_json,
      judge_problem_ref = excluded.judge_problem_ref,
      time_limit_ms = excluded.time_limit_ms,
      memory_limit_kb = excluded.memory_limit_kb,
      supported_languages_json = excluded.supported_languages_json,
      hint_ladder_json = excluded.hint_ladder_json,
      license_metadata_json = excluded.license_metadata_json,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  const insertSkill = db.prepare(`
    INSERT OR IGNORE INTO algorithm_problem_skills
      (workspace_id, problem_id, skill_key, role, confidence)
    VALUES (?, ?, ?, 'primary', 1)
  `);
  db.transaction(() => {
    for (const problem of MANAGED_ALGORITHM_CATALOG) {
      insertProblem.run({
        workspaceId: scope.workspaceId,
        ref: problem.ref,
        sourceUrl: `ascend://catalog/${encodeURIComponent(problem.ref)}`,
        title: problem.title,
        difficultyBand: problem.difficultyBand,
        tagsJson: JSON.stringify(problem.skills),
        statementMarkdown: problem.statementMarkdown,
        inputSpecification: problem.inputSpecification,
        outputSpecification: problem.outputSpecification,
        examplesJson: JSON.stringify(problem.examples),
        timeLimitMs: problem.timeLimitMs,
        memoryLimitKb: problem.memoryLimitKb,
        supportedLanguagesJson: JSON.stringify(problem.supportedLanguages),
        hintLadderJson: JSON.stringify(problem.hints),
        licenseMetadataJson: JSON.stringify({
          license: "CC0-1.0",
          origin: "Ascend original",
          redistribution: true,
        }),
        metadataJson: JSON.stringify({
          starterCode: problem.starterCode,
          catalogVersion: 2,
          transferGroup: problem.transferGroup || "",
        }),
      });
      const row = db.prepare(`
        SELECT id FROM algorithm_problems
        WHERE workspace_id = ? AND provider_id = 'ascend' AND external_problem_id = ?
      `).get(scope.workspaceId, problem.ref) as { id: number };
      for (const skill of problem.skills) {
        insertSkill.run(scope.workspaceId, row.id, skill);
      }
    }
  })();
}

export function seedManagedAlgorithmCatalogForEnabledWorkspaces(
  db: Database.Database,
): void {
  const rows = db.prepare(`
    SELECT workspace_id
    FROM workspace_plugins
    WHERE plugin_id = 'algorithms' AND enabled = 1 AND state = 'enabled'
  `).all() as Array<{ workspace_id: string }>;
  for (const row of rows) {
    ensureManagedAlgorithmCatalog(db, { workspaceId: row.workspace_id });
  }
}
