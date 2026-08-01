import type Database from "better-sqlite3";
import type { AccessContext, WorkspaceScope } from "../access-context";
import { writeAuditLog } from "../audit";
import { getPluginManifest } from "../plugins/registry";

export const ALGORITHM_PILOT_CONSENT_VERSION = 1;

export type AlgorithmPilotStatus = "not_requested" | "requested" | "approved" | "paused";

export type AlgorithmPilotEnrollment = {
  status: AlgorithmPilotStatus;
  consentVersion: number | null;
  consentedAt: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  pausedAt: string | null;
  cohort: string | null;
};

export type AlgorithmPilotOverview = {
  enrollment: Record<AlgorithmPilotStatus, number>;
  enabledApprovedWorkspaces: number;
  submittedWorkspaces: number;
  formalSubmissions: number;
  gatewayFailures: number;
  gatewayP95LatencyMs: number | null;
  outcome: {
    reportable: boolean;
    minimumWorkspaces: number;
    acceptedIndependent: number | null;
    judgedSubmissions: number | null;
  };
};

const MINIMUM_OUTCOME_REPORTING_WORKSPACES = 5;

const EMPTY_ENROLLMENT: AlgorithmPilotEnrollment = {
  status: "not_requested",
  consentVersion: null,
  consentedAt: null,
  requestedAt: null,
  approvedAt: null,
  pausedAt: null,
  cohort: null,
};

type PluginConfigRow = {
  enabled: number;
  state: string;
  config_json: string;
};

export function getAlgorithmPilotEnrollment(db: Database.Database, scope: WorkspaceScope): AlgorithmPilotEnrollment {
  const row = db
    .prepare(
      `
    SELECT config_json
    FROM workspace_plugins
    WHERE workspace_id = ? AND plugin_id = 'algorithms'
  `,
    )
    .get(scope.workspaceId) as Pick<PluginConfigRow, "config_json"> | undefined;
  return parseAlgorithmPilotEnrollment(row?.config_json);
}

export function parseAlgorithmPilotEnrollment(rawConfig: string | null | undefined): AlgorithmPilotEnrollment {
  const root = parseConfigObject(rawConfig, false);
  const value = root.algorithmPilot;
  if (!isRecord(value)) return { ...EMPTY_ENROLLMENT };
  const status = isAlgorithmPilotStatus(value.status) ? value.status : "not_requested";
  return {
    status,
    consentVersion: asPositiveInteger(value.consentVersion),
    consentedAt: asTimestamp(value.consentedAt),
    requestedAt: asTimestamp(value.requestedAt),
    approvedAt: asTimestamp(value.approvedAt),
    pausedAt: asTimestamp(value.pausedAt),
    cohort: asBoundedString(value.cohort),
  };
}

export function requestAlgorithmPilot(
  db: Database.Database,
  context: AccessContext & WorkspaceScope,
  input: { consent: boolean },
): AlgorithmPilotEnrollment {
  if (!input.consent) throw new Error("必须明确同意试点说明后才能申请");
  const row = requireAlgorithmPluginRow(db, context);
  const current = parseAlgorithmPilotEnrollment(row.config_json);
  if (current.status === "approved" && current.consentVersion === ALGORITHM_PILOT_CONSENT_VERSION) return current;

  const now = new Date().toISOString();
  const next: AlgorithmPilotEnrollment = {
    ...current,
    status: "requested",
    consentVersion: ALGORITHM_PILOT_CONSENT_VERSION,
    consentedAt: now,
    requestedAt: now,
    approvedAt: null,
    pausedAt: null,
  };
  db.transaction(() => {
    saveEnrollment(db, context.workspaceId, row.config_json, next);
    writeAuditLog(db, {
      actorUserId: context.userId,
      targetUserId: context.userId,
      action: "algorithm_pilot.requested",
      entityType: "workspace_plugin",
      entityId: `${context.workspaceId}:algorithms`,
      summary: {
        toStatus: next.status,
        consentVersion: next.consentVersion,
      },
    });
  })();
  return next;
}

export function setAlgorithmPilotStatus(
  db: Database.Database,
  admin: AccessContext,
  targetUserId: string,
  input: { status: "approved" | "paused"; cohort?: string },
): AlgorithmPilotEnrollment {
  requireAdminContext(admin);
  const target = db
    .prepare(
      `
    SELECT u.role, u.status, w.id AS workspace_id
    FROM users u
    LEFT JOIN workspaces w ON w.owner_user_id = u.id
    WHERE u.id = ?
  `,
    )
    .get(targetUserId) as
    | {
        role: "admin" | "user";
        status: string;
        workspace_id: string | null;
      }
    | undefined;
  if (!target || target.role !== "user") throw new Error("普通用户不存在");
  if (target.status !== "active" || !target.workspace_id) throw new Error("用户学习空间尚不可用");

  const scope = { workspaceId: target.workspace_id };
  const row = requireAlgorithmPluginRow(db, scope);
  const current = parseAlgorithmPilotEnrollment(row.config_json);
  if (input.status === "approved") {
    if (!["requested", "paused"].includes(current.status)) {
      throw new Error("用户尚未申请算法试点");
    }
    if (current.consentVersion !== ALGORITHM_PILOT_CONSENT_VERSION || !current.consentedAt) {
      throw new Error("用户试点同意版本已失效，需要重新申请");
    }
  } else if (!["requested", "approved"].includes(current.status)) {
    throw new Error("当前试点状态不能暂停");
  }

  const now = new Date().toISOString();
  const cohort = input.status === "approved" ? normalizeCohort(input.cohort) : current.cohort;
  const next: AlgorithmPilotEnrollment = {
    ...current,
    status: input.status,
    cohort,
    approvedAt: input.status === "approved" ? now : current.approvedAt,
    pausedAt: input.status === "paused" ? now : null,
  };
  db.transaction(() => {
    saveEnrollment(db, scope.workspaceId, row.config_json, next);
    writeAuditLog(db, {
      actorUserId: admin.userId,
      targetUserId,
      action: input.status === "approved" ? "algorithm_pilot.approved" : "algorithm_pilot.paused",
      entityType: "workspace_plugin",
      entityId: `${scope.workspaceId}:algorithms`,
      summary: {
        fromStatus: current.status,
        toStatus: next.status,
        cohort: next.cohort,
        consentVersion: next.consentVersion,
      },
    });
  })();
  return next;
}

export function isAlgorithmPilotRequired(
  env: { NODE_ENV?: string; ASCEND_JUDGE_PILOT_REQUIRED?: string } = process.env,
): boolean {
  return ["1", "true"].includes((env.ASCEND_JUDGE_PILOT_REQUIRED || "").trim().toLowerCase());
}

export function requireAlgorithmPilotJudgeAccess(
  db: Database.Database,
  scope: WorkspaceScope,
  env: { NODE_ENV?: string; ASCEND_JUDGE_PILOT_REQUIRED?: string } = process.env,
): AlgorithmPilotEnrollment {
  const enrollment = getAlgorithmPilotEnrollment(db, scope);
  if (isAlgorithmPilotRequired(env) && enrollment.status !== "approved") {
    throw new Error("在线评测试点尚未获批；题目、提示和草稿仍可使用");
  }
  return enrollment;
}

export function getAlgorithmPilotOverview(db: Database.Database): AlgorithmPilotOverview {
  const rows = db
    .prepare(
      `
    SELECT w.id AS workspace_id, wp.enabled, wp.state, wp.config_json
    FROM workspaces w
    JOIN users u ON u.id = w.owner_user_id
    LEFT JOIN workspace_plugins wp
      ON wp.workspace_id = w.id AND wp.plugin_id = 'algorithms'
    WHERE u.role = 'user' AND u.status = 'active'
  `,
    )
    .all() as Array<{
    workspace_id: string;
    enabled: number | null;
    state: string | null;
    config_json: string | null;
  }>;
  const enrollment: Record<AlgorithmPilotStatus, number> = {
    not_requested: 0,
    requested: 0,
    approved: 0,
    paused: 0,
  };
  const approvedWorkspaceIds: string[] = [];
  for (const row of rows) {
    const status = parseAlgorithmPilotEnrollment(row.config_json).status;
    enrollment[status] += 1;
    if (status === "approved" && row.enabled === 1 && row.state === "enabled") {
      approvedWorkspaceIds.push(row.workspace_id);
    }
  }
  if (!approvedWorkspaceIds.length) {
    return {
      enrollment,
      enabledApprovedWorkspaces: 0,
      submittedWorkspaces: 0,
      formalSubmissions: 0,
      gatewayFailures: 0,
      gatewayP95LatencyMs: null,
      outcome: {
        reportable: false,
        minimumWorkspaces: MINIMUM_OUTCOME_REPORTING_WORKSPACES,
        acceptedIndependent: null,
        judgedSubmissions: null,
      },
    };
  }
  const placeholders = approvedWorkspaceIds.map(() => "?").join(", ");
  const submissions = db
    .prepare(
      `
    SELECT s.workspace_id, s.status, s.gateway_latency_ms, a.independent
    FROM algorithm_submissions s
    LEFT JOIN algorithm_attempts a
      ON a.workspace_id = s.workspace_id AND a.id = s.attempt_id
    WHERE s.submission_kind = 'formal'
      AND s.workspace_id IN (${placeholders})
  `,
    )
    .all(...approvedWorkspaceIds) as Array<{
    workspace_id: string;
    status: string;
    gateway_latency_ms: number | null;
    independent: number | null;
  }>;
  const submittedWorkspaces = new Set(submissions.map((row) => row.workspace_id)).size;
  const reportable = submittedWorkspaces >= MINIMUM_OUTCOME_REPORTING_WORKSPACES;
  const judged = submissions.filter((row) => ["AC", "WA", "TLE", "MLE", "RE", "CE"].includes(row.status));
  const latencies = submissions
    .flatMap((row) => (row.gateway_latency_ms === null ? [] : [row.gateway_latency_ms]))
    .sort((left, right) => left - right);
  return {
    enrollment,
    enabledApprovedWorkspaces: approvedWorkspaceIds.length,
    submittedWorkspaces,
    formalSubmissions: submissions.length,
    gatewayFailures: submissions.filter((row) => ["JE", "CANCELLED", "RETRYABLE_ERROR"].includes(row.status)).length,
    gatewayP95LatencyMs: percentile(latencies, 0.95),
    outcome: {
      reportable,
      minimumWorkspaces: MINIMUM_OUTCOME_REPORTING_WORKSPACES,
      acceptedIndependent: reportable
        ? judged.filter((row) => row.status === "AC" && row.independent === 1).length
        : null,
      judgedSubmissions: reportable ? judged.length : null,
    },
  };
}

function requireAlgorithmPluginRow(db: Database.Database, scope: WorkspaceScope): PluginConfigRow {
  const row = db
    .prepare(
      `
    SELECT enabled, state, config_json
    FROM workspace_plugins
    WHERE workspace_id = ? AND plugin_id = 'algorithms'
  `,
    )
    .get(scope.workspaceId) as PluginConfigRow | undefined;
  if (!row?.enabled || row.state !== "enabled") throw new Error("算法训练扩展未启用");
  return row;
}

function saveEnrollment(
  db: Database.Database,
  workspaceId: string,
  rawConfig: string,
  enrollment: AlgorithmPilotEnrollment,
): void {
  const root = parseConfigObject(rawConfig, true);
  const manifest = getPluginManifest("algorithms");
  root.algorithmPilot = enrollment;
  db.prepare(
    `
    UPDATE workspace_plugins
    SET config_json = ?, config_version = ?, installed_version = ?, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND plugin_id = 'algorithms'
  `,
  ).run(JSON.stringify(root), manifest.configVersion, manifest.version, workspaceId);
}

function parseConfigObject(rawConfig: string | null | undefined, strict: boolean): Record<string, unknown> {
  if (!rawConfig?.trim()) return {};
  try {
    const value: unknown = JSON.parse(rawConfig);
    if (isRecord(value)) return value;
  } catch {
    // Handled below so reads degrade safely while writes fail closed.
  }
  if (strict) throw new Error("算法扩展配置损坏，请先由管理员修复");
  return {};
}

function requireAdminContext(context: AccessContext): void {
  if (context.role !== "admin" || context.status !== "active") throw new Error("需要管理员权限");
}

function normalizeCohort(value: string | undefined): string {
  const normalized = value?.trim() || "";
  if (!normalized || normalized.length > 64 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error("试点批次应为 1–64 个可见字符");
  }
  return normalized;
}

function isAlgorithmPilotStatus(value: unknown): value is AlgorithmPilotStatus {
  return value === "not_requested" || value === "requested" || value === "approved" || value === "paused";
}

function asPositiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function asTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || Number.isNaN(Date.parse(value))) return null;
  return value;
}

function asBoundedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 64 ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1));
  return values[index];
}
