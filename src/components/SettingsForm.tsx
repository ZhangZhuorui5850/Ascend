"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveSettingsAction } from "@/app/actions/settings";
import type { AppSettings, ExamCountdown } from "@/lib/repo/settings";

export function SettingsForm({ initial }: { initial: AppSettings }) {
  const router = useRouter();
  const [countdowns, setCountdowns] = useState<ExamCountdown[]>(
    initial.examCountdowns.length ? initial.examCountdowns : [{ name: "", date: "" }],
  );
  const [reviewLimit, setReviewLimit] = useState(initial.dailyReviewLimit);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function updateCountdown(index: number, patch: Partial<ExamCountdown>) {
    setCountdowns((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const result = await saveSettingsAction({
      examCountdowns: countdowns.filter((item) => item.name.trim() && item.date),
      dailyReviewLimit: reviewLimit,
    });
    setBusy(false);
    if (result.ok) {
      setMessage("已保存");
      router.refresh();
    } else {
      setError(result.error || "保存失败");
    }
  }

  return (
    <div className="settingsStack">
      <section className="card" aria-label="考试倒计时">
        <div className="sectionTitle">
          <h2>考试倒计时</h2>
          <span className="sectionHint">最多 5 个，主页按日期显示剩余天数</span>
        </div>
        <div className="countdownEditor">
          {countdowns.map((item, index) => (
            <div className="countdownEditorRow" key={index}>
              <input
                aria-label="考试名称"
                value={item.name}
                onChange={(event) => updateCountdown(index, { name: event.target.value })}
                placeholder="考试名称，如：笔试"
              />
              <input
                aria-label="考试日期"
                type="date"
                value={item.date}
                onChange={(event) => updateCountdown(index, { date: event.target.value })}
              />
              <button
                aria-label="删除这条倒计时"
                className="iconDanger"
                onClick={() => setCountdowns((current) => current.filter((_, i) => i !== index))}
                type="button"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {countdowns.length < 5 ? (
            <button
              className="secondaryButton"
              onClick={() => setCountdowns((current) => [...current, { name: "", date: "" }])}
              type="button"
            >
              <Plus size={14} />
              再加一个
            </button>
          ) : null}
        </div>
      </section>

      <section className="card" aria-label="复习节奏">
        <div className="sectionTitle">
          <h2>复习节奏</h2>
        </div>
        <label className="inlineField settingsLimit">
          每日复习上限
          <input
            min="1"
            max="100"
            onChange={(event) => setReviewLimit(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
            type="number"
            value={reviewLimit}
          />
          个知识点
        </label>
        <p className="hint">到期数量超过上限时，队列按优先级先安排前面的，其余顺延显示在提示里。</p>
      </section>

      {error ? <p className="formError">{error}</p> : null}
      <div className="settingsActions">
        <button className="primaryButton" disabled={busy} onClick={() => void save()} type="button">
          {busy ? "保存中…" : "保存设置"}
        </button>
        {message ? <span className="saveStatus save-saved">{message}</span> : null}
      </div>
    </div>
  );
}
