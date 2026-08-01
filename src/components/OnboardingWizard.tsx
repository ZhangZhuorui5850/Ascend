"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, Target } from "lucide-react";
import { completeOnboardingAction } from "@/app/actions/settings";
import type { AppSettings } from "@/lib/repo/settings";

type SubjectOption = { code: string; name: string };
const WEEKLY_PRESETS = [300, 600, 900, 1200];
const REVIEW_PRESETS = [10, 20, 30, 50];

export function OnboardingWizard({ initial, subjects }: { initial: AppSettings; subjects: SubjectOption[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(initial.learningGoal);
  const [weeklyMinutes, setWeeklyMinutes] = useState(initial.weeklyMinutes);
  const [enabled, setEnabled] = useState(
    initial.enabledSubjectCodes.length ? initial.enabledSubjectCodes : subjects.slice(0, 3).map((subject) => subject.code),
  );
  const [examName, setExamName] = useState(initial.examCountdowns[0]?.name || "");
  const [examDate, setExamDate] = useState(initial.examCountdowns[0]?.date || "");
  const [examSubjectCode, setExamSubjectCode] = useState(initial.examCountdowns[0]?.subjectCode || "");
  const [examTargetScore, setExamTargetScore] = useState(initial.examCountdowns[0]?.targetScore?.toString() || "");
  const [reviewLimit, setReviewLimit] = useState(initial.dailyReviewLimit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const steps = ["目标", "科目", "节奏", "确认"];

  function next() {
    setError("");
    if (step === 0 && !goal.trim()) return setError("请写下当前最重要的学习目标");
    if (step === 1 && !enabled.length) return setError("请至少选择一个当前科目");
    setStep((current) => Math.min(3, current + 1));
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await completeOnboardingAction({
      learningGoal: goal,
      weeklyMinutes,
      enabledSubjectCodes: enabled,
      examCountdowns: examName.trim() && examDate ? [{ name: examName, date: examDate, subjectCode: examSubjectCode || undefined, targetScore: examTargetScore ? Number(examTargetScore) : undefined }] : [],
      dailyReviewLimit: reviewLimit,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error || "保存失败");
    router.push("/");
    router.refresh();
  }

  return (
    <section className="onboardingCard">
      <ol className="onboardingSteps" aria-label="学习设置进度">
        {steps.map((label, index) => (
          <li className={index === step ? "active" : index < step ? "done" : ""} key={label}>
            <span>{index < step ? <Check size={14} /> : index + 1}</span>{label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="onboardingPane">
          <span className="eyebrow">STEP 1 · 目标</span>
          <h1>这段时间，你想登上哪座峰？</h1>
          <p>目标会显示在学习设置中，帮助你判断今天最值得推进的内容。</p>
          <label className="fieldLabel">当前学习目标
            <textarea autoFocus maxLength={120} onChange={(event) => setGoal(event.target.value)} placeholder="例如：12 月前完成考研数学一轮复习，并稳定达到 120 分" rows={3} value={goal} />
          </label>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="onboardingPane">
          <span className="eyebrow">STEP 2 · 科目</span>
          <h1>选择当前主线科目</h1>
          <p>先聚焦正在推进的科目，完整知识库仍会保留。</p>
          <div className="onboardingSubjects">
            {subjects.map((subject) => {
              const selected = enabled.includes(subject.code);
              return (
                <button className={selected ? "selected" : ""} key={subject.code} onClick={() => setEnabled((current) => selected ? current.filter((code) => code !== subject.code) : [...current, subject.code])} type="button">
                  <b>{subject.code}</b><span>{subject.name}</span>{selected ? <Check size={16} /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="onboardingPane">
          <span className="eyebrow">STEP 3 · 节奏</span>
          <h1>设定可持续的每周节奏</h1>
          <div className="onboardingPaceBuilder">
            <section><div className="onboardingPaceHead"><Clock3 size={15} /><span><strong>每周学习投入</strong><small>当前 {Math.round(weeklyMinutes / 60 * 10) / 10} 小时</small></span></div><div className="onboardingPresetGrid" role="group" aria-label="每周学习投入">{WEEKLY_PRESETS.map((minutes) => <button aria-pressed={weeklyMinutes === minutes} className={weeklyMinutes === minutes ? "active" : undefined} key={minutes} onClick={() => setWeeklyMinutes(minutes)} type="button"><strong>{minutes / 60}</strong><span>小时</span>{weeklyMinutes === minutes ? <Check size={12} /> : null}</button>)}</div></section>
            <section><div className="onboardingPaceHead"><Target size={15} /><span><strong>每日复习容量</strong><small>当前 {reviewLimit} 项（知识点 + 错题）</small></span></div><div className="onboardingPresetGrid" role="group" aria-label="每日复习容量">{REVIEW_PRESETS.map((limit) => <button aria-pressed={reviewLimit === limit} className={reviewLimit === limit ? "active" : undefined} key={limit} onClick={() => setReviewLimit(limit)} type="button"><strong>{limit}</strong><span>项</span>{reviewLimit === limit ? <Check size={12} /> : null}</button>)}</div></section>
            <section className="onboardingExamMilestone"><div className="onboardingPaceHead"><CalendarDays size={15} /><span><strong>最近考试里程碑</strong><small>用于首页倒计时与冲刺优先级</small></span></div><div><label><span>考试名称</span><input onChange={(event) => setExamName(event.target.value)} placeholder="例如：期末考试" value={examName} /></label><label><span>考试日期</span><input onChange={(event) => setExamDate(event.target.value)} type="date" value={examDate} /></label><label><span>关联科目</span><select aria-label="考试关联科目" onChange={(event) => setExamSubjectCode(event.target.value)} value={examSubjectCode}><option value="">综合考试</option>{subjects.filter((subject) => enabled.includes(subject.code)).map((subject) => <option key={subject.code} value={subject.code}>{subject.code} · {subject.name}</option>)}</select></label><label><span>目标分数</span><input max="1000" min="1" onChange={(event) => setExamTargetScore(event.target.value)} placeholder="例如 120" type="number" value={examTargetScore} /></label></div></section>
            <details className="onboardingCustomPace"><summary>精确设置分钟数与复习上限</summary><div><label><span>每周分钟</span><input min="30" max="10080" onChange={(event) => setWeeklyMinutes(Number(event.target.value) || 30)} type="number" value={weeklyMinutes} /></label><label><span>每日复习项</span><input min="1" max="100" onChange={(event) => setReviewLimit(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} type="number" value={reviewLimit} /></label></div></details>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="onboardingPane onboardingConfirm">
          <Target size={34} />
          <span className="eyebrow">STEP 4 · 确认</span>
          <h1>学习工作台已经准备好</h1>
          <dl>
            <div><dt>目标</dt><dd>{goal}</dd></div>
            <div><dt>科目</dt><dd>{enabled.join("、")}</dd></div>
            <div><dt>每周节奏</dt><dd>{weeklyMinutes} 分钟</dd></div>
            <div><dt>每日复习</dt><dd>最多 {reviewLimit} 项知识点与错题</dd></div>
          </dl>
        </div>
      ) : null}

      {error ? <p className="formError">{error}</p> : null}
      <div className="onboardingActions">
        {step > 0 ? <button className="secondaryButton" onClick={() => setStep((current) => current - 1)} type="button"><ArrowLeft size={15} />上一步</button> : <span />}
        {step < 3 ? <button className="primaryButton" onClick={next} type="button">下一步<ArrowRight size={15} /></button> : <button className="primaryButton" disabled={busy} onClick={() => void finish()} type="button">{busy ? "保存中…" : "保存并进入工作台"}<ArrowRight size={15} /></button>}
      </div>
    </section>
  );
}
