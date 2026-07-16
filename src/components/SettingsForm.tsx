"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpenCheck, CalendarDays, Check, Clock3, Flag, Plus, Target, Trash2 } from "lucide-react";
import { saveSettingsAction } from "@/app/actions/settings";
import type { AppSettings, ExamCountdown } from "@/lib/repo/settings";

const WEEKLY_PRESETS = [300, 600, 900, 1200];
const REVIEW_PRESETS = [10, 20, 30, 50];

export function SettingsForm({ initial, subjects }: { initial: AppSettings; subjects: Array<{ code: string; name: string }> }) {
  const router = useRouter();
  const [countdowns, setCountdowns] = useState<ExamCountdown[]>(
    initial.examCountdowns.length ? initial.examCountdowns : [{ name: "", date: "" }],
  );
  const [reviewLimit, setReviewLimit] = useState(initial.dailyReviewLimit);
  const [learningGoal, setLearningGoal] = useState(initial.learningGoal);
  const [weeklyMinutes, setWeeklyMinutes] = useState(initial.weeklyMinutes);
  const [enabledSubjectCodes, setEnabledSubjectCodes] = useState(
    initial.enabledSubjectCodes.length ? initial.enabledSubjectCodes : subjects.map((subject) => subject.code),
  );
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
      learningGoal,
      weeklyMinutes,
      enabledSubjectCodes,
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
      <section className="card settingsLearningCard" aria-label="学习目标">
        <div className="settingsSectionHead">
          <span><Target size={17} /></span>
          <div><span className="sectionKicker">LEARNING DIRECTION</span><h2>学习目标</h2><p>确定主线目标、每周投入与当前科目。</p></div>
          <Link className="secondaryButton" href="/onboarding">按步骤设置</Link>
        </div>
        <div className="settingsGoalComposer">
          <label><span>当前最重要的结果</span>
            <input maxLength={120} onChange={(event) => setLearningGoal(event.target.value)} placeholder="例如：12 月前完成考研数学一轮复习，并稳定达到 120 分" value={learningGoal} />
          </label>
          <div className="settingsPacePicker"><div><Clock3 size={14} /><span>每周投入</span><strong>{Math.round(weeklyMinutes / 60 * 10) / 10} 小时</strong></div><div role="group" aria-label="每周投入预设">{WEEKLY_PRESETS.map((minutes) => <button aria-pressed={weeklyMinutes === minutes} className={weeklyMinutes === minutes ? "active" : undefined} key={minutes} onClick={() => setWeeklyMinutes(minutes)} type="button">{minutes / 60}h</button>)}</div><label><input aria-label="每周计划时长（分钟）" min="30" max="10080" onChange={(event) => setWeeklyMinutes(Number(event.target.value) || 30)} type="number" value={weeklyMinutes} /><span>分钟</span></label></div>
        </div>
        <fieldset className="subjectPicker">
          <legend>当前科目</legend>
          {subjects.map((subject) => (
            <label key={subject.code}>
              <input
                checked={enabledSubjectCodes.includes(subject.code)}
                onChange={(event) => setEnabledSubjectCodes((current) => event.target.checked ? [...new Set([...current, subject.code])] : current.filter((code) => code !== subject.code))}
                type="checkbox"
              />
              <span><b>{subject.code}</b>{subject.name}</span>
              {enabledSubjectCodes.includes(subject.code) ? <Check size={13} /> : null}
            </label>
          ))}
        </fieldset>
      </section>

      <section className="card settingsCountdownCard" aria-label="考试倒计时">
        <div className="settingsSectionHead">
          <span><Flag size={17} /></span>
          <div><span className="sectionKicker">MILESTONES</span><h2>考试倒计时</h2><p>主页按日期显示最近里程碑。</p></div>
          <span className="sectionHint">最多 5 个，主页按日期显示剩余天数</span>
        </div>
        <div className="countdownEditor">
          {countdowns.map((item, index) => (
            <div className="countdownEditorRow" key={index}>
              <span className="countdownIndex"><CalendarDays size={14} /></span>
              <label><span>考试名称</span><input aria-label="考试名称" value={item.name} onChange={(event) => updateCountdown(index, { name: event.target.value })} placeholder="例如：考研初试" /></label>
              <label><span>考试日期</span><input aria-label="考试日期" type="date" value={item.date} onChange={(event) => updateCountdown(index, { date: event.target.value })} /></label>
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

      <section className="card settingsReviewCard" aria-label="复习节奏">
        <div className="settingsSectionHead"><span><BookOpenCheck size={17} /></span><div><span className="sectionKicker">DAILY CAPACITY</span><h2>复习节奏</h2><p>设置每天能够稳定完成的主动回忆数量。</p></div></div>
        <div className="settingsReviewPicker"><div role="group" aria-label="每日复习上限预设">{REVIEW_PRESETS.map((limit) => <button aria-pressed={reviewLimit === limit} className={reviewLimit === limit ? "active" : undefined} key={limit} onClick={() => setReviewLimit(limit)} type="button"><strong>{limit}</strong><span>知识点</span></button>)}</div><label><span>自定义上限</span><input aria-label="每日复习上限" min="1" max="100" onChange={(event) => setReviewLimit(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} type="number" value={reviewLimit} /></label></div>
        <p className="settingsReviewHint"><BookOpenCheck size={14} />到期数量超过 {reviewLimit} 个时，队列按优先级安排，其余项目进入积压恢复提示。</p>
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
