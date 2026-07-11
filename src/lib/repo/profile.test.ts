import { describe, expect, it } from "vitest";
import {
  AVATAR_IMAGE_MAX_BYTES,
  getAvatarImage,
  getUserProfile,
  SEAL_COLORS,
  setImageAvatar,
  setSealAvatar,
  updateDisplayName,
} from "./profile";
import { createTestDb, createTestWorkspace } from "./testing";

describe("user profile", () => {
  it("reads profile with seal defaults", () => {
    const db = createTestDb();
    const { userId } = createTestWorkspace(db, { displayName: "卓睿" });

    expect(getUserProfile(db, userId)).toMatchObject({
      displayName: "卓睿",
      avatarKind: "seal",
      avatarChar: "",
      avatarColor: "cinnabar",
      hasAvatarImage: false,
    });
  });

  it("updates display name within 1-30 chars", () => {
    const db = createTestDb();
    const { userId } = createTestWorkspace(db);

    updateDisplayName(db, userId, "  登峰  ");
    expect(getUserProfile(db, userId)?.displayName).toBe("登峰");

    expect(() => updateDisplayName(db, userId, "   ")).toThrow("昵称不能为空");
    expect(() => updateDisplayName(db, userId, "长".repeat(31))).toThrow("昵称最多 30 个字符");
  });

  it("sets a seal avatar with palette validation and keeps only the first char", () => {
    const db = createTestDb();
    const { userId } = createTestWorkspace(db);

    setSealAvatar(db, userId, { char: "峰顶", color: "ink" });
    expect(getUserProfile(db, userId)).toMatchObject({ avatarKind: "seal", avatarChar: "峰", avatarColor: "ink" });

    expect(() => setSealAvatar(db, userId, { char: "", color: "neon" })).toThrow("无效的印章颜色");
    expect(SEAL_COLORS).toContain("cinnabar");
  });

  it("stores an uploaded avatar image and validates mime and size", () => {
    const db = createTestDb();
    const { userId } = createTestWorkspace(db);
    const image = Buffer.from("fake-png-bytes");

    setImageAvatar(db, userId, { image, mime: "image/png" });
    expect(getUserProfile(db, userId)).toMatchObject({ avatarKind: "image", hasAvatarImage: true });
    expect(getAvatarImage(db, userId)).toMatchObject({ mime: "image/png" });
    expect(getAvatarImage(db, userId)?.image.equals(image)).toBe(true);

    expect(() => setImageAvatar(db, userId, { image, mime: "image/gif" })).toThrow("头像仅支持 JPG/PNG/WebP");
    expect(() =>
      setImageAvatar(db, userId, { image: Buffer.alloc(AVATAR_IMAGE_MAX_BYTES + 1), mime: "image/png" }),
    ).toThrow("头像图片不能超过 2MB");
  });

  it("reverting to a seal avatar clears the stored image", () => {
    const db = createTestDb();
    const { userId } = createTestWorkspace(db);
    setImageAvatar(db, userId, { image: Buffer.from("img"), mime: "image/webp" });

    setSealAvatar(db, userId, { char: "", color: "bamboo" });

    expect(getUserProfile(db, userId)).toMatchObject({ avatarKind: "seal", hasAvatarImage: false });
    expect(getAvatarImage(db, userId)).toBeNull();
  });
});
