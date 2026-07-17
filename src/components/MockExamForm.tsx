"use client";

import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type FormEvent } from "react";
import {
  BookOpenCheck,
  CalendarDays,
  Check,
  Clock3,
  Gauge,
  Save,
  Target,
} from "lucide-react";
import { createMockExamAction } from "@/app/actions/mock-exams";

const DURATION_PRESETS = [60, 90, 120, 180];
const REVIEW_TAGS = ["知识盲区", "审题偏差", "计算失误", "节奏失控", "表达不完整"];

export function MockExamForm({ subjects, today }: { subjects: Array<{ code: string; name: string }>; today: string }) {
  const router = useRouter();
  const [day, setDay] = useState(today);
  const [name, setName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [score, setScore] = useState(0);
  const [maxScore, setMaxScore] = useState(100);
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [concepts, setConcepts] = useState(0);
  const [calculation, setCalculation] = useState(0);
  const [time, setTime] = useState(0);
  const [reviewTags, setReviewTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const percent = maxScore > 0 ? Math.round(Math.min(100, Math.max(0, score / maxScore * 100)) * 10) / 10 : 0;
  const validScore = maxScore > 0 && score >= 0 && score <= maxScore;
  const ready = Boolean(name.trim() && validScore);
  const performance = percent >= 85 ? "状态稳定" : percent >= 70 ? "进入提升区" : percent >= 50 ? "需要定向补强" : "重建基础链路";

  function toggleReviewTag(tag: string) {
    setReviewTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    const reflection = [
      reviewTags.length ? `失分类型：${reviewTags.join("、")}` : "",
      notes.trim(),
    ].filter(Boolean).join("\n");
    const result = await createMockExamAction({
      day,
      name,
      subjectCode: subjectCode || undefined,
      score,
      maxScore,
      durationMinutes,
      notes: reflection,
      breakdown: [
        { label: "概念掌握", score: concepts, maxScore: 100 },
        { label: "计算准确", score: calculation, maxScore: 100 },
        { label: "时间控制", score: time, maxScore: 100 },
      ],
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "保存失败");
      return;
    }
    setName("");
    setScore(0);
    setConcepts(0);
    setCalculation(0);
    setTime(0);
    setReviewTags([]);
    setNotes("");
    router.refresh();
  }

  return (
    <form className="card mockExamForm" onSubmit={(event) => void save(event)}>
      <header className="mockExamComposerHead">
        <div className="mockExamComposerTitle">
          <span className="mockExamComposerIcon"><BookOpenCheck size={18} /></span>
          <div><span className="sectionKicker">NEW RESULT</span><h2>记录一次模考</h2><p>一次完成成绩归档、能力诊断与下一轮决策。</p></div>
        </div>
        <div className="mockExamLiveScore" aria-label={`实时得分率 ${percent}%`}>
          <span>得分率</span><strong>{percent}<small>%</small></strong><em>{performance}</em>
        </div>
      </header>

      <section className="mockExamIdentity" aria-labelledby="mock-exam-identity">
        <div className="mockExamSectionHead"><span>01</span><div><h3 id="mock-exam-identity">考试结果</h3><p>先记录这次考试的身份与最终成绩</p></div></div>
        <label className="mockExamTitleField">
          <span>模考名称</span>
          <input autoFocus maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="例如：七月第一次全真模考" value={name} />
        </label>
        <div className="mockExamMetaRow">
          <label><CalendarDays size={14} /><span>日期</span><input onChange={(event) => setDay(event.target.value)} type="date" value={day} /></label>
          <label><Target size={14} /><span>范围</span><select onChange={(event) => setSubjectCode(event.target.value)} value={subjectCode}><option value="">综合模考</option>{subjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.code} · {subject.name}</option>)}</select></label>
        </div>
        <div className={validScore ? "mockScoreComposer" : "mockScoreComposer invalid"}>
          <div className="mockScoreInputs">
            <label><span>本次得分</span><input aria-label="本次得分" min="0" onChange={(event) => setScore(Number(event.target.value) || 0)} step="0.5" type="number" value={score} /></label>
            <i>/</i>
            <label><span>试卷满分</span><input aria-label="试卷满分" min="1" onChange={(event) => setMaxScore(Math.max(1, Number(event.target.value) || 1))} step="0.5" type="number" value={maxScore} /></label>
          </div>
          <div className="mockScoreProgress"><i style={{ transform: `scaleX(${percent / 100})` }} /></div>
          {!validScore ? <small>本次得分需要位于 0 到满分之间</small> : <small>{score}/{maxScore} · {performance}</small>}
        </div>
        <div className="mockDurationPicker">
          <div><Clock3 size={14} /><span>计时用时</span></div>
          <div className="mockDurationOptions" role="group" aria-label="常用模考时长">
            {DURATION_PRESETS.map((minutes) => <button aria-pressed={durationMinutes === minutes} className={durationMinutes === minutes ? "active" : undefined} key={minutes} onClick={() => setDurationMinutes(minutes)} type="button">{minutes}<small>分钟</small></button>)}
          </div>
          <label className="mockDurationCustom"><input aria-label="自定义模考时长" min="0" onChange={(event) => setDurationMinutes(Math.max(0, Number(event.target.value) || 0))} type="number" value={durationMinutes} /><span>分钟</span></label>
        </div>
      </section>

      <section className="mockExamDiagnosis" aria-labelledby="mock-exam-diagnosis">
        <div className="mockExamSectionHead"><span>02</span><div><h3 id="mock-exam-diagnosis">能力诊断</h3><p>根据答题表现评估三个可训练维度</p></div></div>
        <div className="mockExamBreakdown">
          <CapabilityRating icon={<BookOpenCheck size={15} />} label="概念掌握" onChange={setConcepts} value={concepts} />
          <CapabilityRating icon={<Check size={15} />} label="计算准确" onChange={setCalculation} value={calculation} />
          <CapabilityRating icon={<Gauge size={15} />} label="时间控制" onChange={setTime} value={time} />
        </div>
      </section>

      <section className="mockExamReflection" aria-labelledby="mock-exam-reflection">
        <div className="mockExamSectionHead"><span>03</span><div><h3 id="mock-exam-reflection">复盘决策</h3><p>用失分证据确定下一轮训练动作</p></div></div>
        <div aria-label="失分类型" className="mockReviewTags" role="group">
          {REVIEW_TAGS.map((tag) => <button aria-pressed={reviewTags.includes(tag)} className={reviewTags.includes(tag) ? "active" : undefined} key={tag} onClick={() => toggleReviewTag(tag)} type="button">{reviewTags.includes(tag) ? <Check size={12} /> : null}{tag}</button>)}
        </div>
        <label className="mockReflectionEditor">
          <span>关键证据与下一轮动作</span>
          <textarea maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder={"哪类题造成了主要失分？\n下一轮训练要改变什么？\n怎样判断调整已经有效？"} rows={5} value={notes} />
        </label>
      </section>

      {error ? <p className="formError">{error}</p> : null}
      <footer className="mockExamSubmitBar">
        <div><span className={ready ? "ready" : undefined}>{ready ? <Check size={13} /> : null}{ready ? "记录已完整" : "填写模考名称与有效成绩"}</span><small>保存后会更新成绩趋势和薄弱维度</small></div>
        <button className="mockExamSave" disabled={busy || !ready} type="submit"><Save size={15} />{busy ? "保存中…" : "保存并生成诊断"}</button>
      </footer>
    </form>
  );
}

function CapabilityRating({ icon, label, value, onChange }: { icon: React.ReactNode; label: string; value: number; onChange: (value: number) => void }) {
  const state = value >= 85 ? "稳定" : value >= 70 ? "提升" : value >= 50 ? "补强" : "基础";
  return (
    <label className="capabilityRating">
      <span className="capabilityIcon">{icon}</span>
      <span className="capabilityName"><strong>{label}</strong><small>{state}</small></span>
      <input aria-label={`${label}评分`} max="100" min="0" onChange={(event) => onChange(Number(event.target.value) || 0)} style={{ "--capability-score": value } as CSSProperties} type="range" value={value} />
      <output>{value}<small>%</small></output>
    </label>
  );
}
