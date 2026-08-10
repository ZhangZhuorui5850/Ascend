import type { DayField } from "./repo/days";

export type DayJournalSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export type DayJournalAutosaveState = {
  revision: number;
  acknowledgedRevision: number;
  status: DayJournalSaveStatus;
};

export type DayJournalAutosaveEvent =
  | { type: "edit"; revision: number }
  | { type: "save-started"; revision: number }
  | { type: "save-succeeded"; revision: number }
  | { type: "save-failed"; revision: number };

export type DayJournalAutosavePayload = {
  date: string;
  clientId: string;
  revision: number;
  fields: Partial<Record<DayField, string>>;
};

export function initialDayJournalAutosaveState(): DayJournalAutosaveState {
  return { revision: 0, acknowledgedRevision: 0, status: "idle" };
}

export function reduceDayJournalAutosave(
  state: DayJournalAutosaveState,
  event: DayJournalAutosaveEvent,
): DayJournalAutosaveState {
  if (event.type === "edit") {
    if (event.revision <= state.revision) return state;
    return { ...state, revision: event.revision, status: "dirty" };
  }

  if (event.type === "save-started") {
    if (event.revision !== state.revision || event.revision <= state.acknowledgedRevision) return state;
    return { ...state, status: "saving" };
  }

  if (event.type === "save-succeeded") {
    const acknowledgedRevision = Math.max(state.acknowledgedRevision, event.revision);
    return {
      ...state,
      acknowledgedRevision,
      status: acknowledgedRevision >= state.revision ? "saved" : "dirty",
    };
  }

  if (event.revision !== state.revision || event.revision <= state.acknowledgedRevision) return state;
  return { ...state, status: "error" };
}

export function hasUnsavedDayJournalChanges(state: DayJournalAutosaveState): boolean {
  return state.revision > state.acknowledgedRevision;
}

export function nextDayJournalRevision(previous: number, now = Date.now()): number {
  return Math.max(previous + 1, now * 1_000);
}

export function dayJournalStatusLabel(status: DayJournalSaveStatus): string {
  if (status === "dirty") return "有尚未保存的更改";
  if (status === "saving") return "正在保存…";
  if (status === "saved") return "已保存";
  if (status === "error") return "保存失败";
  return "自动保存已开启";
}
