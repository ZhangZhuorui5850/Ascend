import type Database from "better-sqlite3";
import { loadJudgeCodeKeys } from "../../algorithm-code-crypto";
import { ALGORITHM_CURRICULUM_COURSE_KEY } from "../../algorithm-curriculum";
import { assertDateKey, todayKey } from "../../dates";
import type { AlgorithmDeviceContext } from "../../repo/algorithm-devices";
import { listAlgorithmCollections } from "../../repo/algorithm-import";
import { getAlgorithmTrainingRelations } from "../../repo/algorithm-training";
import { getAlgorithmDraft } from "../../repo/algorithm-submissions";
import { getAlgorithmDashboard, getAlgorithmProblemDetail, type AlgorithmProblem } from "../../repo/algorithms";
import { getServerInstanceId } from "../../server-identity";

type DeviceCourseMembership = {
  problemId: number;
  courseKey: string;
  courseName: string;
  stageKey: string;
};

export function getAlgorithmDeviceQueuePayload(
  db: Database.Database,
  context: AlgorithmDeviceContext,
  selectedDayInput?: string,
) {
  const today = todayKey();
  const selectedDay = assertDateKey(selectedDayInput || today);
  const dashboard = getAlgorithmDashboard(db, context, today);
  const collections = listAlgorithmCollections(db, context);
  const training = getAlgorithmTrainingRelations(db, context);
  const library = training.library;
  const curriculumChapterByKey = new Map(training.curriculum.chapters.map((chapter) => [chapter.key, chapter]));
  const curriculumMemberships = training.curriculum.items.flatMap((item) => {
    const chapter = curriculumChapterByKey.get(item.chapterKey);
    return chapter ? [{
      problemId: item.problemId,
      courseKey: training.curriculum.key,
      courseName: training.curriculum.name,
      stageKey: `${chapter.sortOrder}. ${chapter.name}`,
    }] : [];
  });
  const courseMemberships: DeviceCourseMembership[] = [...curriculumMemberships, ...training.courseMemberships];
  const coursesByProblem = new Map<number, DeviceCourseMembership[]>();
  for (const membership of courseMemberships) {
    const current = coursesByProblem.get(membership.problemId) ?? [];
    current.push(membership);
    coursesByProblem.set(membership.problemId, current);
  }
  const libraryNumbers = new Map(library.items.map((item) => [item.problemId, item.libraryNumber]));
  const draftProblemIds = new Set(
    (
      db.prepare(`
        SELECT DISTINCT problem_id AS problemId
        FROM algorithm_code_versions
        WHERE workspace_id = ?
      `).all(context.workspaceId) as Array<{ problemId: number }>
    ).map((item) => item.problemId),
  );
  const problemsById = new Map(dashboard.problems.map((problem) => [problem.id, problem]));
  const courseTree = buildCourseTree(courseMemberships, problemsById, training.curriculum);
  const queueForDay = (day: string) => training.plans
    .filter((plan) => plan.day === day && plan.status !== "canceled")
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((plan) => ({ plan, problem: problemsById.get(plan.problemId) }))
    .filter((item): item is typeof item & { problem: AlgorithmProblem } => Boolean(item.problem));
  const queue = queueForDay(selectedDay);
  const todayQueue = selectedDay === today ? queue : queueForDay(today);
  const overdueQueue = training.plans
    .filter((plan) => plan.day < today && (plan.status === "open" || plan.status === "waiting"))
    .sort((left, right) => left.day.localeCompare(right.day) || left.sortOrder - right.sortOrder)
    .map((plan) => ({ plan, problem: problemsById.get(plan.problemId) }))
    .filter((item): item is typeof item & { problem: AlgorithmProblem } => Boolean(item.problem));
  const queueItem = (item: (typeof queue)[number]) => ({
    ...problemSummary(item.problem, libraryNumbers, draftProblemIds, coursesByProblem),
    planTaskId: item.plan.taskId,
    planDay: item.plan.day,
    planVersion: item.plan.version,
    planStatus: item.plan.status,
    planSortOrder: item.plan.sortOrder,
  });
  return {
    server: { instanceId: getServerInstanceId(db) },
    workspace: { id: context.workspaceId },
    device: { id: context.deviceId, name: context.deviceName },
    today,
    selectedDay,
    metrics: dashboard.metrics,
    dayQueue: queue.map(queueItem),
    todayQueue: todayQueue.map(queueItem),
    overdueQueue: overdueQueue.map(queueItem),
    due: dashboard.dueProblems.map((problem) => problemSummary(problem, libraryNumbers, draftProblemIds, coursesByProblem)),
    collections,
    courseTree,
    library,
    problems: dashboard.problems.map((problem) => problemSummary(problem, libraryNumbers, draftProblemIds, coursesByProblem)),
  };
}

/** 网页课程主线与来源题单共用此树，插件侧栏按课程和章节展开。 */
function buildCourseTree(
  courseMemberships: DeviceCourseMembership[],
  problemsById: Map<number, AlgorithmProblem>,
  curriculum: ReturnType<typeof getAlgorithmTrainingRelations>["curriculum"],
) {
  const curriculumChapterKeyByStage = new Map(
    curriculum.chapters.map((chapter) => [`${chapter.sortOrder}. ${chapter.name}`, chapter.key]),
  );
  const openStatuses = new Set(["unseen", "attempted", "guided_completed"]);
  const openCount = (problemIds: Iterable<number>): number => {
    let count = 0;
    for (const problemId of problemIds) {
      const problem = problemsById.get(problemId);
      if (problem && openStatuses.has(problem.evidenceStatus)) count += 1;
    }
    return count;
  };
  const courses = new Map<
    string,
    { id: string; name: string; kind: string; problemIds: Set<number>; stages: Map<string, Set<number>> }
  >();
  courses.set(curriculum.key, {
    id: `course:${curriculum.key}`,
    name: curriculum.name,
    kind: "curriculum",
    problemIds: new Set(),
    stages: new Map(curriculum.chapters.map((chapter) => [`${chapter.sortOrder}. ${chapter.name}`, new Set<number>()])),
  });
  for (const membership of courseMemberships) {
    let course = courses.get(membership.courseKey);
    if (!course) {
      course = {
        id: `course:${membership.courseKey}`,
        name: membership.courseName,
        kind: membership.courseKey === ALGORITHM_CURRICULUM_COURSE_KEY ? "curriculum" : "course",
        problemIds: new Set(),
        stages: new Map(),
      };
      courses.set(membership.courseKey, course);
    }
    course.problemIds.add(membership.problemId);
    const stageKey = membership.stageKey.trim() || "未分阶段";
    const stage = course.stages.get(stageKey) ?? new Set<number>();
    stage.add(membership.problemId);
    course.stages.set(stageKey, stage);
  }
  const collator = new Intl.Collator("zh-Hans-CN", { numeric: true });
  return [...courses.values()]
    .map((course) => ({
      id: course.id,
      name: course.name,
      kind: course.kind,
      problemCount: course.problemIds.size,
      openCount: openCount(course.problemIds),
      stages: [...course.stages.entries()]
        .sort(([left], [right]) => collator.compare(left, right))
        .map(([key, problemIds]) => ({
          key,
          chapterKey: course.kind === "curriculum" ? curriculumChapterKeyByStage.get(key) : undefined,
          problemCount: problemIds.size,
          openCount: openCount(problemIds),
        })),
    }))
    .sort((left, right) =>
      Number(right.kind === "curriculum") - Number(left.kind === "curriculum")
      || collator.compare(left.name, right.name),
    );
}

export function getAlgorithmDeviceProblemPayload(
  db: Database.Database,
  context: AlgorithmDeviceContext,
  problemId: number,
) {
  const problem = getAlgorithmProblemDetail(db, context, problemId);
  const keys = loadJudgeCodeKeys();
  const draft = keys.length && problem.problemMode !== "external"
    ? getAlgorithmDraft(db, context, { problemId, language: "cpp17" }, keys)
    : null;
  return {
    server: { instanceId: getServerInstanceId(db) },
    workspace: { id: context.workspaceId },
    device: { id: context.deviceId, name: context.deviceName },
    problem: {
      ...problem,
      attempts: problem.attempts,
      sourceCode: draft?.sourceCode ?? problem.starterCode.cpp17 ?? "",
      draftSourceCode: draft?.sourceCode ?? null,
      draftRevision: draft?.revision ?? 0,
      draftSha256: draft?.sha256 ?? "",
      templateSourceCode: problem.starterCode.cpp17 ?? "",
      referenceSourceCode: problem.referenceCode.cpp17 ?? "",
      draftUpdatedAt: draft?.updatedAt ?? null,
    },
  };
}

function problemSummary(
  problem: AlgorithmProblem,
  libraryNumbers: Map<number, number>,
  draftProblemIds: Set<number>,
  coursesByProblem: Map<number, Array<{ courseKey: string; courseName: string; stageKey: string }>> = new Map(),
) {
  const lastAttempt = problem.attempts[0];
  return {
    id: problem.id,
    libraryNumber: libraryNumbers.get(problem.id) || problem.id,
    title: problem.title,
    difficultyBand: problem.difficultyBand,
    notes: problem.notes,
    providerLabel: problem.providerLabel,
    externalProblemId: problem.externalProblemId,
    sourceUrl: problem.sourceUrl,
    phaseKey: problem.phaseKey,
    priorityBand: problem.priorityBand,
    materialStatus: problem.materialStatus,
    evidenceStatus: problem.evidenceStatus,
    nextReview: problem.nextReview,
    reviewEnabled: problem.reviewEnabled,
    reviewStep: problem.reviewStep,
    tags: problem.tags,
    collectionIds: problem.collectionIds,
    courses: coursesByProblem.get(problem.id) ?? [],
    problemMode: problem.problemMode,
    lastAttemptDay: lastAttempt?.day || null,
    lastVerdict: lastAttempt?.verdict || null,
    hasFailedAttempt: problem.attempts.some((attempt) => attempt.verdict !== "AC"),
    hasCloudDraft: draftProblemIds.has(problem.id),
  };
}
