"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  BookOpenCheck,
  CalendarDays,
  Check,
  Clock3,
  Gauge,
  Plus,
  Save,
  Target,
  Trash2,
} from "lucide-react";
import { createMockExamAction } from "@/app/actions/mock-exams";
import type { CaptureSubject } from "@/lib/repo/knowledge";
import type { MockExamDifficulty } from "@/lib/repo/mock-exams";

const DURATION_PRESETS = [60, 90, 120, 180];
const REVIEW_TAGS = ["知识盲区", "审题偏差", "计算失误", "节奏失控", "表达不完整"];
const QUESTION_TYPES = ["", "选择题", "填空题", "计算题", "证明题", "综合题", "其他"];
const CAUSE_CATEGORIES = ["", "知识盲区", "概念混淆", "审题偏差", "计算失误", "方法选择", "表达不完整", "时间不足", "其他"];

type EvidenceRow = {
  id: number;
  label: string;
  score: string;
  maxScore: string;
  knowledgePointId: string;
  questionType: string;
  durationMinutes: string;
  causeCategory: string;
  guessedCorrect: "" | "yes" | "no";
};

export function MockExamForm({ subjects, today }: { subjects: CaptureSubject[]; today: string }) {
  const router = useRouter();
  const rowSequence = useRef(0);
  const [day, setDay] = useState(today);
  const [name, setName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [score, setScore] = useState(0);
  const [maxScore, setMaxScore] = useState(100);
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [scopeLabel, setScopeLabel] = useState("");
  const [difficulty, setDifficulty] = useState<MockExamDifficulty>("");
  const [evidenceRows, setEvidenceRows] = useState<EvidenceRow[]>([]);
  const [evidenceComplete, setEvidenceComplete] = useState(false);
  const [concepts, setConcepts] = useState<number | null>(null);
  const [calculation, setCalculation] = useState<number | null>(null);
  const [time, setTime] = useState<number | null>(null);
  const [reviewTags, setReviewTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const percent = maxScore > 0 ? Math.round(Math.min(100, Math.max(0, score / maxScore * 100)) * 10) / 10 : 0;
  const validScore = maxScore > 0 && score >= 0 && score <= maxScore;
  const feelingsCount = [concepts, calculation, time].filter((value) => value !== null).length;
  const validEvidence = evidenceRows.every(isValidEvidenceRow);
  const evidenceScore = round1(evidenceRows.reduce((sum, row) => sum + (Number(row.score) || 0), 0));
  const evidenceMaxScore = round1(evidenceRows.reduce((sum, row) => sum + (Number(row.maxScore) || 0), 0));
  const completeEvidenceMatches = Math.abs(evidenceScore - score) <= 0.01 && Math.abs(evidenceMaxScore - maxScore) <= 0.01;
  const ready = Boolean(
    name.trim()
    && validScore
    && validEvidence
    && (!evidenceComplete || (evidenceRows.length > 0 && completeEvidenceMatches)),
  );
  const performance = percent >= 85 ? "状态稳定" : percent >= 70 ? "进入提升区" : percent >= 50 ? "需要定向补强" : "重建基础链路";

  function addEvidenceRow() {
    rowSequence.current += 1;
    setEvidenceRows((current) => [
      ...current,
      {
        id: rowSequence.current,
        label: `题组 ${current.length + 1}`,
        score: "",
        maxScore: "",
        knowledgePointId: "",
        questionType: "",
        durationMinutes: "",
        causeCategory: "",
        guessedCorrect: "",
      },
    ]);
    setEvidenceComplete(false);
  }

  function updateEvidenceRow(id: number, patch: Partial<EvidenceRow>) {
    setEvidenceRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
    setEvidenceComplete(false);
  }

  function removeEvidenceRow(id: number) {
    setEvidenceRows((current) => current.filter((row) => row.id !== id));
    setEvidenceComplete(false);
  }

  function changeSubject(nextSubjectCode: string) {
    setSubjectCode(nextSubjectCode);
    if (!nextSubjectCode) return;
    const validPointIds = new Set(
      subjects.find((subject) => subject.code === nextSubjectCode)?.chapters.flatMap((chapter) => chapter.points.map((point) => point.id)) || [],
    );
    setEvidenceRows((current) => current.map((row) => (
      row.knowledgePointId && !validPointIds.has(row.knowledgePointId)
        ? { ...row, knowledgePointId: "" }
        : row
    )));
  }

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
      scopeLabel,
      difficulty,
      notes: reflection,
      breakdown: [
        ...evidenceRows.map((row) => ({
          label: row.label,
          score: Number(row.score),
          maxScore: Number(row.maxScore),
          evidenceType: "group" as const,
          knowledgePointId: row.knowledgePointId || null,
          questionType: row.questionType,
          durationMinutes: row.durationMinutes === "" ? null : Number(row.durationMinutes),
          causeCategory: row.causeCategory,
          guessedCorrect: row.guessedCorrect === "" ? null : row.guessedCorrect === "yes",
        })),
        ...[
          { label: "概念掌握", score: concepts, maxScore: 100 },
          { label: "计算准确", score: calculation, maxScore: 100 },
          { label: "时间控制", score: time, maxScore: 100 },
        ]
          .filter((item): item is { label: string; score: number; maxScore: number } => item.score !== null)
          .map((item) => ({ ...item, evidenceType: "self_assessment" as const })),
      ],
      evidenceComplete,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "保存失败");
      return;
    }
    setName("");
    setScore(0);
    setEvidenceRows([]);
    setEvidenceComplete(false);
    setConcepts(null);
    setCalculation(null);
    setTime(null);
    setReviewTags([]);
    setNotes("");
    router.refresh();
  }

  return (
    <form className="card mockExamForm" onSubmit={(event) => void save(event)}>
      <header className="mockExamComposerHead">
        <div className="mockExamComposerTitle">
          <span className="mockExamComposerIcon"><BookOpenCheck size={18} /></span>
          <div><span className="sectionKicker">NEW RESULT</span><h2>记录一次模考</h2><p>先保存真实成绩，再按需要补充可追溯的题组证据。</p></div>
        </div>
        <div className="mockExamLiveScore" aria-label={`实时得分率 ${percent}%`}>
          <span>得分率</span><strong>{percent}<small>%</small></strong><em>{performance}</em>
        </div>
      </header>

      <section className="mockExamIdentity" aria-labelledby="mock-exam-identity">
        <div className="mockExamSectionHead"><span>01</span><div><h3 id="mock-exam-identity">考试结果</h3><p>快速模式只需名称、总成绩和用时</p></div></div>
        <label className="mockExamTitleField">
          <span>模考名称</span>
          <input autoFocus maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="例如：七月第一次全真模考" value={name} />
        </label>
        <div className="mockExamMetaRow">
          <label><CalendarDays size={14} /><span>日期</span><input onChange={(event) => setDay(event.target.value)} type="date" value={day} /></label>
          <label><Target size={14} /><span>科目</span><select onChange={(event) => changeSubject(event.target.value)} value={subjectCode}><option value="">综合模考</option>{subjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.code} · {subject.name}</option>)}</select></label>
          <label><BookOpenCheck size={14} /><span>考试范围</span><input maxLength={80} onChange={(event) => setScopeLabel(event.target.value)} placeholder="例如：矩阵与行列式" value={scopeLabel} /></label>
          <label><Gauge size={14} /><span>难度</span><select onChange={(event) => setDifficulty(event.target.value as MockExamDifficulty)} value={difficulty}><option value="">未标注</option><option value="foundation">基础</option><option value="standard">标准</option><option value="challenge">挑战</option></select></label>
        </div>
        <div className={validScore ? "mockScoreComposer" : "mockScoreComposer invalid"}>
          <div className="mockScoreInputs">
            <label><span>本次得分</span><input aria-label="本次得分" min="0" onChange={(event) => { setScore(Number(event.target.value) || 0); setEvidenceComplete(false); }} step="0.5" type="number" value={score} /></label>
            <i>/</i>
            <label><span>试卷满分</span><input aria-label="试卷满分" min="1" onChange={(event) => { setMaxScore(Math.max(1, Number(event.target.value) || 1)); setEvidenceComplete(false); }} step="0.5" type="number" value={maxScore} /></label>
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
        <div className="mockExamSectionHead"><span>02</span><div><h3 id="mock-exam-diagnosis">题组证据（可选）</h3><p>弱项只由实际题组得分汇总；知识点、题型、耗时和错因用于定位训练</p></div></div>
        <div className="mockEvidenceToolbar">
          <div><strong>{evidenceRows.length ? `${evidenceRows.length} 个题组` : "尚未添加题组"}</strong><small>部分录入可以只覆盖主要失分题组</small></div>
          <button onClick={addEvidenceRow} type="button"><Plus size={13} />添加题组</button>
        </div>
        {evidenceRows.length ? (
          <div className="mockEvidenceRows">
            {evidenceRows.map((row, index) => (
              <EvidenceRowEditor
                index={index}
                key={row.id}
                onChange={(patch) => updateEvidenceRow(row.id, patch)}
                onRemove={() => removeEvidenceRow(row.id)}
                row={row}
                subjectCode={subjectCode}
                subjects={subjects}
              />
            ))}
          </div>
        ) : (
          <p className="mockDiagnosisHint">不添加题组时保存为快速记录，不会从总分或主观感受推断薄弱知识点。</p>
        )}
        {evidenceRows.length ? (
          <div className="mockEvidenceSummary" data-match={completeEvidenceMatches ? "true" : "false"}>
            <div><span>题组合计</span><strong>{evidenceScore}/{evidenceMaxScore}</strong><small>总成绩 {score}/{maxScore}</small></div>
            <label>
              <input checked={evidenceComplete} disabled={!validEvidence} onChange={(event) => setEvidenceComplete(event.target.checked)} type="checkbox" />
              <span>已录入整张试卷的全部题组，合计与总成绩一致</span>
            </label>
            {!completeEvidenceMatches ? <p>合计尚未覆盖总成绩，只能保存为部分题组证据。</p> : null}
          </div>
        ) : null}

        <details className="mockFeelings">
          <summary>考后感受（可选，不参与弱项排序）</summary>
          <p>这些滑块只记录你的主观感受，不会被当作作答成绩或掌握证据。</p>
          <div className="mockExamBreakdown">
            <CapabilityRating icon={<BookOpenCheck size={15} />} label="概念掌握" onChange={setConcepts} value={concepts} />
            <CapabilityRating icon={<Check size={15} />} label="计算准确" onChange={setCalculation} value={calculation} />
            <CapabilityRating icon={<Gauge size={15} />} label="时间控制" onChange={setTime} value={time} />
          </div>
        </details>
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
        <div>
          <span className={ready ? "ready" : undefined}>{ready ? <Check size={13} /> : null}{footerStatus({ baseReady: Boolean(name.trim() && validScore), evidenceRows, validEvidence, evidenceComplete, completeEvidenceMatches })}</span>
          <small>{evidenceRows.length ? `${evidenceComplete ? "完整" : "部分"}题组证据将参与弱项排序${feelingsCount ? `；另存 ${feelingsCount} 项主观感受` : ""}` : "快速记录不会生成薄弱维度"}</small>
        </div>
        <button className="mockExamSave" disabled={busy || !ready} type="submit"><Save size={15} />{busy ? "保存中…" : evidenceRows.length ? "保存成绩与题组证据" : "保存快速记录"}</button>
      </footer>
    </form>
  );
}

function EvidenceRowEditor({
  index,
  row,
  subjects,
  subjectCode,
  onChange,
  onRemove,
}: {
  index: number;
  row: EvidenceRow;
  subjects: CaptureSubject[];
  subjectCode: string;
  onChange: (patch: Partial<EvidenceRow>) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset className="mockEvidenceRow" data-valid={isValidEvidenceRow(row) ? "true" : "false"}>
      <legend>题组 {index + 1}</legend>
      <button aria-label={`删除题组 ${index + 1}`} className="mockEvidenceRemove" onClick={onRemove} type="button"><Trash2 size={13} /></button>
      <label className="mockEvidenceLabel"><span>题组名称</span><input maxLength={40} onChange={(event) => onChange({ label: event.target.value })} placeholder="例如：矩阵计算题" value={row.label} /></label>
      <label><span>得分</span><input min="0" onChange={(event) => onChange({ score: event.target.value })} step="0.5" type="number" value={row.score} /></label>
      <label><span>满分</span><input min="0.5" onChange={(event) => onChange({ maxScore: event.target.value })} step="0.5" type="number" value={row.maxScore} /></label>
      <label className="mockEvidencePoint"><span>知识点</span><select onChange={(event) => onChange({ knowledgePointId: event.target.value })} value={row.knowledgePointId}><option value="">未关联知识点</option>{pointOptions(subjects, subjectCode)}</select></label>
      <label><span>题型</span><select onChange={(event) => onChange({ questionType: event.target.value })} value={row.questionType}>{QUESTION_TYPES.map((value) => <option key={value || "empty"} value={value}>{value || "未标注"}</option>)}</select></label>
      <label><span>耗时（分钟）</span><input min="0" onChange={(event) => onChange({ durationMinutes: event.target.value })} type="number" value={row.durationMinutes} /></label>
      <label><span>主要错因</span><select onChange={(event) => onChange({ causeCategory: event.target.value })} value={row.causeCategory}>{CAUSE_CATEGORIES.map((value) => <option key={value || "empty"} value={value}>{value || "未标注"}</option>)}</select></label>
      <label><span>是否猜对</span><select onChange={(event) => onChange({ guessedCorrect: event.target.value as EvidenceRow["guessedCorrect"] })} value={row.guessedCorrect}><option value="">不确定</option><option value="no">否</option><option value="yes">是</option></select></label>
      {!isValidEvidenceRow(row) ? <p>请填写题组名称，并确保得分位于 0 到题组满分之间。</p> : null}
    </fieldset>
  );
}

function pointOptions(subjects: CaptureSubject[], subjectCode: string): ReactNode {
  return subjects
    .filter((subject) => !subjectCode || subject.code === subjectCode)
    .flatMap((subject) => subject.chapters.map((chapter) => (
      <optgroup key={`${subject.code}:${chapter.id}`} label={`${subject.code} · ${chapter.title}`}>
        {chapter.points.map((point) => <option key={point.id} value={point.id}>{point.title}</option>)}
      </optgroup>
    )));
}

function CapabilityRating({ icon, label, value, onChange }: { icon: ReactNode; label: string; value: number | null; onChange: (value: number | null) => void }) {
  const state = value === null ? "未评估" : value >= 85 ? "稳定" : value >= 70 ? "提升" : value >= 50 ? "补强" : "基础";
  return (
    <div className="capabilityRating" data-evaluated={value === null ? "false" : "true"}>
      <span className="capabilityIcon">{icon}</span>
      <span className="capabilityName"><strong>{label}</strong><small>{state}</small></span>
      {value === null ? (
        <>
          <button className="capabilityAssessButton" onClick={() => onChange(50)} type="button">记录感受</button>
          <output aria-label={`${label}未评估`}>—</output>
        </>
      ) : (
        <>
          <input aria-label={`${label}评分`} max="100" min="0" onChange={(event) => onChange(Number(event.target.value))} style={{ "--capability-score": value } as CSSProperties} type="range" value={value} />
          <span className="capabilityResult"><output>{value}<small>%</small></output><button aria-label={`清除${label}感受`} onClick={() => onChange(null)} type="button">清除</button></span>
        </>
      )}
    </div>
  );
}

function isValidEvidenceRow(row: EvidenceRow): boolean {
  if (!row.label.trim() || row.score === "" || row.maxScore === "") return false;
  const score = Number(row.score);
  const maxScore = Number(row.maxScore);
  const duration = row.durationMinutes === "" ? null : Number(row.durationMinutes);
  return Number.isFinite(score)
    && Number.isFinite(maxScore)
    && maxScore > 0
    && score >= 0
    && score <= maxScore
    && (duration === null || (Number.isFinite(duration) && duration >= 0));
}

function footerStatus({
  baseReady,
  evidenceRows,
  validEvidence,
  evidenceComplete,
  completeEvidenceMatches,
}: {
  baseReady: boolean;
  evidenceRows: EvidenceRow[];
  validEvidence: boolean;
  evidenceComplete: boolean;
  completeEvidenceMatches: boolean;
}): string {
  if (!baseReady) return "填写模考名称与有效成绩";
  if (!validEvidence) return "补全题组得分";
  if (!evidenceRows.length) return "快速记录已就绪";
  if (evidenceComplete && !completeEvidenceMatches) return "完整题组合计需与总成绩一致";
  return evidenceComplete ? "完整题组证据已就绪" : `部分题组证据已就绪（${evidenceRows.length} 组）`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
