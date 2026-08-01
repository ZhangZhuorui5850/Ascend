import { describe, expect, it } from "vitest";
import type { AccessContext } from "../access-context";
import {
  ALGORITHM_PILOT_CONSENT_VERSION,
  getAlgorithmPilotEnrollment,
  getAlgorithmPilotOverview,
  requestAlgorithmPilot,
  requireAlgorithmPilotJudgeAccess,
  setAlgorithmPilotStatus,
} from "./algorithm-pilot";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace } from "./testing";

describe("algorithm pilot governance", () => {
  it("requires explicit consent, preserves unrelated config, and isolates workspaces", () => {
    const db = createTestDb();
    const first = createTestWorkspace(db, { email: "pilot-first@example.com" });
    const second = createTestWorkspace(db, { email: "pilot-second@example.com" });
    setPluginEnabled(db, first, "algorithms", true);
    setPluginEnabled(db, second, "algorithms", true);
    db.prepare(
      `
      UPDATE workspace_plugins
      SET config_json = '{"displayDensity":"compact"}'
      WHERE workspace_id = ? AND plugin_id = 'algorithms'
    `,
    ).run(first.workspaceId);

    expect(() =>
      requestAlgorithmPilot(db, userContext(first, "pilot-first@example.com"), {
        consent: false,
      }),
    ).toThrow("明确同意");

    const requested = requestAlgorithmPilot(db, userContext(first, "pilot-first@example.com"), {
      consent: true,
    });
    expect(requested).toMatchObject({
      status: "requested",
      consentVersion: ALGORITHM_PILOT_CONSENT_VERSION,
    });
    expect(requested.consentedAt).toBeTruthy();
    expect(getAlgorithmPilotEnrollment(db, second)).toMatchObject({ status: "not_requested" });

    const config = JSON.parse(
      (
        db
          .prepare(
            `
      SELECT config_json FROM workspace_plugins
      WHERE workspace_id = ? AND plugin_id = 'algorithms'
    `,
          )
          .get(first.workspaceId) as { config_json: string }
      ).config_json,
    );
    expect(config.displayDensity).toBe("compact");
    expect(config.algorithmPilot.status).toBe("requested");
  });

  it("requires an active admin and current consent before approval, then audits pause", () => {
    const db = createTestDb();
    const admin = createAdmin(db);
    const target = createTestWorkspace(db, { email: "pilot-target@example.com" });
    const context = userContext(target, "pilot-target@example.com");
    setPluginEnabled(db, target, "algorithms", true);

    expect(() =>
      setAlgorithmPilotStatus(db, admin, target.userId, {
        status: "approved",
        cohort: "pilot-2026q3",
      }),
    ).toThrow("尚未申请");
    requestAlgorithmPilot(db, context, { consent: true });
    expect(() =>
      setAlgorithmPilotStatus(db, context, target.userId, {
        status: "approved",
        cohort: "pilot-2026q3",
      }),
    ).toThrow("管理员");

    const approved = setAlgorithmPilotStatus(db, admin, target.userId, {
      status: "approved",
      cohort: "pilot-2026q3",
    });
    expect(approved).toMatchObject({
      status: "approved",
      cohort: "pilot-2026q3",
    });
    expect(() =>
      requireAlgorithmPilotJudgeAccess(db, target, {
        ASCEND_JUDGE_PILOT_REQUIRED: "true",
      }),
    ).not.toThrow();

    const paused = setAlgorithmPilotStatus(db, admin, target.userId, {
      status: "paused",
    });
    expect(paused.status).toBe("paused");
    expect(() =>
      requireAlgorithmPilotJudgeAccess(db, target, {
        ASCEND_JUDGE_PILOT_REQUIRED: "true",
      }),
    ).toThrow("尚未获批");

    const logs = db
      .prepare(
        `
      SELECT action, summary_json
      FROM audit_logs
      WHERE target_user_id = ?
      ORDER BY id
    `,
      )
      .all(target.userId) as Array<{ action: string; summary_json: string }>;
    expect(logs.map((row) => row.action)).toEqual([
      "algorithm_pilot.requested",
      "algorithm_pilot.approved",
      "algorithm_pilot.paused",
    ]);
    expect(JSON.parse(logs[1].summary_json)).toEqual({
      fromStatus: "requested",
      toStatus: "approved",
      cohort: "pilot-2026q3",
      consentVersion: ALGORITHM_PILOT_CONSENT_VERSION,
    });
  });

  it("fails closed on corrupt config during a write", () => {
    const db = createTestDb();
    const target = createTestWorkspace(db);
    setPluginEnabled(db, target, "algorithms", true);
    db.prepare(
      `
      UPDATE workspace_plugins SET config_json = '{broken'
      WHERE workspace_id = ? AND plugin_id = 'algorithms'
    `,
    ).run(target.workspaceId);

    expect(getAlgorithmPilotEnrollment(db, target)).toMatchObject({ status: "not_requested" });
    expect(() =>
      requestAlgorithmPilot(db, userContext(target, "target@example.com"), {
        consent: true,
      }),
    ).toThrow("配置损坏");
  });

  it("suppresses cross-workspace learning outcomes below the reporting threshold", () => {
    const db = createTestDb();
    const admin = createAdmin(db);
    const target = createTestWorkspace(db, { email: "pilot-metrics@example.com" });
    setPluginEnabled(db, target, "algorithms", true);
    requestAlgorithmPilot(db, userContext(target, "pilot-metrics@example.com"), { consent: true });
    setAlgorithmPilotStatus(db, admin, target.userId, {
      status: "approved",
      cohort: "pilot-metrics",
    });

    const overview = getAlgorithmPilotOverview(db);
    expect(overview).toMatchObject({
      enrollment: {
        not_requested: 0,
        requested: 0,
        approved: 1,
        paused: 0,
      },
      enabledApprovedWorkspaces: 1,
      submittedWorkspaces: 0,
      outcome: {
        reportable: false,
        minimumWorkspaces: 5,
        acceptedIndependent: null,
        judgedSubmissions: null,
      },
    });
    expect(JSON.stringify(overview)).not.toContain("pilot-metrics@example.com");
    expect(JSON.stringify(overview)).not.toContain(target.workspaceId);
  });
});

function userContext(
  scope: { userId: string; workspaceId: string },
  email: string,
): AccessContext & { workspaceId: string } {
  return {
    ...scope,
    email,
    displayName: "试点用户",
    role: "user",
    status: "active",
    mustChangePassword: false,
  };
}

function createAdmin(db: ReturnType<typeof createTestDb>): AccessContext & { role: "admin" } {
  db.prepare(
    `
    INSERT INTO users (id, email, password_hash, display_name, role, status)
    VALUES ('pilot-admin', 'pilot-admin@example.com', 'hash', '试点管理员', 'admin', 'active')
  `,
  ).run();
  return {
    userId: "pilot-admin",
    email: "pilot-admin@example.com",
    displayName: "试点管理员",
    role: "admin",
    status: "active",
    workspaceId: null,
    mustChangePassword: false,
  };
}
