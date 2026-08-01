export const REVIEW_ATTEMPT_MODES = ["typed", "paper", "oral"] as const;
export type ReviewAttemptMode = "unknown" | (typeof REVIEW_ATTEMPT_MODES)[number];

export type ReviewEvidenceInput = {
  attemptMode?: ReviewAttemptMode;
  attemptText?: string;
  attemptDurationSeconds?: number;
  preConfidence?: number | null;
};

export type NormalizedReviewEvidence = {
  attemptMode: ReviewAttemptMode;
  attemptText: string;
  attemptDurationSeconds: number;
  preConfidence: number | null;
};

export const PRE_CONFIDENCE_LABELS = ["没把握", "有点把握", "比较确定", "很确定"] as const;

export function normalizeReviewEvidence(input: ReviewEvidenceInput): NormalizedReviewEvidence {
  const attemptMode = REVIEW_ATTEMPT_MODES.includes(input.attemptMode as (typeof REVIEW_ATTEMPT_MODES)[number])
    ? input.attemptMode as (typeof REVIEW_ATTEMPT_MODES)[number]
    : "unknown";
  const attemptText = String(input.attemptText || "").trim().slice(0, 1000);
  const rawDuration = Number(input.attemptDurationSeconds);
  const attemptDurationSeconds = Number.isFinite(rawDuration)
    ? Math.max(0, Math.min(86400, Math.round(rawDuration)))
    : 0;
  const preConfidence = input.preConfidence === undefined || input.preConfidence === null
    ? null
    : Number(input.preConfidence);

  if (preConfidence !== null && (!Number.isInteger(preConfidence) || preConfidence < 0 || preConfidence > 3)) {
    throw new Error("揭晓前信心需在 0 到 3 之间");
  }
  if (attemptMode === "unknown") {
    if (attemptText || preConfidence !== null || attemptDurationSeconds > 0) {
      throw new Error("请先选择作答方式");
    }
    return { attemptMode, attemptText: "", attemptDurationSeconds: 0, preConfidence: null };
  }
  if (preConfidence === null) throw new Error("请选择揭晓前信心");
  if (attemptMode === "typed" && !attemptText) throw new Error("请输入简短草稿");

  return { attemptMode, attemptText, attemptDurationSeconds, preConfidence };
}

export function evidenceStateLabel(input: {
  evidenceSampleCount: number;
  lastEvidenceScore: number | null;
  legacyReviewCount?: number;
}): string {
  if (input.evidenceSampleCount <= 0) {
    return input.legacyReviewCount ? "仅有历史评分" : "样本不足";
  }
  if (input.lastEvidenceScore !== null && input.lastEvidenceScore <= 1) return "需要巩固";
  if (input.evidenceSampleCount < 3) return "初步稳定";
  return "证据较稳定";
}

export function confidenceLabel(value: number | null): string {
  if (value === null) return "未设置";
  if (value < 25) return "较低";
  if (value < 50) return "一般";
  if (value < 75) return "较高";
  return "很高";
}
