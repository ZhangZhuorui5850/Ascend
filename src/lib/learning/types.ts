export const LEARNING_ACTIVITY_TYPES = [
  "unspecified",
  "study",
  "practice",
  "recall",
  "review",
  "mock",
  "mixed",
] as const;

export type LearningActivityType = (typeof LEARNING_ACTIVITY_TYPES)[number];

export type LearningTaskLink = {
  workspaceId: string;
  taskId: string;
  knowledgePointId: string | null;
  activityType: LearningActivityType;
  completionCriteria: string;
  plannedVerificationMethod: string;
  sourceType: string;
  sourceId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type UpsertLearningTaskLinkInput = {
  taskId: string;
  knowledgePointId?: string | null;
  activityType?: LearningActivityType;
  completionCriteria?: string;
  plannedVerificationMethod?: string;
  sourceType?: string;
  sourceId?: string | number;
  /** 0 means the caller expects a create; positive values guard an update. */
  expectedVersion?: number;
};

export type LearningEvidence = {
  id: string;
  workspaceId: string;
  taskId: string | null;
  completionCycle: number;
  day: string;
  knowledgePointId: string | null;
  activityType: LearningActivityType;
  actualMinutes: number | null;
  output: string;
  outcome: string;
  difficulty: string;
  verificationMethod: string;
  verificationResult: string;
  verificationOutcome: string;
  confidence: number | null;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  correctedBy: string | null;
  voidedAt: string | null;
  voidReason: string;
  createdAt: string;
};

export type AppendLearningEvidenceInput = {
  idempotencyKey: string;
  taskId?: string | null;
  completionCycle: number;
  day: string;
  knowledgePointId?: string | null;
  activityType?: LearningActivityType;
  actualMinutes?: number | null;
  output?: string;
  outcome?: string;
  difficulty?: string;
  verificationMethod?: string;
  verificationResult?: string;
  verificationOutcome?: string;
  confidence?: number | null;
  sourceType?: string;
  sourceId?: string | number;
  /** If set, the new row becomes the immutable correction for this evidence row. */
  correctsEvidenceId?: string;
};

export type ListLearningEvidenceInput = {
  taskId?: string;
  knowledgePointId?: string;
  fromDay?: string;
  throughDay?: string;
  includeVoided?: boolean;
  limit?: number;
};

export type VoidLearningEvidenceInput = {
  id: string;
  reason: string;
};
