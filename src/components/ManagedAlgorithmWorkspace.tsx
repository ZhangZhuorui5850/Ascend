"use client";

import { startTransition, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Braces,
  CheckCircle2,
  CircleX,
  Clock3,
  Code2,
  Eye,
  FileCode2,
  LoaderCircle,
  Play,
  Save,
  Send,
  SquareTerminal,
} from "lucide-react";
import {
  getAlgorithmDraftAction,
  getAlgorithmLearningStateAction,
  refreshAlgorithmSubmissionAction,
  revealAlgorithmHintAction,
  resolveAlgorithmErrorCaseAction,
  saveAlgorithmDraftAction,
  saveAlgorithmReflectionAction,
  submitAlgorithmCodeAction,
} from "@/app/actions/algorithm-judge";
import { useFeedback } from "@/components/FeedbackProvider";
import { RichText } from "@/components/RichText";
import type { JudgeLanguage } from "@/lib/judge-gateway";
import type { JudgeRuntimeAvailability } from "@/lib/judge-runtime";
import type { AlgorithmLearningState } from "@/lib/repo/algorithm-learning";
import type { AlgorithmDraftConflict, AlgorithmSubmission } from "@/lib/repo/algorithm-submissions";
import type { AlgorithmProblem, AlgorithmReviewKind } from "@/lib/repo/algorithms";

type SessionTab = "problem" | "plan" | "code" | "result";
const TERMINAL = new Set(["AC", "WA", "TLE", "MLE", "RE", "CE", "JE", "CANCELLED"]);

export function ManagedAlgorithmWorkspace({
  availability,
  problem,
  relatedProblems,
  sourceTaskId,
  today,
}: {
  availability: JudgeRuntimeAvailability;
  problem: AlgorithmProblem;
  relatedProblems: AlgorithmProblem[];
  sourceTaskId: number | null;
  today: string;
}) {
  const { notify } = useFeedback();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef("");
  const sourceCodeRef = useRef(problem.starterCode[problem.supportedLanguages[0] || "cpp17"] || "");
  const languageRef = useRef<JudgeLanguage>(problem.supportedLanguages[0] || "cpp17");
  const editRevisionRef = useRef(0);
  const draftRevisionRef = useRef(0);
  const draftSaveRef = useRef({ active: false, pending: false, notifyWhenDone: false });
  const [tab, setTab] = useState<SessionTab>("problem");
  const [language, setLanguage] = useState<JudgeLanguage>(problem.supportedLanguages[0] || "cpp17");
  const [sourceCode, setSourceCode] = useState(problem.starterCode[language] || "");
  const [planText, setPlanText] = useState("");
  const [preConfidence, setPreConfidence] = useState<number | null>(null);
  const [reviewKind, setReviewKind] = useState<AlgorithmReviewKind>(
    problem.attempts.length ? "original_retest" : "initial",
  );
  const [transferSourceProblemId, setTransferSourceProblemId] = useState<number | null>(null);
  const [maxHintLevel, setMaxHintLevel] = useState(0);
  const [hints, setHints] = useState<Array<{ level: number; title: string; body: string }>>([]);
  const [submission, setSubmission] = useState<AlgorithmSubmission | null>(null);
  const [operationId, setOperationId] = useState("");
  const [busy, setBusy] = useState<"sample" | "formal" | "draft" | "hint" | null>(null);
  const [draftState, setDraftState] = useState(
    availability.configured ? "正在读取云端草稿…" : "Judge 未配置，草稿不会上传",
  );
  const [draftConflict, setDraftConflict] = useState<AlgorithmDraftConflict | null>(null);
  const [activeSeconds, setActiveSeconds] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const requestedRevision = editRevisionRef.current;
    const requestedLanguage = language;
    if (!availability.configured) return () => { cancelled = true; };
    startTransition(async () => {
      const result = await getAlgorithmDraftAction({ problemId: problem.id, language });
      if (cancelled) return;
      if (!result.ok) {
        setDraftState(result.error || "草稿读取失败");
        return;
      }
      if (result.sourceCode !== undefined) {
        if (
          editRevisionRef.current !== requestedRevision
          || languageRef.current !== requestedLanguage
        ) return;
        sourceCodeRef.current = result.sourceCode;
        setSourceCode(result.sourceCode);
        draftRevisionRef.current = result.revision ?? 0;
        setDraftConflict(null);
        setDraftState(result.updatedAt ? `已同步 ${formatTime(result.updatedAt)}` : "已载入云端草稿");
      } else {
        draftRevisionRef.current = 0;
        setDraftState("尚无云端草稿");
      }
    });
    return () => { cancelled = true; };
  }, [availability.configured, language, problem.id, problem.starterCode]);

  useEffect(() => {
    if (!availability.configured || !sourceCode.trim() || draftConflict) return;
    const timer = window.setTimeout(() => {
      void saveDraft(true);
    }, 1_500);
    return () => window.clearTimeout(timer);
    // saveDraft is intentionally driven by the latest rendered source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability.configured, draftConflict, language, problem.id, sourceCode]);

  useEffect(() => {
    let lastActivity = Date.now();
    const markActivity = () => { lastActivity = Date.now(); };
    const node = workspaceRef.current;
    node?.addEventListener("pointerdown", markActivity);
    node?.addEventListener("keydown", markActivity);
    node?.addEventListener("input", markActivity);
    const timer = window.setInterval(() => {
      if (
        document.visibilityState === "visible"
        && document.hasFocus()
        && Date.now() - lastActivity < 60_000
      ) {
        setActiveSeconds((current) => current + 1);
      }
    }, 1_000);
    return () => {
      window.clearInterval(timer);
      node?.removeEventListener("pointerdown", markActivity);
      node?.removeEventListener("keydown", markActivity);
      node?.removeEventListener("input", markActivity);
    };
  }, []);

  useEffect(() => {
    if (
      !submission
      || TERMINAL.has(submission.status)
      || submission.status === "RETRYABLE_ERROR"
      || !submission.gatewaySubmissionId
    ) return;
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await refreshAlgorithmSubmissionAction({
          submissionId: submission.id,
          day: today,
        });
        if (!result.ok || !result.submission) {
          setBusy(null);
          notify(result.error || "评测状态刷新失败", "error");
          return;
        }
        setSubmission(result.submission);
        if (TERMINAL.has(result.submission.status)) {
          setBusy(null);
          closeFormalSession(result.submission);
        }
      });
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [notify, submission, today]);

  async function saveDraft(silent = false) {
    if (!availability.configured || !sourceCodeRef.current.trim()) return;
    if (draftSaveRef.current.active) {
      draftSaveRef.current.pending = true;
      draftSaveRef.current.notifyWhenDone ||= !silent;
      return;
    }
    draftSaveRef.current.active = true;
    draftSaveRef.current.notifyWhenDone = !silent;
    if (!silent) setBusy("draft");
    try {
      do {
        draftSaveRef.current.pending = false;
        const snapshot = {
          language: languageRef.current,
          sourceCode: sourceCodeRef.current,
        };
        setDraftState("保存中…");
        const result = await saveAlgorithmDraftAction({
          problemId: problem.id,
          ...snapshot,
          baseRevision: draftRevisionRef.current,
          operationId: `draft:${crypto.randomUUID()}`,
        });
        if (!result.ok) {
          if (result.code === "DRAFT_CONFLICT" && result.conflict) {
            setDraftConflict(result.conflict);
            setDraftState(`云端 v${result.conflict.revision} 已更新`);
          } else {
            setDraftState(result.error || "保存失败");
          }
          if (draftSaveRef.current.notifyWhenDone) {
            notify(result.error || "代码草稿保存失败", "error");
          }
          return;
        }
        draftRevisionRef.current = result.revision ?? draftRevisionRef.current;
        setDraftConflict(null);
        setDraftState(result.savedAt ? `已同步 ${formatTime(result.savedAt)}` : "已同步");
      } while (draftSaveRef.current.pending);
      if (draftSaveRef.current.notifyWhenDone) notify("代码草稿已加密保存", "success");
    } finally {
      draftSaveRef.current.active = false;
      draftSaveRef.current.notifyWhenDone = false;
      setBusy((current) => current === "draft" ? null : current);
    }
  }

  async function loadCloudDraft(): Promise<void> {
    const result = await getAlgorithmDraftAction({ problemId: problem.id, language: languageRef.current });
    if (!result.ok || result.sourceCode === undefined) {
      notify(result.error || "云端草稿读取失败", "error");
      return;
    }
    editRevisionRef.current += 1;
    sourceCodeRef.current = result.sourceCode;
    setSourceCode(result.sourceCode);
    draftRevisionRef.current = result.revision ?? 0;
    setDraftConflict(null);
    setDraftState(result.updatedAt ? `已载入云端 v${result.revision}` : "已载入云端草稿");
  }

  async function saveLocalAfterConflict(): Promise<void> {
    if (!draftConflict) return;
    draftRevisionRef.current = draftConflict.revision;
    setDraftConflict(null);
    await saveDraft(false);
  }

  async function revealNextHint() {
    if (maxHintLevel >= 4 || busy) return;
    const sessionId = ensureSessionId();
    const level = maxHintLevel + 1;
    if (level === 4 && !window.confirm("L4 会展示参考实现方向，本次通过将记为“引导完成”。确认继续吗？")) {
      return;
    }
    setBusy("hint");
    const result = await revealAlgorithmHintAction({
      problemId: problem.id,
      sessionId,
      level,
    });
    setBusy(null);
    if (!result.ok || !result.hint) {
      notify(result.error || "提示读取失败", "error");
      return;
    }
    setMaxHintLevel(Math.max(maxHintLevel, result.hint.level));
    setHints((current) => [...current.filter((hint) => hint.level !== result.hint!.level), result.hint!]
      .sort((left, right) => left.level - right.level));
  }

  async function execute(kind: "sample" | "formal", reuseOperationId = "") {
    if (!availability.submissionAllowed || busy || !sourceCode.trim()) return;
    const sessionId = ensureSessionId();
    if (kind === "formal" && planText.trim().length < 10) {
      setTab("plan");
      notify("正式提交前先写出至少一句思路或关键不变量", "error");
      return;
    }
    if (kind === "formal" && preConfidence === null) {
      setTab("plan");
      notify("正式提交前请记录作答信心", "error");
      return;
    }
    if (
      (reviewKind === "isomorphic_variant" || reviewKind === "unseen_variant")
      && transferSourceProblemId === null
    ) {
      setTab("plan");
      notify("变式训练必须选择一道人已独立完成且共享技能的来源题", "error");
      return;
    }
    const nextOperationId = reuseOperationId || `operation:${crypto.randomUUID()}`;
    setOperationId(nextOperationId);
    setBusy(kind);
    setSubmission(null);
    setTab("result");
    const result = await submitAlgorithmCodeAction({
      operationId: nextOperationId,
      sessionId,
      problemId: problem.id,
      day: today,
      language,
      sourceCode,
      planText,
      preConfidence,
      maxHintLevel,
      reviewKind,
      transferSourceProblemId,
      activeSeconds,
      submissionKind: kind,
      sourceTaskId,
    });
    if (!result.ok || !result.submission) {
      setBusy(null);
      notify(result.error || "代码提交失败", "error");
      return;
    }
    setSubmission(result.submission);
    if (TERMINAL.has(result.submission.status) || result.submission.status === "RETRYABLE_ERROR") {
      setBusy(null);
    }
    closeFormalSession(result.submission);
  }

  async function retrySubmission(): Promise<void> {
    if (!submission || busy) return;
    if (!submission.gatewaySubmissionId) {
      await execute(submission.submissionKind, operationId);
      return;
    }
    setBusy(submission.submissionKind);
    const result = await refreshAlgorithmSubmissionAction({
      submissionId: submission.id,
      day: today,
    });
    if (!result.ok || !result.submission) {
      setBusy(null);
      notify(result.error || "评测状态刷新失败", "error");
      return;
    }
    setSubmission(result.submission);
    if (
      TERMINAL.has(result.submission.status)
      || result.submission.status === "RETRYABLE_ERROR"
    ) setBusy(null);
    closeFormalSession(result.submission);
  }

  function closeFormalSession(result: AlgorithmSubmission): void {
    if (result.submissionKind !== "formal" || !TERMINAL.has(result.status)) return;
    sessionIdRef.current = "";
    setOperationId("");
    setActiveSeconds(0);
    setMaxHintLevel(0);
    setHints([]);
    setPlanText("");
    setPreConfidence(null);
    setReviewKind("original_retest");
    setTransferSourceProblemId(null);
  }

  function ensureSessionId(): string {
    if (!sessionIdRef.current) sessionIdRef.current = `session:${crypto.randomUUID()}`;
    return sessionIdRef.current;
  }

  function changeLanguage(next: JudgeLanguage): void {
    editRevisionRef.current += 1;
    languageRef.current = next;
    sourceCodeRef.current = problem.starterCode[next] || "";
    draftRevisionRef.current = 0;
    setLanguage(next);
    setSourceCode(sourceCodeRef.current);
    setDraftConflict(null);
    setDraftState(availability.configured ? "正在读取云端草稿…" : "Judge 未配置，草稿不会上传");
    setSubmission(null);
  }

  function handleCodeKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const node = event.currentTarget;
    const next = `${sourceCode.slice(0, node.selectionStart)}    ${sourceCode.slice(node.selectionEnd)}`;
    const cursor = node.selectionStart + 4;
    editRevisionRef.current += 1;
    sourceCodeRef.current = next;
    setSourceCode(next);
    requestAnimationFrame(() => node.setSelectionRange(cursor, cursor));
  }

  return (
    <div className="managedAlgorithmWorkspace" ref={workspaceRef}>
      <nav aria-label="算法训练步骤" className="algorithmSessionTabs">
        {([
          ["problem", "题目"],
          ["plan", "思路"],
          ["code", "代码"],
          ["result", "结果"],
        ] as Array<[SessionTab, string]>).map(([value, label]) => (
          <button
            aria-current={tab === value ? "step" : undefined}
            key={value}
            onClick={() => setTab(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="algorithmSessionPanel problemPanel" data-active={tab === "problem"}>
        <header><FileCode2 size={16} /><strong>题目与约束</strong></header>
        <RichText text={problem.statementMarkdown} />
        <dl>
          <div><dt>输入</dt><dd><RichText text={problem.inputSpecification} /></dd></div>
          <div><dt>输出</dt><dd><RichText text={problem.outputSpecification} /></dd></div>
          <div><dt>限制</dt><dd>{problem.timeLimitMs} ms · {Math.round(problem.memoryLimitKb / 1024)} MiB</dd></div>
        </dl>
        <div className="algorithmExamples">
          {problem.examples.map((example, index) => (
            <article key={`${example.input}:${index}`}>
              <strong>公开样例 {index + 1}</strong>
              <span>输入</span><pre>{example.input}</pre>
              <span>输出</span><pre>{example.output}</pre>
              {example.explanation ? <p>{example.explanation}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="algorithmSessionPanel planPanel" data-active={tab === "plan"}>
        <header><Braces size={16} /><strong>先写思路，再写代码</strong></header>
        <label>
          <span>关键思路、不变量和边界</span>
          <textarea
            maxLength={4000}
            onChange={(event) => setPlanText(event.target.value)}
            placeholder="例如：输入范围是什么？为什么这个算法正确？最容易漏掉哪个边界？"
            rows={8}
            value={planText}
          />
        </label>
        <label>
          <span>提交前信心</span>
          <select
            onChange={(event) => setPreConfidence(event.target.value === "" ? null : Number(event.target.value))}
            value={preConfidence ?? ""}
          >
            <option value="">尚未判断</option>
            <option value="0">0 · 完全没把握</option>
            <option value="1">1 · 偏低</option>
            <option value="2">2 · 较有把握</option>
            <option value="3">3 · 很有把握</option>
          </select>
        </label>
        <label>
          <span>本次证据类型</span>
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
            {problem.attempts.length ? null : <option value="initial">首次训练</option>}
            <option value="original_retest">原题复测</option>
            <option value="isomorphic_variant">同构变式</option>
            <option value="unseen_variant">未见变式</option>
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
        <div className="algorithmHintLadder">
          <div>
            <strong>最小充分帮助</strong>
            <small>当前最高 L{maxHintLevel}；L3/L4 后通过不计独立完成</small>
          </div>
          <button disabled={busy !== null || maxHintLevel >= 4} onClick={() => void revealNextHint()} type="button">
            <Eye size={14} />{busy === "hint" ? "读取中…" : maxHintLevel ? `查看 L${maxHintLevel + 1}` : "查看 L1 定位提示"}
          </button>
          {hints.map((hint) => (
            <article key={hint.level}>
              <span>L{hint.level}</span><div><strong>{hint.title}</strong><p>{hint.body}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="algorithmSessionPanel codePanel" data-active={tab === "code"}>
        <header>
          <span><Code2 size={16} /><strong>代码编辑器</strong></span>
          <label>
            <span className="srOnly">语言</span>
            <select onChange={(event) => changeLanguage(event.target.value as JudgeLanguage)} value={language}>
              {problem.supportedLanguages.map((item) => (
                <option key={item} value={item}>{item === "cpp17" ? "C++17" : "Python 3"}</option>
              ))}
            </select>
          </label>
        </header>
        <textarea
          aria-label="算法代码"
          className="algorithmCodeEditor"
          onChange={(event) => {
            editRevisionRef.current += 1;
            sourceCodeRef.current = event.target.value;
            setSourceCode(event.target.value);
          }}
          onKeyDown={handleCodeKeyDown}
          spellCheck={false}
          value={sourceCode}
        />
        <footer>
          <span><Clock3 size={13} />有效作答 {formatDuration(activeSeconds)}</span>
          <small>
            {draftState} · 草稿加密持久化；提交源码
            {availability.retentionDays ? `${availability.retentionDays} 天后擦除` : "评测终态即擦除"}
          </small>
          {draftConflict ? (
            <span className="algorithmDraftConflictActions">
              <button onClick={() => void loadCloudDraft()} type="button">载入云端 v{draftConflict.revision}</button>
              <button onClick={() => void saveLocalAfterConflict()} type="button">保留本地并保存</button>
            </span>
          ) : (
            <button disabled={!availability.configured || busy !== null} onClick={() => void saveDraft(false)} type="button">
              <Save size={14} />保存草稿
            </button>
          )}
        </footer>
      </section>

      <section className="algorithmSessionPanel resultPanel" data-active={tab === "result"}>
        <header><SquareTerminal size={16} /><strong>运行与确定性反馈</strong></header>
        {!availability.submissionAllowed ? (
          <div className="judgeUnavailable">
            <Code2 size={20} />
            <strong>正式 Judge 尚未开放</strong>
            <p>{availability.reason}。代码不会在 Ascend 主容器执行。</p>
          </div>
        ) : null}
        <div className="algorithmJudgeActions">
          <button
            disabled={!availability.submissionAllowed || busy !== null || !sourceCode.trim()}
            onClick={() => void execute("sample")}
            type="button"
          >
            <Play size={14} />运行公开样例
          </button>
          <button
            className="primaryButton"
            disabled={!availability.submissionAllowed || busy !== null || !sourceCode.trim()}
            onClick={() => void execute("formal")}
            type="button"
          >
            <Send size={14} />提交正式评测
          </button>
        </div>
        {busy && !submission ? (
          <div className="judgePending"><LoaderCircle className="spin" size={18} />正在创建异步评测…</div>
        ) : null}
        {submission ? (
          <div className="judgeResult" data-status={submission.status}>
            <div>
              {submission.status === "AC"
                ? <CheckCircle2 size={18} />
                : TERMINAL.has(submission.status)
                  ? <CircleX size={18} />
                  : <LoaderCircle className="spin" size={18} />}
              <span><strong>{statusLabel(submission.status)}</strong><small>{submission.submissionKind === "sample" ? "公开样例" : "正式评测"}</small></span>
              <em>{submission.timeMs === null ? "—" : `${submission.timeMs} ms`} · {submission.memoryKb === null ? "—" : `${submission.memoryKb} KiB`}</em>
            </div>
            {submission.compilerExcerpt ? <pre>{submission.compilerExcerpt}</pre> : null}
            {submission.publicFeedback.map((feedback) => (
              <article key={feedback.caseIndex}>
                <strong>公开样例 {feedback.caseIndex + 1} · {feedback.status}</strong>
                <span>你的输出</span><pre>{feedback.stdoutExcerpt || "（无输出）"}</pre>
                <span>期望输出</span><pre>{feedback.expectedExcerpt}</pre>
              </article>
            ))}
            {submission.failureCode ? <p>错误代码：{submission.failureCode}</p> : null}
            {submission.status === "RETRYABLE_ERROR" ? (
              <button onClick={() => void retrySubmission()} type="button">
                {submission.gatewaySubmissionId ? "重试查询同一评测" : "使用同一幂等键重试创建"}
              </button>
            ) : null}
            {submission.submissionKind === "formal"
              && ["AC", "WA", "TLE", "MLE", "RE", "CE"].includes(submission.status)
              ? <AlgorithmReflectionPanel key={submission.attemptId} submission={submission} />
              : null}
          </div>
        ) : (
          <p className="algorithmResultEmpty">先运行公开样例，再提交隐藏测试。隐藏输入和答案不会返回浏览器或 AI。</p>
        )}
      </section>
    </div>
  );
}

function AlgorithmReflectionPanel({ submission }: { submission: AlgorithmSubmission }) {
  const { notify } = useFeedback();
  const [state, setState] = useState<AlgorithmLearningState | null>(null);
  const [errorCategory, setErrorCategory] = useState("");
  const [correctionRule, setCorrectionRule] = useState("");
  const [complexityTime, setComplexityTime] = useState("");
  const [complexitySpace, setComplexitySpace] = useState("");
  const [takeaway, setTakeaway] = useState("");
  const [pending, setPending] = useState<"load" | "save" | "confirm" | "dismiss" | null>("load");

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const result = await getAlgorithmLearningStateAction({ attemptId: submission.attemptId });
      if (cancelled) return;
      setPending(null);
      if (!result.ok || !result.state) {
        notify(result.error || "训练复盘读取失败", "error");
        return;
      }
      applyState(result.state);
    });
    return () => { cancelled = true; };
  }, [notify, submission.attemptId]);

  function applyState(next: AlgorithmLearningState) {
    setState(next);
    setErrorCategory(next.reflection?.errorCategory || next.errorCase?.errorCategory || "");
    setCorrectionRule(next.reflection?.correctionRule || next.errorCase?.correctionRule || "");
    setComplexityTime(next.reflection?.complexityTime || "");
    setComplexitySpace(next.reflection?.complexitySpace || "");
    setTakeaway(next.reflection?.takeaway || "");
  }

  async function save(): Promise<boolean> {
    setPending("save");
    const result = await saveAlgorithmReflectionAction({
      attemptId: submission.attemptId,
      errorCategory,
      correctionRule,
      complexityTime,
      complexitySpace,
      takeaway,
    });
    setPending(null);
    if (!result.ok || !result.state) {
      notify(result.error || "训练复盘保存失败", "error");
      return false;
    }
    applyState(result.state);
    notify("结构化复盘已保存", "success");
    return true;
  }

  async function resolve(decision: "confirm" | "dismiss") {
    if (decision === "confirm" && !(await save())) return;
    setPending(decision);
    const result = await resolveAlgorithmErrorCaseAction({
      attemptId: submission.attemptId,
      decision,
    });
    setPending(null);
    if (!result.ok || !result.state) {
      notify(result.error || "算法错误案例处理失败", "error");
      return;
    }
    applyState(result.state);
    notify(decision === "confirm" ? "已合并为一条错题回炉记录" : "已忽略本次错误案例", "success");
  }

  if (pending === "load") {
    return <div className="algorithmReflectionLoading"><LoaderCircle className="spin" size={15} />正在读取复盘…</div>;
  }
  const errorCase = state?.errorCase;
  return (
    <section className="algorithmReflection" aria-label="训练后结构化复盘">
      <header>
        <div><strong>训练后复盘</strong><small>结果不是终点：把错误改写成下次可执行的检查规则。</small></div>
        {state?.reflection ? <span>已保存</span> : <span>待完成</span>}
      </header>
      <div className="algorithmReflectionGrid">
        <label>
          <span>错误类别</span>
          <select onChange={(event) => setErrorCategory(event.target.value)} value={errorCategory}>
            <option value="">无 / 尚未判断</option>
            <option value="题意理解">题意理解</option>
            <option value="算法选择">算法选择</option>
            <option value="边界条件">边界条件</option>
            <option value="实现细节">实现细节</option>
            <option value="复杂度">复杂度</option>
            <option value="编译错误">编译错误</option>
            <option value="运行时错误">运行时错误</option>
            <option value="逻辑或边界错误">逻辑或边界错误</option>
            <option value="复杂度或死循环">复杂度或死循环</option>
            <option value="空间复杂度">空间复杂度</option>
          </select>
        </label>
        <label><span>时间复杂度</span><input maxLength={120} onChange={(event) => setComplexityTime(event.target.value)} placeholder="例如 O(n log n)" value={complexityTime} /></label>
        <label><span>空间复杂度</span><input maxLength={120} onChange={(event) => setComplexitySpace(event.target.value)} placeholder="例如 O(n)" value={complexitySpace} /></label>
      </div>
      <label>
        <span>纠正规则</span>
        <textarea maxLength={2000} onChange={(event) => setCorrectionRule(event.target.value)} placeholder="下次提交前，我会……（写成能检查的动作）" rows={3} value={correctionRule} />
      </label>
      <label>
        <span>一句话带走</span>
        <textarea maxLength={2000} onChange={(event) => setTakeaway(event.target.value)} placeholder="这次真正学到的、以后能迁移的原则是什么？" rows={2} value={takeaway} />
      </label>
      <footer>
        <button disabled={pending !== null} onClick={() => void save()} type="button">
          <Save size={14} />{pending === "save" ? "保存中…" : "保存复盘"}
        </button>
        {errorCase?.status === "candidate" ? (
          <>
            <button className="textButton" disabled={pending !== null} onClick={() => void resolve("dismiss")} type="button">
              {pending === "dismiss" ? "处理中…" : "本次不进入错题本"}
            </button>
            <button className="primaryButton" disabled={pending !== null} onClick={() => void resolve("confirm")} type="button">
              {pending === "confirm" ? "处理中…" : "确认进入错题回炉"}
            </button>
          </>
        ) : null}
        {errorCase?.status === "confirmed" ? <a href="/mistakes">已进入错题本，去安排回炉</a> : null}
        {errorCase?.status === "dismissed" ? <small>本次案例已忽略，结构化复盘仍保留。</small> : null}
      </footer>
    </section>
  );
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    CREATING: "正在创建",
    QUEUED: "排队中",
    RUNNING: "评测中",
    AC: "AC · 通过",
    WA: "WA · 答案错误",
    TLE: "TLE · 超时",
    MLE: "MLE · 超内存",
    RE: "RE · 运行错误",
    CE: "CE · 编译错误",
    JE: "JE · 评测异常",
    CANCELLED: "已取消",
    RETRYABLE_ERROR: "暂时失败，可重试",
  };
  return labels[status] || status;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
