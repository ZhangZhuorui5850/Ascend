import { describe, expect, it } from "vitest";
import {
  ALGORITHM_CURRICULUM_COURSE_KEY,
  ALGORITHM_CURRICULUM_TITLE,
} from "../../algorithm-curriculum";
import { createAlgorithmProblem } from "../../repo/algorithms";
import { setPluginEnabled } from "../../repo/plugins";
import { createTestDb, createTestWorkspace } from "../../repo/testing";
import { getAlgorithmDeviceQueuePayload } from "./device-read-model";

describe("algorithm device read model", () => {
  it("shares the web curriculum tree with the VS Code queue", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    setPluginEnabled(db, scope, "algorithms", true);
    createAlgorithmProblem(db, scope, {
      sourceUrl: "https://bailian.openjudge.cn/practice/2742/",
      title: "统计字符数",
      tags: ["字符串", "计数数组"],
    });
    createAlgorithmProblem(db, scope, {
      sourceUrl: "https://example.com/exercises/official/2025-summer/03",
      externalProblemId: "exercises/official/2025-summer/03-wormhole",
      title: "虫洞穿梭",
      tags: ["图论", "Dijkstra"],
    });

    const payload = getAlgorithmDeviceQueuePayload(db, {
      ...scope,
      deviceId: "device-test",
      deviceName: "测试设备",
    });
    const curriculum = payload.courseTree.find(
      (course) => course.id === `course:${ALGORITHM_CURRICULUM_COURSE_KEY}`,
    );
    expect(curriculum).toMatchObject({
      name: ALGORITHM_CURRICULUM_TITLE,
      kind: "curriculum",
      problemCount: 2,
      openCount: 2,
    });
    expect(curriculum?.stages.map((stage) => stage.key)).toEqual([
      "1. 基础语法与 STL",
      "2. 模拟与枚举",
      "3. 前缀和、双指针与二分",
      "4. 递归与分治",
      "5. DFS、BFS 与回溯",
      "6. 动态规划与背包",
      "7. 贪心",
      "8. 图论与最短路",
      "9. 历年机试综合",
    ]);

    const examProblem = payload.problems.find((problem) => problem.title === "虫洞穿梭");
    expect(examProblem?.courses.filter((course) => course.courseKey === ALGORITHM_CURRICULUM_COURSE_KEY))
      .toEqual([
        expect.objectContaining({ stageKey: "8. 图论与最短路" }),
        expect.objectContaining({ stageKey: "9. 历年机试综合" }),
      ]);
  });
});
