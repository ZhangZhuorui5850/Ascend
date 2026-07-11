import type Database from "better-sqlite3";

/** 印章底色枚举：朱砂/墨黑/黛蓝/竹青/藤黄，对应 globals.css 的 seal-* token。 */
export const SEAL_COLORS = ["cinnabar", "ink", "indigo", "bamboo", "rattan"] as const;
export type SealColor = (typeof SEAL_COLORS)[number];

export const AVATAR_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

export type UserProfile = {
  userId: string;
  email: string;
  displayName: string;
  avatarKind: "seal" | "image";
  avatarChar: string;
  avatarColor: SealColor;
  hasAvatarImage: boolean;
  updatedAt: string;
};

export function getUserProfile(db: Database.Database, userId: string): UserProfile | null {
  const row = db.prepare(`
    SELECT
      id AS userId,
      email,
      display_name AS displayName,
      avatar_kind AS avatarKind,
      avatar_char AS avatarChar,
      avatar_color AS avatarColor,
      avatar_image IS NOT NULL AS hasAvatarImage,
      updated_at AS updatedAt
    FROM users
    WHERE id = ?
  `).get(userId) as (Omit<UserProfile, "hasAvatarImage"> & { hasAvatarImage: number }) | undefined;
  if (!row) return null;
  return { ...row, hasAvatarImage: Boolean(row.hasAvatarImage) };
}

export function updateDisplayName(db: Database.Database, userId: string, displayName: string): void {
  const name = displayName.trim();
  if (!name) throw new Error("昵称不能为空");
  if ([...name].length > 30) throw new Error("昵称最多 30 个字符");
  db.prepare("UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(name, userId);
}

export function setSealAvatar(
  db: Database.Database,
  userId: string,
  input: { char: string; color: string },
): void {
  if (!SEAL_COLORS.includes(input.color as SealColor)) throw new Error("无效的印章颜色");
  // 印章只放一个字；留空表示渲染时取昵称首字
  const char = [...input.char.trim()].slice(0, 1).join("");
  db.prepare(`
    UPDATE users
    SET avatar_kind = 'seal', avatar_char = ?, avatar_color = ?,
        avatar_image = NULL, avatar_mime = '', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(char, input.color, userId);
}

export function setImageAvatar(
  db: Database.Database,
  userId: string,
  input: { image: Buffer; mime: string },
): void {
  if (!AVATAR_IMAGE_MIMES.includes(input.mime as (typeof AVATAR_IMAGE_MIMES)[number])) {
    throw new Error("头像仅支持 JPG/PNG/WebP");
  }
  if (input.image.byteLength > AVATAR_IMAGE_MAX_BYTES) throw new Error("头像图片不能超过 2MB");
  if (!input.image.byteLength) throw new Error("头像图片为空");
  db.prepare(`
    UPDATE users
    SET avatar_kind = 'image', avatar_image = ?, avatar_mime = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(input.image, input.mime, userId);
}

export function getAvatarImage(
  db: Database.Database,
  userId: string,
): { image: Buffer; mime: string; updatedAt: string } | null {
  const row = db.prepare(`
    SELECT avatar_image AS image, avatar_mime AS mime, updated_at AS updatedAt
    FROM users
    WHERE id = ? AND avatar_image IS NOT NULL
  `).get(userId) as { image: Buffer; mime: string; updatedAt: string } | undefined;
  return row ?? null;
}
