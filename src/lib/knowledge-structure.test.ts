import { describe, expect, it } from "vitest";
import { summarizeKnowledgeStructure } from "./knowledge-structure";

describe("knowledge structure summaries", () => {
  it("summarizes subjects, chapters, tags, and the selected subject", () => {
    const summary = summarizeKnowledgeStructure(
      [
        {
          code: "M1",
          name: "线性代数",
          chapters: [
            { id: "c1", title: "矩阵", knowledgeTags: [{ id: "t1", name: "矩阵乘法" }] },
            { id: "c2", title: "特征值", knowledgeTags: [] },
          ],
        },
        {
          code: "M2",
          name: "概率统计",
          chapters: [{ id: "c3", title: "概率基础", knowledgeTags: [{ id: "t2", name: "贝叶斯" }] }],
        },
      ],
      "M1",
    );

    expect(summary).toEqual({
      subjectCount: 2,
      chapterCount: 3,
      tagCount: 2,
      selectedSubjectName: "线性代数",
      selectedChapterCount: 2,
      selectedTagCount: 1,
    });
  });
});
