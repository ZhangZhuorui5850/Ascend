"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAutosyncedFields } from "@/hooks/useAutosyncedFields";

type DayWorkspaceProps = {
  date: string;
  entry: Record<string, string>;
  draftVersions?: Record<string, number>;
};

export function DayWorkspace({ date, entry, draftVersions = {} }: DayWorkspaceProps) {
  const router = useRouter();
  const initialFields = useMemo(() => ({
    plan: entry.plan || "",
    diary: entry.diary || "",
    summary: entry.summary || "",
    blockers: entry.blockers || "",
    tomorrow: entry.tomorrow || "",
  }), [entry.blockers, entry.diary, entry.plan, entry.summary, entry.tomorrow]);
  const {
    fields: form,
    updateField,
    statusByField,
    globalStatus,
  } = useAutosyncedFields({
    scopeType: "day",
    scopeId: date,
    initial: initialFields,
    initialVersions: draftVersions,
  });
  const [sessionTitle, setSessionTitle] = useState("");
  const [minutes, setMinutes] = useState(50);
  const [mistakeTitle, setMistakeTitle] = useState("");

  function update(key: keyof typeof form, value: string) {
    updateField(key, value);
  }

  async function saveDay() {
    await fetch(`/api/day/${date}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    router.refresh();
  }

  async function addSession() {
    if (!sessionTitle.trim()) return;
    await fetch("/api/study-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ day: date, title: sessionTitle, durationMinutes: minutes }),
    });
    setSessionTitle("");
    router.refresh();
  }

  async function addMistake() {
    if (!mistakeTitle.trim()) return;
    await fetch("/api/mistakes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ day: date, title: mistakeTitle, cause: "待归因" }),
    });
    setMistakeTitle("");
    router.refresh();
  }

  return (
    <section className="card dayEditor">
      <div className="sectionTitle">
        <span className="eyebrow">Daily Hub</span>
        <h2>日记 / 总结</h2>
      </div>
      <p className={`syncStatus sync-${globalStatus}`}>自动同步：{syncLabel(globalStatus)}</p>
      <label className="field">
        今日计划
        <textarea value={form.plan} onChange={(event) => update("plan", event.target.value)} />
        <FieldStatus status={statusByField.plan} />
      </label>
      <label className="field">
        日记
        <textarea value={form.diary} onChange={(event) => update("diary", event.target.value)} />
        <FieldStatus status={statusByField.diary} />
      </label>
      <label className="field">
        晚间总结
        <textarea value={form.summary} onChange={(event) => update("summary", event.target.value)} />
        <FieldStatus status={statusByField.summary} />
      </label>
      <div className="grid2">
        <label className="field">
          阻塞
          <input value={form.blockers} onChange={(event) => update("blockers", event.target.value)} />
          <FieldStatus status={statusByField.blockers} />
        </label>
        <label className="field">
          明日第一步
          <input value={form.tomorrow} onChange={(event) => update("tomorrow", event.target.value)} />
          <FieldStatus status={statusByField.tomorrow} />
        </label>
      </div>
      <button className="primaryButton" onClick={saveDay} type="button">
        提交当天正式记录
      </button>

      <div className="inlineComposer">
        <input value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} placeholder="学习记录：PCA 推导重写" />
        <input value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} type="number" min="0" />
        <button onClick={addSession} type="button">添加学习</button>
      </div>
      <div className="inlineComposer">
        <input value={mistakeTitle} onChange={(event) => setMistakeTitle(event.target.value)} placeholder="错题：CNN 参数量漏 bias" />
        <button onClick={addMistake} type="button">添加错题</button>
      </div>
    </section>
  );
}

function FieldStatus({ status }: { status?: string }) {
  return <small className={`fieldStatus ${status === "error" ? "error" : ""}`}>{fieldStatusLabel(status)}</small>;
}

function fieldStatusLabel(status?: string) {
  if (status === "dirty") return "等待自动保存";
  if (status === "saving") return "保存中...";
  if (status === "saved") return "已保存草稿";
  if (status === "remote") return "已同步其它终端";
  if (status === "error") return "自动保存失败";
  return "自动保存";
}

function syncLabel(status: string) {
  if (status === "saving") return "保存中";
  if (status === "remote") return "已收到其它终端更新";
  if (status === "error") return "有字段失败";
  return "已保存草稿";
}
