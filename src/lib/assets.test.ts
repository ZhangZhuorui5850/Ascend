import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  contentDispositionFor,
  MAX_UPLOAD_BYTES,
  resolveAssetPathForRoot,
  resolveWorkspaceAssetPathForRoot,
  storageKeyFor,
  storeUploadedFile,
} from "./assets";

describe("asset storage safety", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("uses content-addressed storage keys to dedupe renamed uploads", () => {
    expect(storageKeyFor("workspace-a", "2026-07-07", "abc123", "PCA.png")).toBe("workspace-a/blobs/ab/abc123");
    expect(storageKeyFor("workspace-a", "2026-07-08", "abc123", "renamed.png")).toBe("workspace-a/blobs/ab/abc123");
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

  it("rejects another workspace's storage path", () => {
    const root = path.join(os.tmpdir(), `zgca-assets-${Date.now()}`);
    roots.push(root);
    expect(() => resolveWorkspaceAssetPathForRoot(root, "workspace-a", "workspace-b/blobs/ab/file")).toThrow(
      "Invalid workspace asset path",
    );
  });

  it("rejects files larger than 20MB before reading their contents", async () => {
    const oversized = { size: MAX_UPLOAD_BYTES + 1 } as File;
    await expect(
      storeUploadedFile({ workspaceId: "workspace-a", file: oversized, day: "2026-07-07" }),
    ).rejects.toThrow("File is too large");
  });

  it("forces active content to download", () => {
    expect(contentDispositionFor("text/html", "x.html")).toMatch(/^attachment;/);
    expect(contentDispositionFor("image/svg+xml", "x.svg")).toMatch(/^attachment;/);
    expect(contentDispositionFor("image/png", "x.png")).toMatch(/^inline;/);
  });
});
