"use client";

import { startTransition, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  Copy,
  Database,
  FileText,
  FolderInput,
  LibraryBig,
  Link2,
  ListFilter,
  Laptop,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  Unplug,
} from "lucide-react";
import {
  createAlgorithmProblemAction,
  createAlgorithmDeviceAction,
  importAlgorithmDirectoryAction,
  previewAlgorithmImportAction,
  recordAlgorithmAttemptAction,
  revokeAlgorithmDeviceAction,
  updateAlgorithmProblemAction,
} from "@/app/actions/algorithms";
import { CreateTrainingTaskButton } from "@/components/CreateTrainingTaskButton";
import { ManagedAlgorithmWorkspace } from "@/components/ManagedAlgorithmWorkspace";
import { ImportedAlgorithmWorkspace } from "@/components/ImportedAlgorithmWorkspace";
import { RichText } from "@/components/RichText";
import type { JudgeRuntimeAvailability } from "@/lib/judge-runtime";
import { buildAlgorithmTodayQueue } from "@/lib/algorithm-today-queue";
import { useFeedback } from "@/components/FeedbackProvider";
import type {
  AlgorithmDashboard,
  AlgorithmProblem,
  AlgorithmReviewKind,
  AlgorithmVerdict,
} from "@/lib/repo/algorithms";
import type { AlgorithmCollection, AlgorithmImportSource } from "@/lib/repo/algorithm-import";
import type { AlgorithmDevice } from "@/lib/repo/algorithm-devices";

type AlgorithmSection = "today" | "library" | "collections" | "import";

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
  collections,
  codeStorageAvailable,
  dashboard,
  devices,
  importRoots,
  importSources,
  initialProblemId,
  initialTaskId,
  judgeAvailability,
  today,
}: {
  collections: AlgorithmCollection[];
  codeStorageAvailable: boolean;
  dashboard: AlgorithmDashboard;
  devices: AlgorithmDevice[];
  importRoots: string[];
  importSources: AlgorithmImportSource[];
  initialProblemId: number | null;
  initialTaskId: number | null;
  judgeAvailability: JudgeRuntimeAvailability;
  today: string;
}) {
  const [section, setSection] = useState<AlgorithmSection>(initialProblemId ? "library" : "today");
  const [selectedCollectionId, setSelectedCollectionId] = useState(collections[0]?.id || "");
  const todayProblems = useMemo(
    () => buildAlgorithmTodayQueue(dashboard.problems, today).map((item) => item.problem),
    [dashboard.problems, today],
  );
  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId) || null;
  const collectionProblems = selectedCollection
    ? dashboard.problems.filter((problem) => problem.collectionIds.includes(selectedCollection.id))
    : [];

  return (
    <div className="algorithmBoard">
      <nav aria-label="算法训练分区" className="algorithmSectionTabs">
        <SectionTab
          active={section === "today"}
          icon={<CalendarClock size={16} />}
          label="今日训练"
          onClick={() => setSection("today")}
        />
        <SectionTab
          active={section === "library"}
          icon={<LibraryBig size={16} />}
          label="题库"
          onClick={() => setSection("library")}
        />
        <SectionTab
          active={section === "collections"}
          icon={<ListFilter size={16} />}
          label="题单"
          onClick={() => setSection("collections")}
        />
        <SectionTab
          active={section === "import"}
          icon={<FolderInput size={16} />}
          label="导入与同步"
          onClick={() => setSection("import")}
        />
      </nav>

      <section aria-label="算法训练指标" className="algorithmMetrics">
        <Metric icon={<Code2 size={18} />} label="已收录题目" value={dashboard.metrics.problemCount} />
        <Metric icon={<CircleDot size={18} />} label="已有尝试" value={dashboard.metrics.attemptedCount} />
        <Metric icon={<CheckCircle2 size={18} />} label="独立完成" value={dashboard.metrics.independentCount} />
        <Metric icon={<Sparkles size={18} />} label="迁移验证" value={dashboard.metrics.transferCount} />
        <Metric
          danger={dashboard.metrics.dueCount > 0}
          icon={<CalendarClock size={18} />}
          label="到期复测"
          value={dashboard.metrics.dueCount}
        />
      </section>

      {section === "today" && dashboard.dueProblems.length ? (
        <section className="algorithmDue card">
          <div className="sectionTitle">
            <div>
              <span className="sectionKicker">DUE REVIEW</span>
              <h2>今天优先复测</h2>
            </div>
            <span className="sectionHint">到期意味着需要重新取得证据</span>
          </div>
          <div>
            {dashboard.dueProblems.slice(0, 4).map((problem) => (
              <a href={`#algorithm-problem-${problem.id}`} key={problem.id}>
                <CalendarClock size={15} />
                <span>
                  <strong>{problem.title}</strong>
                  <small>
                    {problem.providerLabel} · 到期 {problem.nextReview}
                  </small>
                </span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {section === "today" ? (
        <section className="algorithmProblemSection">
          <div className="sectionTitle">
            <div>
              <span className="sectionKicker">TODAY QUEUE</span>
              <h2>今天只处理这些题</h2>
            </div>
            <span className="sectionHint">到期复测、进行中和 P1 题优先</span>
          </div>
          <ProblemList
            judgeAvailability={judgeAvailability}
            codeStorageAvailable={codeStorageAvailable}
            problems={todayProblems}
            allProblems={dashboard.problems}
            initialProblemId={initialProblemId}
            initialTaskId={initialTaskId}
            today={today}
          />
        </section>
      ) : null}

      {section === "library" ? (
        <AlgorithmLibraryManager
          initialProblemId={initialProblemId}
          problems={dashboard.problems}
        />
      ) : null}

      {section === "collections" ? (
        <section className="algorithmCollectionsLayout">
          <aside className="algorithmCollectionList card">
            <span className="sectionKicker">COLLECTIONS</span>
            <h2>训练题单</h2>
            {collections.map((collection) => (
              <button
                data-active={collection.id === selectedCollectionId}
                key={collection.id}
                onClick={() => setSelectedCollectionId(collection.id)}
                type="button"
              >
                <span>
                  <strong>{collection.name}</strong>
                  <small>{collection.openCount} 道待稳定</small>
                </span>
                <b>{collection.problemCount}</b>
              </button>
            ))}
          </aside>
          <div className="algorithmProblemSection">
            <div className="sectionTitle">
              <div>
                <span className="sectionKicker">COLLECTION DETAIL</span>
                <h2>{selectedCollection?.name || "等待导入题单"}</h2>
              </div>
              <span className="sectionHint">{collectionProblems.length} 道题</span>
            </div>
            <ProblemList
              codeStorageAvailable={codeStorageAvailable}
              judgeAvailability={judgeAvailability}
              problems={collectionProblems}
              allProblems={dashboard.problems}
              initialProblemId={initialProblemId}
              initialTaskId={initialTaskId}
              today={today}
            />
          </div>
        </section>
      ) : null}

      {section === "import" ? (
        <div className="algorithmImportLayout">
          <AlgorithmImportPanel importRoots={importRoots} importSources={importSources} />
          <AlgorithmDevicePanel devices={devices} />
          <ProblemComposer />
          <aside className="algorithmModeNotice card">
            <span className="algorithmNoticeIcon">
              <ShieldAlert size={20} />
            </span>
            <div>
              <span className="sectionKicker">PRIVATE LIBRARY</span>
              <h2>私人题库边界</h2>
              <p>导入题面和代码保存在当前工作区，来源与验证等级会随题目一起记录。</p>
              <ul>
                <li>学习证据与本地素材状态分别维护。</li>
                <li>再次扫描会按平台题号和文件路径更新。</li>
                <li>外部 OJ 结果继续标记为用户记录。</li>
              </ul>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function SectionTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button aria-current={active ? "page" : undefined} data-active={active} onClick={onClick} type="button">
      {icon}
      <span>{label}</span>
    </button>
  );
}

type LibraryView = "content" | "settings";

function AlgorithmLibraryManager({
  initialProblemId,
  problems,
}: {
  initialProblemId: number | null;
  problems: AlgorithmProblem[];
}) {
  const [query, setQuery] = useState("");
  const [sourceMode, setSourceMode] = useState("");
  const [material, setMaterial] = useState("");
  const [evidence, setEvidence] = useState("");
  const [selectedProblemId, setSelectedProblemId] = useState(
    problems.some((problem) => problem.id === initialProblemId) ? initialProblemId : problems[0]?.id ?? null,
  );
  const filteredProblems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return problems.filter((problem) => {
      if (
        normalizedQuery &&
        ![
          problem.title,
          problem.externalProblemId,
          problem.providerLabel,
          problem.phaseKey,
          problem.priorityBand,
          ...problem.tags,
        ]
          .join(" ")
          .toLocaleLowerCase("zh-CN")
          .includes(normalizedQuery)
      )
        return false;
      if (sourceMode && problem.problemMode !== sourceMode) return false;
      if (material && problem.materialStatus !== material) return false;
      if (evidence && problem.evidenceStatus !== evidence) return false;
      return true;
    });
  }, [evidence, material, problems, query, sourceMode]);
  const selectedProblem =
    filteredProblems.find((problem) => problem.id === selectedProblemId) ?? filteredProblems[0] ?? null;

  return (
    <section className="algorithmLibraryManager">
      <div className="algorithmLibraryIndex card">
        <header>
          <div>
            <span className="sectionKicker">LIBRARY MANAGER</span>
            <h2>题库管理</h2>
          </div>
          <strong>{filteredProblems.length}</strong>
        </header>
        <label className="algorithmLibrarySearch">
          <Search size={16} />
          <input
            aria-label="搜索算法题"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、题号、阶段或标签"
            value={query}
          />
        </label>
        <div className="algorithmLibraryFilters">
          <select aria-label="题目来源筛选" onChange={(event) => setSourceMode(event.target.value)} value={sourceMode}>
            <option value="">全部来源</option>
            <option value="imported">本地导入</option>
            <option value="managed">内置题目</option>
            <option value="external">外部链接</option>
          </select>
          <select aria-label="素材状态筛选" onChange={(event) => setMaterial(event.target.value)} value={material}>
            <option value="">全部素材状态</option>
            <option value="todo">待整理</option>
            <option value="doing">整理中</option>
            <option value="review">待复查</option>
            <option value="done">已就绪</option>
          </select>
          <select aria-label="学习状态筛选" onChange={(event) => setEvidence(event.target.value)} value={evidence}>
            <option value="">全部学习状态</option>
            <option value="unseen">待开始</option>
            <option value="attempted">已有尝试</option>
            <option value="guided_completed">引导完成</option>
            <option value="independent_completed">独立完成</option>
            <option value="delayed_stable">延迟稳定</option>
            <option value="transfer_verified">迁移验证</option>
          </select>
        </div>
        <div aria-label="题目清单" className="algorithmLibraryRows">
          {filteredProblems.map((problem) => (
            <button
              aria-current={problem.id === selectedProblem?.id ? "true" : undefined}
              data-active={problem.id === selectedProblem?.id}
              key={problem.id}
              onClick={() => setSelectedProblemId(problem.id)}
              type="button"
            >
              <span className="algorithmLibraryRowStatus" data-status={problem.evidenceStatus} />
              <span>
                <strong>{problem.title}</strong>
                <small>
                  {problem.providerLabel}
                  {problem.externalProblemId ? ` · #${problem.externalProblemId}` : ""}
                  {problem.phaseKey ? ` · ${problem.phaseKey}` : ""}
                </small>
                <span>
                  <b data-status={problem.materialStatus}>{materialStatusLabel(problem.materialStatus)}</b>
                  <b>{evidenceLabel(problem.evidenceStatus)}</b>
                  {problem.priorityBand ? <b>{problem.priorityBand}</b> : null}
                </span>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          {!filteredProblems.length ? (
            <div className="algorithmLibraryNoResults">
              <Search size={20} />
              <p>当前筛选条件下暂无题目。</p>
            </div>
          ) : null}
        </div>
      </div>
      {selectedProblem ? <AlgorithmProblemManagerDetail key={selectedProblem.id} problem={selectedProblem} /> : null}
    </section>
  );
}

function AlgorithmProblemManagerDetail({ problem }: { problem: AlgorithmProblem }) {
  const [view, setView] = useState<LibraryView>("content");
  const latest = problem.attempts[0];
  return (
    <article className="algorithmLibraryDetail card">
      <header>
        <div>
          <div className="algorithmProblemMeta">
            <span>{problem.providerLabel}</span>
            {problem.externalProblemId ? <span>#{problem.externalProblemId}</span> : null}
            <span>{problemModeLabel(problem.problemMode)}</span>
          </div>
          <h2>{problem.title}</h2>
          <p>{problem.tags.length ? problem.tags.join(" · ") : "等待补充算法标签"}</p>
        </div>
        <div className="algorithmLibraryDetailActions">
          {problem.problemMode !== "external" ? (
            <a className="secondaryButton" href={`vscode://zzr.ascend-practice/open?problem=${problem.id}`}>
              <Code2 size={14} /> VS Code
            </a>
          ) : null}
          {isHttpUrl(problem.sourceUrl) ? (
            <a className="secondaryButton" href={problem.sourceUrl} rel="noreferrer" target="_blank">
              打开题源 <ArrowUpRight size={14} />
            </a>
          ) : null}
        </div>
      </header>
      <div aria-label="题目状态" className="algorithmLibraryStatusGrid">
        <StatusFact
          label="学习状态"
          status={problem.evidenceStatus}
          value={evidenceLabel(problem.evidenceStatus)}
        />
        <StatusFact
          label="素材状态"
          status={problem.materialStatus}
          value={materialStatusLabel(problem.materialStatus)}
        />
        <StatusFact label="优先级" value={problem.priorityBand || "常规"} />
        <StatusFact label="下次复测" value={problem.nextReview || "等待安排"} />
      </div>
      <div className="algorithmLibraryDetailTabs" role="tablist" aria-label="题目详情视图">
        <button
          aria-selected={view === "content"}
          data-active={view === "content"}
          onClick={() => setView("content")}
          role="tab"
          type="button"
        >
          <FileText size={15} /> 题目内容
        </button>
        <button
          aria-selected={view === "settings"}
          data-active={view === "settings"}
          onClick={() => setView("settings")}
          role="tab"
          type="button"
        >
          <Settings2 size={15} /> 管理设置
        </button>
      </div>
      {view === "content" ? <AlgorithmProblemPreview problem={problem} /> : <ProblemMetadataEditor problem={problem} />}
      <footer className="algorithmLibraryDetailFooter">
        <span>{problem.attempts.length} 次训练记录</span>
        <span>{latest ? `最近 ${latest.day} · ${latest.verdict} · L${latest.maxHintLevel}` : "等待首次训练"}</span>
      </footer>
    </article>
  );
}

function StatusFact({ label, status, value }: { label: string; status?: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong data-status={status}>{value}</strong>
    </div>
  );
}

function AlgorithmProblemPreview({ problem }: { problem: AlgorithmProblem }) {
  if (!problem.statementMarkdown.trim()) {
    return (
      <div className="algorithmProblemPreviewEmpty">
        <FileText size={26} />
        <h3>这道题使用外部题面</h3>
        <p>题目元数据与训练记录保存在 Ascend，题面通过上方“打开题源”查看。</p>
      </div>
    );
  }
  return (
    <div className="algorithmProblemPreview">
      <section>
        <span className="sectionKicker">PROBLEM STATEMENT</span>
        <AlgorithmStatement text={problem.statementMarkdown} />
      </section>
      {problem.inputSpecification || problem.outputSpecification ? (
        <dl>
          {problem.inputSpecification ? (
            <div>
              <dt>输入</dt>
              <dd><RichText block text={problem.inputSpecification} /></dd>
            </div>
          ) : null}
          {problem.outputSpecification ? (
            <div>
              <dt>输出</dt>
              <dd><RichText block text={problem.outputSpecification} /></dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {problem.examples.length ? (
        <section className="algorithmProblemPreviewExamples">
          <h3>样例</h3>
          {problem.examples.map((example, index) => (
            <article key={`${example.input}:${index}`}>
              <div><small>输入 {index + 1}</small><pre>{example.input}</pre></div>
              <div><small>输出 {index + 1}</small><pre>{example.output}</pre></div>
              {example.explanation ? <p>{example.explanation}</p> : null}
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function AlgorithmStatement({ text }: { text: string }) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  return (
    <div className="algorithmStatementContent">
      {blocks.map((block, index) => {
        const heading = block.match(/^(#{1,4})\s+(.+)$/s);
        if (heading && !heading[2].includes("\n")) {
          const title = heading[2].trim();
          return heading[1].length === 1 ? <h3 key={index}>{title}</h3> : <h4 key={index}>{title}</h4>;
        }
        return <p key={index}><RichText block text={block} /></p>;
      })}
    </div>
  );
}

function ProblemMetadataEditor({ problem }: { problem: AlgorithmProblem }) {
  const { notify } = useFeedback();
  const [title, setTitle] = useState(problem.title);
  const [difficultyBand, setDifficultyBand] = useState(problem.difficultyBand);
  const [tags, setTags] = useState(problem.tags.join("，"));
  const [notes, setNotes] = useState(problem.notes);
  const [materialStatus, setMaterialStatus] = useState(problem.materialStatus);
  const [priorityBand, setPriorityBand] = useState(problem.priorityBand);
  const [phaseKey, setPhaseKey] = useState(problem.phaseKey);
  const [nextReview, setNextReview] = useState(problem.nextReview || "");
  const [busy, setBusy] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    startTransition(async () => {
      const result = await updateAlgorithmProblemAction({
        problemId: problem.id,
        title,
        difficultyBand,
        tags: tags.split(/[，,]/),
        notes,
        materialStatus,
        priorityBand,
        phaseKey,
        nextReview: nextReview || null,
      });
      setBusy(false);
      if (!result.ok) {
        notify(result.error || "题目资料保存失败", "error");
        return;
      }
      notify("题目资料与状态已保存", "success");
    });
  }

  return (
    <form className="algorithmProblemManagerForm" onSubmit={submit}>
      <div className="algorithmProblemManagerGrid">
        <label className="algorithmProblemManagerTitle">
          <span>题目名称</span>
          <input maxLength={160} onChange={(event) => setTitle(event.target.value)} required value={title} />
        </label>
        <label>
          <span>素材状态</span>
          <select onChange={(event) => setMaterialStatus(event.target.value as AlgorithmProblem["materialStatus"])} value={materialStatus}>
            <option value="todo">待整理</option>
            <option value="doing">整理中</option>
            <option value="review">待复查</option>
            <option value="done">已就绪</option>
          </select>
        </label>
        <label>
          <span>优先级</span>
          <select onChange={(event) => setPriorityBand(event.target.value as AlgorithmProblem["priorityBand"])} value={priorityBand}>
            <option value="">常规</option>
            <option value="P1">P1 · 优先</option>
            <option value="P2">P2 · 计划内</option>
            <option value="P3">P3 · 补充</option>
          </select>
        </label>
        <label>
          <span>训练阶段</span>
          <input maxLength={40} onChange={(event) => setPhaseKey(event.target.value)} placeholder="例如 W3" value={phaseKey} />
        </label>
        <label>
          <span>难度</span>
          <select onChange={(event) => setDifficultyBand(event.target.value as AlgorithmProblem["difficultyBand"])} value={difficultyBand}>
            <option value="">待标注</option>
            <option value="foundation">基础</option>
            <option value="standard">标准</option>
            <option value="challenge">挑战</option>
          </select>
        </label>
        <label>
          <span>下次复测</span>
          <input onChange={(event) => setNextReview(event.target.value)} type="date" value={nextReview} />
        </label>
        <label className="algorithmProblemManagerWide">
          <span>算法标签</span>
          <input maxLength={240} onChange={(event) => setTags(event.target.value)} placeholder="动态规划，边界处理" value={tags} />
        </label>
        <label className="algorithmProblemManagerWide">
          <span>管理备注</span>
          <textarea maxLength={2000} onChange={(event) => setNotes(event.target.value)} rows={4} value={notes} />
        </label>
      </div>
      <div className="algorithmProblemManagerActions">
        <small>导入题目的自定义字段会作为个人覆盖保留，后续同步继续生效。</small>
        <button className="primaryButton" disabled={busy} type="submit">
          <Save size={14} /> {busy ? "保存中…" : "保存题目资料"}
        </button>
      </div>
    </form>
  );
}

function ProblemList({
  judgeAvailability,
  codeStorageAvailable,
  problems,
  allProblems,
  initialProblemId,
  initialTaskId,
  today,
}: {
  judgeAvailability: JudgeRuntimeAvailability;
  codeStorageAvailable: boolean;
  problems: AlgorithmProblem[];
  allProblems: AlgorithmProblem[];
  initialProblemId: number | null;
  initialTaskId: number | null;
  today: string;
}) {
  if (!problems.length) {
    return (
      <div className="algorithmEmpty card">
        <Code2 size={28} />
        <h3>当前视图还没有题目</h3>
        <p>调整筛选条件或从“导入与同步”加入题库。</p>
      </div>
    );
  }
  return (
    <div className="algorithmProblemList">
      {problems.map((problem) => (
        <ProblemCard
          judgeAvailability={judgeAvailability}
          codeStorageAvailable={codeStorageAvailable}
          initialOpen={problem.id === initialProblemId}
          key={problem.id}
          problem={problem}
          relatedProblems={eligibleTransferSources(allProblems, problem)}
          sourceTaskId={problem.id === initialProblemId ? initialTaskId : null}
          today={today}
        />
      ))}
    </div>
  );
}

type ImportPreview = {
  rootPath: string;
  rootName: string;
  total: number;
  warningCount: number;
  phases: Array<{ key: string; count: number }>;
  statuses: Array<{ key: string; count: number }>;
  items: Array<{
    sourcePath: string;
    title: string;
    phase: string;
    priority: string;
    status: string;
    warnings: string[];
  }>;
};

function AlgorithmDevicePanel({ devices }: { devices: AlgorithmDevice[] }) {
  const { notify } = useFeedback();
  const [name, setName] = useState("我的 VS Code");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    startTransition(async () => {
      const result = await createAlgorithmDeviceAction({ name, platform: "vscode-desktop" });
      setBusy(false);
      if (!result.ok || !result.token) {
        notify(result.error || "VS Code 设备连接失败", "error");
        return;
      }
      setToken(result.token);
      notify("设备令牌已创建", "success");
    });
  }

  function revoke(device: AlgorithmDevice) {
    if (!window.confirm(`撤销“${device.name}”的刷题同步权限？`)) return;
    startTransition(async () => {
      const result = await revokeAlgorithmDeviceAction(device.id);
      if (!result.ok) {
        notify(result.error || "设备撤销失败", "error");
        return;
      }
      notify("设备权限已撤销", "success");
    });
  }

  return (
    <section className="algorithmDevicePanel card">
      <header>
        <span className="algorithmComposerIcon">
          <Laptop size={19} />
        </span>
        <div>
          <span className="sectionKicker">VS CODE SYNC</span>
          <h2>连接 VS Code</h2>
          <p>设备令牌只拥有算法题与代码草稿权限。</p>
        </div>
      </header>
      <form onSubmit={connect}>
        <label>
          <span>设备名称</span>
          <input maxLength={60} onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        <button className="secondaryButton" disabled={busy} type="submit">
          <Laptop size={15} />
          {busy ? "创建中…" : "创建设备令牌"}
        </button>
      </form>
      {token ? (
        <div className="algorithmDeviceToken">
          <p>令牌只显示这一次，请粘贴到扩展的“Ascend: Connect”命令中。</p>
          <code>{token}</code>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(token);
              notify("令牌已复制", "success");
            }}
            type="button"
          >
            <Copy size={14} />
            复制
          </button>
        </div>
      ) : null}
      <div className="algorithmDeviceList">
        {devices.map((device) => (
          <div key={device.id}>
            <span>
              <strong>{device.name}</strong>
              <small>
                {device.lastSeenAt ? `最近同步 ${formatDeviceTime(device.lastSeenAt)}` : "等待首次连接"} ·{" "}
                {device.tokenPrefix}
              </small>
            </span>
            <button aria-label={`撤销 ${device.name}`} onClick={() => revoke(device)} type="button">
              <Unplug size={14} />
            </button>
          </div>
        ))}
        {!devices.length ? <p>连接后，VS Code 会显示今日训练、到期复测和题单。</p> : null}
      </div>
    </section>
  );
}

function AlgorithmImportPanel({
  importRoots,
  importSources,
}: {
  importRoots: string[];
  importSources: AlgorithmImportSource[];
}) {
  const { notify } = useFeedback();
  const [rootPath, setRootPath] = useState(importRoots[0] || "");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);

  function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("preview");
    startTransition(async () => {
      const result = await previewAlgorithmImportAction({ rootPath });
      setBusy(null);
      if (!result.ok || !result.preview) {
        notify(result.error || "题库扫描失败", "error");
        return;
      }
      setRootPath(result.preview.rootPath);
      setPreview(result.preview);
      notify(`扫描完成：${result.preview.total} 道题`, "success");
    });
  }

  function runImport() {
    if (!preview || busy) return;
    setBusy("import");
    startTransition(async () => {
      const response = await importAlgorithmDirectoryAction({ rootPath: preview.rootPath });
      setBusy(null);
      if (!response.ok || !response.result) {
        notify(response.error || "题库导入失败", "error");
        return;
      }
      notify(
        `已导入 ${response.result.total} 道题，新增 ${response.result.created}，更新 ${response.result.updated}`,
        "success",
      );
    });
  }

  return (
    <section className="algorithmImporter card">
      <header>
        <span className="algorithmComposerIcon">
          <FolderInput size={19} />
        </span>
        <div>
          <span className="sectionKicker">FOLDER IMPORT</span>
          <h2>导入本地题库</h2>
          <p>先检查已经接入的数据源，再扫描目录并确认本次变化。</p>
        </div>
      </header>
      <div className="algorithmImportSources">
        <div className="algorithmImportSourcesTitle">
          <span>已接入数据源</span>
          <small>{importSources.length} 个</small>
        </div>
        {importSources.map((source) => (
          <article key={source.id}>
            <span className="algorithmImportSourceIcon" data-status={source.status}>
              <Database size={16} />
            </span>
            <span>
              <strong>{source.name}</strong>
              <small title={source.rootLocator}>{source.rootLocator}</small>
            </span>
            <span>
              <strong>{source.itemCount} 道</strong>
              <small>{source.lastImportedAt ? `同步于 ${formatImportTime(source.lastImportedAt)}` : "等待首次同步"}</small>
            </span>
            <b data-warning={source.warningCount > 0}>
              {source.warningCount ? `${source.warningCount} 条提醒` : "状态正常"}
            </b>
          </article>
        ))}
        {!importSources.length ? <p>完成一次目录导入后，数据源状态会显示在这里。</p> : null}
      </div>
      <form onSubmit={scan}>
        <label>
          <span>本地题库目录</span>
          <input
            onChange={(event) => setRootPath(event.target.value)}
            placeholder="/absolute/path/to/algorithm"
            required
            value={rootPath}
          />
        </label>
        <button className="secondaryButton" disabled={Boolean(busy)} type="submit">
          <Search size={15} />
          {busy === "preview" ? "扫描中…" : "扫描并预览"}
        </button>
      </form>
      {!importRoots.length ? (
        <p className="algorithmImportConfig">
          服务端需要配置 <code>ASCEND_ALGORITHM_IMPORT_ROOTS</code>，多个目录使用英文逗号分隔。
        </p>
      ) : null}
      {preview ? (
        <div className="algorithmImportPreview">
          <div className="algorithmImportSummary">
            <span>
              <strong>{preview.total}</strong> 道题
            </span>
            <span>
              <strong>{preview.phases.length}</strong> 个阶段
            </span>
            <span>
              <strong>{preview.warningCount}</strong> 条解析提醒
            </span>
          </div>
          <div className="algorithmImportChips">
            {preview.phases.map((item) => (
              <span key={item.key}>
                {item.key} · {item.count}
              </span>
            ))}
            {preview.statuses.map((item) => (
              <span key={item.key}>
                {materialStatusLabel(item.key)} · {item.count}
              </span>
            ))}
          </div>
          <div className="algorithmImportTable" role="table" aria-label="算法题导入预览">
            {preview.items.map((item) => (
              <div key={item.sourcePath} role="row">
                <span role="cell">
                  <strong>{item.title}</strong>
                  <small>{item.sourcePath}</small>
                </span>
                <span role="cell">{item.phase}</span>
                <span role="cell">{item.priority || "—"}</span>
                <span role="cell" data-warning={item.warnings.length > 0}>
                  {item.warnings.length ? `${item.warnings.length} 条提醒` : "字段完整"}
                </span>
              </div>
            ))}
          </div>
          <button className="primaryButton" disabled={Boolean(busy)} onClick={runImport} type="button">
            <FolderInput size={15} />
            {busy === "import" ? "导入中…" : `导入 ${preview.total} 道题`}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function materialStatusLabel(value: string): string {
  if (value === "doing") return "进行中";
  if (value === "review") return "待复查";
  if (value === "done") return "素材完成";
  return "待做";
}

function formatDeviceTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatImportTime(value: string): string {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
        <span className="algorithmComposerIcon">
          <Plus size={19} />
        </span>
        <div>
          <span className="sectionKicker">ADD PROBLEM</span>
          <h2>收录外部题目</h2>
          <p>仅保存链接和你填写的元数据。</p>
        </div>
      </header>
      <label>
        <span>题目链接</span>
        <div className="algorithmInputWithIcon">
          <Link2 size={15} />
          <input
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://bailian.openjudge.cn/..."
            required
            type="url"
            value={sourceUrl}
          />
        </div>
      </label>
      <div className="algorithmComposerRow">
        <label>
          <span>题目名称</span>
          <input maxLength={160} onChange={(event) => setTitle(event.target.value)} required value={title} />
        </label>
        <label>
          <span>平台题号</span>
          <input
            maxLength={120}
            onChange={(event) => setExternalProblemId(event.target.value)}
            placeholder="可留空"
            value={externalProblemId}
          />
        </label>
      </div>
      <div className="algorithmComposerRow">
        <label>
          <span>难度</span>
          <select onChange={(event) => setDifficultyBand(event.target.value)} value={difficultyBand}>
            <option value="">未标注</option>
            <option value="foundation">基础</option>
            <option value="standard">标准</option>
            <option value="challenge">挑战</option>
          </select>
        </label>
        <label>
          <span>技能标签</span>
          <input
            maxLength={240}
            onChange={(event) => setTags(event.target.value)}
            placeholder="动态规划，边界处理"
            value={tags}
          />
        </label>
      </div>
      <label>
        <span>训练备注</span>
        <textarea
          maxLength={2000}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="为什么选择这道题？需要验证什么？"
          rows={3}
          value={notes}
        />
      </label>
      <button className="primaryButton" disabled={busy} type="submit">
        <Save size={15} />
        {busy ? "保存中…" : "加入训练"}
      </button>
    </form>
  );
}

function ProblemCard({
  codeStorageAvailable,
  judgeAvailability,
  initialOpen,
  problem,
  relatedProblems,
  sourceTaskId,
  today,
}: {
  codeStorageAvailable: boolean;
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
            {problem.phaseKey ? <span>{problem.phaseKey}</span> : null}
            {problem.priorityBand ? <span>{problem.priorityBand}</span> : null}
            {problem.problemMode === "imported" ? <span>{materialStatusLabel(problem.materialStatus)}</span> : null}
            <span>{difficultyLabel(problem.difficultyBand)}</span>
          </div>
          <h3>{problem.title}</h3>
          <div className="algorithmTags">
            {problem.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
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
          {problem.problemMode !== "external" ? (
            <a href={`vscode://zzr.ascend-practice/open?problem=${problem.id}`} title="使用 Ascend Practice 扩展打开">
              VS Code <ArrowUpRight size={14} />
            </a>
          ) : null}
          {problem.problemMode === "managed" || problem.problemMode === "imported" ? (
            <button
              className="algorithmStartSession"
              onClick={() => setSessionOpen((current) => !current)}
              type="button"
            >
              <Code2 size={14} />
              {sessionOpen ? "收起训练" : "开始训练"}
            </button>
          ) : (
            <a href={problem.sourceUrl} rel="noreferrer" target="_blank">
              打开原题 <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      </header>
      <div className="algorithmEvidenceStrip">
        <span data-status={problem.evidenceStatus}>{evidenceLabel(problem.evidenceStatus)}</span>
        <small>{problem.nextReview ? `下次复测 ${problem.nextReview}` : "尚未安排复测"}</small>
        <small>{problem.attempts.length} 次记录</small>
        {latest ? (
          <small>
            最近 {latest.day} · {latest.verdict} · L{latest.maxHintLevel}
          </small>
        ) : null}
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
      {problem.problemMode === "imported" && sessionOpen ? (
        <ImportedAlgorithmWorkspace codeStorageAvailable={codeStorageAvailable} problem={problem} />
      ) : null}
      {problem.evaluationMode === "manual" ? (
        <AttemptRecorder problem={problem} relatedProblems={relatedProblems} today={today} />
      ) : null}
      {problem.attempts.length ? (
        <details className="algorithmAttemptHistory">
          <summary>查看历史记录</summary>
          <div>
            {problem.attempts.map((attempt) => (
              <article key={attempt.id}>
                <strong>{attempt.verdict}</strong>
                <span>
                  {attempt.day} · {reviewKindLabel(attempt.reviewKind)} · {attempt.durationMinutes} 分钟
                </span>
                <small>
                  {attempt.independent ? "独立通过" : `最高提示 L${attempt.maxHintLevel}`} ·{" "}
                  {attempt.sourceVerification === "provider_verified" ? "平台验证" : "用户记录"}
                </small>
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
  const [reviewKind, setReviewKind] = useState<AlgorithmReviewKind>(
    problem.attempts.length ? "original_retest" : "initial",
  );
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
    return (
      <button className="algorithmRecordTrigger" onClick={() => setOpen(true)} type="button">
        <RotateCcw size={15} />
        记录本次训练
      </button>
    );
  }

  return (
    <form className="algorithmAttemptForm" onSubmit={submit}>
      <div className="algorithmAttemptGrid">
        <label>
          <span>日期</span>
          <input onChange={(event) => setDay(event.target.value)} type="date" value={day} />
        </label>
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
            {REVIEW_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
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
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          <span>结果</span>
          <select onChange={(event) => setVerdict(event.target.value as AlgorithmVerdict)} value={verdict}>
            {VERDICTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>有效训练分钟</span>
          <div className="algorithmNumberInput">
            <Clock3 size={14} />
            <input
              min={0}
              onChange={(event) => setDurationMinutes(Number(event.target.value) || 0)}
              type="number"
              value={durationMinutes}
            />
          </div>
        </label>
        <label>
          <span>最高提示级别</span>
          <select onChange={(event) => setMaxHintLevel(Number(event.target.value))} value={maxHintLevel}>
            {[0, 1, 2, 3, 4].map((level) => (
              <option key={level} value={level}>
                L{level}
                {level >= 3 ? " · 非独立" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>提交前信心</span>
          <select
            onChange={(event) => setPreConfidence(event.target.value === "" ? null : Number(event.target.value))}
            value={preConfidence ?? ""}
          >
            <option value="">未记录</option>
            <option value="0">0 · 完全没把握</option>
            <option value="1">1 · 偏低</option>
            <option value="2">2 · 较有把握</option>
            <option value="3">3 · 很有把握</option>
          </select>
        </label>
      </div>
      <label>
        <span>错误类别</span>
        <input
          maxLength={80}
          onChange={(event) => setErrorCategory(event.target.value)}
          placeholder="例如：边界遗漏、复杂度判断错误"
          value={errorCategory}
        />
      </label>
      <label>
        <span>纠正规则与复盘</span>
        <textarea
          maxLength={2000}
          onChange={(event) => setReflection(event.target.value)}
          placeholder="下次遇到什么信号？先检查什么？"
          rows={3}
          value={reflection}
        />
      </label>
      <div className="algorithmAttemptActions">
        <button
          className="secondaryButton"
          disabled={busy}
          onClick={() => {
            operationIdRef.current = null;
            setOpen(false);
          }}
          type="button"
        >
          取消
        </button>
        <button className="primaryButton" disabled={busy} type="submit">
          <Save size={14} />
          {busy ? "保存中…" : "保存证据"}
        </button>
      </div>
    </form>
  );
}

function Metric({
  icon,
  label,
  value,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className={danger ? "algorithmMetric danger" : "algorithmMetric"}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
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

function problemModeLabel(value: AlgorithmProblem["problemMode"]): string {
  if (value === "imported") return "本地导入";
  if (value === "managed") return "内置题目";
  return "外部链接";
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function reviewKindLabel(value: AlgorithmReviewKind): string {
  return REVIEW_KINDS.find((kind) => kind.value === value)?.label || "训练";
}

function eligibleTransferSources(problems: AlgorithmProblem[], target: AlgorithmProblem): AlgorithmProblem[] {
  const targetTags = new Set(target.tags);
  return problems.filter(
    (candidate) =>
      candidate.id !== target.id &&
      ["independent_completed", "delayed_stable", "transfer_verified"].includes(candidate.evidenceStatus) &&
      candidate.tags.some((tag) => targetTags.has(tag)),
  );
}
