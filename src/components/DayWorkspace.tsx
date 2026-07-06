"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DayWorkspaceProps = {
  date: string;
  entry: Record<string, string>;
};

export function DayWorkspace({ date, entry }: DayWorkspaceProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    plan: entry.plan || "",
    diary: entry.diary || "",
    summary: entry.summary || "",
    blockers: entry.blockers || "",
    tomorrow: entry.tomorrow || "",
  });
  const [sessionTitle, setSessionTitle] = useState("");
  const [minutes, setMinutes] = useState(50);
  const [mistakeTitle, setMistakeTitle] = useState("");

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
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
      <label className="field">
        今日计划
        <textarea value={form.plan} onChange={(event) => update("plan", event.target.value)} />
      </label>
      <label className="field">
        日记
        <textarea value={form.diary} onChange={(event) => update("diary", event.target.value)} />
      </label>
      <label className="field">
        晚间总结
        <textarea value={form.summary} onChange={(event) => update("summary", event.target.value)} />
      </label>
      <div className="grid2">
        <label className="field">
          阻塞
          <input value={form.blockers} onChange={(event) => update("blockers", event.target.value)} />
        </label>
        <label className="field">
          明日第一步
          <input value={form.tomorrow} onChange={(event) => update("tomorrow", event.target.value)} />
        </label>
      </div>
      <button className="primaryButton" onClick={saveDay} type="button">
        保存当天
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
