import { describe, expect, it } from "vitest";
import { parseAlgorithmCpp } from "./algorithm-import-parser";

describe("algorithm import parser", () => {
  it("extracts metadata, statement sections, samples and source code", () => {
    const parsed = parseAlgorithmCpp(
      "openjudge/2974-phone.cpp",
      `/*
题目：487-3279

@source      http://bailian.openjudge.cn/practice/2974/
@origin      fixed-list+guowei-example
@phase       W1
@status      todo
@priority    P1
@topics      字符串;排序;去重
@statement   high
@verified    未验证

描述：
将电话号码转换为标准形式。

输入：
第一行是号码数量。

输出：
输出重复的号码。

样例输入：
2
ITS-EASY
4873279

样例输出：
487-3279 2
*/
#include <iostream>
int main() { return 0; }
`,
    );

    expect(parsed).toMatchObject({
      title: "487-3279",
      providerId: "bailian",
      externalProblemId: "2974",
      phase: "W1",
      priority: "P1",
      materialStatus: "todo",
      topics: ["字符串", "排序", "去重"],
      origins: ["fixed-list", "guowei-example"],
      inputSpecification: "第一行是号码数量。",
      outputSpecification: "输出重复的号码。",
    });
    expect(parsed.examples).toEqual([{ input: "2\nITS-EASY\n4873279", output: "487-3279 2" }]);
    expect(parsed.statementMarkdown).toContain("## 题目描述");
    expect(parsed.sourceCode).toContain("int main()");
    expect(parsed.warnings).toEqual([]);
  });

  it("keeps official local sources private and reports missing sections", () => {
    const parsed = parseAlgorithmCpp(
      "official/2025-summer/03-wormhole.cpp",
      `/*
题目：虫洞穿梭
@source 中关村学院 2025 夏季机试
@status review
@priority P1
@topics 图论, Dijkstra
题目描述：求最短路。
*/
int main() {}
`,
    );
    expect(parsed.providerId).toBe("zgca-official");
    expect(parsed.externalProblemId).toBe("official/2025-summer/03-wormhole");
    expect(parsed.materialStatus).toBe("review");
    expect(parsed.warnings).toEqual(expect.arrayContaining(["缺少输入说明", "缺少输出说明", "缺少可解析样例"]));
  });

  it("identifies a catalog problem from a numbered filename without a header comment", () => {
    const parsed = parseAlgorithmCpp(
      "郭炜/W3/2754-八皇后.cpp",
      "#include <bits/stdc++.h>\nint main() { return 0; }\n",
    );
    expect(parsed).toMatchObject({
      title: "八皇后",
      providerId: "bailian",
      externalProblemId: "2754",
      phase: "W3",
      topics: ["回溯", "枚举"],
      matchStatus: "identified",
    });
    expect(parsed.sourceCode).toContain("#include <bits/stdc++.h>");
    expect(parsed.warnings).toContain("未找到文件头块注释，已从文件名识别");
  });

  it("keeps a low-information temp.cpp importable for preview correction", () => {
    const parsed = parseAlgorithmCpp("临时/temp.cpp", "int main() {}\n");
    expect(parsed).toMatchObject({
      title: "temp",
      providerId: "local-import",
      externalProblemId: "临时/temp",
      matchStatus: "incomplete",
    });
    expect(parsed.warnings).toEqual(expect.arrayContaining([
      "未找到文件头块注释，已从文件名识别",
      "缺少可确认的平台链接或题号",
    ]));
  });
});
