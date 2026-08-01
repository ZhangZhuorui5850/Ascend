import { describe, expect, it } from "vitest";
import {
  attemptDraftReady,
  attemptEvidence,
  emptyAttemptDraft,
} from "./ReviewAttemptEvidence";

describe("review attempt interaction contract", () => {
  it("requires mode and pre-reveal confidence", () => {
    const draft = emptyAttemptDraft();
    expect(attemptDraftReady(draft)).toBe(false);
    expect(attemptDraftReady({
      ...draft,
      attemptMode: "paper",
      preConfidence: 2,
    })).toBe(true);
  });

  it("requires content for typed attempts and serializes finalized evidence", () => {
    const draft = {
      ...emptyAttemptDraft(),
      attemptMode: "typed" as const,
      attemptText: "",
      preConfidence: 1,
    };
    expect(attemptDraftReady(draft)).toBe(false);

    const completed = {
      ...draft,
      attemptText: "先列条件",
      durationSeconds: 31,
    };
    expect(attemptDraftReady(completed)).toBe(true);
    expect(attemptEvidence(completed)).toEqual({
      attemptMode: "typed",
      attemptText: "先列条件",
      attemptDurationSeconds: 31,
      preConfidence: 1,
    });
  });
});
