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

type DraftSnapshot = { content?: string; version?: number };

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
  const fieldsRef = useRef(fields);
  const statusRef = useRef(statusByField);
  const scopeRef = useRef({ scopeType: input.scopeType, scopeId: input.scopeId });
  const versionRef = useRef<Record<string, number>>({});
  const pendingOpRef = useRef<Record<string, string>>({});
  const deviceId = useMemo(() => readOrCreateDeviceId(), []);

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

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
      const opId = crypto.randomUUID();
      pendingOpRef.current[fieldName] = opId;
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
            baseVersion: versionRef.current[fieldName] ?? 0,
            deviceId,
            opId,
          }),
        });
        if (!response.ok) throw new Error("Draft save failed");
        const draft = (await response.json()) as { version?: number };
        versionRef.current[fieldName] = Math.max(versionRef.current[fieldName] ?? 0, Number(draft.version ?? 0));
        if (pendingOpRef.current[fieldName] === opId && fieldsRef.current[field] === value) {
          delete pendingOpRef.current[fieldName];
          setStatusByField((current) => ({ ...current, [field]: "saved" }));
        }
      } catch {
        if (pendingOpRef.current[fieldName] === opId) {
          delete pendingOpRef.current[fieldName];
          setStatusByField((current) => ({ ...current, [field]: "error" }));
        }
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

      const snapshot = JSON.parse(change.snapshot_json) as DraftSnapshot;
      const remoteVersion = Number(snapshot.version ?? 0);
      if (remoteVersion <= (versionRef.current[field] ?? 0)) continue;
      versionRef.current[field] = remoteVersion;
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
