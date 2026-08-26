import { describe, expect, it } from "vitest";
import { parseAlgorithmCpp } from "../algorithm-import-parser";
import { importAlgorithmScan, listAlgorithmCollections, listAlgorithmImportSources } from "./algorithm-import";
import { getAlgorithmDashboard } from "./algorithms";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace } from "./testing";

describe("algorithm library import", () => {
  it("imports idempotently and creates phase/source collections", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    const exercise = parseAlgorithmCpp(
      "openjudge/100.cpp",
      `/*
题目：测试题
@source https://bailian.openjudge.cn/practice/100/
@origin fixed-list
@phase W1
@status todo
@priority P1
@topics 字符串;模拟
输入：一个整数。
输出：一个整数。
样例输入：
1
样例输出：
1
*/
int main() { return 0; }
`,
    );
    const scan = {
      rootPath: "/allowed/algorithm",
      rootName: "algorithm",
      contentSha256: exercise.contentSha256,
      templateSourceCode: "#include <bits/stdc++.h>\nint main() { return 0; }\n",
      exercises: [exercise],
      warningCount: 0,
    };

    expect(importAlgorithmScan(db, scope, scan)).toMatchObject({
      total: 1,
      created: 1,
      updated: 0,
      unchanged: 0,
      collectionCount: 2,
    });
    expect(importAlgorithmScan(db, scope, scan)).toMatchObject({
      total: 1,
      created: 0,
      updated: 0,
      unchanged: 1,
    });

    const dashboard = getAlgorithmDashboard(db, scope, "2026-08-19");
    const imported = dashboard.problems.find((problem) => problem.externalProblemId === "100");
    expect(imported).toMatchObject({
      title: "测试题",
      problemMode: "imported",
      contentMode: "imported_private",
      evaluationMode: "manual",
      materialStatus: "todo",
      priorityBand: "P1",
      phaseKey: "W1",
    });
    expect(imported?.starterCode.cpp17).toContain("bits/stdc++.h");
    expect(imported?.referenceCode.cpp17).toContain("int main()");
    expect(imported?.collectionIds).toHaveLength(2);
    expect(listAlgorithmCollections(db, scope)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "W1", problemCount: 1 }),
        expect.objectContaining({ name: "固定题单", problemCount: 1 }),
      ]),
    );
    expect(listAlgorithmImportSources(db, scope)).toEqual([
      expect.objectContaining({
        name: "algorithm",
        rootLocator: "/allowed/algorithm",
        itemCount: 1,
        status: "ready",
        warningCount: 0,
      }),
    ]);
  });
});
