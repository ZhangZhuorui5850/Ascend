"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type FieldStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "remote";

type SyncChange = {
  seq: number;
  entity_type: string;
  entity_id: string;
  snapshot_json: string;
  device_id?: string | null;
};

export function useAutosyncedFields<T extends Record<string, string>>(input: {
  scopeType: string;
  scopeId: string;
  initial: T;
  debounceMs?: number;
  pollMs?: number;
}) {
  const [fields, setFields] = useState<T>(input.initial);
  const [statusByField, setStatusByField] = useState<Record<keyof T, FieldStatus>>({} as Record<keyof T, FieldStatus>);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const latestSeq = useRef(0);
  const statusRef = useRef(statusByField);
  const scopeRef = useRef({ scopeType: input.scopeType, scopeId: input.scopeId });
  const deviceId = useMemo(() => readOrCreateDeviceId(), []);

  useEffect(() => {
    statusRef.current = statusByField;
  }, [statusByField]);

  useEffect(() => {
    scopeRef.current = { scopeType: input.scopeType, scopeId: input.scopeId };
  }, [input.scopeId, input.scopeType]);

  useEffect(() => {
    void fetch("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: deviceId, name: navigator.platform || "Browser" }),
    });
  }, [deviceId]);

  function updateField<K extends keyof T>(field: K, value: T[K]) {
    setFields((current) => ({ ...current, [field]: value }));
    setStatusByField((current) => ({ ...current, [field]: "dirty" }));

    const fieldName = String(field);
    clearTimeout(timers.current[fieldName]);
    timers.current[fieldName] = setTimeout(async () => {
      setStatusByField((current) => ({ ...current, [field]: "saving" }));
      try {
        const response = await fetch("/api/drafts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            scopeType: input.scopeType,
            scopeId: input.scopeId,
            field: fieldName,
            content: value,
            baseVersion: 0,
            deviceId,
            opId: crypto.randomUUID(),
          }),
        });
        if (!response.ok) throw new Error("Draft save failed");
        setStatusByField((current) => ({ ...current, [field]: "saved" }));
      } catch {
        setStatusByField((current) => ({ ...current, [field]: "error" }));
      }
    }, input.debounceMs ?? 600);
  }

  const applyRemoteChanges = useCallback((changes: SyncChange[]) => {
    for (const change of changes) {
      if (change.entity_type !== "draft" || change.device_id === deviceId) continue;
      const [scopeType, scopeId, field] = change.entity_id.split(":");
      const currentScope = scopeRef.current;
      if (scopeType !== currentScope.scopeType || scopeId !== currentScope.scopeId || !field) continue;
      if (!Object.prototype.hasOwnProperty.call(input.initial, field)) continue;

      const fieldKey = field as keyof T;
      const currentStatus = statusRef.current[fieldKey];
      if (currentStatus === "dirty" || currentStatus === "saving") continue;

      const snapshot = JSON.parse(change.snapshot_json) as { content?: string };
      setFields((current) => ({ ...current, [fieldKey]: String(snapshot.content ?? "") }));
      setStatusByField((current) => ({ ...current, [fieldKey]: "remote" }));
    }
  }, [deviceId, input.initial]);

  useEffect(() => {
    let stopped = false;

    async function poll() {
      try {
        const response = await fetch(`/api/sync/pull?sinceSeq=${latestSeq.current}`);
        if (!response.ok) return;
        const payload = (await response.json()) as { latestSeq: number; changes: SyncChange[] };
        latestSeq.current = payload.latestSeq;
        applyRemoteChanges(payload.changes);
      } catch {
        // Polling is best-effort; direct saves still surface field-level errors.
      }
    }

    const interval = window.setInterval(() => {
      if (!stopped) void poll();
    }, input.pollMs ?? 1500);
    void poll();

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [applyRemoteChanges, input.pollMs]);

  useEffect(() => {
    const timerStore = timers.current;
    return () => {
      for (const timer of Object.values(timerStore)) clearTimeout(timer);
    };
  }, []);

  const statuses = Object.values(statusByField);
  const globalStatus = statuses.includes("error")
    ? "error"
    : statuses.includes("saving") || statuses.includes("dirty")
      ? "saving"
      : statuses.includes("remote")
        ? "remote"
        : "saved";

  return { fields, updateField, statusByField, globalStatus };
}

function readOrCreateDeviceId() {
  if (typeof window === "undefined") return "server";
  const key = "zgca.deviceId";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
}
