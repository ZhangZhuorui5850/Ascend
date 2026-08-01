import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const library = readFileSync(new URL("./offline-review.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../public/offline.html", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const appShell = readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8");

describe("offline reopen contract", () => {
  it("tracks the active workspace separately from cached snapshots", () => {
    expect(library).toContain('const DB_VERSION = 3');
    expect(library).toContain('createObjectStore("meta", { keyPath: "key" })');
    expect(library).toContain('key: "activeWorkspace"');
    expect(appShell).toContain("setActiveOfflineWorkspace(user?.workspaceKey ?? null)");
  });

  it("renders only a read-only local snapshot in the identity-free fallback", () => {
    const script = shell.match(/<script>([\s\S]*)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();
    expect(shell).toContain("本机复习快照");
    expect(shell).toContain("只读恢复");
    expect(shell).toContain('item.workspaceKey === active.workspaceKey');
    expect(shell).toContain("textContent = String(review.prompt");
    expect(shell).not.toContain("innerHTML");
    expect(shell).not.toContain("/api/reviews/sync");
    expect(serviceWorker).toContain('const CACHE_VERSION = "zgca-shell-v4"');
  });
});
