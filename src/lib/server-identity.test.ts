import { describe, expect, it } from "vitest";
import { getServerInstanceId } from "./server-identity";
import { createTestDb } from "./repo/testing";

describe("server identity", () => {
  it("persists one stable public instance id", () => {
    const db = createTestDb();
    const first = getServerInstanceId(db);
    const second = getServerInstanceId(db);
    expect(first).toMatch(/^ascend-[a-f0-9]{32}$/);
    expect(second).toBe(first);
  });
});
