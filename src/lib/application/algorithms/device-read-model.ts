import type Database from "better-sqlite3";
import { loadJudgeCodeKeys } from "../../algorithm-code-crypto";
import { buildAlgorithmTodayQueue } from "../../algorithm-today-queue";
import { todayKey } from "../../dates";
import type { AlgorithmDeviceContext } from "../../repo/algorithm-devices";
import { listAlgorithmCollections } from "../../repo/algorithm-import";
import { listAlgorithmLibrary } from "../../repo/algorithm-library";
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
  const queue = buildAlgorithmTodayQueue(dashboard.problems, today);
  return {
    server: { instanceId: getServerInstanceId(db) },
    workspace: { id: context.workspaceId },
    device: { id: context.deviceId, name: context.deviceName },
    today,
    metrics: dashboard.metrics,
    todayQueue: queue.map((item) => ({
      ...problemSummary(item.problem, libraryNumbers, draftProblemIds),
      recommendationReason: item.reason,
      recommendationReasonLabel: item.reasonLabel,
      recommendationScore: item.score,
    })),
    due: dashboard.dueProblems.map((problem) => problemSummary(problem, libraryNumbers, draftProblemIds)),
    collections,
    library,
    problems: dashboard.problems.map((problem) => problemSummary(problem, libraryNumbers, draftProblemIds)),
  };
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
    tags: problem.tags,
    collectionIds: problem.collectionIds,
    problemMode: problem.problemMode,
    lastAttemptDay: lastAttempt?.day || null,
    lastVerdict: lastAttempt?.verdict || null,
    hasFailedAttempt: problem.attempts.some((attempt) => attempt.verdict !== "AC"),
    hasCloudDraft: draftProblemIds.has(problem.id),
  };
}
