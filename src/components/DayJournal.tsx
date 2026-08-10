"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  dayJournalStatusLabel,
  hasUnsavedDayJournalChanges,
  initialDayJournalAutosaveState,
  nextDayJournalRevision,
  reduceDayJournalAutosave,
  type DayJournalAutosaveEvent,
  type DayJournalAutosavePayload,
  type DayJournalAutosaveState,
} from "@/lib/day-journal-autosave";
import type { DayEntry, DayField } from "@/lib/repo/days";

const AUTOSAVE_DELAY = 800;
const CLIENT_CLOCK_PREFIX = "ascend:day-journal-autosave:";

type ClientClock = { clientId: string; lastRevision: number };

export function DayJournal({ date, entry }: { date: string; entry: DayEntry }) {
  const initialFields: Partial<Record<DayField, string>> = {
    summary: entry.summary || "",
    tomorrow: entry.tomorrow || "",
  };
  const [fields, setFields] = useState(initialFields);
  const [saveState, setSaveState] = useState<DayJournalAutosaveState>(initialDayJournalAutosaveState);
  const saveStateRef = useRef<DayJournalAutosaveState>(initialDayJournalAutosaveState());
  const fieldsRef = useRef(initialFields);
  const clientClockRef = useRef<ClientClock | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const mountedRef = useRef(true);

  const applySaveEvent = useCallback((event: DayJournalAutosaveEvent) => {
    const next = reduceDayJournalAutosave(saveStateRef.current, event);
    saveStateRef.current = next;
    if (mountedRef.current) setSaveState(next);
  }, []);

  const ensureClientClock = useCallback((): ClientClock => {
    if (clientClockRef.current) return clientClockRef.current;
    const storageKey = `${CLIENT_CLOCK_PREFIX}${date}`;
    let stored: Partial<ClientClock> | null = null;
    try {
      stored = JSON.parse(sessionStorage.getItem(storageKey) || "null") as Partial<ClientClock> | null;
    } catch {
      // A blocked or corrupt sessionStorage must not disable saving.
    }
    const clientId = typeof stored?.clientId === "string" && /^[a-zA-Z0-9._:-]{1,120}$/.test(stored.clientId)
      ? stored.clientId
      : createClientId();
    const lastRevision = Number.isSafeInteger(stored?.lastRevision) && Number(stored?.lastRevision) >= 0
      ? Number(stored?.lastRevision)
      : 0;
    clientClockRef.current = { clientId, lastRevision };
    return clientClockRef.current;
  }, [date]);

  const persistClientClock = useCallback((clock: ClientClock) => {
    try {
      sessionStorage.setItem(`${CLIENT_CLOCK_PREFIX}${date}`, JSON.stringify(clock));
    } catch {
      // The in-memory monotonic clock still protects this mounted component.
    }
  }, [date]);

  const buildPayload = useCallback((revision: number): DayJournalAutosavePayload => ({
    date,
    clientId: ensureClientClock().clientId,
    revision,
    fields: { ...fieldsRef.current },
  }), [date, ensureClientClock]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inFlightRef.current || !hasUnsavedDayJournalChanges(saveStateRef.current)) return;

    const revision = saveStateRef.current.revision;
    const payload = buildPayload(revision);
    applySaveEvent({ type: "save-started", revision });

    const request = (async () => {
      try {
        await postAutosave(payload);
        applySaveEvent({ type: "save-succeeded", revision });
      } catch {
        applySaveEvent({ type: "save-failed", revision });
      } finally {
        inFlightRef.current = null;
        if (saveStateRef.current.revision > revision) {
          queueMicrotask(() => void flushRef.current());
        }
      }
    })();
    inFlightRef.current = request;
    await request;
  }, [applySaveEvent, buildPayload]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const flushForExit = useCallback(() => {
    if (!hasUnsavedDayJournalChanges(saveStateRef.current)) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const payload = buildPayload(saveStateRef.current.revision);
    const body = JSON.stringify(payload);
    const queued = typeof navigator.sendBeacon === "function"
      && navigator.sendBeacon("/api/day-entry", new Blob([body], { type: "text/plain;charset=UTF-8" }));
    if (!queued) void postAutosave(payload, true).catch(() => undefined);
  }, [buildPayload]);

  useEffect(() => {
    mountedRef.current = true;
    const handlePageHide = () => flushForExit();
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedDayJournalChanges(saveStateRef.current)) return;
      flushForExit();
      event.preventDefault();
      event.returnValue = "";
      queueMicrotask(() => void flushRef.current());
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushForExit();
      else void flushRef.current();
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      flushForExit();
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushForExit]);

  function update(key: DayField, value: string) {
    const nextFields = { ...fieldsRef.current, [key]: value };
    fieldsRef.current = nextFields;
    setFields(nextFields);
    const clock = ensureClientClock();
    clock.lastRevision = nextDayJournalRevision(clock.lastRevision);
    persistClientClock(clock);
    applySaveEvent({ type: "edit", revision: clock.lastRevision });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushRef.current(), AUTOSAVE_DELAY);
  }

  return (
    <section className="card dayJournal" aria-label="当日复盘">
      <div className="sectionTitle">
        <h2>日记与复盘</h2>
        <div className="saveStatusGroup">
          <span
            aria-atomic="true"
            aria-live="polite"
            className={`saveStatus save-${saveState.status}`}
            role="status"
          >
            {dayJournalStatusLabel(saveState.status)}
          </span>
          {saveState.status === "error" ? (
            <button className="saveRetry" onClick={() => void flush()} type="button">重试保存</button>
          ) : null}
        </div>
      </div>
      <label className="field">
        晚间总结
        <textarea
          value={fields.summary || ""}
          onChange={(event) => update("summary", event.target.value)}
          onBlur={() => void flush()}
          placeholder="今天真正学会了什么？哪里是假会？明天怎么验证？"
        />
      </label>
      <label className="field">
        明日第一步
        <input
          value={fields.tomorrow || ""}
          onChange={(event) => update("tomorrow", event.target.value)}
          onBlur={() => void flush()}
          placeholder="明天打开工作台后的第一件事"
        />
      </label>
    </section>
  );
}

async function postAutosave(payload: DayJournalAutosavePayload, keepalive = false): Promise<void> {
  const response = await fetch("/api/day-entry", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    keepalive,
  });
  if (!response.ok) throw new Error(`Autosave failed with ${response.status}`);
  const result = await response.json() as { ok?: boolean };
  if (!result.ok) throw new Error("Autosave was rejected");
}

function createClientId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
