"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BookOpenCheck, CalendarDays, Check, Clock3, Flag, Plus, Target, Trash2 } from "lucide-react";
import { saveSettingsAction } from "@/app/actions/settings";
import { usePresenceAnimation } from "@/components/usePresenceAnimation";
import type { AppSettings, ExamCountdown } from "@/lib/repo/settings";

const WEEKLY_PRESETS = [300, 600, 900, 1200];
const REVIEW_PRESETS = [10, 20, 30, 50];
type CountdownDraft = ExamCountdown & { clientKey: string };

export function SettingsForm({ initial, onboardingHref = "/onboarding", subjects }: { initial: AppSettings; onboardingHref?: string; subjects: Array<{ code: string; name: string }> }) {
  const router = useRouter();
  const [countdowns, setCountdowns] = useState<CountdownDraft[]>(() => (
    initial.examCountdowns.length
      ? initial.examCountdowns.map((item, index) => ({ ...item, clientKey: `saved-${index}` }))
      : [{ name: "", date: "", clientKey: "draft-0" }]
  ));
  const [enteringCountdownKeys, setEnteringCountdownKeys] = useState<Set<string>>(() => new Set());
  const [leavingCountdownKeys, setLeavingCountdownKeys] = useState<Set<string>>(() => new Set());
  const countdownKeyRef = useRef(1);
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
      examCountdowns: countdowns
        .filter((item) => item.name.trim() && item.date)
        .map(({ name, date, subjectCode, targetScore }) => ({ name, date, subjectCode, targetScore })),
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
          <Link className="secondaryButton" href={onboardingHref}>按步骤设置</Link>
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
            <CountdownRow
              entering={enteringCountdownKeys.has(item.clientKey)}
              item={item}
              key={item.clientKey}
              leaving={leavingCountdownKeys.has(item.clientKey)}
              onEnterComplete={() => setEnteringCountdownKeys((current) => withoutKey(current, item.clientKey))}
              onRemove={() => setLeavingCountdownKeys((current) => new Set(current).add(item.clientKey))}
              onRemoveComplete={() => {
                setCountdowns((current) => current.filter((countdown) => countdown.clientKey !== item.clientKey));
                setLeavingCountdownKeys((current) => withoutKey(current, item.clientKey));
              }}
              onUpdate={(patch) => updateCountdown(index, patch)}
              subjects={subjects}
            />
          ))}
          {countdowns.length < 5 ? (
            <button
              className="secondaryButton"
              onClick={() => {
                const clientKey = `draft-${countdownKeyRef.current++}`;
                setEnteringCountdownKeys((current) => new Set(current).add(clientKey));
                setCountdowns((current) => [...current, { name: "", date: "", subjectCode: "", clientKey }]);
              }}
              type="button"
            >
              <Plus size={14} />
              再加一个
            </button>
          ) : null}
        </div>
      </section>

      <section className="card settingsReviewCard" aria-label="复习节奏">
        <div className="settingsSectionHead"><span><BookOpenCheck size={17} /></span><div><span className="sectionKicker">DAILY CAPACITY</span><h2>复习节奏</h2><p>设置每天能够稳定完成的知识点复习与错题回炉总量。</p></div></div>
        <div className="settingsReviewPicker"><div role="group" aria-label="每日复习上限预设">{REVIEW_PRESETS.map((limit) => <button aria-pressed={reviewLimit === limit} className={reviewLimit === limit ? "active" : undefined} key={limit} onClick={() => setReviewLimit(limit)} type="button"><strong>{limit}</strong><span>项</span></button>)}</div><label><span>自定义上限</span><input aria-label="每日复习上限" min="1" max="100" onChange={(event) => setReviewLimit(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} type="number" value={reviewLimit} /></label></div>
        <p className="settingsReviewHint"><BookOpenCheck size={14} />知识点与错题的到期总数超过 {reviewLimit} 项时，队列按优先级安排，其余项目进入积压恢复提示。</p>
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

function CountdownRow({ item, subjects, entering, leaving, onUpdate, onRemove, onEnterComplete, onRemoveComplete }: {
  item: CountdownDraft;
  subjects: Array<{ code: string; name: string }>;
  entering: boolean;
  leaving: boolean;
  onUpdate: (patch: Partial<ExamCountdown>) => void;
  onRemove: () => void;
  onEnterComplete: () => void;
  onRemoveComplete: () => void;
}) {
  const [elementRef, onAnimationEnd] = usePresenceAnimation<HTMLDivElement>({ entering, leaving, onEnterComplete, onExitComplete: onRemoveComplete });
  return (
    <div
      className="countdownEditorRow summitCountdownRow"
      data-entering={entering ? "" : undefined}
      data-leaving={leaving ? "" : undefined}
      onAnimationEnd={onAnimationEnd}
      ref={elementRef}
    >
      <span className="countdownIndex"><CalendarDays size={14} /></span>
      <label><span>考试名称</span><input aria-label="考试名称" value={item.name} onChange={(event) => onUpdate({ name: event.target.value })} placeholder="例如：考研初试" /></label>
      <label><span>考试日期</span><input aria-label="考试日期" type="date" value={item.date} onChange={(event) => onUpdate({ date: event.target.value })} /></label>
      <label><span>关联科目</span><select aria-label="考试关联科目" value={item.subjectCode || ""} onChange={(event) => onUpdate({ subjectCode: event.target.value || undefined })}><option value="">综合考试</option>{subjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.code} · {subject.name}</option>)}</select></label>
      <label><span>目标分数</span><input aria-label="考试目标分数" min="1" max="1000" type="number" value={item.targetScore || ""} onChange={(event) => onUpdate({ targetScore: event.target.value ? Number(event.target.value) : undefined })} placeholder="120" /></label>
      <button aria-label="删除这条倒计时" className="iconDanger" disabled={leaving} onClick={onRemove} type="button"><Trash2 size={14} /></button>
    </div>
  );
}

function withoutKey(keys: Set<string>, key: string): Set<string> {
  const next = new Set(keys);
  next.delete(key);
  return next;
}
