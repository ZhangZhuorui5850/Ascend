import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MockExamForm.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/mock-exams/page.tsx", import.meta.url), "utf8");

describe("MockExamForm evidence contract", () => {
  it("separates scored groups from subjective post-exam feelings", () => {
    expect(source).toContain('evidenceType: "group" as const');
    expect(source).toContain('evidenceType: "self_assessment" as const');
    expect(source).toContain("考后感受（可选，不参与弱项排序）");
    expect(source).toContain("合计尚未覆盖总成绩");
  });

  it("captures the fields needed to trace a weak group into training", () => {
    expect(source).toContain("knowledgePointId");
    expect(source).toContain("questionType");
    expect(source).toContain("durationMinutes");
    expect(source).toContain("causeCategory");
    expect(source).toContain("guessedCorrect");
    expect(pageSource).toContain("knowledgePointId={dashboard.weakAreas[0].knowledgePointId}");
  });
});
