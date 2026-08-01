import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const queue = source("./ReviewQueue.tsx");
const dayPage = source("../app/day/[date]/page.tsx");
const settings = source("./SettingsForm.tsx");
const quickLog = source("./QuickLog.tsx");

describe("review queue capacity contract", () => {
  it("uses one remaining capacity for knowledge reviews and mistake reattempts", () => {
    expect(queue).toContain("Math.max(0, dailyLimit - doneToday)");
    expect(queue).toContain("backlogTotal > remainingToday");
    expect(queue).toContain("今日剩余容量");
    expect(settings).toContain("知识点复习与错题回炉总量");
  });

  it("lets a study log preserve its concrete output", () => {
    expect(quickLog).toContain("output: output.trim()");
    expect(quickLog).toContain("学习产出（可选）");
  });

  it("locks a real attempt and pre-reveal confidence before showing outcomes", () => {
    expect(queue).toContain("ReviewAttemptEvidence");
    expect(queue).toContain("attemptDraftReady");
    expect(queue).toContain("锁定尝试并显示答案");
    expect(queue).toContain("锁定重做并查看错因");
    expect(queue).toContain("attemptEvidence(attemptDrafts[key])");
  });

  it("passes subject-scoped sprint priorities instead of a global sprint boolean", () => {
    expect(dayPage).toContain("sprintSubjectCodes");
    expect(dayPage).toContain("exam.subjectCode ? [exam.subjectCode] : enabledSubjectCodes");
    expect(queue).toContain("sprintSubjectCodes.length");
    expect(dayPage).not.toContain("examSprint=");
  });
});
