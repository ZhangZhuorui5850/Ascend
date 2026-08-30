"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  Code2,
  FileCode2,
  FolderOpen,
  GripVertical,
  LibraryBig,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  UploadCloud,
  X,
} from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  finishAlgorithmPlanAction,
  finishDueAlgorithmReviewAction,
  moveAlgorithmProblemsAction,
  removeAlgorithmPlanAction,
  reorderAlgorithmPlansAction,
  scheduleAlgorithmProblemsAction,
  revokeAlgorithmDeviceAction,
  setAlgorithmCurriculumChapterAction,
  setAlgorithmCourseAction,
} from "@/app/actions/algorithms";
import { useFeedback } from "@/components/FeedbackProvider";
import { RichText } from "@/components/RichText";
import plannerStyles from "@/styles/planner/primitives.module.css";
import type { AlgorithmCurriculumChapter } from "@/lib/algorithm-curriculum";
import type { JudgeRuntimeAvailability } from "@/lib/judge-runtime";
import type { AlgorithmDevice } from "@/lib/repo/algorithm-devices";
import type { AlgorithmDashboard, AlgorithmProblem } from "@/lib/repo/algorithms";
import type {
  AlgorithmTrainingRelations,
  PlannedAlgorithmProblem,
} from "@/lib/repo/algorithm-training";
import styles from "@/styles/algorithm-training.module.css";

type Section = "today" | "library";
type LibraryFilter = "all" | "curriculum" | "todo" | "done" | "review" | `chapter:${string}` | `course:${string}` | `stage:${string}` | `folder:${string}`;
type FilterOption = { value: string; label: string; count: number };
type TableSortKey = "title" | "ext" | "course" | "status";
type TableSort = { key: TableSortKey; dir: 1 | -1 };
type CompletionTarget = { problem: AlgorithmProblem; plan: PlannedAlgorithmProblem | null };
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

const LIBRARY_PAGE_SIZE = 20;
const DETAIL_MIN_WIDTH = 300;
const DETAIL_MAX_WIDTH = 760;
const DETAIL_DEFAULT_WIDTH = 360;

function clampDetailWidth(value: number): number {
  const max = typeof window === "undefined"
    ? DETAIL_MAX_WIDTH
    : Math.min(DETAIL_MAX_WIDTH, Math.max(DETAIL_MIN_WIDTH, window.innerWidth - 600));
  return Math.round(Math.min(max, Math.max(DETAIL_MIN_WIDTH, value)));
}

export function AlgorithmTrainingBoardV2({
  dashboard,
  devices,
  initialProblemId,
  judgeAvailability,
  relations,
  today,
}: {
  dashboard: AlgorithmDashboard;
  devices: AlgorithmDevice[];
  initialProblemId: number | null;
  judgeAvailability: JudgeRuntimeAvailability;
  relations: AlgorithmTrainingRelations;
  today: string;
}) {
  const router = useRouter();
  const { notify, confirm } = useFeedback();
  const [section, setSection] = useState<Section>(initialProblemId ? "library" : "today");
  const [selectedDate, setSelectedDate] = useState(today);
  const [showReviews, setShowReviews] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState<number | null>(initialProblemId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [completion, setCompletion] = useState<CompletionTarget | null>(null);
  const [pending, setPending] = useState(false);
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);

  useEffect(() => {
    setRevokingDeviceId((current) => (current && devices.some((device) => device.id === current) ? current : null));
  }, [devices]);

  useEffect(() => {
    const saved = window.localStorage.getItem("ascend.algorithm.showReviews");
    if (saved) queueMicrotask(() => setShowReviews(saved === "1"));
  }, []);

  function mutate(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    if (pending) return;
    setPending(true);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          notify(result.error || "操作失败", "error");
          return;
        }
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

  const selectedProblem = dashboard.problems.find((problem) => problem.id === selectedProblemId) ?? null;

  return (
    <main className={styles.shell} aria-busy={pending}>
      <header className={styles.topbar}>
        <nav className={styles.tabs} aria-label="算法训练主导航">
          <button aria-current={section === "today" ? "page" : undefined} onClick={() => setSection("today")}>
            <CalendarDays size={17} /> 今日训练
          </button>
          <button aria-current={section === "library" ? "page" : undefined} onClick={() => setSection("library")}>
            <LibraryBig size={17} /> 题库
          </button>
        </nav>
        <div className={styles.topActions}>
          <button className={styles.primaryButton} onClick={() => setImportOpen(true)}>
            <Plus size={17} /> 添加 CPP
          </button>
          <button aria-label="连接与设置" className={styles.iconButton} onClick={() => setSettingsOpen(true)}>
            <Settings2 size={18} />
          </button>
        </div>
      </header>

      {section === "today" ? (
        <TodayView
          dashboard={dashboard}
          onComplete={setCompletion}
          onOpenProblem={(id) => { setSelectedProblemId(id); setSection("library"); }}
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
                mutate(
                  () => removeAlgorithmPlanAction({ taskId: plan.taskId, expectedVersion: plan.version, day: plan.day }),
                  "已移出训练计划",
                );
              }
            });
          }}
          onReorder={(taskIds) => mutate(
            () => reorderAlgorithmPlansAction({ day: selectedDate, taskIds }),
            "训练顺序已保存",
          )}
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
        />
      ) : (
        <LibraryView
          dashboard={dashboard}
          onAddPlan={(problemIds, day) => mutate(
            () => scheduleAlgorithmProblemsAction({ problemIds, day }),
            `已加入 ${day} 的训练计划`,
          )}
          onMove={(problemIds, folderId) => mutate(
            () => moveAlgorithmProblemsAction({ problemIds, folderId }),
            "题目位置已更新",
          )}
          onSetCourse={(problemIds, courseName, stageKey) => mutate(
            () => setAlgorithmCourseAction({ problemIds, courseName, stageKey }),
            "来源题单已保存",
          )}
          onSetCurriculum={(problemIds, chapterKey) => mutate(
            () => setAlgorithmCurriculumChapterAction({ problemIds, chapterKey }),
            "课程章节已同步",
          )}
          relations={relations}
          selectedIds={selectedIds}
          selectedProblemId={selectedProblemId}
          setSelectedIds={setSelectedIds}
          setSelectedProblemId={setSelectedProblemId}
          today={today}
        />
      )}

      {pickerOpen ? (
        <ProblemPicker
          problems={dashboard.problems}
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
          onClose={() => setCompletion(null)}
          onChoose={(choice) => {
            const target = completion;
            setCompletion(null);
            mutate(
              () => target.plan
                ? finishAlgorithmPlanAction({
                    taskId: target.plan.taskId,
                    expectedVersion: target.plan.version,
                    problemId: target.problem.id,
                    day: selectedDate,
                    choice,
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
          onImported={() => { setImportOpen(false); router.refresh(); }}
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
          pendingDeviceId={revokingDeviceId}
        />
      ) : null}
    </main>
  );
}

function TodayView({
  dashboard,
  onComplete,
  onOpenPicker,
  onOpenProblem,
  onRemove,
  onReorder,
  plans,
  curriculum,
  selectedDate,
  setSelectedDate,
  showReviews,
  setShowReviews,
  today,
}: {
  dashboard: AlgorithmDashboard;
  onComplete: (target: CompletionTarget) => void;
  onOpenPicker: () => void;
  onOpenProblem: (id: number) => void;
  onRemove: (plan: PlannedAlgorithmProblem) => void;
  onReorder: (taskIds: string[]) => void;
  plans: PlannedAlgorithmProblem[];
  curriculum: AlgorithmTrainingRelations["curriculum"];
  selectedDate: string;
  setSelectedDate: (value: string) => void;
  showReviews: boolean;
  setShowReviews: (value: boolean) => void;
  today: string;
}) {
  const primaryChapterByProblem = curriculumPrimaryChapters(curriculum);
  const manualPlans = plans.filter((item) => item.day === selectedDate && item.status !== "canceled");
  const due = selectedDate === today
    ? dashboard.problems.filter((problem) => problem.reviewEnabled && problem.nextReview && problem.nextReview <= today)
    : dashboard.problems.filter((problem) => problem.reviewEnabled && problem.nextReview === selectedDate);
  const rows: Array<{ problem: AlgorithmProblem; plan: PlannedAlgorithmProblem | null; review: boolean }> = manualPlans.map((plan) => ({
    problem: dashboard.problems.find((problem) => problem.id === plan.problemId)!,
    plan,
    review: due.some((problem) => problem.id === plan.problemId),
  })).filter((row) => row.problem);
  if (showReviews) {
    for (const problem of due) {
      if (!rows.some((row) => row.problem.id === problem.id)) rows.push({ problem, plan: null, review: true });
    }
  }
  const completedCount = rows.filter((row) => row.plan?.status === "completed").length;

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= manualPlans.length) return;
    const next = [...manualPlans];
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next.map((item) => item.taskId));
  }

  return (
    <section className={styles.todayPage}>
      <div className={styles.heroRow}>
        <div>
          <span className={styles.eyebrow}>DAILY TRAINING</span>
          <h2>{selectedDate === today ? "今天练什么" : `${selectedDate} 的训练`}</h2>
          <p>{rows.length ? `${completedCount}/${rows.length} 已完成，按你的顺序逐题处理。` : "先从题库加入几道题。"}</p>
        </div>
        <label className={styles.dateField}>
          <span>训练日期</span>
          <input min={today} type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
        </label>
      </div>
      <div className={styles.todayToolbar}>
        <button className={styles.primaryButton} onClick={onOpenPicker}><Plus size={17} /> 添加题目</button>
        <label className={styles.switchLabel}>
          <input checked={showReviews} type="checkbox" onChange={(event) => setShowReviews(event.target.checked)} />
          <span /> 显示到期复习 <b>{due.length}</b>
        </label>
      </div>
      <div className={styles.planList}>
        {rows.map((row, index) => (
          <article className={styles.planRow} key={`${row.problem.id}:${row.plan?.taskId ?? "review"}`}>
            <span className={styles.grip} data-static={row.plan ? undefined : "true"}><GripVertical size={17} /></span>
            <button className={styles.completeCircle} aria-label={`完成 ${row.problem.title}`} data-completed={row.plan?.status === "completed" || undefined} onClick={() => onComplete(row)}>
              {row.plan?.status === "completed" ? <Check size={16} /> : <Circle size={17} />}
            </button>
            <button className={styles.planTitle} onClick={() => onOpenProblem(row.problem.id)}>
              <strong>{row.problem.title}</strong>
              <span>{providerText(row.problem)} · {curriculumChapterText(row.problem, primaryChapterByProblem)}</span>
            </button>
            {row.review ? <span className={styles.reviewBadge}>复习</span> : null}
            {row.plan ? (
              <span className={styles.rowActions}>
                <button aria-label="上移" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                <button aria-label="下移" disabled={index === manualPlans.length - 1} onClick={() => move(index, 1)}>↓</button>
                <button aria-label="移出计划" onClick={() => onRemove(row.plan!)}><X size={16} /></button>
              </span>
            ) : <span className={styles.dueText}>到期 {row.problem.nextReview}</span>}
          </article>
        ))}
        {!rows.length ? (
          <div className={styles.emptyState}>
            <CalendarDays size={28} />
            <h3>这一天还很轻</h3>
            <p>从课程章节、题库或当前题目加入训练。</p>
            <button className={styles.primaryButton} onClick={onOpenPicker}>选择题目</button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LibraryView({
  dashboard,
  onAddPlan,
  onMove,
  onSetCourse,
  onSetCurriculum,
  relations,
  selectedIds,
  selectedProblemId,
  setSelectedIds,
  setSelectedProblemId,
  today,
}: {
  dashboard: AlgorithmDashboard;
  onAddPlan: (ids: number[], day: string) => void;
  onMove: (ids: number[], folderId: string | null) => void;
  onSetCourse: (ids: number[], courseName: string, stageKey: string) => void;
  onSetCurriculum: (ids: number[], chapterKey: string) => void;
  relations: AlgorithmTrainingRelations;
  selectedIds: number[];
  selectedProblemId: number | null;
  setSelectedIds: (ids: number[]) => void;
  setSelectedProblemId: (id: number | null) => void;
  today: string;
}) {
  const curriculumChapters = useMemo(() => relations.curriculum.chapters.map((chapter) => ({
    key: chapter.key,
    order: chapter.sortOrder,
    title: chapter.name,
    weekLabel: chapter.weekLabel,
    description: chapter.description,
  })), [relations.curriculum.chapters]);
  const curriculumByProblem = useMemo(
    () => curriculumPrimaryChapters(relations.curriculum),
    [relations.curriculum],
  );
  const curriculumChaptersByProblem = useMemo(
    () => curriculumAllChapters(relations.curriculum),
    [relations.curriculum],
  );
  const curriculumStats = useMemo(() => curriculumChapters.map((chapter) => {
    const problems = dashboard.problems.filter((problem) => curriculumChaptersByProblem.get(problem.id)?.some((item) => item.key === chapter.key));
    return {
      chapter,
      completed: problems.filter(isAlgorithmCompleted).length,
      total: problems.length,
    };
  }), [curriculumChapters, curriculumChaptersByProblem, dashboard.problems]);
  const currentChapter = curriculumStats.find((item) => item.total > 0 && item.completed < item.total)
    ?? curriculumStats.find((item) => item.total > 0)
    ?? null;
  const initialChapter = selectedProblemId
    ? curriculumByProblem.get(selectedProblemId) ?? currentChapter?.chapter
    : currentChapter?.chapter;
  const [filter, setFilter] = useState<LibraryFilter>(() => initialChapter ? `chapter:${initialChapter.key}` : "all");
  const [query, setQuery] = useState("");
  const [planDate, setPlanDate] = useState(today);
  const [courseName, setCourseName] = useState(relations.courses[0]?.name || "郭炜算法基础");
  const [stageKey, setStageKey] = useState("W1");
  const [curriculumChapterKey, setCurriculumChapterKey] = useState(initialChapter?.key ?? curriculumChapters[0]?.key ?? "");
  const [pageIndex, setPageIndex] = useState(0);
  const [detailWidth, setDetailWidth] = useState<number | null>(null);
  const [providersSelected, setProvidersSelected] = useState<string[]>([]);
  const [tagsSelected, setTagsSelected] = useState<string[]>([]);
  const [expandedCourses, setExpandedCourses] = useState<string[]>([]);
  const [tableSort, setTableSort] = useState<TableSort | null>(null);
  const membershipsByProblem = useMemo(() => groupMemberships(relations), [relations]);
  const folderByProblem = useMemo(
    () => new Map(relations.library.items.map((item) => [item.problemId, item.folderId])),
    [relations.library.items],
  );
  const topics = [...new Set(dashboard.problems.flatMap((problem) => problem.tags))].sort();
  const platformOptions: FilterOption[] = useMemo(() => {
    const byId = new Map<string, FilterOption>();
    for (const problem of dashboard.problems) {
      const current = byId.get(problem.providerId);
      if (current) current.count += 1;
      else byId.set(problem.providerId, { value: problem.providerId, label: problem.providerLabel || problem.providerId, count: 1 });
    }
    return [...byId.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }, [dashboard.problems]);
  const tagOptions: FilterOption[] = useMemo(
    () => topics.map((tag) => ({ value: tag, label: tag, count: dashboard.problems.filter((problem) => problem.tags.includes(tag)).length })),
    [topics, dashboard.problems],
  );
  const filtered = dashboard.problems.filter((problem) => {
    const text = `${problem.title} ${problem.externalProblemId} ${problem.tags.join(" ")}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (filter === "todo") return learningStatus(problem, today) === "todo";
    if (filter === "done") return learningStatus(problem, today) === "done";
    if (filter === "review") return learningStatus(problem, today) === "review";
    const membershipsForProblem = membershipsByProblem.get(problem.id);
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
    setFilter(next);
    setPageIndex(0);
  }

  function toggleTableSort(key: TableSortKey) {
    setPageIndex(0);
    setTableSort((current) => (!current || current.key !== key ? { key, dir: 1 } : current.dir === 1 ? { key, dir: -1 } : null));
  }

  function toggleSelection(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function toggleProvider(value: string) {
    setProvidersSelected((current) => toggleSelection(current, value));
    setPageIndex(0);
  }

  function toggleTag(value: string) {
    setTagsSelected((current) => toggleSelection(current, value));
    setPageIndex(0);
  }

  function toggleCourseExpanded(courseKey: string) {
    setExpandedCourses((current) => (current.includes(courseKey) ? current.filter((key) => key !== courseKey) : [...current, courseKey]));
  }

  const hasActiveRefiners = providersSelected.length > 0 || tagsSelected.length > 0;

  function resetAllFilters() {
    setFilter("all");
    setQuery("");
    setProvidersSelected([]);
    setTagsSelected([]);
    setPageIndex(0);
  }

  const sortCell = (key: TableSortKey, label: string) => (
    <button
      aria-label={`按${label}排序${tableSort?.key === key ? (tableSort.dir === 1 ? "，当前升序" : "，当前降序") : ""}`}
      className={styles.headSort}
      data-active={tableSort?.key === key || undefined}
      onClick={() => toggleTableSort(key)}
      type="button"
    >
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

  const selectedProblem = dashboard.problems.find((problem) => problem.id === selectedProblemId) ?? null;
  useEffect(() => {
    if (!selectedProblemId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.querySelector('[class*="modalBackdrop"]')) {
        setSelectedProblemId(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedProblemId, setSelectedProblemId]);
  const targetIds = selectedIds.length ? selectedIds : selectedProblem ? [selectedProblem.id] : [];
  const selectedChapterStats = filter.startsWith("chapter:")
    ? curriculumStats.find((item) => item.chapter.key === filter.slice(8)) ?? null
    : null;
  const curriculumCompleted = dashboard.problems.filter(isAlgorithmCompleted).length;

  return (
    <section
      className={styles.libraryLayout}
      data-detail-open={selectedProblem ? "true" : undefined}
      style={detailWidth ? ({ "--alg-detail-w": `${detailWidth}px` } as React.CSSProperties) : undefined}
    >
      <aside className={styles.libraryNav}>
        <NavButton active={filter === "all"} count={dashboard.problems.length} label="全部题目" onClick={() => applyFilter("all")} />
        <NavButton active={filter === "todo"} count={dashboard.problems.filter((p) => learningStatus(p, today) === "todo").length} label="未做" onClick={() => applyFilter("todo")} />
        <NavButton active={filter === "done"} count={dashboard.problems.filter((p) => learningStatus(p, today) === "done").length} label="已做" onClick={() => applyFilter("done")} />
        <NavButton active={filter === "review"} count={dashboard.problems.filter((p) => learningStatus(p, today) === "review").length} label="待复习" onClick={() => applyFilter("review")} />
        <NavGroup label="学习课程">
          <div className={styles.curriculumSummary}>
            <button aria-current={filter === "curriculum" ? "page" : undefined} onClick={() => applyFilter("curriculum")} type="button">
              <strong>{relations.curriculum.name}</strong>
              <span>{curriculumCompleted}/{dashboard.problems.length} 已完成</span>
            </button>
            <div aria-label={`课程进度 ${curriculumCompleted}/${dashboard.problems.length}`} className={styles.curriculumProgress} role="progressbar" aria-valuemin={0} aria-valuemax={dashboard.problems.length} aria-valuenow={curriculumCompleted}>
              <span style={{ width: `${dashboard.problems.length ? curriculumCompleted / dashboard.problems.length * 100 : 0}%` }} />
            </div>
          </div>
          {curriculumStats.map((item) => {
            const scope: LibraryFilter = `chapter:${item.chapter.key}`;
            return (
              <button
                aria-current={filter === scope ? "page" : undefined}
                className={`${styles.navButton} ${styles.curriculumChapter}`}
                key={scope}
                onClick={() => applyFilter(scope)}
                title={item.chapter.description}
              >
                <span>{item.chapter.order}. {item.chapter.title}</span>
                <small>{item.total ? `${item.completed}/${item.total}` : "待补题"}</small>
              </button>
            );
          })}
        </NavGroup>
        <NavGroup label="来源课程与题单">
          {relations.courses.map((course) => (
            <div className={styles.courseBlock} key={course.key}>
              <div className={styles.courseLine}>
                <NavButton active={filter === `course:${course.key}`} count={course.problemCount} label={course.name} onClick={() => applyFilter(`course:${course.key}`)} />
                {course.stages.length ? (
                  <button aria-expanded={expandedCourses.includes(course.key)} aria-label={`展开 ${course.name} 的分组`} className={styles.courseCaret} onClick={() => toggleCourseExpanded(course.key)}>
                    <ChevronDown size={14} />
                  </button>
                ) : null}
              </div>
              {expandedCourses.includes(course.key)
                ? [...course.stages]
                    .sort((left, right) => left.key.localeCompare(right.key, "zh-Hans-CN", { numeric: true }))
                    .map((stage) => {
                      const scope: LibraryFilter = `stage:${course.key}||${stage.key}`;
                      return <button aria-current={filter === scope ? "page" : undefined} className={`${styles.navButton} ${styles.navSubButton}`} key={scope} onClick={() => applyFilter(scope)}><span>{stage.key}</span>{stage.problemCount === undefined ? null : <small>{stage.problemCount}</small>}</button>;
                    })
                : null}
            </div>
          ))}
        </NavGroup>
        <NavGroup label="我的文件夹">
          <NavButton active={filter === "folder:root"} label="未整理" onClick={() => applyFilter("folder:root")} />
          {relations.library.folders.map((folder) => (
            <NavButton key={folder.id} active={filter === `folder:${folder.id}`} label={folder.name} onClick={() => applyFilter(`folder:${folder.id}`)} />
          ))}
        </NavGroup>
      </aside>

      <div className={styles.libraryMain}>
        {selectedChapterStats ? (
          <section className={styles.chapterContext}>
            <div>
              <span>{selectedChapterStats.chapter.weekLabel} · 第 {selectedChapterStats.chapter.order} 章</span>
              <h2>{selectedChapterStats.chapter.title}</h2>
              <p>{selectedChapterStats.chapter.description}</p>
            </div>
            <strong>{selectedChapterStats.total ? `${selectedChapterStats.completed}/${selectedChapterStats.total}` : "待补题"}</strong>
          </section>
        ) : null}
        <div className={styles.libraryHeader}>
          <label className={styles.searchField}><Search size={17} /><input placeholder="搜索名称、题号或分类" value={query} onChange={(event) => { setQuery(event.target.value); setPageIndex(0); }} /></label>
          <span>{filtered.length} 道题</span>
        </div>
        <div className={styles.filterBar}>
          <FilterDropdown
            label="平台"
            options={platformOptions}
            selected={providersSelected}
            onToggle={(value) => toggleProvider(value)}
          />
          <FilterDropdown
            label="标签"
            options={tagOptions}
            selected={tagsSelected}
            onToggle={(value) => toggleTag(value)}
          />
          {hasActiveRefiners || query ? <button className={styles.filterReset} onClick={resetAllFilters}>清除筛选</button> : null}
        </div>
        <div className={styles.bulkBar} data-visible={selectedIds.length > 0}>
          <strong>已选 {selectedIds.length}</strong>
          <input min={today} type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} />
          <button onClick={() => onAddPlan(selectedIds, planDate)}>加入计划</button>
          <select aria-label="移动到文件夹" defaultValue="" onChange={(event) => { onMove(selectedIds, event.target.value || null); event.currentTarget.value = ""; }}>
            <option value="">移动文件夹…</option>
            <option value="">未整理</option>
            {relations.library.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          <button onClick={() => onSetCourse(selectedIds, courseName, stageKey)}>设置来源题单</button>
          <input aria-label="来源课程或题单名称" value={courseName} onChange={(event) => setCourseName(event.target.value)} />
          <input aria-label="题单分组" className={styles.shortInput} value={stageKey} onChange={(event) => setStageKey(event.target.value)} />
          <select aria-label="课程章节" value={curriculumChapterKey} onChange={(event) => setCurriculumChapterKey(event.target.value)}>
            {curriculumChapters.map((chapter) => <option key={chapter.key} value={chapter.key}>{chapter.order}. {chapter.title}</option>)}
          </select>
          <button onClick={() => onSetCurriculum(selectedIds, curriculumChapterKey)}>设置课程章节</button>
        </div>
        <div className={styles.problemTable} role="table" aria-label="算法题库">
          <div className={styles.tableHead} role="row">
            <input aria-label={`全选筛选结果（共 ${filtered.length} 题，含未显示页）`} checked={filtered.length > 0 && filtered.every((item) => selectedIds.includes(item.id))} type="checkbox" onChange={(event) => setSelectedIds(event.target.checked ? filtered.map((item) => item.id) : [])} />
            {sortCell("title", "题目")}
            {sortCell("ext", "平台题号")}
            {sortCell("course", "课程章节")}
            <span>算法分类</span>
            {sortCell("status", "状态")}
          </div>
          {visibleProblems.map((problem) => {
            const chapter = curriculumByProblem.get(problem.id);
            const openDetail = () => setSelectedProblemId(problem.id);
            return (
              <div
                className={styles.tableRow}
                data-active={selectedProblem?.id === problem.id}
                key={problem.id}
                role="row"
                tabIndex={0}
                aria-selected={selectedProblem?.id === problem.id}
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
                <span className={styles.tagList}>{problem.tags.slice(0, 2).map((tag) => <i key={tag}>{tag}</i>)}</span>
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
            <button disabled={safePageIndex === 0} onClick={() => setPageIndex(safePageIndex - 1)}>上一页</button>
            <span data-pager-info>
              第 {safePageIndex + 1} / {pageCount} 页 · 共 {filtered.length} 题 · 本页 {visibleProblems.length} 题
            </span>
            <button disabled={safePageIndex >= pageCount - 1} onClick={() => setPageIndex(safePageIndex + 1)}>下一页</button>
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
            <button aria-label="关闭详情" onClick={() => setSelectedProblemId(null)}><X size={18} /></button>
          </div>
          <span className={styles.eyebrow}>{providerText(selectedProblem)}</span>
          <h2>{selectedProblem.title}</h2>
          <p className={styles.detailMeta}>{curriculumChapterText(selectedProblem, curriculumByProblem)} · {curriculumByProblem.get(selectedProblem.id)?.weekLabel ?? ""}</p>
          {(membershipsByProblem.get(selectedProblem.id) ?? []).length ? (
            <p className={styles.detailSource}>来源题单：{(membershipsByProblem.get(selectedProblem.id) ?? []).map((item) => `${item.courseName} · ${item.stageKey}`).join(" / ")}</p>
          ) : null}
          <div className={styles.detailActions}>
            <input min={today} type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} />
            <button className={styles.primaryButton} onClick={() => onAddPlan(targetIds, planDate)}><Plus size={16} /> 加入计划</button>
          </div>
          <section className={styles.statement}><RichText block text={selectedProblem.statementMarkdown || `${selectedProblem.title}\n\n题面保存在参考 CPP 的文件头注释中。`} /></section>
          <details className={styles.detailSection}>
            <summary>参考 CPP</summary>
            <pre>{selectedProblem.referenceCode.cpp17 || "参考代码保存在 Ascend 网盘中。"}</pre>
          </details>
          <details className={styles.detailSection} open>
            <summary>训练记录 · {selectedProblem.attempts.length}</summary>
            {selectedProblem.attempts.slice(0, 5).map((attempt) => <p key={attempt.id}>{attempt.day} · {attempt.verdict} · {attempt.durationMinutes} 分钟</p>)}
            {!selectedProblem.attempts.length ? <p>还没有训练记录。</p> : null}
          </details>
          <details className={styles.detailSection}>
            <summary>复习策略</summary>
            <p>{selectedProblem.reviewEnabled ? `当前第 ${selectedProblem.reviewStep + 1} 阶段，下一次 ${selectedProblem.nextReview || "完成后安排"}` : "已退出复习计划"}</p>
            <p>间隔：3 → 7 → 14 → 30 → 60 天</p>
          </details>
          <p className={styles.storageLine}><FolderOpen size={15} /> Ascend 网盘 / 算法 / {folderName(relations, folderByProblem.get(selectedProblem.id))}</p>
        </aside>
      ) : (
        <aside className={styles.detailPlaceholder}>
          <LibraryBig size={26} />
          <strong>从左侧选择题目查看详情</strong>
          <span>题面、参考代码与训练记录会显示在这里。</span>
        </aside>
      )}
    </section>
  );
}

function ProblemPicker({ problems, selectedDate, onClose, onSubmit }: { problems: AlgorithmProblem[]; selectedDate: string; onClose: () => void; onSubmit: (ids: number[]) => void }) {
  const [query, setQuery] = useState("");
  const [ids, setIds] = useState<number[]>([]);
  const visible = problems.filter((problem) => `${problem.title} ${problem.externalProblemId}`.toLowerCase().includes(query.toLowerCase())).slice(0, 100);
  return (
    <Modal title={`添加到 ${selectedDate}`} onClose={onClose}>
      <label className={styles.searchField}><Search size={17} /><input autoFocus placeholder="搜索题目" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className={styles.pickerList}>
        {visible.map((problem) => <label key={problem.id}><input checked={ids.includes(problem.id)} type="checkbox" onChange={(event) => setIds(event.target.checked ? [...ids, problem.id] : ids.filter((id) => id !== problem.id))} /><span><strong>{problem.title}</strong><small>{providerText(problem)}</small></span></label>)}
      </div>
      <footer className={styles.modalFooter}><button onClick={onClose}>取消</button><button className={styles.primaryButton} disabled={!ids.length} onClick={() => onSubmit(ids)}>加入 {ids.length} 道题</button></footer>
    </Modal>
  );
}

function CompletionDialog({ target, onClose, onChoose }: { target: CompletionTarget; onClose: () => void; onChoose: (choice: "review" | "tomorrow" | "stop-review") => void }) {
  return (
    <Modal title={`完成「${target.problem.title}」`} onClose={onClose}>
      <p className={styles.modalLead}>选择这道题接下来的安排。</p>
      <div className={styles.choiceList}>
        <button onClick={() => onChoose("review")}><strong>完成并安排复习</strong><span>按 3 → 7 → 14 → 30 → 60 天推进</span></button>
        <button onClick={() => onChoose("tomorrow")}><strong>明天继续</strong><span>保留训练状态，安排到次日</span></button>
        <button onClick={() => onChoose("stop-review")}><strong>完成并退出复习计划</strong><span>保留完成记录，停止自动安排</span></button>
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
    await Promise.all(next.map(async (row) => {
      try {
        const form = new FormData();
        form.set("intent", "preview");
        form.set("file", row.file);
        form.set("relativePath", row.relativePath);
        const response = await fetch("/api/algorithm/import/cpp", { method: "POST", body: form });
        const result = await response.json() as { ok: boolean; candidate?: ImportPreview; error?: string };
        if (!response.ok || !result.ok || !result.candidate) throw new Error(result.error || "解析失败");
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, preview: result.candidate!, error: "" } : item));
      } catch (error) {
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, error: error instanceof Error ? error.message : "解析失败" } : item));
      }
    }));
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
        const result = await response.json() as { ok: boolean; duplicate?: boolean; error?: string };
        if (!response.ok || !result.ok) {
          setRows((current) => current.map((item) => item.id === row.id ? { ...item, error: result.error || "导入失败" } : item));
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
      <div className={styles.dropZone} onDragOver={(event) => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); void addFiles([...event.dataTransfer.files]); }}>
        <UploadCloud size={30} />
        <h3>把 CPP 拖到这里</h3>
        <p>Ascend 会读取文件头块注释、文件名和题号，并生成导入预览。</p>
        <span><button onClick={() => multipleRef.current?.click()}>选择多个 CPP</button><button onClick={() => folderRef.current?.click()}>选择文件夹</button></span>
        <input hidden multiple ref={multipleRef} type="file" accept=".cpp,.cc,.cxx" onChange={(event) => void addFiles([...event.target.files || []])} />
        <input hidden multiple ref={folderRef} type="file" onChange={(event) => void addFiles([...event.target.files || []])} />
      </div>
      {rows.length ? (
        <>
          <div className={styles.importBulk}>
            <label>目标文件夹<select value={folderId} onChange={(event) => setFolderId(event.target.value)}><option value="">未整理</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
            <label>来源课程或题单{autoAssignedCount ? <em>（自动识别的文件除外）</em> : null}<input value={courseName} onChange={(event) => setCourseName(event.target.value)} /></label>
            <label>题单分组<input value={stageKey} onChange={(event) => setStageKey(event.target.value)} /></label>
            <label>算法分类<input placeholder="字符串, 模拟" value={topics} onChange={(event) => setTopics(event.target.value)} /></label>
          </div>
          {autoAssignedCount ? (
            <p className={styles.autoNotice}>
              {autoAssignedCount} 个文件将按链接自动归入「程序设计实习」（例题 / 课后习题），上方来源题单设置作用于其余文件。
            </p>
          ) : null}
          <div className={styles.importRows}>
            {rows.map((row) => (
              <article key={row.id}>
                <FileCode2 size={20} />
                <div>
                  <strong>{row.preview?.title || row.file.name}</strong>
                  <small>{row.relativePath}</small>
                  {row.preview?.courseSuggestion ? (
                    <small className={styles.autoCourse}>自动归入：{row.preview.courseSuggestion.courseName} · {row.preview.courseSuggestion.stageKey}</small>
                  ) : null}
                </div>
                {row.preview ? <input aria-label="平台题号" value={row.preview.externalProblemId} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id && item.preview ? { ...item, preview: { ...item.preview, externalProblemId: event.target.value } } : item))} /> : null}
                <span className={styles.importStatus} data-status={row.error ? "error" : row.preview?.matchStatus || "loading"}>{row.error || importStatusLabel(row.preview?.matchStatus)}</span>
                <button aria-label="移除文件" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}><X size={16} /></button>
              </article>
            ))}
          </div>
        </>
      ) : null}
      <p className={styles.privacyLine}>文件保存在当前 Ascend 个人空间；题面、来源题单、训练记录和参考 CPP 跟随账号同步。</p>
      <footer className={styles.modalFooter}><button onClick={onClose}>取消</button><button className={styles.primaryButton} disabled={uploading || !rows.some((row) => row.preview)} onClick={() => void importAll()}>{uploading ? <RefreshCw className={styles.spin} size={16} /> : <UploadCloud size={16} />} 导入 {rows.filter((row) => row.preview).length} 个文件</button></footer>
    </Modal>
  );
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
            <span><strong>{device.name}</strong><small>{device.lastSeenAt ? `最近同步 ${device.lastSeenAt.slice(0, 16).replace("T", " ")}` : "等待首次同步"}</small></span>
            <button
              className={styles.deviceRevoke}
              disabled={pendingDeviceId === device.id}
              onClick={() => onRevokeDevice(device.id, device.name)}
              type="button"
            >
              撤销
            </button>
          </div>
        ))}
        <a className={styles.primaryButton} href="/practice/algorithms/connect">连接新设备</a>
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
          <Dialog.Popup
            aria-label={title}
            className={styles.modal}
            data-wide={wide}
            initialFocus
            finalFocus={returnFocusRef}
          >
            <header>
              <Dialog.Title render={<h2 />}>{title}</Dialog.Title>
              <button aria-label="关闭" onClick={onClose}><X size={19} /></button>
            </header>
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NavButton({ active, count, label, onClick }: { active: boolean; count?: number; label: string; onClick: () => void }) {
  return <button aria-current={active ? "page" : undefined} className={styles.navButton} onClick={onClick}><span>{label}</span>{count === undefined ? null : <small>{count}</small>}</button>;
}

function FilterDropdown({ label, options, selected, onToggle }: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
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
      <button
        aria-expanded={open}
        aria-haspopup="true"
        className={styles.filterTrigger}
        data-active={selected.length > 0 || undefined}
        onClick={() => setOpen(!open)}
      >
        {label}
        {selected.length ? (
          <span className={styles.filterCount}>
            {selected.length === 1
              ? options.find((option) => option.value === selected[0])?.label ?? selected[0]
              : `${selected.length} 项`}
          </span>
        ) : null}
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

function NavGroup({ children, label }: { children: React.ReactNode; label: string }) {
  const [open, setOpen] = useState(true);
  return (
    <section className={styles.navGroup}>
      <button aria-expanded={open} className={styles.navGroupToggle} onClick={() => setOpen(!open)} type="button">
        <ChevronDown size={14} /> {label}
      </button>
      {open ? children : null}
    </section>
  );
}

function StatusBadge({ status }: { status: "todo" | "done" | "review" }) {
  const labels = { todo: "未做", done: "已做", review: "待复习" };
  return <span className={styles.statusBadge} data-status={status}>{labels[status]}</span>;
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
  return `${problem.providerLabel}${problem.externalProblemId ? ` ${problem.externalProblemId}` : ""}`;
}

function curriculumPrimaryChapters(curriculum: AlgorithmTrainingRelations["curriculum"]): Map<number, AlgorithmCurriculumChapter> {
  const chapters = new Map(curriculum.chapters.map((chapter) => [chapter.key, {
    key: chapter.key,
    order: chapter.sortOrder,
    title: chapter.name,
    weekLabel: chapter.weekLabel,
    description: chapter.description,
  }]));
  return new Map(curriculum.items
    .filter((item) => item.membershipKind === "primary")
    .flatMap((item) => {
      const chapter = chapters.get(item.chapterKey);
      return chapter ? [[item.problemId, chapter] as const] : [];
    }));
}

function curriculumAllChapters(curriculum: AlgorithmTrainingRelations["curriculum"]): Map<number, AlgorithmCurriculumChapter[]> {
  const chapters = new Map(curriculum.chapters.map((chapter) => [chapter.key, {
    key: chapter.key,
    order: chapter.sortOrder,
    title: chapter.name,
    weekLabel: chapter.weekLabel,
    description: chapter.description,
  }]));
  const result = new Map<number, AlgorithmCurriculumChapter[]>();
  for (const item of curriculum.items) {
    const chapter = chapters.get(item.chapterKey);
    if (!chapter) continue;
    result.set(item.problemId, [...(result.get(item.problemId) ?? []), chapter]);
  }
  return result;
}

function curriculumChapterText(
  problem: AlgorithmProblem,
  chaptersByProblem: Map<number, AlgorithmCurriculumChapter>,
): string {
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
