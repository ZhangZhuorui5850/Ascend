import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyAssetIntoLibrary } from "./storage";

describe("copyAssetIntoLibrary", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("copies uploaded files into the dated original folder with a safe name", async () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "zgca-upload-"));
    dirs.push(tempRoot);
    const source = path.join(tempRoot, "input.md");
    writeFileSync(source, "# PCA\n");

    const stored = await copyAssetIntoLibrary({
      sourcePath: source,
      originalName: "../PCA 笔记.md",
      day: "2026-07-06",
      uploadRoot: path.join(tempRoot, "uploads"),
    });

    expect(stored.relativePath).toBe("2026/07/06/original/PCA 笔记.md");
    expect(readFileSync(stored.absolutePath, "utf8")).toBe("# PCA\n");
  });
});
