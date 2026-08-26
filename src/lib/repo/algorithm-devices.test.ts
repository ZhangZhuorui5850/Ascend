import { describe, expect, it } from "vitest";
import { resolveAgentContext } from "../agent/context";
import {
  authenticateAlgorithmDevice,
  createAlgorithmDevice,
  listAlgorithmDevices,
  revokeAlgorithmDevice,
} from "./algorithm-devices";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace } from "./testing";

describe("algorithm VS Code devices", () => {
  it("stores a scoped token hash, authenticates and revokes the device", () => {
    const db = createTestDb();
    createTestWorkspace(db, { email: "vscode@example.com", displayName: "VS Code 用户" });
    const context = resolveAgentContext(db, "vscode@example.com");
    setPluginEnabled(db, context, "algorithms", true);
    const created = createAlgorithmDevice(db, context, {
      name: "Windows VS Code",
      platform: "win32",
    });

    expect(created.token).toMatch(/^ascend_vscode_[A-Za-z0-9_-]{40,}$/);
    expect(listAlgorithmDevices(db, context)).toEqual([
      expect.objectContaining({ name: "Windows VS Code", platform: "win32" }),
    ]);
    expect(authenticateAlgorithmDevice(db, `Bearer ${created.token}`)).toMatchObject({
      workspaceId: context.workspaceId,
      deviceId: created.device.id,
    });
    const stored = db.prepare("SELECT token_hash FROM algorithm_devices WHERE id = ?").get(created.device.id) as {
      token_hash: string;
    };
    expect(stored.token_hash).not.toContain(created.token);

    revokeAlgorithmDevice(db, context, created.device.id);
    expect(() => authenticateAlgorithmDevice(db, `Bearer ${created.token}`)).toThrow("invalid or expired");
    expect(listAlgorithmDevices(db, context)).toHaveLength(0);
  });
});
