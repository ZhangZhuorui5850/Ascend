"use client";

import {
  PRE_CONFIDENCE_LABELS,
  type ReviewAttemptMode,
  type ReviewEvidenceInput,
} from "@/lib/review-evidence";

export type AttemptDraft = {
  attemptMode: Exclude<ReviewAttemptMode, "unknown"> | "";
  attemptText: string;
  preConfidence: number | null;
  startedAt: number;
  durationSeconds: number;
};

export function emptyAttemptDraft(): AttemptDraft {
  return {
    attemptMode: "",
    attemptText: "",
    preConfidence: null,
    startedAt: 0,
    durationSeconds: 0,
  };
}

export function attemptDraftReady(draft: AttemptDraft | undefined): boolean {
  if (!draft?.attemptMode || draft.preConfidence === null) return false;
  return draft.attemptMode !== "typed" || Boolean(draft.attemptText.trim());
}

export function attemptEvidence(draft: AttemptDraft | undefined): ReviewEvidenceInput {
  if (!draft?.attemptMode) return {};
  return {
    attemptMode: draft.attemptMode,
    attemptText: draft.attemptText,
    attemptDurationSeconds: draft.durationSeconds,
    preConfidence: draft.preConfidence,
  };
}

const MODE_OPTIONS: Array<{
  value: AttemptDraft["attemptMode"];
  label: string;
  hint: string;
}> = [
  { value: "paper", label: "纸上完成", hint: "已写出关键步骤" },
  { value: "oral", label: "口述完成", hint: "已完整说出答案" },
  { value: "typed", label: "输入草稿", hint: "留下一段简短作答" },
];

export function ReviewAttemptEvidence({
  draft,
  onChange,
}: {
  draft: AttemptDraft;
  onChange: (next: AttemptDraft) => void;
}) {
  function update(patch: Partial<AttemptDraft>) {
    onChange({
      ...draft,
      ...patch,
    });
  }

  return (
    <fieldset className="reviewAttemptEvidence">
      <legend>揭晓前先留下作答证据</legend>
      <div className="attemptModeOptions" role="group" aria-label="作答方式">
        {MODE_OPTIONS.map((option) => (
          <button
            aria-pressed={draft.attemptMode === option.value}
            className={draft.attemptMode === option.value ? "active" : undefined}
            key={option.value}
            onClick={() => update({
              attemptMode: option.value,
              startedAt: draft.startedAt || Date.now(),
            })}
            type="button"
          >
            <strong>{option.label}</strong>
            <small>{option.hint}</small>
          </button>
        ))}
      </div>
      {draft.attemptMode === "typed" ? (
        <label className="attemptDraftField">
          <span>简短草稿</span>
          <textarea
            maxLength={1000}
            onChange={(event) => update({
              attemptText: event.target.value,
              startedAt: draft.startedAt || Date.now(),
            })}
            placeholder="写下定义、关键步骤或最终答案；不要求完整排版。"
            rows={3}
            value={draft.attemptText}
          />
        </label>
      ) : null}
      <div className="preConfidence">
        <span>揭晓前信心</span>
        <div role="group" aria-label="揭晓前信心">
          {PRE_CONFIDENCE_LABELS.map((label, value) => (
            <button
              aria-pressed={draft.preConfidence === value}
              className={draft.preConfidence === value ? "active" : undefined}
              key={label}
              onClick={() => update({
                preConfidence: value,
                startedAt: draft.startedAt || Date.now(),
              })}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p>
        {attemptDraftReady(draft)
          ? "已具备揭晓条件；系统会分别保存尝试、信心与揭晓后结果。"
          : "选择作答方式和信心；输入草稿模式还需留下简短内容。"}
      </p>
    </fieldset>
  );
}
