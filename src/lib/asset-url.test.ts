import { describe, expect, it } from "vitest";
import { assetFileUrl } from "@/lib/asset-url";

describe("assetFileUrl", () => {
  it("uses a versioned URL so legacy immutable private caches cannot match", () => {
    expect(assetFileUrl(42)).toBe("/api/assets/42/file?v=2");
  });
});
