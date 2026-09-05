"use client";

import { AlertCircle, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, Code2, FileDown, FileCode2, FileUp, Folder, FolderOpen, FolderPlus, GripVertical, LibraryBig, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Settings2, Trash2, UploadCloud, X } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createAlgorithmFolderAction, createAlgorithmProblemAction, deleteAlgorithmFolderAction, deleteAlgorithmProblemsAction, finishAlgorithmPlanAction, finishDueAlgorithmReviewAction, getAlgorithmProblemDetailAction, moveAlgorithmFolderAction, moveAlgorithmProblemsAction, removeAlgorithmPlanAction, renameAlgorithmFolderAction, reorderAlgorithmFolderAction, reorderAlgorithmPlansAction, rescheduleAlgorithmPlanAction, rescheduleAlgorithmPlansAction, scheduleAlgorithmProblemsAction, revokeAlgorithmDeviceAction, setAlgorithmCurriculumChapterAction, setAlgorithmCourseAction, updateAlgorithmProblemAction } from "@/app/actions/algorithms";
import { useFeedback } from "@/components/FeedbackProvider";
import { MarkdownContent } from "@/components/MarkdownContent";
import plannerStyles from "@/styles/planner/primitives.module.css";
import type { AlgorithmCurriculumChapter } from "@/lib/algorithm-curriculum";
import type { JudgeRuntimeAvailability } from "@/lib/judge-runtime";
import type { AlgorithmDevice } from "@/lib/repo/algorithm-devices";
import type { AlgorithmDashboard, AlgorithmProblem } from "@/lib/repo/algorithms";
import type { AlgorithmTrainingRelations, PlannedAlgorithmProblem } from "@/lib/repo/algorithm-training";
import type { AlgorithmLibraryFolder } from "@/lib/repo/algorithm-library";
import { shiftDateKey } from "@/lib/dates";
import styles from "@/styles/algorithm-training.module.css";

type Section = "today" | "library";
type LibraryFilter = "all" | "curriculum" | "todo" | "done" | "review" | `chapter:${string}` | `course:${string}` | `stage:${string}` | `folder:${string}`;
type FilterOption = { value: string; label: string; count: number };
type TableSortKey = "title" | "ext" | "course" | "status";
type TableSort = { key: TableSortKey; dir: 1 | -1 };
type CompletionTarget = { problem: AlgorithmProblem; plan: PlannedAlgorithmProblem | null };
type FolderEditorState = { mode: "create"; parentId: string | null } | { mode: "edit"; folder: AlgorithmLibraryFolder };
type ProblemEditorValue = {
  title: string; sourceUrl: string; externalProblemId: string; difficultyBand: string; tags: string[]; notes: string;
  statementMarkdown: string; inputSpecification: string; outputSpecification: string;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  timeLimitMs: number; memoryLimitKb: number; folderId: string | null; chapterKey: string;
  courseName: string; stageKey: string; phaseKey: string; priorityBand: string; nextReview: string | null;
};
type ImportPreview = {
  sourcePath: string;
  title: string;
  providerId: string;
  externalProblemId: string;
  phase: string;
  topics: string[];
  statementMarkdown: string;
  matchStatus: "identified" | "confirm" | "incomplete";
  matchCandidates: Array<{ providerId: string; externalProblemId: string; title: string }>;
  warnings: string[];
  courseSuggestion?: { courseName: string; stageKey: string } | null;
};
type ImportRow = { id: string; file: File; relativePath: string; preview: ImportPreview | null; error: string };
type PackagePreview = {
  packageId: string;
  name: string;
  description: string;
  total: number;
  created: number;
  updated: number;
  reused: number;
  unchanged: number;
  numberCollisions: number;
  warningCount: number;
  warnings: string[];
};

const LIBRARY_PAGE_SIZE = 20;
const DETAIL_MIN_WIDTH = 300;
const DETAIL_MAX_WIDTH = 760;
const DETAIL_DEFAULT_WIDTH = 360;

function parseUrlId(value: string | null): number | null {
  if (!value || !/^\d{1,12}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeLibraryFilter(value: string | null): LibraryFilter {
  if (!value) return "all";
  if (value === "all" || value === "curriculum" || value === "todo" || value === "done" || value === "review" || value.startsWith("chapter:") || value.startsWith("course:") || value.startsWith("stage:") || value.startsWith("folder:")) {
    return value as LibraryFilter;
  }
  return "all";
}

function normalizeDateParam(value: string | null, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function parseTableSortParam(value: string | null): TableSort | null {
  if (!value) return null;
  const [key, dir] = value.split(":");
  if ((key === "title" || key === "ext" || key === "course" || key === "status") && (dir === "asc" || dir === "desc")) {
    return { key, dir: dir === "asc" ? 1 : -1 };
  }
  return null;
}

function clampDetailWidth(value: number): number {
  const max = typeof window === "undefined" ? DETAIL_MAX_WIDTH : Math.min(DETAIL_MAX_WIDTH, Math.max(DETAIL_MIN_WIDTH, window.innerWidth - 600));
  return Math.round(Math.min(max, Math.max(DETAIL_MIN_WIDTH, value)));
}

export function AlgorithmTrainingBoardV2({ dashboard, devices, judgeAvailability, relations, today }: { dashboard: AlgorithmDashboard; devices: AlgorithmDevice[]; judgeAvailability: JudgeRuntimeAvailability; relations: AlgorithmTrainingRelations; today: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notify, confirm } = useFeedback();
  const selectedDate = normalizeDateParam(searchParams.get("day"), today);
  const [showReviews, setShowReviews] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [packageImportOpen, setPackageImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [completion, setCompletion] = useState<CompletionTarget | null>(null);
  const [problemEditor, setProblemEditor] = useState<AlgorithmProblem | "new" | null>(null);
  const [pending, setPending] = useState(false);
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);
  // 撤销请求发出后、设备列表刷新前，按钮保持忙碌；设备消失即视为完成。
  const pendingDeviceId = revokingDeviceId && devices.some((device) => device.id === revokingDeviceId) ? revokingDeviceId : null;

  useEffect(() => {
    const saved = window.localStorage.getItem("ascend.algorithm.showReviews");
    if (saved) queueMicrotask(() => setShowReviews(saved === "1"));
  }, []);

  // URL 状态契约：tab/主筛选/problem 可回退（push），q/sort/page 连续操作不刷历史（replace）。
  function updateUrl(entries: Record<string, string | null>, mode: "push" | "replace") {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(entries)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    const url = `/practice/algorithms${query ? `?${query}` : ""}`;
    if (mode === "push") router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  }

  const urlProblem = parseUrlId(searchParams.get("problem"));
  const section: Section = searchParams.get("tab") === "library" || (!searchParams.has("tab") && urlProblem !== null) ? "library" : "today";
  const selectedProblemId = urlProblem;
  const setSection = (next: Section) => updateUrl({ tab: next === "library" ? "library" : null, problem: null }, "push");
  const setSelectedDate = (day: string) => updateUrl({ day: day === today ? null : day }, "push");
  const openProblem = (id: number | null) => {
    if (id === null) {
      // 关闭详情不离开题库：仅当前不在题库时才移除 tab
      updateUrl({ problem: null, tab: section === "library" ? "library" : null }, "push");
      return;
    }
    updateUrl({ problem: String(id), tab: "library" }, "push");
  };

  function mutate(action: () => Promise<{ ok: boolean; error?: string }>, success: string, onSuccess?: () => void) {
    if (pending) return;
    setPending(true);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          notify(result.error || "操作失败", "error");
          return;
        }
        onSuccess?.();
        notify(success);
        router.refresh();
      } catch (reason) {
        console.error("算法训练操作失败", reason);
        notify("网络异常，操作未生效，可以重试", "error");
      } finally {
        setPending(false);
      }
    });
  }

  function deleteProblems(problemIds: number[]) {
    void confirm({
      title: `删除 ${problemIds.length} 道题？`,
      description: "题面、参考代码、算法训练记录、题库关系及关联训练计划会被删除。已完成的学习证据继续保留。此操作无法撤销。",
      confirmLabel: "删除题目",
      danger: true,
    }).then((accepted) => {
      if (!accepted) return;
      mutate(() => deleteAlgorithmProblemsAction({ problemIds }), `已删除 ${problemIds.length} 道题`, () => {
        setSelectedIds([]);
        if (selectedProblemId && problemIds.includes(selectedProblemId)) openProblem(null);
      });
    });
  }

  function saveProblem(value: ProblemEditorValue) {
    const editing = problemEditor === "new" ? null : problemEditor;
    let savedId = editing?.id ?? null;
    mutate(async () => {
      const payload = {
        title: value.title,
        sourceUrl: value.sourceUrl || undefined,
        externalProblemId: value.externalProblemId || undefined,
        difficultyBand: value.difficultyBand,
        tags: value.tags,
        notes: value.notes,
        statementMarkdown: value.statementMarkdown,
        inputSpecification: value.inputSpecification,
        outputSpecification: value.outputSpecification,
        examples: value.examples,
        timeLimitMs: value.timeLimitMs,
        memoryLimitKb: value.memoryLimitKb,
      };
      if (editing) {
        const saved = await updateAlgorithmProblemAction({ problemId: editing.id, ...payload, priorityBand: value.priorityBand, phaseKey: value.phaseKey, nextReview: value.nextReview });
        if (!saved.ok) return saved;
        savedId = editing.id;
      } else {
        const saved = await createAlgorithmProblemAction(payload);
        if (!saved.ok) return saved;
        savedId = saved.problemId ?? null;
      }
      if (!savedId) return { ok: false, error: "题目已保存，目录关系等待刷新" };
      const moved = await moveAlgorithmProblemsAction({ problemIds: [savedId], folderId: value.folderId });
      if (!moved.ok) return moved;
      if (value.chapterKey) {
        const chapter = await setAlgorithmCurriculumChapterAction({ problemIds: [savedId], chapterKey: value.chapterKey });
        if (!chapter.ok) return chapter;
      }
      if (value.courseName.trim()) {
        const source = await setAlgorithmCourseAction({ problemIds: [savedId], courseName: value.courseName, stageKey: value.stageKey });
        if (!source.ok) return source;
      }
      return { ok: true };
    }, editing ? "题目已更新" : "题目已创建", () => {
      setProblemEditor(null);
      if (savedId) openProblem(savedId);
    });
  }

  return (
    <main className={styles.shell} aria-busy={pending}>
      <header className={styles.topbar}>
        <nav className={styles.tabs} aria-label="算法训练主导航">
          <button aria-current={section === "today" ? "page" : undefined} onClick={() => setSection("today")}>
            <CalendarDays size={17} /> 训练计划
          </button>
          <button aria-current={section === "library" ? "page" : undefined} onClick={() => setSection("library")}>
            <LibraryBig size={17} /> 题库
          </button>
        </nav>
        <div className={styles.topActions}>
          {section === "library" ? <button className={styles.primaryButton} onClick={() => setProblemEditor("new")}><Plus size={17} /> 新建题目</button> : null}
          <button className={styles.secondaryButton} onClick={() => setPackageImportOpen(true)}>
            <FileUp size={17} /> 导入题库包
          </button>
          <button className={styles.secondaryButton} onClick={() => setImportOpen(true)}>
            <Plus size={17} /> 添加 CPP
          </button>
          <button aria-label="连接与设置" className={styles.iconButton} onClick={() => setSettingsOpen(true)}>
            <Settings2 size={18} />
          </button>
        </div>
      </header>

      <div hidden={section !== "today"}>
        <TodayView
          dashboard={dashboard}
          onComplete={setCompletion}
          onOpenProblem={(id) => openProblem(id)}
          onOpenPicker={() => setPickerOpen(true)}
          onRemove={(plan) => {
            const problem = dashboard.problems.find((item) => item.id === plan.problemId);
            void confirm({
              title: "移出训练计划？",
              description: `「${problem?.title ?? "该题"}」将从 ${plan.day} 的计划中移除。`,
              confirmLabel: "移出",
              danger: true,
            }).then((ok) => {
              if (ok) {
                mutate(() => removeAlgorithmPlanAction({ taskId: plan.taskId, expectedVersion: plan.version, day: plan.day }), "已移出训练计划");
              }
            });
          }}
          onReorder={(taskIds) => reorderAlgorithmPlansAction({ day: selectedDate, taskIds })}
          onReorderSettled={() => {}}
          plans={relations.plans}
          curriculum={relations.curriculum}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          setShowReviews={(value) => {
            setShowReviews(value);
            window.localStorage.setItem("ascend.algorithm.showReviews", value ? "1" : "0");
          }}
          showReviews={showReviews}
          today={today}
          onReschedule={(plan, targetDay) => mutate(
            () => rescheduleAlgorithmPlanAction({ taskId: plan.taskId, expectedVersion: plan.version, fromDay: plan.day, targetDay }),
            `已移到 ${targetDay}`,
          )}
          onRescheduleAll={(items) => mutate(
            () => rescheduleAlgorithmPlansAction({
              plans: items.map((plan) => ({ taskId: plan.taskId, expectedVersion: plan.version })),
              fromDays: items.map((plan) => plan.day),
              targetDay: today,
            }),
            `已将 ${items.length} 道逾期题移到今天`,
          )}
        />
      </div>
      <div hidden={section !== "library"}>
        <LibraryView dashboard={dashboard} onAddPlan={(problemIds, day) => mutate(() => scheduleAlgorithmProblemsAction({ problemIds, day }), `已加入 ${day} 的训练计划`)} onDelete={deleteProblems} onEditProblem={setProblemEditor} onMove={(problemIds, folderId) => mutate(() => moveAlgorithmProblemsAction({ problemIds, folderId }), "题目位置已更新")} onSetCourse={(problemIds, courseName, stageKey) => mutate(() => setAlgorithmCourseAction({ problemIds, courseName, stageKey }), "来源题单已保存")} onSetCurriculum={(problemIds, chapterKey) => mutate(() => setAlgorithmCurriculumChapterAction({ problemIds, chapterKey }), "课程章节已同步")} relations={relations} selectedIds={selectedIds} selectedProblemId={selectedProblemId} setSelectedIds={setSelectedIds} setOpenProblem={openProblem} today={today} filterParam={searchParams.get("filter")} queryParam={searchParams.get("q") ?? ""} sortParam={searchParams.get("sort")} pageParam={searchParams.get("page")} updateUrl={updateUrl} />
      </div>

      {pickerOpen ? (
        <ProblemPicker
          problems={dashboard.problems}
          plannedProblemIds={relations.plans.filter((plan) => plan.day === selectedDate && plan.status !== "canceled").map((plan) => plan.problemId)}
          selectedDate={selectedDate}
          onClose={() => setPickerOpen(false)}
          onSubmit={(ids) => {
            setPickerOpen(false);
            mutate(() => scheduleAlgorithmProblemsAction({ problemIds: ids, day: selectedDate }), "题目已加入训练计划");
          }}
        />
      ) : null}
      {completion ? (
        <CompletionDialog
          target={completion}
          today={today}
          onClose={() => setCompletion(null)}
          onChoose={(choice, attemptDayMode) => {
            const target = completion;
            setCompletion(null);
            mutate(
              () =>
                target.plan
                  ? finishAlgorithmPlanAction({
                      taskId: target.plan.taskId,
                      expectedVersion: target.plan.version,
                      problemId: target.problem.id,
                      day: selectedDate,
                      choice,
                      attemptDayMode,
                    })
                  : finishDueAlgorithmReviewAction({ problemId: target.problem.id, day: selectedDate, choice }),
              choice === "tomorrow" ? "已安排到明天" : "训练结果已记录",
            );
          }}
        />
      ) : null}
      {importOpen ? (
        <CppImportDialog
          folders={relations.library.folders}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            router.refresh();
          }}
        />
      ) : null}
      {packageImportOpen ? (
        <PackageImportDialog
          folders={relations.library.folders}
          onClose={() => setPackageImportOpen(false)}
          onImported={() => {
            setPackageImportOpen(false);
            router.refresh();
          }}
        />
      ) : null}
      {problemEditor ? (
        <ProblemEditorDialog
          problem={problemEditor === "new" ? null : problemEditor}
          relations={relations}
          onClose={() => setProblemEditor(null)}
          onSubmit={saveProblem}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsDialog
          devices={devices}
          judge={judgeAvailability}
          onClose={() => setSettingsOpen(false)}
          onRevokeDevice={(deviceId, deviceName) => {
            void confirm({
              title: "撤销这台设备？",
              description: `「${deviceName}」的访问令牌会立即失效，需要重新配对才能同步。`,
              confirmLabel: "撤销设备",
              danger: true,
            }).then((ok) => {
              if (!ok) return;
              setRevokingDeviceId(deviceId);
              mutate(async () => revokeAlgorithmDeviceAction(deviceId), "设备已撤销");
            });
          }}
          pendingDeviceId={pendingDeviceId}
        />
      ) : null}
    </main>
  );
}

function TodayView({ dashboard, onComplete, onOpenPicker, onOpenProblem, onRemove, onReorder, onReorderSettled, onReschedule, onRescheduleAll, plans, curriculum, selectedDate, setSelectedDate, showReviews, setShowReviews, today }: { dashboard: AlgorithmDashboard; onComplete: (target: CompletionTarget) => void; onOpenPicker: () => void; onOpenProblem: (id: number) => void; onRemove: (plan: PlannedAlgorithmProblem) => void; onReorder: (taskIds: string[]) => Promise<{ ok: boolean; error?: string }>; onReorderSettled: () => void; onReschedule: (plan: PlannedAlgorithmProblem, targetDay: string) => void; onRescheduleAll: (plans: PlannedAlgorithmProblem[]) => void; plans: PlannedAlgorithmProblem[]; curriculum: AlgorithmTrainingRelations["curriculum"]; selectedDate: string; setSelectedDate: (value: string) => void; showReviews: boolean; setShowReviews: (value: boolean) => void; today: string }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const primaryChapterByProblem = curriculumPrimaryChapters(curriculum);
  const manualPlans = plans.filter((item) => item.day === selectedDate && item.status !== "canceled");
  const overduePlans = selectedDate === today
    ? plans.filter((item) => item.day < today && item.status !== "completed" && item.status !== "canceled").sort((a, b) => a.day.localeCompare(b.day))
    : [];
  // 排序乐观化：本地顺序立即生效，服务端确认前单飞串行提交，失败恢复服务端真值。
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);
  const reorderQueue = useRef<Promise<void>>(Promise.resolve());
  const due = selectedDate === today ? dashboard.problems.filter((problem) => problem.reviewEnabled && problem.nextReview && problem.nextReview <= today) : dashboard.problems.filter((problem) => problem.reviewEnabled && problem.nextReview === selectedDate);
  const orderedPlans = useMemo(() => {
    if (orderOverride) {
      const byTaskId = new Map(manualPlans.map((plan) => [plan.taskId, plan]));
      const overridden = orderOverride.map((taskId) => byTaskId.get(taskId)).filter((plan): plan is PlannedAlgorithmProblem => Boolean(plan));
      const rest = manualPlans.filter((plan) => !orderOverride.includes(plan.taskId));
      return [...overridden, ...rest];
    }
    // 默认顺序：未完成在前，已完成沉底
    return [...manualPlans.filter((plan) => plan.status !== "completed"), ...manualPlans.filter((plan) => plan.status === "completed")];
  }, [manualPlans, orderOverride]);
  const rows: Array<{
    problem: AlgorithmProblem;
    plan: PlannedAlgorithmProblem | null;
    review: boolean;
    planIndex: number;
    overdue?: boolean;
  }> = orderedPlans
    .map((plan, planIndex) => ({ plan, planIndex }))
    .filter((entry) => !(completedCollapsed && entry.plan.status === "completed"))
    .flatMap((entry) => {
      const problem = dashboard.problems.find((item) => item.id === entry.plan.problemId);
      return problem
        ? [
            {
              problem,
              plan: entry.plan,
              review: due.some((item) => item.id === problem.id),
              planIndex: entry.planIndex,
            },
          ]
        : [];
    });
  if (showReviews) {
    for (const problem of due) {
      if (!rows.some((row) => row.problem.id === problem.id)) rows.push({ problem, plan: null, review: true, planIndex: -1 });
    }
  }
  for (const plan of overduePlans) {
    const problem = dashboard.problems.find((item) => item.id === plan.problemId);
    if (problem) rows.unshift({ problem, plan, review: false, planIndex: -1, overdue: true });
  }
  const completedCount = manualPlans.filter((plan) => plan.status === "completed").length;

  // 服务端真值到达后清掉本地覆盖，避免与刷新后的数据漂移（渲染期对账）
  const plansFingerprint = manualPlans.map((plan) => `${plan.taskId}:${plan.status}`).join("|");
  const [settledFingerprint, setSettledFingerprint] = useState(plansFingerprint);
  if (settledFingerprint !== plansFingerprint) {
    setSettledFingerprint(plansFingerprint);
    setOrderOverride(null);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= orderedPlans.length) return;
    const next = [...orderedPlans];
    [next[index], next[target]] = [next[target], next[index]];
    const taskIds = next.map((item) => item.taskId);
    setOrderOverride(taskIds);
    reorderQueue.current = reorderQueue.current.then(async () => {
      try {
        const result = await onReorder(taskIds);
        if (!result.ok) {
          notify(result.error || "排序保存失败", "error");
          setOrderOverride(null);
        }
      } catch {
        notify("网络异常，顺序未保存，已恢复原顺序", "error");
        setOrderOverride(null);
      } finally {
        onReorderSettled();
        void router.refresh();
      }
    });
  }

  return (
    <section className={styles.todayPage}>
      <div className={styles.heroRow}>
        <div>
          <span className={styles.eyebrow}>训练计划</span>
          <h2>{selectedDate === today ? "今天" : selectedDate}</h2>
          <p>
            {rows.length ? `${completedCount}/${orderedPlans.length} 已完成，按你的顺序逐题处理。` : "先从题库加入几道题。"}
            {completedCount > 0 ? (
              <button className={styles.collapseToggle} onClick={() => setCompletedCollapsed((value) => !value)} type="button">
                {completedCollapsed ? `显示已完成（${completedCount}）` : "收起已完成"}
              </button>
            ) : null}
          </p>
        </div>
        <div className={styles.heroSide}>
          <button aria-label="上一天" className={styles.iconButton} onClick={() => setSelectedDate(shiftDateKey(selectedDate, -1))} title="上一天" type="button">
            <ChevronLeft size={18} />
          </button>
          <label className={styles.dateField}>
            <span className={styles.srOnly}>训练日期</span>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          </label>
          <button aria-label="下一天" className={styles.iconButton} onClick={() => setSelectedDate(shiftDateKey(selectedDate, 1))} title="下一天" type="button">
            <ChevronRight size={18} />
          </button>
          <button className={styles.backToday} disabled={selectedDate === today} onClick={() => setSelectedDate(today)} type="button">
            回到今天
          </button>
        </div>
      </div>
      <div aria-label="题库证据概览" className={styles.metricBand}>
        <span>
          <b>{dashboard.metrics.problemCount}</b> 题库
        </span>
        <span>
          <b>{dashboard.metrics.attemptedCount}</b> 已做
        </span>
        <span>
          <b>{dashboard.metrics.independentCount}</b> 独立完成
        </span>
        <span>
          <b>{dashboard.metrics.dueCount}</b> 待复习
        </span>
      </div>
      <div className={styles.todayToolbar}>
        <button className={styles.primaryButton} onClick={onOpenPicker}>
          <Plus size={17} /> 添加题目
        </button>
        <label className={styles.switchLabel}>
          <input checked={showReviews} type="checkbox" onChange={(event) => setShowReviews(event.target.checked)} />
          <span /> 显示到期复习 <b>{due.length}</b>
        </label>
      </div>
      <div className={styles.planList}>
        {overduePlans.length ? (
          <div className={styles.overdueHeader}>
            <span><AlertCircle size={16} /> 逾期未完成 · {overduePlans.length}</span>
            <span className={styles.overdueActions}>
              <small>按原计划日期排列</small>
              <button onClick={() => onRescheduleAll(overduePlans)} type="button">全部移到今天</button>
            </span>
          </div>
        ) : null}
        {rows.map((row) => (
          <article className={styles.planRow} data-overdue={row.overdue || undefined} key={`${row.problem.id}:${row.plan?.taskId ?? "review"}`}>
            <span className={styles.grip} data-static={row.plan ? undefined : "true"}>
              <GripVertical size={17} />
            </span>
            <button className={styles.completeCircle} aria-label={`完成 ${row.problem.title}`} data-completed={row.plan?.status === "completed" || undefined} onClick={() => onComplete(row)}>
              {row.plan?.status === "completed" ? <Check size={16} /> : <Circle size={17} />}
            </button>
            <button className={styles.planTitle} onClick={() => onOpenProblem(row.problem.id)}>
              <strong>{row.problem.title}</strong>
              <span>
                {providerText(row.problem)} · {curriculumChapterText(row.problem, primaryChapterByProblem)}
              </span>
            </button>
            {row.review ? <span className={styles.reviewBadge}>复习</span> : null}
            {row.overdue && row.plan ? <span className={styles.overdueBadge}>{row.plan.day}</span> : null}
            {row.plan ? (
              <span className={styles.rowActions}>
                {row.plan.day < today && (row.plan.status === "open" || row.plan.status === "waiting") ? (
                  <button className={styles.moveTodayButton} onClick={() => onReschedule(row.plan!, today)} type="button">移到今天</button>
                ) : (
                  <>
                    <button aria-label="上移" disabled={row.planIndex === 0} onClick={() => move(row.planIndex, -1)}>↑</button>
                    <button aria-label="下移" disabled={row.planIndex >= orderedPlans.length - 1} onClick={() => move(row.planIndex, 1)}>↓</button>
                  </>
                )}
                <button aria-label="移出计划" onClick={() => onRemove(row.plan!)}>
                  <X size={16} />
                </button>
              </span>
            ) : (
              <span className={styles.dueText}>到期 {row.problem.nextReview}</span>
            )}
          </article>
        ))}
        {!rows.length ? (
          <div className={styles.emptyState}>
            <CalendarDays size={28} />
            <h3>这一天还很轻</h3>
            <p>从课程章节、题库或当前题目加入训练。</p>
            <button className={styles.primaryButton} onClick={onOpenPicker}>
              选择题目
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LibraryView({ dashboard, onAddPlan, onDelete, onEditProblem, onMove, onSetCourse, onSetCurriculum, relations, selectedIds, selectedProblemId, setSelectedIds, setOpenProblem, today, filterParam, queryParam, sortParam, pageParam, updateUrl }: { dashboard: AlgorithmDashboard; onAddPlan: (ids: number[], day: string) => void; onDelete: (ids: number[]) => void; onEditProblem: (problem: AlgorithmProblem) => void; onMove: (ids: number[], folderId: string | null) => void; onSetCourse: (ids: number[], courseName: string, stageKey: string) => void; onSetCurriculum: (ids: number[], chapterKey: string) => void; relations: AlgorithmTrainingRelations; selectedIds: number[]; selectedProblemId: number | null; setSelectedIds: (ids: number[]) => void; setOpenProblem: (id: number | null) => void; today: string; filterParam: string | null; queryParam: string; sortParam: string | null; pageParam: string | null; updateUrl: (entries: Record<string, string | null>, mode: "push" | "replace") => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm, notify } = useFeedback();
  const curriculumChapters = useMemo(
    () =>
      relations.curriculum.chapters.map((chapter) => ({
        key: chapter.key,
        order: chapter.sortOrder,
        title: chapter.name,
        weekLabel: chapter.weekLabel,
        description: chapter.description,
      })),
    [relations.curriculum.chapters],
  );
  const curriculumByProblem = useMemo(() => curriculumPrimaryChapters(relations.curriculum), [relations.curriculum]);
  const curriculumChaptersByProblem = useMemo(() => curriculumAllChapters(relations.curriculum), [relations.curriculum]);
  const curriculumStats = useMemo(
    () =>
      curriculumChapters.map((chapter) => {
        const problems = dashboard.problems.filter((problem) => curriculumChaptersByProblem.get(problem.id)?.some((item) => item.key === chapter.key));
        return {
          chapter,
          completed: problems.filter(isAlgorithmCompleted).length,
          total: problems.length,
        };
      }),
    [curriculumChapters, curriculumChaptersByProblem, dashboard.problems],
  );
  const currentChapter = curriculumStats.find((item) => item.total > 0 && item.completed < item.total) ?? curriculumStats.find((item) => item.total > 0) ?? null;
  const initialChapter = selectedProblemId ? (curriculumByProblem.get(selectedProblemId) ?? currentChapter?.chapter) : currentChapter?.chapter;
  // 筛选/搜索/排序/页码由 URL 驱动（见主组件契约），刷新与回退都能保住现场。
  const folderParam = searchParams.get("folder");
  const filter = folderParam ? (`folder:${folderParam}` as LibraryFilter) : normalizeLibraryFilter(filterParam);
  const query = queryParam;
  const statusFilter = searchParams.get("status") ?? "";
  const courseFilter = searchParams.get("course") ?? "";
  const sourceFilter = searchParams.get("source") ?? "";
  const providersSelected = (searchParams.get("platform") ?? "").split(",").filter(Boolean);
  const tagsSelected = (searchParams.get("tag") ?? "").split(",").filter(Boolean);
  const tableSort = parseTableSortParam(sortParam);
  const pageIndex = Math.max(0, Number.parseInt(pageParam ?? "0", 10) || 0);
  const [planDate, setPlanDate] = useState(today);
  const [courseName, setCourseName] = useState(relations.courses[0]?.name || "郭炜算法基础");
  const [stageKey, setStageKey] = useState("W1");
  const [curriculumChapterKey, setCurriculumChapterKey] = useState(initialChapter?.key ?? curriculumChapters[0]?.key ?? "");
  const [detailWidth, setDetailWidth] = useState<number | null>(null);
  const [exportProblemIds, setExportProblemIds] = useState<number[] | null>(null);
  const [folderEditor, setFolderEditor] = useState<FolderEditorState | null>(null);
  const [folderDrawerOpen, setFolderDrawerOpen] = useState(false);
  const [detailProblem, setDetailProblem] = useState<AlgorithmProblem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const membershipsByProblem = useMemo(() => groupMemberships(relations), [relations]);
  const folderByProblem = useMemo(() => new Map(relations.library.items.map((item) => [item.problemId, item.folderId])), [relations.library.items]);
  const topics = [...new Set(dashboard.problems.flatMap((problem) => problem.tags))].sort();
  const platformOptions: FilterOption[] = useMemo(() => {
    const byId = new Map<string, FilterOption>();
    for (const problem of dashboard.problems) {
      const current = byId.get(problem.providerId);
      if (current) current.count += 1;
      else
        byId.set(problem.providerId, {
          value: problem.providerId,
          label: problem.providerLabel || problem.providerId,
          count: 1,
        });
    }
    return [...byId.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }, [dashboard.problems]);
  const tagOptions: FilterOption[] = useMemo(
    () =>
      topics.map((tag) => ({
        value: tag,
        label: tag,
        count: dashboard.problems.filter((problem) => problem.tags.includes(tag)).length,
      })),
    [topics, dashboard.problems],
  );
  const filtered = dashboard.problems.filter((problem) => {
    const text = `${problem.title} ${problem.externalProblemId} ${problem.providerLabel} ${problem.tags.join(" ")} ${problem.notes}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (filter === "todo") return learningStatus(problem, today) === "todo";
    if (filter === "done") return learningStatus(problem, today) === "done";
    if (filter === "review") return learningStatus(problem, today) === "review";
    if (statusFilter && learningStatus(problem, today) !== statusFilter) return false;
    if (courseFilter && !curriculumChaptersByProblem.get(problem.id)?.some((item) => item.key === courseFilter)) return false;
    const membershipsForProblem = membershipsByProblem.get(problem.id);
    if (sourceFilter && !membershipsForProblem?.some((item) => item.courseKey === sourceFilter)) return false;
    if (filter.startsWith("chapter:")) {
      if (!curriculumChaptersByProblem.get(problem.id)?.some((item) => item.key === filter.slice(8))) return false;
    } else if (filter.startsWith("course:")) {
      if (!membershipsForProblem?.some((item) => item.courseKey === filter.slice(7))) return false;
    } else if (filter.startsWith("stage:")) {
      const [courseKey, stageFilter] = filter.slice(6).split("||");
      if (!membershipsForProblem?.some((item) => item.courseKey === courseKey && item.stageKey === stageFilter)) return false;
    } else if (filter.startsWith("folder:")) {
      if ((folderByProblem.get(problem.id) || "root") !== filter.slice(7)) return false;
    }
    // 维度内任一命中（OR），维度之间取交集（AND）
    if (providersSelected.length && !providersSelected.includes(problem.providerId)) return false;
    if (tagsSelected.length && !tagsSelected.some((tag) => problem.tags.includes(tag))) return false;
    return true;
  });
  const statusRank: Record<"todo" | "done" | "review", number> = { todo: 0, done: 1, review: 2 };
  const courseStageLabel = (problem: AlgorithmProblem): string => {
    const chapter = curriculumByProblem.get(problem.id);
    return chapter ? `${chapter.order}·${chapter.title}` : "\uffff";
  };
  const sortedProblems = useMemo(() => {
    if (!tableSort) return filtered;
    const dir = tableSort.dir;
    const collator = new Intl.Collator("zh-Hans-CN", { numeric: true });
    return [...filtered].sort((left, right) => {
      switch (tableSort.key) {
        case "title":
          return collator.compare(left.title, right.title) * dir;
        case "ext":
          return collator.compare(providerText(left), providerText(right)) * dir;
        case "course":
          return collator.compare(courseStageLabel(left), courseStageLabel(right)) * dir;
        case "status":
          return (statusRank[learningStatus(left, today)] - statusRank[learningStatus(right, today)]) * dir;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, tableSort, curriculumByProblem, today]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / LIBRARY_PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleProblems = sortedProblems.slice(safePageIndex * LIBRARY_PAGE_SIZE, (safePageIndex + 1) * LIBRARY_PAGE_SIZE);
  useEffect(() => {
    const saved = Number(window.localStorage.getItem("ascend.algorithm.detailWidth"));
    if (Number.isFinite(saved) && saved >= DETAIL_MIN_WIDTH && saved <= DETAIL_MAX_WIDTH) {
      queueMicrotask(() => setDetailWidth(saved));
    }
  }, []);

  function applyFilter(next: LibraryFilter) {
    setFolderDrawerOpen(false);
    if (next === "all") updateUrl({ folder: null, filter: null, page: null }, "push");
    else if (next.startsWith("folder:")) updateUrl({ folder: next.slice(7), filter: null, page: null }, "push");
    else updateUrl({ filter: next, folder: null, page: null }, "push");
  }

  function toggleTableSort(key: TableSortKey) {
    const next = !tableSort || tableSort.key !== key ? `${key}:asc` : tableSort.dir === 1 ? `${key}:desc` : null;
    updateUrl({ sort: next, page: null }, "replace");
  }

  function changeQuery(value: string) {
    updateUrl({ q: value || null, page: null }, "replace");
  }

  function changePage(next: number) {
    updateUrl({ page: next > 0 ? String(next) : null }, "replace");
  }

  function toggleSelection(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function toggleProvider(value: string) {
    const next = toggleSelection(providersSelected, value);
    updateUrl({ platform: next.length ? next.join(",") : null, page: null }, "replace");
  }

  function toggleTag(value: string) {
    const next = toggleSelection(tagsSelected, value);
    updateUrl({ tag: next.length ? next.join(",") : null, page: null }, "replace");
  }

  const hasActiveRefiners = Boolean(statusFilter || courseFilter || sourceFilter || providersSelected.length || tagsSelected.length);

  function resetAllFilters() {
    updateUrl({ filter: null, folder: null, q: null, status: null, course: null, source: null, platform: null, tag: null, page: null }, "push");
  }

  const sortCell = (key: TableSortKey, label: string) => (
    <button aria-label={`按${label}排序${tableSort?.key === key ? (tableSort.dir === 1 ? "，当前升序" : "，当前降序") : ""}`} className={styles.headSort} data-active={tableSort?.key === key || undefined} onClick={() => toggleTableSort(key)} type="button">
      {label}
      <i aria-hidden>{tableSort?.key === key ? (tableSort.dir === 1 ? "↑" : "↓") : "⇅"}</i>
    </button>
  );

  function commitDetailWidth(value: number) {
    setDetailWidth(value);
    window.localStorage.setItem("ascend.algorithm.detailWidth", String(value));
  }

  function startDetailResize(event: React.PointerEvent<HTMLDivElement>) {
    // 捕获必须设在柄自己身上：设在祖先 aside 会把 pointerup 重定向走，
    // mousedown/mouseup 目标不一致时浏览器不合成 click/dblclick，双击恢复默认就失效
    const grabber = event.currentTarget;
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startWidth = grabber.parentElement?.getBoundingClientRect().width ?? 0;
    document.body.dataset.algResizing = "true";
    const onMove = (moveEvent: PointerEvent) => {
      setDetailWidth(clampDetailWidth(startWidth + startX - moveEvent.clientX));
    };
    const onEnd = (upEvent: PointerEvent) => {
      grabber.removeEventListener("pointermove", onMove);
      delete document.body.dataset.algResizing;
      if (upEvent.type === "pointercancel") {
        commitDetailWidth(clampDetailWidth(startWidth));
        return;
      }
      commitDetailWidth(clampDetailWidth(startWidth + startX - upEvent.clientX));
    };
    grabber.setPointerCapture(event.pointerId);
    grabber.addEventListener("pointermove", onMove);
    grabber.addEventListener("pointerup", onEnd, { once: true });
    grabber.addEventListener("pointercancel", onEnd, { once: true });
  }

  const selectedProblemSummary = dashboard.problems.find((problem) => problem.id === selectedProblemId) ?? null;
  const selectedProblem = detailProblem?.id === selectedProblemId ? detailProblem : selectedProblemSummary;
  useEffect(() => {
    if (!selectedProblemId) {
      queueMicrotask(() => setDetailProblem(null));
      return;
    }
    let active = true;
    queueMicrotask(() => setDetailLoading(true));
    void getAlgorithmProblemDetailAction(selectedProblemId).then((result) => {
      if (!active) return;
      if (result.ok && result.problem) setDetailProblem(result.problem);
      else notify(result.error || "题目详情加载失败", "error");
      setDetailLoading(false);
    });
    return () => { active = false; };
  }, [selectedProblemId, notify]);
  useEffect(() => {
    if (!selectedProblemId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.querySelector('[class*="modalBackdrop"]')) {
        setOpenProblem(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedProblemId, setOpenProblem]);
  const targetIds = selectedIds.length ? selectedIds : selectedProblem ? [selectedProblem.id] : [];
  const selectedChapterStats = filter.startsWith("chapter:") ? (curriculumStats.find((item) => item.chapter.key === filter.slice(8)) ?? null) : null;
  const hiddenSelectedCount = selectedIds.filter((id) => !filtered.some((problem) => problem.id === id)).length;
  const allFilteredSelected = filtered.length > 0 && filtered.every((item) => selectedIds.includes(item.id));

  async function runFolderMutation(action: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    const result = await action();
    if (!result.ok) {
      notify(result.error || "文件夹操作失败", "error");
      return;
    }
    notify(message, "success");
    setFolderEditor(null);
    router.refresh();
  }

  function folderProblemCount(folderId: string | null): number {
    return relations.library.items.filter((item) => item.folderId === folderId).length;
  }

  function renderFolders(parentId: string | null, depth = 0): React.ReactNode {
    return relations.library.folders
      .filter((folder) => folder.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((folder) => (
        <div key={folder.id} role="treeitem" aria-level={depth + 2} aria-selected={filter === `folder:${folder.id}`}>
          <div
            className={styles.folderRow}
            data-active={filter === `folder:${folder.id}` || undefined}
            style={{ paddingLeft: `${10 + depth * 16}px` }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const problemId = Number(event.dataTransfer.getData("application/x-ascend-algorithm-problem"));
              if (Number.isSafeInteger(problemId) && problemId > 0) onMove([problemId], folder.id);
            }}
          >
            <button className={styles.folderSelect} data-folder-id={folder.id} data-folder-node data-parent-folder-id={folder.parentId ?? ""} onClick={() => applyFilter(`folder:${folder.id}`)} type="button">
              <Folder size={15} /> <span>{folder.name}</span><small>{folderProblemCount(folder.id)}</small>
            </button>
            <details className={styles.folderMenu}>
              <summary aria-label={`${folder.name} 更多操作`}><MoreHorizontal size={15} /></summary>
              <div>
                <button onClick={() => setFolderEditor({ mode: "create", parentId: folder.id })} type="button"><FolderPlus size={14} /> 新建子文件夹</button>
                <button onClick={() => setFolderEditor({ mode: "edit", folder })} type="button"><Pencil size={14} /> 重命名或移动</button>
                <button onClick={() => void runFolderMutation(() => reorderAlgorithmFolderAction({ folderId: folder.id, direction: "up" }), "文件夹已上移")} type="button">↑ 上移</button>
                <button onClick={() => void runFolderMutation(() => reorderAlgorithmFolderAction({ folderId: folder.id, direction: "down" }), "文件夹已下移")} type="button">↓ 下移</button>
                <button onClick={() => void confirm({ title: `删除空文件夹「${folder.name}」？`, description: "仅空文件夹可以直接删除。", confirmLabel: "删除空文件夹", danger: true }).then((ok) => { if (ok) return runFolderMutation(() => deleteAlgorithmFolderAction({ folderId: folder.id }), "空文件夹已删除"); })} type="button"><Trash2 size={14} /> 删除空文件夹</button>
                <button onClick={() => void confirm({ title: `删除「${folder.name}」？`, description: "文件夹中的子目录和题目会提升到上一级。", confirmLabel: "删除并提升内容", danger: true }).then((ok) => { if (ok) return runFolderMutation(() => deleteAlgorithmFolderAction({ folderId: folder.id, promoteContents: true }), "文件夹已删除"); })} type="button"><Trash2 size={14} /> 删除并提升内容</button>
              </div>
            </details>
          </div>
          {renderFolders(folder.id, depth + 1)}
        </div>
      ));
  }

  return (
    <section className={styles.libraryLayout} data-detail-open={selectedProblem ? "true" : undefined} style={detailWidth ? ({ "--alg-detail-w": `${detailWidth}px` } as React.CSSProperties) : undefined}>
      {folderDrawerOpen ? <button aria-label="关闭目录" className={styles.mobileFolderBackdrop} onClick={() => setFolderDrawerOpen(false)} type="button" /> : null}
      <aside className={styles.libraryNav} data-open={folderDrawerOpen || undefined}>
        <div className={styles.folderTreeHeader}>
          <button className={styles.folderRoot} onClick={() => applyFilter("all")} type="button"><FolderOpen size={17} /><strong>算法训练</strong><small>{dashboard.problems.length}</small></button>
          <button aria-label="新建文件夹" className={styles.folderAdd} onClick={() => setFolderEditor({ mode: "create", parentId: null })} title="新建文件夹" type="button"><FolderPlus size={16} /></button>
          <button aria-label="关闭目录" className={styles.mobileFolderClose} onClick={() => setFolderDrawerOpen(false)} type="button"><X size={16} /></button>
        </div>
        <div aria-label="算法训练目录" className={styles.folderTree} role="tree" onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          const nodes = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-folder-node]")];
          const current = nodes.indexOf(document.activeElement as HTMLButtonElement);
          if (current < 0) {
            event.preventDefault();
            nodes[0]?.focus();
            return;
          }
          let next = event.key === "Home" ? 0 : event.key === "End" ? nodes.length - 1 : Math.max(0, Math.min(nodes.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
          if (event.key === "ArrowRight") {
            const child = nodes.findIndex((node) => node.dataset.parentFolderId === nodes[current]?.dataset.folderId);
            next = child >= 0 ? child : current;
          } else if (event.key === "ArrowLeft") {
            const parentId = nodes[current]?.dataset.parentFolderId;
            const parent = nodes.findIndex((node) => node.dataset.folderId === parentId);
            next = parent >= 0 ? parent : current;
          }
          event.preventDefault();
          nodes[next]?.focus();
        }}>
          <div className={styles.folderRow} data-active={filter === "folder:root" || undefined} role="treeitem" aria-level={2} aria-selected={filter === "folder:root"} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = Number(event.dataTransfer.getData("application/x-ascend-algorithm-problem")); if (Number.isSafeInteger(id) && id > 0) onMove([id], null); }}>
            <button className={styles.folderSelect} data-folder-id="__unfiled" data-folder-node data-parent-folder-id="" onClick={() => applyFilter("folder:root")} type="button"><Folder size={15} /><span>未整理</span><small>{folderProblemCount(null)}</small></button>
          </div>
          {renderFolders(null)}
        </div>
      </aside>

      <div className={styles.libraryMain}>
        <button className={styles.mobileFolderTrigger} onClick={() => setFolderDrawerOpen(true)} type="button"><FolderOpen size={16} /> 浏览题库目录</button>
        {selectedChapterStats ? (
          <section className={styles.chapterContext}>
            <div>
              <span>
                {selectedChapterStats.chapter.weekLabel} · 第 {selectedChapterStats.chapter.order} 章
              </span>
              <h2>{selectedChapterStats.chapter.title}</h2>
              <p>{selectedChapterStats.chapter.description}</p>
            </div>
            <strong>{selectedChapterStats.total ? `${selectedChapterStats.completed}/${selectedChapterStats.total}` : "待补题"}</strong>
          </section>
        ) : null}
        <div className={styles.libraryHeader}>
          <label className={styles.searchField}>
            <Search size={17} />
            <input placeholder="搜索名称、题号或分类" value={query} onChange={(event) => changeQuery(event.target.value)} />
          </label>
          <div className={styles.libraryHeaderActions}>
            <label className={styles.selectAll}>
              <input checked={allFilteredSelected} disabled={!filtered.length} type="checkbox" onChange={(event) => setSelectedIds(event.target.checked ? filtered.map((problem) => problem.id) : [])} />
              全选 {filtered.length} 道题
            </label>
            <button className={styles.secondaryButton} disabled={!filtered.length} onClick={() => setExportProblemIds(filtered.map((problem) => problem.id))}>
              <FileDown size={15} /> 导出当前结果
            </button>
          </div>
        </div>
        <div className={styles.filterBar}>
          <label className={styles.compactSelect}><span>状态</span><select value={statusFilter} onChange={(event) => updateUrl({ status: event.target.value || null, page: null }, "replace")}><option value="">全部状态</option><option value="todo">未做</option><option value="done">已做</option><option value="review">待复习</option></select></label>
          <label className={styles.compactSelect}><span>课程</span><select value={courseFilter} onChange={(event) => updateUrl({ course: event.target.value || null, page: null }, "replace")}><option value="">全部章节</option>{curriculumChapters.map((chapter) => <option key={chapter.key} value={chapter.key}>{chapter.order}. {chapter.title}</option>)}</select></label>
          <label className={styles.compactSelect}><span>来源</span><select value={sourceFilter} onChange={(event) => updateUrl({ source: event.target.value || null, page: null }, "replace")}><option value="">全部题单</option>{relations.courses.map((course) => <option key={course.key} value={course.key}>{course.name}</option>)}</select></label>
          <FilterDropdown label="平台" options={platformOptions} selected={providersSelected} onToggle={(value) => toggleProvider(value)} />
          <FilterDropdown label="标签" options={tagOptions} selected={tagsSelected} onToggle={(value) => toggleTag(value)} />
          {hasActiveRefiners || query ? (
            <button className={styles.filterReset} onClick={resetAllFilters}>
              清除筛选
            </button>
          ) : null}
        </div>
        <div className={styles.bulkBar} data-visible={selectedIds.length > 0}>
          <strong>已选 {selectedIds.length}</strong>
          {hiddenSelectedCount > 0 ? <span className={styles.bulkHint}>其中 {hiddenSelectedCount} 道不在当前筛选内</span> : null}
          <button className={styles.bulkClear} onClick={() => setSelectedIds([])} type="button">
            取消选择
          </button>
          <span className={styles.bulkDivider} aria-hidden />
          <input aria-label="计划日期" type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} />
          <button className={styles.bulkPrimary}
            onClick={() => {
              onAddPlan(selectedIds, planDate);
              setSelectedIds([]);
            }}
          >
            加入计划
          </button>
          <select
            aria-label="移动到文件夹"
            defaultValue=""
            onChange={(event) => {
              onMove(selectedIds, event.target.value || null);
              event.currentTarget.value = "";
              setSelectedIds([]);
            }}
          >
            <option value="">移动到…</option>
            <option value="">未整理</option>
            {relations.library.folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folderPathLabel(relations.library.folders, folder)}
              </option>
            ))}
          </select>
          <details className={styles.bulkMenu}>
            <summary>设置属性 <ChevronDown size={13} /></summary>
            <div>
              <label><span>来源题单</span><select value={courseName} onChange={(event) => { setCourseName(event.target.value); const course = relations.courses.find((item) => item.name === event.target.value); setStageKey(course?.stages[0]?.key ?? stageKey); }}>{relations.courses.length ? relations.courses.map((course) => <option key={course.key} value={course.name}>{course.name}</option>) : <option value={courseName}>{courseName}</option>}</select></label>
              <label><span>题单分组</span><input value={stageKey} onChange={(event) => setStageKey(event.target.value)} /></label>
              <button onClick={() => { onSetCourse(selectedIds, courseName, stageKey); setSelectedIds([]); }} type="button">应用来源题单</button>
              <label><span>课程章节</span><select value={curriculumChapterKey} onChange={(event) => setCurriculumChapterKey(event.target.value)}>{curriculumChapters.map((chapter) => <option key={chapter.key} value={chapter.key}>{chapter.order}. {chapter.title}</option>)}</select></label>
              <button onClick={() => { onSetCurriculum(selectedIds, curriculumChapterKey); setSelectedIds([]); }} type="button">应用课程章节</button>
            </div>
          </details>
          <details className={styles.bulkMenu}>
            <summary aria-label="更多批量操作"><MoreHorizontal size={16} /> 更多</summary>
            <div className={styles.bulkMoreMenu}>
              <button onClick={() => setExportProblemIds(selectedIds)} type="button"><FileDown size={15} /> 导出题库包</button>
              <button className={styles.bulkDelete} onClick={() => onDelete(selectedIds)} type="button"><Trash2 size={15} /> 删除题目</button>
            </div>
          </details>
        </div>
        <div className={styles.problemTable} role="table" aria-label="算法题库">
          <div className={styles.tableHead} role="row">
            <span aria-hidden />
            {sortCell("title", "题目")}
            {sortCell("ext", "平台题号")}
            {sortCell("course", "课程章节")}
            <span>算法分类</span>
            {sortCell("status", "状态")}
          </div>
          {visibleProblems.map((problem) => {
            const chapter = curriculumByProblem.get(problem.id);
            const openDetail = () => setOpenProblem(problem.id);
            return (
              <div
                className={styles.tableRow}
                data-active={selectedProblem?.id === problem.id}
                draggable
                key={problem.id}
                role="row"
                tabIndex={0}
                aria-selected={selectedProblem?.id === problem.id}
                onDragStart={(event) => event.dataTransfer.setData("application/x-ascend-algorithm-problem", String(problem.id))}
                onClick={openDetail}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openDetail();
                  }
                }}
              >
                <input aria-label={`选择 ${problem.title}`} checked={selectedIds.includes(problem.id)} type="checkbox" onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, problem.id] : selectedIds.filter((id) => id !== problem.id))} />
                <strong>{problem.title}</strong>
                <span>{providerText(problem)}</span>
                <span>{chapter ? `${chapter.order}. ${chapter.title}` : problem.phaseKey || "—"}</span>
                <span className={styles.tagList}>
                  {problem.tags.slice(0, 2).map((tag) => (
                    <i key={tag}>{tag}</i>
                  ))}
                </span>
                <StatusBadge status={learningStatus(problem, today)} />
              </div>
            );
          })}
          {!visibleProblems.length ? (
            <div className={styles.libraryEmpty}>
              <LibraryBig size={24} />
              <strong>{selectedChapterStats?.total === 0 ? "这个章节正在等待练习题" : "当前筛选下暂无题目"}</strong>
              <span>{selectedChapterStats?.total === 0 ? "导入题目并补充算法标签后，课程会自动归类。" : "调整章节、平台、标签或搜索条件。"}</span>
            </div>
          ) : null}
        </div>
        {filtered.length > LIBRARY_PAGE_SIZE ? (
          <nav className={styles.pager} aria-label="题库分页">
            <button disabled={safePageIndex === 0} onClick={() => changePage(safePageIndex - 1)}>
              上一页
            </button>
            <span data-pager-info>
              第 {safePageIndex + 1} / {pageCount} 页 · 共 {filtered.length} 题 · 本页 {visibleProblems.length} 题
            </span>
            <button disabled={safePageIndex >= pageCount - 1} onClick={() => changePage(safePageIndex + 1)}>
              下一页
            </button>
          </nav>
        ) : null}
      </div>

      {selectedProblem ? (
        <aside className={styles.detailDrawer}>
          <div
            aria-label="调整详情栏宽度，左右方向键调节，双击恢复默认"
            aria-orientation="vertical"
            aria-valuemax={clampDetailWidth(DETAIL_MAX_WIDTH)}
            aria-valuemin={DETAIL_MIN_WIDTH}
            aria-valuenow={detailWidth ?? DETAIL_DEFAULT_WIDTH}
            className={styles.drawerHandle}
            role="separator"
            tabIndex={0}
            onDoubleClick={() => {
              setDetailWidth(null);
              window.localStorage.removeItem("ascend.algorithm.detailWidth");
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const base = detailWidth ?? DETAIL_DEFAULT_WIDTH;
              commitDetailWidth(clampDetailWidth(base + (event.key === "ArrowLeft" ? 28 : -28)));
            }}
            onPointerDown={startDetailResize}
          />
          <div className={styles.detailTop}>
            <span className={styles.statusDot} data-status={learningStatus(selectedProblem, today)} />
            <span className={styles.detailTopActions}>
              <button aria-label="编辑题目" disabled={detailLoading || detailProblem?.id !== selectedProblem.id} onClick={() => onEditProblem(selectedProblem)} title="编辑题目"><Pencil size={17} /></button>
              <button aria-label="关闭详情" onClick={() => setOpenProblem(null)}><X size={18} /></button>
            </span>
          </div>
          {detailLoading ? <p aria-live="polite" className={styles.detailLoading}><RefreshCw className={styles.spin} size={15} /> 正在加载题面与训练记录</p> : null}
          <span className={styles.eyebrow}>{providerText(selectedProblem)}</span>
          <h2>{selectedProblem.title}</h2>
          <p className={styles.detailMeta}>
            {curriculumChapterText(selectedProblem, curriculumByProblem)} · {curriculumByProblem.get(selectedProblem.id)?.weekLabel ?? ""}
          </p>
          {(membershipsByProblem.get(selectedProblem.id) ?? []).length ? (
            <p className={styles.detailSource}>
              来源题单：
              {(membershipsByProblem.get(selectedProblem.id) ?? []).map((item) => `${item.courseName} · ${item.stageKey}`).join(" / ")}
            </p>
          ) : null}
          <div className={styles.detailActions}>
            <input aria-label="计划日期" type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} />
            <button className={styles.primaryButton} onClick={() => onAddPlan(targetIds, planDate)}>
              <Plus size={16} /> 加入计划
            </button>
          </div>
          <section className={styles.statement}>
            <MarkdownContent source={selectedProblem.statementMarkdown || `${selectedProblem.title}\n\n题面保存在参考 CPP 的文件头注释中。`} />
          </section>
          <details className={styles.detailSection}>
            <summary>参考 CPP</summary>
            <pre>{selectedProblem.referenceCode.cpp17 || "参考代码保存在 Ascend 网盘中。"}</pre>
          </details>
          <details className={styles.detailSection} open>
            <summary>训练记录 · {selectedProblem.attempts.length}</summary>
            {selectedProblem.attempts.slice(0, 5).map((attempt) => (
              <p key={attempt.id}>
                {attempt.day} · {attempt.verdict} · {attempt.durationMinutes} 分钟
              </p>
            ))}
            {!selectedProblem.attempts.length ? <p>还没有训练记录。</p> : null}
          </details>
          <details className={styles.detailSection}>
            <summary>复习策略</summary>
            <p>{selectedProblem.reviewEnabled ? `当前第 ${selectedProblem.reviewStep + 1} 阶段，下一次 ${selectedProblem.nextReview || "完成后安排"}` : "已退出复习计划"}</p>
            <p>间隔：3 → 7 → 14 → 30 → 60 天</p>
          </details>
          <p className={styles.storageLine}>
            <FolderOpen size={15} /> Ascend 网盘 / 算法 / {folderName(relations, folderByProblem.get(selectedProblem.id))}
          </p>
        </aside>
      ) : (
        <aside className={styles.detailPlaceholder}>
          <LibraryBig size={26} />
          <strong>从左侧选择题目查看详情</strong>
          <span>题面、参考代码与训练记录会显示在这里。</span>
        </aside>
      )}
      {exportProblemIds ? <PackageExportDialog problemIds={exportProblemIds} onClose={() => setExportProblemIds(null)} /> : null}
      {folderEditor ? (
        <FolderEditorDialog
          editor={folderEditor}
          folders={relations.library.folders}
          onClose={() => setFolderEditor(null)}
          onSubmit={(name, parentId) => {
            if (folderEditor.mode === "create") {
              void runFolderMutation(() => createAlgorithmFolderAction({ name, parentId }), "文件夹已创建");
              return;
            }
            const folder = folderEditor.folder;
            void runFolderMutation(async () => {
              const renamed = await renameAlgorithmFolderAction({ folderId: folder.id, name });
              if (!renamed.ok || parentId === folder.parentId) return renamed;
              return moveAlgorithmFolderAction({ folderId: folder.id, targetParentId: parentId });
            }, "文件夹已更新");
          }}
        />
      ) : null}
    </section>
  );
}

function FolderEditorDialog({ editor, folders, onClose, onSubmit }: { editor: FolderEditorState; folders: AlgorithmLibraryFolder[]; onClose: () => void; onSubmit: (name: string, parentId: string | null) => void }) {
  const [name, setName] = useState(editor.mode === "edit" ? editor.folder.name : "");
  const [parentId, setParentId] = useState(editor.mode === "edit" ? editor.folder.parentId ?? "" : editor.parentId ?? "");
  const blockedIds = editor.mode === "edit" ? collectFolderDescendants(folders, editor.folder.id) : new Set<string>();
  if (editor.mode === "edit") blockedIds.add(editor.folder.id);
  return (
    <Modal title={editor.mode === "create" ? "新建文件夹" : "编辑文件夹"} onClose={onClose}>
      <div className={styles.formGrid}>
        <label><span>名称</span><input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span>上级目录</span><select value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">算法训练</option>{folders.filter((folder) => !blockedIds.has(folder.id)).map((folder) => <option key={folder.id} value={folder.id}>{folderPathLabel(folders, folder)}</option>)}</select></label>
      </div>
      <footer className={styles.modalFooter}>
        <button onClick={onClose} type="button">取消</button>
        <button className={styles.primaryButton} disabled={!name.trim()} onClick={() => onSubmit(name.trim(), parentId || null)} type="button">保存</button>
      </footer>
    </Modal>
  );
}

function ProblemEditorDialog({ problem, relations, onClose, onSubmit }: { problem: AlgorithmProblem | null; relations: AlgorithmTrainingRelations; onClose: () => void; onSubmit: (value: ProblemEditorValue) => void }) {
  const membership = problem ? relations.courseMemberships.find((item) => item.problemId === problem.id) : null;
  const chapter = problem ? relations.curriculum.items.find((item) => item.problemId === problem.id && item.membershipKind === "primary") : null;
  const currentFolder = problem ? relations.library.items.find((item) => item.problemId === problem.id)?.folderId ?? "" : "";
  const firstCourse = membership?.courseName ?? relations.courses[0]?.name ?? "";
  const firstStage = membership?.stageKey ?? relations.courses.find((item) => item.name === firstCourse)?.stages[0]?.key ?? "W1";
  const [value, setValue] = useState<ProblemEditorValue>({
    title: problem?.title ?? "",
    sourceUrl: problem?.providerId === "ascend" ? "" : problem?.sourceUrl ?? "",
    externalProblemId: problem?.providerId === "ascend" ? "" : problem?.externalProblemId ?? "",
    difficultyBand: problem?.difficultyBand ?? "",
    tags: problem?.tags ?? [],
    notes: problem?.notes ?? "",
    statementMarkdown: problem?.statementMarkdown ?? "",
    inputSpecification: problem?.inputSpecification ?? "",
    outputSpecification: problem?.outputSpecification ?? "",
    examples: problem?.examples.length ? problem.examples : [{ input: "", output: "" }],
    timeLimitMs: problem?.timeLimitMs ?? 1000,
    memoryLimitKb: problem?.memoryLimitKb ?? 262144,
    folderId: currentFolder || null,
    chapterKey: chapter?.chapterKey ?? relations.curriculum.chapters[0]?.key ?? "",
    courseName: firstCourse,
    stageKey: firstStage,
    phaseKey: problem?.phaseKey ?? "",
    priorityBand: problem?.priorityBand ?? "",
    nextReview: problem?.nextReview ?? null,
  });
  const update = <K extends keyof ProblemEditorValue>(key: K, next: ProblemEditorValue[K]) => setValue((current) => ({ ...current, [key]: next }));
  const updateExample = (index: number, patch: Partial<ProblemEditorValue["examples"][number]>) => update("examples", value.examples.map((example, current) => current === index ? { ...example, ...patch } : example));
  return (
    <Modal title={problem ? "编辑题目" : "新建题目"} onClose={onClose} wide>
      <div className={styles.problemEditorGrid}>
        <section>
          <h3>基础信息</h3>
          <div className={styles.formGrid}>
            <label className={styles.spanTwo}><span>题目名称</span><input autoFocus maxLength={160} value={value.title} onChange={(event) => update("title", event.target.value)} /></label>
            <label className={styles.spanTwo}><span>来源链接</span><input placeholder="可留空，创建 Ascend 原创题" type="url" value={value.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} /></label>
            <label><span>平台题号</span><input value={value.externalProblemId} onChange={(event) => update("externalProblemId", event.target.value)} /></label>
            <label><span>难度</span><select value={value.difficultyBand} onChange={(event) => update("difficultyBand", event.target.value)}><option value="">未设置</option><option value="foundation">基础</option><option value="standard">标准</option><option value="challenge">挑战</option></select></label>
            <label className={styles.spanTwo}><span>标签</span><input placeholder="双指针, 二分, 边界" value={value.tags.join(", ")} onChange={(event) => update("tags", event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))} /></label>
            <label className={styles.spanTwo}><span>备注</span><textarea value={value.notes} onChange={(event) => update("notes", event.target.value)} /></label>
          </div>
        </section>
        <section>
          <h3>组织与计划</h3>
          <div className={styles.formGrid}>
            <label><span>目录</span><select value={value.folderId ?? ""} onChange={(event) => update("folderId", event.target.value || null)}><option value="">未整理</option>{relations.library.folders.map((folder) => <option key={folder.id} value={folder.id}>{folderPathLabel(relations.library.folders, folder)}</option>)}</select></label>
            <label><span>课程章节</span><select value={value.chapterKey} onChange={(event) => update("chapterKey", event.target.value)}>{relations.curriculum.chapters.map((item) => <option key={item.key} value={item.key}>{item.sortOrder}. {item.name}</option>)}</select></label>
            <label><span>来源题单</span><input list="problem-course-options" value={value.courseName} onChange={(event) => update("courseName", event.target.value)} /><datalist id="problem-course-options">{relations.courses.map((item) => <option key={item.key} value={item.name} />)}</datalist></label>
            <label><span>题单分组</span><input value={value.stageKey} onChange={(event) => update("stageKey", event.target.value)} /></label>
            <label><span>训练阶段</span><input placeholder="W1" value={value.phaseKey} onChange={(event) => update("phaseKey", event.target.value)} /></label>
            <label><span>优先级</span><select value={value.priorityBand} onChange={(event) => update("priorityBand", event.target.value)}><option value="">普通</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></select></label>
            <label className={styles.spanTwo}><span>复习日期</span><input type="date" value={value.nextReview ?? ""} onChange={(event) => update("nextReview", event.target.value || null)} /></label>
          </div>
        </section>
        <section className={styles.spanTwo}>
          <h3>题面内容</h3>
          <div className={styles.formGrid}>
            <label className={styles.spanTwo}><span>题面 Markdown</span><textarea className={styles.statementEditor} value={value.statementMarkdown} onChange={(event) => update("statementMarkdown", event.target.value)} /></label>
            <label><span>输入说明</span><textarea value={value.inputSpecification} onChange={(event) => update("inputSpecification", event.target.value)} /></label>
            <label><span>输出说明</span><textarea value={value.outputSpecification} onChange={(event) => update("outputSpecification", event.target.value)} /></label>
            <div className={`${styles.spanTwo} ${styles.examplesEditor}`}>
              <div className={styles.examplesHeader}><strong>样例</strong><button className={styles.secondaryButton} onClick={() => update("examples", [...value.examples, { input: "", output: "" }])} type="button"><Plus size={14} /> 添加样例</button></div>
              {value.examples.map((example, index) => (
                <section className={styles.exampleCard} key={index}>
                  <header><strong>样例 {index + 1}</strong><button aria-label={`删除样例 ${index + 1}`} disabled={value.examples.length === 1} onClick={() => update("examples", value.examples.filter((_, current) => current !== index))} type="button"><Trash2 size={14} /></button></header>
                  <label><span>输入</span><textarea value={example.input} onChange={(event) => updateExample(index, { input: event.target.value })} /></label>
                  <label><span>输出</span><textarea value={example.output} onChange={(event) => updateExample(index, { output: event.target.value })} /></label>
                  <label className={styles.spanTwo}><span>说明</span><input value={example.explanation ?? ""} onChange={(event) => updateExample(index, { explanation: event.target.value })} /></label>
                </section>
              ))}
            </div>
            <label><span>时间限制（ms）</span><input min={1} type="number" value={value.timeLimitMs} onChange={(event) => update("timeLimitMs", Number(event.target.value))} /></label>
            <label><span>内存限制（KB）</span><input min={1024} type="number" value={value.memoryLimitKb} onChange={(event) => update("memoryLimitKb", Number(event.target.value))} /></label>
          </div>
        </section>
      </div>
      <footer className={styles.modalFooter}><button onClick={onClose} type="button">取消</button><button className={styles.primaryButton} disabled={!value.title.trim()} onClick={() => onSubmit(value)} type="button">保存题目</button></footer>
    </Modal>
  );
}

function collectFolderDescendants(folders: AlgorithmLibraryFolder[], folderId: string): Set<string> {
  const result = new Set<string>();
  const visit = (parentId: string) => {
    for (const folder of folders.filter((item) => item.parentId === parentId)) {
      result.add(folder.id);
      visit(folder.id);
    }
  };
  visit(folderId);
  return result;
}

function folderPathLabel(folders: AlgorithmLibraryFolder[], folder: AlgorithmLibraryFolder): string {
  const parts = [folder.name];
  let parentId = folder.parentId;
  while (parentId) {
    const parent = folders.find((item) => item.id === parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    parentId = parent.parentId;
  }
  return parts.join(" / ");
}

function ProblemPicker({ plannedProblemIds, problems, selectedDate, onClose, onSubmit }: { plannedProblemIds: number[]; problems: AlgorithmProblem[]; selectedDate: string; onClose: () => void; onSubmit: (ids: number[]) => void }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "todo" | "done" | "review">("all");
  const [ids, setIds] = useState<number[]>([]);
  const planned = new Set(plannedProblemIds);
  const matched = problems.filter((problem) => `${problem.title} ${problem.externalProblemId}`.toLowerCase().includes(query.toLowerCase())).filter((problem) => statusFilter === "all" || learningStatus(problem, selectedDate) === statusFilter);
  const visible = matched.slice(0, 100);
  return (
    <Modal title={`添加到 ${selectedDate}`} onClose={onClose}>
      <label className={styles.searchField}>
        <Search size={17} />
        <input autoFocus placeholder="搜索题目" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className={styles.pickerFilters} role="group" aria-label="按状态筛选">
        {(
          [
            ["all", "全部"],
            ["todo", "未做"],
            ["done", "已做"],
            ["review", "待复习"],
          ] as const
        ).map(([value, label]) => (
          <button aria-pressed={statusFilter === value} key={value} onClick={() => setStatusFilter(value)} type="button">
            {label}
          </button>
        ))}
      </div>
      <div className={styles.pickerList}>
        {visible.map((problem) => (
          <label key={problem.id}>
            <input checked={ids.includes(problem.id)} type="checkbox" onChange={(event) => setIds(event.target.checked ? [...ids, problem.id] : ids.filter((id) => id !== problem.id))} />
            <span>
              <strong>
                {problem.title}
                {planned.has(problem.id) ? <i className={styles.plannedMark}>已加入</i> : null}
              </strong>
              <small>{providerText(problem)}</small>
            </span>
          </label>
        ))}
      </div>
      {matched.length > visible.length ? <p className={styles.pickerTruncated}>共 {matched.length} 道匹配，仅显示前 100 道；用搜索缩小范围。</p> : <p className={styles.pickerTruncated}>共 {matched.length} 道匹配</p>}
      <footer className={styles.modalFooter}>
        <button onClick={onClose}>取消</button>
        <button className={styles.primaryButton} disabled={!ids.length} onClick={() => onSubmit(ids)}>
          加入 {ids.length} 道题
        </button>
      </footer>
    </Modal>
  );
}

function CompletionDialog({ target, today, onClose, onChoose }: { target: CompletionTarget; today: string; onClose: () => void; onChoose: (choice: "review" | "tomorrow" | "stop-review", attemptDayMode?: "now" | "backfill") => void }) {
  const historical = Boolean(target.plan && target.plan.day < today);
  return (
    <Modal title={`完成「${target.problem.title}」`} onClose={onClose}>
      <p className={styles.modalLead}>{historical ? `原计划日期为 ${target.plan?.day}，请选择实际完成日期。` : "选择这道题接下来的安排。"}</p>
      <div className={styles.choiceList}>
        {historical ? (
          <>
            <button onClick={() => onChoose("review", "now")}>
              <strong>今天完成并安排复习</strong>
              <span>实际完成日记为今天，原计划日期保留在任务记录中</span>
            </button>
            <button onClick={() => onChoose("review", "backfill")}>
              <strong>补记为 {target.plan?.day} 完成</strong>
              <span>复习周期从补记日期开始计算</span>
            </button>
            <button onClick={() => onChoose("stop-review", "now")}>
              <strong>今天完成并结束复习</strong>
              <span>记录今天完成，停止自动复习安排</span>
            </button>
          </>
        ) : (
          <>
            <button onClick={() => onChoose("review", "now")}>
              <strong>完成并安排复习</strong>
              <span>按 3 → 7 → 14 → 30 → 60 天推进</span>
            </button>
            <button onClick={() => onChoose("tomorrow", "now")}>
              <strong>明天继续</strong>
              <span>保留训练状态，安排到次日</span>
            </button>
            <button onClick={() => onChoose("stop-review", "now")}>
              <strong>完成并退出复习计划</strong>
              <span>保留完成记录，停止自动安排</span>
            </button>
          </>
        )}
      </div>
      <p className={styles.modalFootnote}>「完成」会记录一次 AC（独立通过）结果；未通过的作答请先不要点完成，等修正后再记录。</p>
    </Modal>
  );
}

function CppImportDialog({ folders, onClose, onImported }: { folders: AlgorithmTrainingRelations["library"]["folders"]; onClose: () => void; onImported: () => void }) {
  const { notify } = useFeedback();
  const multipleRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [courseName, setCourseName] = useState("郭炜算法基础");
  const [stageKey, setStageKey] = useState("W1");
  const [topics, setTopics] = useState("");
  const [folderId, setFolderId] = useState("");
  const [uploading, setUploading] = useState(false);
  const autoAssignedCount = rows.filter((row) => row.preview?.courseSuggestion).length;

  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
    folderRef.current?.setAttribute("directory", "");
  }, []);

  async function addFiles(files: File[]) {
    const cppFiles = files.filter((file) => /\.(?:cpp|cc|cxx)$/i.test(file.name));
    const next = cppFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      preview: null,
      error: "",
    }));
    setRows((current) => [...current, ...next]);
    await Promise.all(
      next.map(async (row) => {
        try {
          const form = new FormData();
          form.set("intent", "preview");
          form.set("file", row.file);
          form.set("relativePath", row.relativePath);
          const response = await fetch("/api/algorithm/import/cpp", { method: "POST", body: form });
          const result = (await response.json()) as { ok: boolean; candidate?: ImportPreview; error?: string };
          if (!response.ok || !result.ok || !result.candidate) throw new Error(result.error || "解析失败");
          setRows((current) => current.map((item) => (item.id === row.id ? { ...item, preview: result.candidate!, error: "" } : item)));
        } catch (error) {
          setRows((current) => current.map((item) => (item.id === row.id ? { ...item, error: error instanceof Error ? error.message : "解析失败" } : item)));
        }
      }),
    );
  }

  async function importAll() {
    const ready = rows.filter((row) => row.preview && !row.error);
    if (!ready.length) return;
    setUploading(true);
    let created = 0;
    let updated = 0;
    const queue = [...ready];
    async function worker() {
      while (queue.length) {
        const row = queue.shift()!;
        const preview = row.preview!;
        // 已识别课程来源的文件按链接自动归类，未识别的退回弹窗里的手动设置
        const suggestion = preview.courseSuggestion ?? null;
        const effectiveCourseName = suggestion?.courseName || courseName;
        const effectiveStageKey = suggestion?.stageKey || stageKey || preview.phase;
        const form = new FormData();
        form.set("file", row.file);
        form.set("relativePath", row.relativePath);
        form.set("title", preview.title);
        form.set("providerId", preview.providerId);
        form.set("externalProblemId", preview.externalProblemId);
        form.set("courseName", effectiveCourseName);
        form.set("stageKey", effectiveStageKey);
        form.set("topics", topics || preview.topics.join(","));
        form.set("folderId", folderId);
        const response = await fetch("/api/algorithm/import/cpp", { method: "POST", body: form });
        const result = (await response.json()) as { ok: boolean; duplicate?: boolean; error?: string };
        if (!response.ok || !result.ok) {
          setRows((current) => current.map((item) => (item.id === row.id ? { ...item, error: result.error || "导入失败" } : item)));
          continue;
        }
        if (result.duplicate) updated += 1;
        else created += 1;
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    setUploading(false);
    notify(`导入完成：新增 ${created}，更新 ${updated}`);
    onImported();
  }

  return (
    <Modal wide title="添加 CPP" onClose={onClose}>
      <div
        className={styles.dropZone}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          void addFiles([...event.dataTransfer.files]);
        }}
      >
        <UploadCloud size={30} />
        <h3>把 CPP 拖到这里</h3>
        <p>Ascend 会读取文件头块注释、文件名和题号，并生成导入预览。</p>
        <span>
          <button onClick={() => multipleRef.current?.click()}>选择多个 CPP</button>
          <button onClick={() => folderRef.current?.click()}>选择文件夹</button>
        </span>
        <input hidden multiple ref={multipleRef} type="file" accept=".cpp,.cc,.cxx" onChange={(event) => void addFiles([...(event.target.files || [])])} />
        <input hidden multiple ref={folderRef} type="file" onChange={(event) => void addFiles([...(event.target.files || [])])} />
      </div>
      {rows.length ? (
        <>
          <div className={styles.importBulk}>
            <label>
              目标文件夹
              <select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
                <option value="">未整理</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              来源课程或题单{autoAssignedCount ? <em>（自动识别的文件除外）</em> : null}
              <input value={courseName} onChange={(event) => setCourseName(event.target.value)} />
            </label>
            <label>
              题单分组
              <input value={stageKey} onChange={(event) => setStageKey(event.target.value)} />
            </label>
            <label>
              算法分类
              <input placeholder="字符串, 模拟" value={topics} onChange={(event) => setTopics(event.target.value)} />
            </label>
          </div>
          {autoAssignedCount ? <p className={styles.autoNotice}>{autoAssignedCount} 个文件将按链接自动归入「程序设计实习」（例题 / 课后习题），上方来源题单设置作用于其余文件。</p> : null}
          <div className={styles.importRows}>
            {rows.map((row) => (
              <article key={row.id}>
                <FileCode2 size={20} />
                <div>
                  <strong>{row.preview?.title || row.file.name}</strong>
                  <small>{row.relativePath}</small>
                  {row.preview?.courseSuggestion ? (
                    <small className={styles.autoCourse}>
                      自动归入：{row.preview.courseSuggestion.courseName} · {row.preview.courseSuggestion.stageKey}
                    </small>
                  ) : null}
                </div>
                {row.preview ? <input aria-label="平台题号" value={row.preview.externalProblemId} onChange={(event) => setRows((current) => current.map((item) => (item.id === row.id && item.preview ? { ...item, preview: { ...item.preview, externalProblemId: event.target.value } } : item)))} /> : null}
                <span className={styles.importStatus} data-status={row.error ? "error" : row.preview?.matchStatus || "loading"}>
                  {row.error || importStatusLabel(row.preview?.matchStatus)}
                </span>
                <button aria-label="移除文件" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>
                  <X size={16} />
                </button>
              </article>
            ))}
          </div>
        </>
      ) : null}
      <p className={styles.privacyLine}>文件保存在当前 Ascend 个人空间；题面、来源题单、训练记录和参考 CPP 跟随账号同步。</p>
      <footer className={styles.modalFooter}>
        <button onClick={onClose}>取消</button>
        <button className={styles.primaryButton} disabled={uploading || !rows.some((row) => row.preview)} onClick={() => void importAll()}>
          {uploading ? <RefreshCw className={styles.spin} size={16} /> : <UploadCloud size={16} />} 导入 {rows.filter((row) => row.preview).length} 个文件
        </button>
      </footer>
    </Modal>
  );
}

function PackageExportDialog({ problemIds, onClose }: { problemIds: number[]; onClose: () => void }) {
  const { notify } = useFeedback();
  const [name, setName] = useState("算法题库");
  const [description, setDescription] = useState("");
  const [exporting, setExporting] = useState(false);

  async function exportPackage() {
    if (!name.trim() || exporting) return;
    setExporting(true);
    try {
      const response = await fetch("/api/algorithm/library-package/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ problemIds, name, description }),
      });
      if (!response.ok) throw new Error(await responseError(response, "导出失败"));
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "ascend-algorithm-library.ascend-algorithms.json";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notify(`已导出 ${problemIds.length} 道题`);
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "导出失败", "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal title="导出题库包" onClose={onClose}>
      <p className={styles.modalLead}>生成一份可迁移的 JSON 题库包，共 {problemIds.length} 道题。</p>
      <div className={styles.packageForm}>
        <label>
          题库名称
          <input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          说明
          <textarea maxLength={500} placeholder="适用范围、课程或版本说明" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
      </div>
      <p className={styles.privacyLine}>包内包含题面、样例、代码、标签与组织关系；个人训练记录、草稿、复习状态与设备信息保留在当前空间。</p>
      <footer className={styles.modalFooter}>
        <button onClick={onClose}>取消</button>
        <button className={styles.primaryButton} disabled={exporting || !name.trim()} onClick={() => void exportPackage()}>
          {exporting ? <RefreshCw className={styles.spin} size={16} /> : <FileDown size={16} />} 导出 JSON
        </button>
      </footer>
    </Modal>
  );
}

function PackageImportDialog({ folders, onClose, onImported }: { folders: AlgorithmTrainingRelations["library"]["folders"]; onClose: () => void; onImported: () => void }) {
  const { notify } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PackagePreview | null>(null);
  const [error, setError] = useState("");
  const [targetFolderId, setTargetFolderId] = useState("");
  const [createPackageFolder, setCreatePackageFolder] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  async function previewFile(nextFile: File) {
    setFile(nextFile);
    setPreview(null);
    setError("");
    setPreviewing(true);
    try {
      const form = new FormData();
      form.set("intent", "preview");
      form.set("file", nextFile);
      const response = await fetch("/api/algorithm/library-package/import", { method: "POST", body: form });
      const result = (await response.json()) as { ok?: boolean; preview?: PackagePreview; error?: string };
      if (!response.ok || !result.preview) throw new Error(result.error || "题库包解析失败");
      setPreview(result.preview);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "题库包解析失败");
    } finally {
      setPreviewing(false);
    }
  }

  async function importPackage() {
    if (!file || !preview || importing) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("targetFolderId", targetFolderId);
      form.set("createPackageFolder", String(createPackageFolder));
      const response = await fetch("/api/algorithm/library-package/import", { method: "POST", body: form });
      const result = (await response.json()) as { ok?: boolean; result?: PackagePreview; error?: string };
      if (!response.ok || !result.result) throw new Error(result.error || "导入失败");
      notify(`导入完成：新增 ${result.result.created}，复用 ${result.result.reused}，更新 ${result.result.updated}`);
      onImported();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "导入失败", "error");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal title="导入题库包" onClose={onClose}>
      <div
        className={styles.dropZone}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          const nextFile = event.dataTransfer.files[0];
          if (nextFile) void previewFile(nextFile);
        }}
      >
        {previewing ? <RefreshCw className={styles.spin} size={30} /> : <FileUp size={30} />}
        <h3>{file?.name || "选择 Ascend 题库包"}</h3>
        <p>支持 .ascend-algorithms.json 与普通 JSON 文件，单包上限 20 MB。</p>
        <button onClick={() => fileRef.current?.click()}>选择文件</button>
        <input
          accept=".json,.ascend-algorithms.json,application/json"
          hidden
          ref={fileRef}
          type="file"
          onChange={(event) => {
            const nextFile = event.target.files?.[0];
            if (nextFile) void previewFile(nextFile);
            event.currentTarget.value = "";
          }}
        />
      </div>
      {error ? <p className={styles.packageError}>{error}</p> : null}
      {preview ? (
        <>
          <section className={styles.packageSummary}>
            <div>
              <strong>{preview.name}</strong>
              <span>{preview.description || "题库包导入预览"}</span>
            </div>
            <dl>
              <div>
                <dt>总题数</dt>
                <dd>{preview.total}</dd>
              </div>
              <div>
                <dt>新增</dt>
                <dd>{preview.created}</dd>
              </div>
              <div>
                <dt>复用</dt>
                <dd>{preview.reused}</dd>
              </div>
              <div>
                <dt>更新</dt>
                <dd>{preview.updated}</dd>
              </div>
              <div>
                <dt>内容一致</dt>
                <dd>{preview.unchanged}</dd>
              </div>
              <div>
                <dt>编号顺延</dt>
                <dd>{preview.numberCollisions}</dd>
              </div>
            </dl>
          </section>
          <div className={styles.packageForm}>
            <label>
              导入位置
              <select value={targetFolderId} onChange={(event) => setTargetFolderId(event.target.value)}>
                <option value="">题库根目录</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.packageCheck}>
              <input checked={createPackageFolder} type="checkbox" onChange={(event) => setCreatePackageFolder(event.target.checked)} />
              在目标位置创建独立题库文件夹
            </label>
          </div>
          {preview.warnings.length ? (
            <details className={styles.packageWarnings}>
              <summary>{preview.warningCount} 条内容提示</summary>
              <ul>
                {preview.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <p className={styles.privacyLine}>相同包会安全更新包管理的基础内容；现有题目、用户覆盖字段与个人训练数据继续保留。</p>
        </>
      ) : null}
      <footer className={styles.modalFooter}>
        <button onClick={onClose}>取消</button>
        <button className={styles.primaryButton} disabled={!preview || importing || previewing} onClick={() => void importPackage()}>
          {importing ? <RefreshCw className={styles.spin} size={16} /> : <FileUp size={16} />} 导入题库包
        </button>
      </footer>
    </Modal>
  );
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const result = (await response.json()) as { error?: string };
    return result.error || fallback;
  } catch {
    return fallback;
  }
}

function SettingsDialog({ devices, judge, onClose, onRevokeDevice, pendingDeviceId }: { devices: AlgorithmDevice[]; judge: JudgeRuntimeAvailability; onClose: () => void; onRevokeDevice: (deviceId: string, deviceName: string) => void; pendingDeviceId: string | null }) {
  return (
    <Modal title="连接与设置" onClose={onClose}>
      <section className={styles.settingsSection}>
        <h3>VS Code 连接</h3>
        <p>{devices.length ? `${devices.length} 台设备已连接` : "等待 VS Code 插件配对"}</p>
        {devices.map((device) => (
          <div className={styles.deviceRow} key={device.id}>
            <Code2 size={17} />
            <span>
              <strong>{device.name}</strong>
              <small>{device.lastSeenAt ? `最近同步 ${device.lastSeenAt.slice(0, 16).replace("T", " ")}` : "等待首次同步"}</small>
            </span>
            <button className={styles.deviceRevoke} disabled={pendingDeviceId === device.id} onClick={() => onRevokeDevice(device.id, device.name)} type="button">
              撤销
            </button>
          </div>
        ))}
        <a className={styles.primaryButton} href="/practice/algorithms/connect">
          连接新设备
        </a>
      </section>
      <section className={styles.settingsSection}>
        <h3>Judge 状态</h3>
        <p>{judge.submissionAllowed ? "在线评测可用" : judge.reason || "在线评测等待配置"}</p>
      </section>
    </Modal>
  );
}

function Modal({ children, onClose, title, wide = false }: { children: React.ReactNode; onClose: () => void; title: string; wide?: boolean }) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    return () => returnFocusRef.current?.focus?.();
  }, []);
  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.modalBackdrop} />
        <Dialog.Viewport className={plannerStyles.dialogViewport}>
          <Dialog.Popup aria-label={title} className={styles.modal} data-wide={wide} initialFocus finalFocus={returnFocusRef}>
            <header>
              <Dialog.Title render={<h2 />}>{title}</Dialog.Title>
              <button aria-label="关闭" onClick={onClose}>
                <X size={19} />
              </button>
            </header>
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FilterDropdown({ label, options, selected, onToggle }: { label: string; options: FilterOption[]; selected: string[]; onToggle: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onPointerDownOutside(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDownOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDownOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.filterWrap} ref={wrapRef}>
      <button aria-expanded={open} aria-haspopup="true" className={styles.filterTrigger} data-active={selected.length > 0 || undefined} onClick={() => setOpen(!open)}>
        {label}
        {selected.length ? <span className={styles.filterCount}>{selected.length === 1 ? (options.find((option) => option.value === selected[0])?.label ?? selected[0]) : `${selected.length} 项`}</span> : null}
        <ChevronDown size={13} />
      </button>
      {open ? (
        <div className={styles.filterPanel} role="group" aria-label={`按${label}筛选`}>
          {options.map((option) => (
            <label className={styles.filterOption} key={option.value}>
              <input checked={selected.includes(option.value)} onChange={() => onToggle(option.value)} type="checkbox" />
              <span>{option.label}</span>
              <small>{option.count}</small>
            </label>
          ))}
          {!options.length ? <p className={styles.filterEmpty}>暂无可选项</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: "todo" | "done" | "review" }) {
  const labels = { todo: "未做", done: "已做", review: "待复习" };
  return (
    <span className={styles.statusBadge} data-status={status}>
      {labels[status]}
    </span>
  );
}

function learningStatus(problem: AlgorithmProblem, today: string): "todo" | "done" | "review" {
  if (problem.reviewEnabled && problem.nextReview && problem.nextReview <= today) return "review";
  return isAlgorithmCompleted(problem) ? "done" : "todo";
}

function isAlgorithmCompleted(problem: AlgorithmProblem): boolean {
  return problem.attempts.some((attempt) => attempt.verdict === "AC");
}

function groupMemberships(relations: AlgorithmTrainingRelations) {
  const result = new Map<number, AlgorithmTrainingRelations["courseMemberships"]>();
  for (const membership of relations.courseMemberships) {
    const current = result.get(membership.problemId) ?? [];
    current.push(membership);
    result.set(membership.problemId, current);
  }
  return result;
}

function providerText(problem: AlgorithmProblem): string {
  if (problem.providerId === "ascend") return problem.providerLabel;
  return `${problem.providerLabel}${problem.externalProblemId ? ` ${problem.externalProblemId}` : ""}`;
}

function curriculumPrimaryChapters(curriculum: AlgorithmTrainingRelations["curriculum"]): Map<number, AlgorithmCurriculumChapter> {
  const chapters = new Map(
    curriculum.chapters.map((chapter) => [
      chapter.key,
      {
        key: chapter.key,
        order: chapter.sortOrder,
        title: chapter.name,
        weekLabel: chapter.weekLabel,
        description: chapter.description,
      },
    ]),
  );
  return new Map(
    curriculum.items
      .filter((item) => item.membershipKind === "primary")
      .flatMap((item) => {
        const chapter = chapters.get(item.chapterKey);
        return chapter ? [[item.problemId, chapter] as const] : [];
      }),
  );
}

function curriculumAllChapters(curriculum: AlgorithmTrainingRelations["curriculum"]): Map<number, AlgorithmCurriculumChapter[]> {
  const chapters = new Map(
    curriculum.chapters.map((chapter) => [
      chapter.key,
      {
        key: chapter.key,
        order: chapter.sortOrder,
        title: chapter.name,
        weekLabel: chapter.weekLabel,
        description: chapter.description,
      },
    ]),
  );
  const result = new Map<number, AlgorithmCurriculumChapter[]>();
  for (const item of curriculum.items) {
    const chapter = chapters.get(item.chapterKey);
    if (!chapter) continue;
    result.set(item.problemId, [...(result.get(item.problemId) ?? []), chapter]);
  }
  return result;
}

function curriculumChapterText(problem: AlgorithmProblem, chaptersByProblem: Map<number, AlgorithmCurriculumChapter>): string {
  const chapter = chaptersByProblem.get(problem.id);
  return chapter ? `第 ${chapter.order} 章 ${chapter.title}` : "课程章节待整理";
}

function folderName(relations: AlgorithmTrainingRelations, id: string | null | undefined): string {
  return relations.library.folders.find((folder) => folder.id === id)?.name || "未整理";
}

function importStatusLabel(status: ImportPreview["matchStatus"] | undefined): string {
  if (status === "identified") return "已识别";
  if (status === "confirm") return "需要确认";
  if (status === "incomplete") return "待补充";
  return "解析中";
}
