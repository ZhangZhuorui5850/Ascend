import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanAlgorithmDirectory } from "./algorithm-import";

const originalRoots = process.env.ASCEND_ALGORITHM_IMPORT_ROOTS;
const scratch: string[] = [];

afterEach(() => {
  if (originalRoots === undefined) delete process.env.ASCEND_ALGORITHM_IMPORT_ROOTS;
  else process.env.ASCEND_ALGORITHM_IMPORT_ROOTS = originalRoots;
  while (scratch.length) rmSync(scratch.pop()!, { recursive: true, force: true });
});

describe("algorithm directory scan", () => {
  it("imports the root template separately from exercise reference code", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ascend-algorithm-template-"));
    scratch.push(root);
    process.env.ASCEND_ALGORITHM_IMPORT_ROOTS = root;
    writeFileSync(root + "/template.cpp", "#include <bits/stdc++.h>\nint main() { return 0; }\n");
    writeFileSync(
      root + "/problem.cpp",
      `/*
题目：模板隔离测试
@source unknown
@phase W1
@status todo
@priority P1
输入：一个整数。
输出：一个整数。
样例输入：
1
样例输出：
1
*/
int solved_answer = 42;
`,
    );

    const scan = scanAlgorithmDirectory(root);

    expect(scan.exercises).toHaveLength(1);
    expect(scan.templateSourceCode).toContain("bits/stdc++.h");
    expect(scan.templateSourceCode).not.toContain("solved_answer");
    expect(scan.exercises[0].sourceCode).toContain("solved_answer");
  });
});
