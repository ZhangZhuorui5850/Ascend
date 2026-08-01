import { describe, expect, it } from "vitest";
import {
  confidenceLabel,
  evidenceStateLabel,
  normalizeReviewEvidence,
} from "./review-evidence";

describe("review evidence", () => {
  it("normalizes a real typed attempt", () => {
    expect(normalizeReviewEvidence({
      attemptMode: "typed",
      attemptText: "  先写定义，再列两个边界条件  ",
      attemptDurationSeconds: 18.6,
      preConfidence: 2,
    })).toEqual({
      attemptMode: "typed",
      attemptText: "先写定义，再列两个边界条件",
      attemptDurationSeconds: 19,
      preConfidence: 2,
    });
  });

  it("keeps legacy calls explicitly unknown and rejects partial evidence", () => {
    expect(normalizeReviewEvidence({})).toEqual({
      attemptMode: "unknown",
      attemptText: "",
      attemptDurationSeconds: 0,
      preConfidence: null,
    });
    expect(() => normalizeReviewEvidence({
      attemptMode: "typed",
      preConfidence: 2,
    })).toThrow("请输入简短草稿");
    expect(() => normalizeReviewEvidence({
      attemptMode: "paper",
    })).toThrow("请选择揭晓前信心");
    expect(() => normalizeReviewEvidence({
      preConfidence: 3,
    })).toThrow("请先选择作答方式");
  });

  it("uses qualitative labels instead of presenting a precise mastery percentage", () => {
    expect(evidenceStateLabel({
      evidenceSampleCount: 0,
      lastEvidenceScore: null,
      legacyReviewCount: 0,
    })).toBe("样本不足");
    expect(evidenceStateLabel({
      evidenceSampleCount: 0,
      lastEvidenceScore: null,
      legacyReviewCount: 3,
    })).toBe("仅有历史评分");
    expect(evidenceStateLabel({
      evidenceSampleCount: 1,
      lastEvidenceScore: 1,
    })).toBe("需要巩固");
    expect(evidenceStateLabel({
      evidenceSampleCount: 3,
      lastEvidenceScore: 3,
    })).toBe("证据较稳定");
    expect(confidenceLabel(null)).toBe("未设置");
    expect(confidenceLabel(80)).toBe("很高");
  });
});
