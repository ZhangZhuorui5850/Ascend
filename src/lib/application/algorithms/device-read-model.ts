import type Database from "better-sqlite3";
import { loadJudgeCodeKeys } from "../../algorithm-code-crypto";
import { todayKey } from "../../dates";
import type { AlgorithmDeviceContext } from "../../repo/algorithm-devices";
import { listAlgorithmCollections } from "../../repo/algorithm-import";
import { listAlgorithmLibrary } from "../../repo/algorithm-library";
import { getAlgorithmTrainingRelations } from "../../repo/algorithm-training";
import { getAlgorithmDraft } from "../../repo/algorithm-submissions";
import { getAlgorithmDashboard, getAlgorithmProblem, type AlgorithmProblem } from "../../repo/algorithms";
import { getServerInstanceId } from "../../server-identity";

export function getAlgorithmDeviceQueuePayload(
  db: Database.Database,
  context: AlgorithmDeviceContext,
) {
  const today = todayKey();
  const dashboard = getAlgorithmDashboard(db, context, today);
  const collections = listAlgorithmCollections(db, context);
  const library = listAlgorithmLibrary(db, context);
  const training = getAlgorithmTrainingRelations(db, context);
  const coursesByProblem = new Map<number, typeof training.courseMemberships>();
  for (const membership of training.courseMemberships) {
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
  const courseTree = buildCourseTree(training, problemsById);
  const queue = training.plans
    .filter((plan) => plan.day === today && plan.status !== "canceled")
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((plan) => ({ plan, problem: problemsById.get(plan.problemId) }))
    .filter((item): item is typeof item & { problem: AlgorithmProblem } => Boolean(item.problem));
  return {
    server: { instanceId: getServerInstanceId(db) },
    workspace: { id: context.workspaceId },
    device: { id: context.deviceId, name: context.deviceName },
    today,
    metrics: dashboard.metrics,
    todayQueue: queue.map((item) => ({
      ...problemSummary(item.problem, libraryNumbers, draftProblemIds, coursesByProblem),
      planTaskId: item.plan.taskId,
      planStatus: item.plan.status,
      planSortOrder: item.plan.sortOrder,
    })),
    due: dashboard.dueProblems.map((problem) => problemSummary(problem, libraryNumbers, draftProblemIds, coursesByProblem)),
    collections,
    courseTree,
    library,
    problems: dashboard.problems.map((problem) => problemSummary(problem, libraryNumbers, draftProblemIds, coursesByProblem)),
  };
}

/** 程序设计实习等课程阶段树：与网页「课程与阶段」同一份 memberships，插件侧栏优先渲染它。 */
function buildCourseTree(
  training: ReturnType<typeof getAlgorithmTrainingRelations>,
  problemsById: Map<number, AlgorithmProblem>,
) {
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
  for (const membership of training.courseMemberships) {
    let course = courses.get(membership.courseKey);
    if (!course) {
      course = {
        id: `course:${membership.courseKey}`,
        name: membership.courseName,
        kind: "course",
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
        .map(([key, problemIds]) => ({ key, problemCount: problemIds.size, openCount: openCount(problemIds) })),
    }))
    .sort((left, right) => collator.compare(left.name, right.name));
}

export function getAlgorithmDeviceProblemPayload(
  db: Database.Database,
  context: AlgorithmDeviceContext,
  problemId: number,
) {
  const problem = getAlgorithmProblem(db, context, problemId);
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
