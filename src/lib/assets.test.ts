import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contentDispositionFor, resolveAssetPathForRoot, storageKeyFor } from "./assets";

describe("asset storage safety", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("uses hash-prefixed storage keys to avoid same-name overwrites", () => {
    expect(storageKeyFor("2026-07-07", "abc123", "PCA.png")).toBe("2026/07/07/original/abc123-PCA.png");
  });

  it("rejects paths that escape the upload root", () => {
    const root = path.join(os.tmpdir(), `zgca-assets-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    roots.push(root);

    expect(() => resolveAssetPathForRoot(root, "../secret.txt")).toThrow("Invalid asset path");
  });

  it("allows safe paths inside upload root", () => {
    const root = path.join(os.tmpdir(), `zgca-assets-${Date.now()}`);
    const relative = "2026/07/07/original/file.txt";
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, "ok");
    roots.push(root);

    expect(resolveAssetPathForRoot(root, relative)).toBe(absolute);
  });

  it("forces active content to download", () => {
    expect(contentDispositionFor("text/html", "x.html")).toMatch(/^attachment;/);
    expect(contentDispositionFor("image/png", "x.png")).toMatch(/^inline;/);
  });
});
