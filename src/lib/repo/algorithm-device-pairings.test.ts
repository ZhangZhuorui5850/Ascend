import { describe, expect, it } from "vitest";
import { resolveAgentContext } from "../agent/context";
import {
  approveAlgorithmDevicePairing,
  createAlgorithmDevicePairing,
  exchangeAlgorithmDevicePairing,
  getAlgorithmDevicePairingForApproval,
} from "./algorithm-device-pairings";
import { authenticateAlgorithmDevice, listAlgorithmDevices } from "./algorithm-devices";
import { setPluginEnabled } from "./plugins";
import { createTestDb, createTestWorkspace } from "./testing";

describe("algorithm VS Code browser pairing", () => {
  it("approves, exchanges and idempotently restores a device credential", () => {
    const db = createTestDb();
    createTestWorkspace(db, { email: "pair@example.com", displayName: "配对用户" });
    const context = resolveAgentContext(db, "pair@example.com");
    setPluginEnabled(db, context, "algorithms", true);
    const created = createAlgorithmDevicePairing(db, {
      deviceName: "WSL 算法环境",
      platform: "linux",
      environment: "WSL: Ubuntu",
      requestFingerprint: "test-client",
    });

    expect(created.deviceCode).toMatch(/^ascend_pair_[A-Za-z0-9_-]{40,}$/);
    expect(created.pairing.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(exchangeAlgorithmDevicePairing(db, created.deviceCode)).toEqual({ status: "pending", intervalSeconds: 3 });
    expect(getAlgorithmDevicePairingForApproval(db, created.pairing.userCode)).toMatchObject({
      deviceName: "WSL 算法环境",
      status: "pending",
    });

    approveAlgorithmDevicePairing(db, context, created.pairing.userCode);
    const exchanged = exchangeAlgorithmDevicePairing(db, created.deviceCode);
    expect(exchanged).toMatchObject({ status: "approved", deviceName: "WSL 算法环境" });
    if (exchanged.status !== "approved") throw new Error("expected approved pairing");
    expect(authenticateAlgorithmDevice(db, `Bearer ${exchanged.token}`)).toMatchObject({
      workspaceId: context.workspaceId,
      deviceId: exchanged.deviceId,
    });
    expect(exchangeAlgorithmDevicePairing(db, created.deviceCode)).toEqual(exchanged);
    expect(listAlgorithmDevices(db, context)).toHaveLength(1);
    const stored = db.prepare("SELECT device_code_hash FROM algorithm_device_pairings").get() as {
      device_code_hash: string;
    };
    expect(stored.device_code_hash).not.toContain(created.deviceCode);
  });

  it("limits repeated pairing creation by request fingerprint", () => {
    const db = createTestDb();
    for (let index = 0; index < 10; index += 1) {
      createAlgorithmDevicePairing(db, { deviceName: `设备 ${index}`, requestFingerprint: "same-client" });
    }
    expect(() =>
      createAlgorithmDevicePairing(db, { deviceName: "设备 11", requestFingerprint: "same-client" }),
    ).toThrow("配对请求过于频繁");
  });
});
