import { describe, expect, it } from "vitest";
import {
  hasUnsavedDayJournalChanges,
  initialDayJournalAutosaveState,
  nextDayJournalRevision,
  reduceDayJournalAutosave,
} from "./day-journal-autosave";

describe("day journal autosave state", () => {
  it("does not let an older success mark newer edits as saved", () => {
    let state = reduceDayJournalAutosave(initialDayJournalAutosaveState(), { type: "edit", revision: 10 });
    state = reduceDayJournalAutosave(state, { type: "save-started", revision: 10 });
    state = reduceDayJournalAutosave(state, { type: "edit", revision: 11 });
    state = reduceDayJournalAutosave(state, { type: "save-succeeded", revision: 10 });

    expect(state).toEqual({ revision: 11, acknowledgedRevision: 10, status: "dirty" });
    expect(hasUnsavedDayJournalChanges(state)).toBe(true);
  });

  it("ignores an expired failure while the newest revision is saving", () => {
    let state = reduceDayJournalAutosave(initialDayJournalAutosaveState(), { type: "edit", revision: 20 });
    state = reduceDayJournalAutosave(state, { type: "edit", revision: 21 });
    state = reduceDayJournalAutosave(state, { type: "save-started", revision: 21 });
    state = reduceDayJournalAutosave(state, { type: "save-failed", revision: 20 });

    expect(state.status).toBe("saving");
  });

  it("keeps a failed revision dirty until an explicit retry succeeds", () => {
    let state = reduceDayJournalAutosave(initialDayJournalAutosaveState(), { type: "edit", revision: 30 });
    state = reduceDayJournalAutosave(state, { type: "save-started", revision: 30 });
    state = reduceDayJournalAutosave(state, { type: "save-failed", revision: 30 });
    expect(state.status).toBe("error");
    expect(hasUnsavedDayJournalChanges(state)).toBe(true);

    state = reduceDayJournalAutosave(state, { type: "save-started", revision: 30 });
    state = reduceDayJournalAutosave(state, { type: "save-succeeded", revision: 30 });
    expect(state.status).toBe("saved");
    expect(hasUnsavedDayJournalChanges(state)).toBe(false);
  });

  it("creates a monotonic safe revision when the wall clock does not advance", () => {
    expect(nextDayJournalRevision(1_900_000_000_000_000, 1_800_000_000_000)).toBe(1_900_000_000_000_001);
  });
});
