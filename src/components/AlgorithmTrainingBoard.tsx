"use client";

import { startTransition, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  Code2,
  Link2,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  createAlgorithmProblemAction,
  recordAlgorithmAttemptAction,
} from "@/app/actions/algorithms";
import { CreateTrainingTaskButton } from "@/components/CreateTrainingTaskButton";
import { ManagedAlgorithmWorkspace } from "@/components/ManagedAlgorithmWorkspace";
import type { JudgeRuntimeAvailability } from "@/lib/judge-runtime";
import { useFeedback } from "@/components/FeedbackProvider";
import type {
  AlgorithmDashboard,
  AlgorithmProblem,
  AlgorithmReviewKind,
  AlgorithmVerdict,
} from "@/lib/repo/algorithms";

const VERDICTS: Array<{ value: AlgorithmVerdict; label: string }> = [
  { value: "AC", label: "AC · 通过" },
  { value: "WA", label: "WA · 答案错误" },
  { value: "CE", label: "CE · 编译错误" },
  { value: "TLE", label: "TLE · 超时" },
  { value: "MLE", label: "MLE · 超内存" },
  { value: "RE", label: "RE · 运行错误" },
  { value: "OTHER", label: "其他" },
];

const REVIEW_KINDS: Array<{ value: AlgorithmReviewKind; label: string }> = [
  { value: "initial", label: "首次训练" },
  { value: "original_retest", label: "原题复测" },
  { value: "isomorphic_variant", label: "同构变式" },
  { value: "unseen_variant", label: "未见变式" },
];

export function AlgorithmTrainingBoard({
  dashboard,
  initialProblemId,
  initialTaskId,
  judgeAvailability,
  today,
}: {
  dashboard: AlgorithmDashboard;
  initialProblemId: number | null;
  initialTaskId: number | null;
  judgeAvailability: JudgeRuntimeAvailability;
  today: string;
}) {
  return (
    <div className="algorithmBoard">
      <section aria-label="算法训练指标" className="algorithmMetrics">
        <Metric icon={<Code2 size={18} />} label="已收录题目" value={dashboard.metrics.problemCount} />
        <Metric icon={<CircleDot size={18} />} label="已有尝试" value={dashboard.metrics.attemptedCount} />
        <Metric icon={<CheckCircle2 size={18} />} label="独立完成" value={dashboard.metrics.independentCount} />
        <Metric icon={<Sparkles size={18} />} label="迁移验证" value={dashboard.metrics.transferCount} />
        <Metric danger={dashboard.metrics.dueCount > 0} icon={<CalendarClock size={18} />} label="到期复测" value={dashboard.metrics.dueCount} />
      </section>

      {dashboard.dueProblems.length ? (
        <section className="algorithmDue card">
          <div className="sectionTitle">
            <div><span className="sectionKicker">DUE REVIEW</span><h2>今天优先复测</h2></div>
            <span className="sectionHint">到期不是惩罚，只是需要重新取得证据</span>
          </div>
          <div>
            {dashboard.dueProblems.slice(0, 4).map((problem) => (
              <a href={`#algorithm-problem-${problem.id}`} key={problem.id}>
                <CalendarClock size={15} />
                <span><strong>{problem.title}</strong><small>{problem.providerLabel} · 到期 {problem.nextReview}</small></span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <div className="algorithmWorkspaceGrid">
        <ProblemComposer />
        <aside className="algorithmModeNotice card">
          <span className="algorithmNoticeIcon"><ShieldAlert size={20} /></span>
          <div>
            <span className="sectionKicker">EXTERNAL RECORD MODE</span>
            <h2>外部记录模式</h2>
            <p>当前只保存题目链接和你主动填写的结果，不抓取百炼账号、题面或提交记录。</p>
            <ul>
              <li>结果标记为“用户记录”，不冒充平台验证。</li>
              <li>正式在线判题将在独立 Judge 服务接通后开放。</li>
              <li>L2–L4 提示后的 AC 不计为独立完成。</li>
            </ul>
          </div>
        </aside>
      </div>

      <section className="algorithmProblemSection">
        <div className="sectionTitle">
          <div><span className="sectionKicker">TRAINING LOG</span><h2>题目与训练证据</h2></div>
          <span className="sectionHint">最近更新位于最前</span>
        </div>
        {dashboard.problems.length ? (
          <div className="algorithmProblemList">
            {dashboard.problems.map((problem) => (
              <ProblemCard
                judgeAvailability={judgeAvailability}
                initialOpen={problem.id === initialProblemId}
                key={problem.id}
                problem={problem}
                relatedProblems={eligibleTransferSources(dashboard.problems, problem)}
                sourceTaskId={problem.id === initialProblemId ? initialTaskId : null}
                today={today}
              />
            ))}
          </div>
        ) : (
          <div className="algorithmEmpty card">
            <Code2 size={28} />
            <h3>先收录第一道题</h3>
            <p>推荐从百炼或其他正式题目页面复制链接；Ascend 负责训练编排和证据，不复制平台内容。</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ProblemComposer() {
  const { notify } = useFeedback();
  const [sourceUrl, setSourceUrl] = useState("");
  const [title, setTitle] = useState("");
  const [externalProblemId, setExternalProblemId] = useState("");
  const [difficultyBand, setDifficultyBand] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    startTransition(async () => {
      const result = await createAlgorithmProblemAction({
        sourceUrl,
        title,
        externalProblemId,
        difficultyBand,
        tags: tags.split(/[，,]/),
        notes,
      });
      setBusy(false);
      if (!result.ok) {
        notify(result.error || "题目保存失败", "error");
        return;
      }
      setSourceUrl("");
      setTitle("");
      setExternalProblemId("");
      setDifficultyBand("");
      setTags("");
      setNotes("");
      notify("题目已加入算法训练", "success");
    });
  }

  return (
    <form className="algorithmComposer card" onSubmit={submit}>
      <header>
        <span className="algorithmComposerIcon"><Plus size={19} /></span>
        <div><span className="sectionKicker">ADD PROBLEM</span><h2>收录外部题目</h2><p>仅保存链接和你填写的元数据。</p></div>
      </header>
      <label>
        <span>题目链接</span>
        <div className="algorithmInputWithIcon"><Link2 size={15} /><input onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://bailian.openjudge.cn/..." required type="url" value={sourceUrl} /></div>
      </label>
      <div className="algorithmComposerRow">
        <label><span>题目名称</span><input maxLength={160} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
        <label><span>平台题号</span><input maxLength={120} onChange={(event) => setExternalProblemId(event.target.value)} placeholder="可留空" value={externalProblemId} /></label>
      </div>
      <div className="algorithmComposerRow">
        <label><span>难度</span><select onChange={(event) => setDifficultyBand(event.target.value)} value={difficultyBand}><option value="">未标注</option><option value="foundation">基础</option><option value="standard">标准</option><option value="challenge">挑战</option></select></label>
        <label><span>技能标签</span><input maxLength={240} onChange={(event) => setTags(event.target.value)} placeholder="动态规划，边界处理" value={tags} /></label>
      </div>
      <label><span>训练备注</span><textarea maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder="为什么选择这道题？需要验证什么？" rows={3} value={notes} /></label>
      <button className="primaryButton" disabled={busy} type="submit"><Save size={15} />{busy ? "保存中…" : "加入训练"}</button>
    </form>
  );
}

function ProblemCard({
  judgeAvailability,
  initialOpen,
  problem,
  relatedProblems,
  sourceTaskId,
  today,
}: {
  judgeAvailability: JudgeRuntimeAvailability;
  initialOpen: boolean;
  problem: AlgorithmProblem;
  relatedProblems: AlgorithmProblem[];
  sourceTaskId: number | null;
  today: string;
}) {
  const latest = problem.attempts[0];
  const [sessionOpen, setSessionOpen] = useState(initialOpen);
  return (
    <article className="algorithmProblemCard card" id={`algorithm-problem-${problem.id}`}>
      <header>
        <div>
          <div className="algorithmProblemMeta">
            <span>{problem.providerLabel}</span>
            {problem.externalProblemId ? <span>#{problem.externalProblemId}</span> : null}
            <span>{difficultyLabel(problem.difficultyBand)}</span>
          </div>
          <h3>{problem.title}</h3>
          <div className="algorithmTags">{problem.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        </div>
        <div className="algorithmProblemActions">
          <CreateTrainingTaskButton
            compact
            completionCriteria="完成一次独立作答，并在算法训练中记录结果、提示级别与复盘。"
            day={today}
            label="加入今日"
            notes={`算法训练题：${problem.title}\n原题：${problem.sourceUrl}`}
            sourceId={problem.id}
            sourceType="plugin:algorithms"
            title={`算法训练：${problem.title}`}
            verificationMethod="以 AC、最高提示级别和延迟复测结果验证"
          />
          {problem.problemMode === "managed" ? (
            <button
              className="algorithmStartSession"
              onClick={() => setSessionOpen((current) => !current)}
              type="button"
            >
              <Code2 size={14} />{sessionOpen ? "收起训练" : "开始训练"}
            </button>
          ) : (
            <a href={problem.sourceUrl} rel="noreferrer" target="_blank">打开原题 <ArrowUpRight size={14} /></a>
          )}
        </div>
      </header>
      <div className="algorithmEvidenceStrip">
        <span data-status={problem.evidenceStatus}>{evidenceLabel(problem.evidenceStatus)}</span>
        <small>{problem.nextReview ? `下次复测 ${problem.nextReview}` : "尚未安排复测"}</small>
        <small>{problem.attempts.length} 次记录</small>
        {latest ? <small>最近 {latest.day} · {latest.verdict} · L{latest.maxHintLevel}</small> : null}
      </div>
      {problem.notes ? <p className="algorithmProblemNotes">{problem.notes}</p> : null}
      {problem.problemMode === "managed" && sessionOpen ? (
        <ManagedAlgorithmWorkspace
          availability={judgeAvailability}
          problem={problem}
          relatedProblems={relatedProblems}
          sourceTaskId={sourceTaskId}
          today={today}
        />
      ) : null}
      {problem.problemMode === "external" ? (
        <AttemptRecorder problem={problem} relatedProblems={relatedProblems} today={today} />
      ) : null}
      {problem.attempts.length ? (
        <details className="algorithmAttemptHistory">
          <summary>查看历史记录</summary>
          <div>
            {problem.attempts.map((attempt) => (
              <article key={attempt.id}>
                <strong>{attempt.verdict}</strong>
                <span>{attempt.day} · {reviewKindLabel(attempt.reviewKind)} · {attempt.durationMinutes} 分钟</span>
                <small>{attempt.independent ? "独立通过" : `最高提示 L${attempt.maxHintLevel}`} · {attempt.sourceVerification === "provider_verified" ? "平台验证" : "用户记录"}</small>
                {attempt.errorCategory ? <p>错因：{attempt.errorCategory}</p> : null}
                {attempt.reflection ? <p>{attempt.reflection}</p> : null}
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function AttemptRecorder({
  problem,
  relatedProblems,
  today,
}: {
  problem: AlgorithmProblem;
  relatedProblems: AlgorithmProblem[];
  today: string;
}) {
  const { notify } = useFeedback();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(today);
  const [verdict, setVerdict] = useState<AlgorithmVerdict>("AC");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [maxHintLevel, setMaxHintLevel] = useState(0);
  const [preConfidence, setPreConfidence] = useState<number | null>(null);
  const [reviewKind, setReviewKind] = useState<AlgorithmReviewKind>(problem.attempts.length ? "original_retest" : "initial");
  const [transferSourceProblemId, setTransferSourceProblemId] = useState<number | null>(null);
  const [errorCategory, setErrorCategory] = useState("");
  const [reflection, setReflection] = useState("");
  const [busy, setBusy] = useState(false);
  const operationIdRef = useRef<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    operationIdRef.current ??= crypto.randomUUID();
    startTransition(async () => {
      const result = await recordAlgorithmAttemptAction({
        operationId: operationIdRef.current!,
        problemId: problem.id,
        day,
        verdict,
        durationMinutes,
        maxHintLevel,
        preConfidence,
        reviewKind,
        transferSourceProblemId,
        errorCategory,
        reflection,
      });
      setBusy(false);
      if (!result.ok) {
        notify(result.error || "训练结果保存失败", "error");
        return;
      }
      operationIdRef.current = null;
      setOpen(false);
      setErrorCategory("");
      setReflection("");
      notify("训练证据已保存", "success");
    });
  }

  if (!open) {
    return <button className="algorithmRecordTrigger" onClick={() => setOpen(true)} type="button"><RotateCcw size={15} />记录本次训练</button>;
  }

  return (
    <form className="algorithmAttemptForm" onSubmit={submit}>
      <div className="algorithmAttemptGrid">
        <label><span>日期</span><input onChange={(event) => setDay(event.target.value)} type="date" value={day} /></label>
        <label>
          <span>训练类型</span>
          <select
            onChange={(event) => {
              const next = event.target.value as AlgorithmReviewKind;
              setReviewKind(next);
              if (next !== "isomorphic_variant" && next !== "unseen_variant") {
                setTransferSourceProblemId(null);
              }
            }}
            value={reviewKind}
          >
            {REVIEW_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
          </select>
        </label>
        {reviewKind === "isomorphic_variant" || reviewKind === "unseen_variant" ? (
          <label>
            <span>迁移来源题</span>
            <select
              onChange={(event) => setTransferSourceProblemId(event.target.value ? Number(event.target.value) : null)}
              required
              value={transferSourceProblemId ?? ""}
            >
              <option value="">选择一道人已独立完成且共享技能的题</option>
              {relatedProblems.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label><span>结果</span><select onChange={(event) => setVerdict(event.target.value as AlgorithmVerdict)} value={verdict}>{VERDICTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label><span>有效训练分钟</span><div className="algorithmNumberInput"><Clock3 size={14} /><input min={0} onChange={(event) => setDurationMinutes(Number(event.target.value) || 0)} type="number" value={durationMinutes} /></div></label>
        <label><span>最高提示级别</span><select onChange={(event) => setMaxHintLevel(Number(event.target.value))} value={maxHintLevel}>{[0, 1, 2, 3, 4].map((level) => <option key={level} value={level}>L{level}{level >= 3 ? " · 非独立" : ""}</option>)}</select></label>
        <label><span>提交前信心</span><select onChange={(event) => setPreConfidence(event.target.value === "" ? null : Number(event.target.value))} value={preConfidence ?? ""}><option value="">未记录</option><option value="0">0 · 完全没把握</option><option value="1">1 · 偏低</option><option value="2">2 · 较有把握</option><option value="3">3 · 很有把握</option></select></label>
      </div>
      <label><span>错误类别</span><input maxLength={80} onChange={(event) => setErrorCategory(event.target.value)} placeholder="例如：边界遗漏、复杂度判断错误" value={errorCategory} /></label>
      <label><span>纠正规则与复盘</span><textarea maxLength={2000} onChange={(event) => setReflection(event.target.value)} placeholder="下次遇到什么信号？先检查什么？" rows={3} value={reflection} /></label>
      <div className="algorithmAttemptActions">
        <button
          className="secondaryButton"
          disabled={busy}
          onClick={() => {
            operationIdRef.current = null;
            setOpen(false);
          }}
          type="button"
        >取消</button>
        <button className="primaryButton" disabled={busy} type="submit"><Save size={14} />{busy ? "保存中…" : "保存证据"}</button>
      </div>
    </form>
  );
}

function Metric({ icon, label, value, danger = false }: { icon: React.ReactNode; label: string; value: number; danger?: boolean }) {
  return <div className={danger ? "algorithmMetric danger" : "algorithmMetric"}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function difficultyLabel(value: string): string {
  if (value === "foundation") return "基础";
  if (value === "standard") return "标准";
  if (value === "challenge") return "挑战";
  return "难度未标注";
}

function evidenceLabel(value: string): string {
  if (value === "attempted") return "已有尝试";
  if (value === "guided_completed") return "引导完成";
  if (value === "independent_completed") return "独立完成";
  if (value === "delayed_stable") return "延迟稳定";
  if (value === "transfer_verified") return "迁移验证";
  return "未开始";
}

function reviewKindLabel(value: AlgorithmReviewKind): string {
  return REVIEW_KINDS.find((kind) => kind.value === value)?.label || "训练";
}

function eligibleTransferSources(
  problems: AlgorithmProblem[],
  target: AlgorithmProblem,
): AlgorithmProblem[] {
  const targetTags = new Set(target.tags);
  return problems.filter((candidate) => (
    candidate.id !== target.id
    && ["independent_completed", "delayed_stable", "transfer_verified"].includes(candidate.evidenceStatus)
    && candidate.tags.some((tag) => targetTags.has(tag))
  ));
}
