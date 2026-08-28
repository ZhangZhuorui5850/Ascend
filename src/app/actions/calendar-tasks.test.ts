import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb, createTestWorkspace } from "@/lib/repo/testing";

const mocks = vi.hoisted(() => ({
  after: vi.fn<(callback: () => void) => void>(),
  revalidatePath: vi.fn(),
}));

let testDb: Database.Database;
let testScope: { userId: string; workspaceId: string };

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  getDb: () => testDb,
}));
vi.mock("@/lib/request-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/request-auth")>()),
  requireWorkspace: async () => testScope,
}));

describe("Calendar task actions", () => {
  beforeEach(() => {
    mocks.after.mockReset();
    mocks.revalidatePath.mockReset();
    testDb = createTestDb();
    testScope = createTestWorkspace(testDb);
  });

  afterEach(() => {
    testDb.close();
  });

  it("returns the created task before scheduling cross-view revalidation", async () => {
    const { createCalendarTaskAction } = await import("./calendar-tasks");
    const result = await createCalendarTaskAction({
      clientMutationId: "calendar-action-create",
      day: "2026-08-11",
      title: "即时呈现任务",
    });

    expect(result).toMatchObject({
      ok: true,
      entity: { day: "2026-08-11", title: "即时呈现任务" },
    });
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    const revalidateAfterResponse = mocks.after.mock.calls[0]?.[0];
    expect(revalidateAfterResponse).toBeTypeOf("function");
    revalidateAfterResponse?.();
    expect(mocks.revalidatePath.mock.calls).toEqual([["/"], ["/tasks"], ["/calendar"], ["/day/[date]", "page"]]);
  });
});
