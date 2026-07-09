"use client";

import { useEffect, useRef, useState } from "react";
import { saveDayEntry } from "@/app/actions/day";
import type { DayEntry, DayField } from "@/lib/repo/days";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY = 800;

export function DayJournal({ date, entry }: { date: string; entry: DayEntry }) {
  const [fields, setFields] = useState<Partial<Record<DayField, string>>>({
    summary: entry.summary || "",
    tomorrow: entry.tomorrow || "",
  });
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldsRef = useRef(fields);

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function update(key: DayField, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setStatus("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY);
  }

  async function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatus("saving");
    const result = await saveDayEntry(date, fieldsRef.current);
    setStatus(result.ok ? "saved" : "error");
  }

  function blurFlush() {
    if (status === "dirty") void flush();
  }

  return (
    <section className="card dayJournal" aria-label="当日复盘">
      <div className="sectionTitle">
        <h2>日记与复盘</h2>
        <span className={`saveStatus save-${status}`}>{statusLabel(status)}</span>
      </div>
      <label className="field">
        晚间总结
        <textarea
          value={fields.summary || ""}
          onChange={(event) => update("summary", event.target.value)}
          onBlur={blurFlush}
          placeholder="今天真正学会了什么？哪里是假会？明天怎么验证？"
        />
      </label>
      <label className="field">
        明日第一步
        <input
          value={fields.tomorrow || ""}
          onChange={(event) => update("tomorrow", event.target.value)}
          onBlur={blurFlush}
          placeholder="明天打开工作台后的第一件事"
        />
      </label>
    </section>
  );
}

function statusLabel(status: SaveStatus): string {
  if (status === "dirty") return "编辑中…";
  if (status === "saving") return "保存中…";
  if (status === "saved") return "已保存";
  if (status === "error") return "保存失败，请重试";
  return "自动保存";
}
