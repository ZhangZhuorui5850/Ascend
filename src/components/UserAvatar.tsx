import type { DeviceAccount } from "@/lib/auth";

export type AvatarInfo = Pick<
  DeviceAccount,
  "userId" | "displayName" | "avatarKind" | "avatarChar" | "avatarColor" | "avatarVersion"
>;

/** 统一的用户头像：印章（单字 + 底色）或上传图片，双主题通用。 */
export function UserAvatar({ avatar, size = 36 }: { avatar: AvatarInfo; size?: number }) {
  if (avatar.avatarKind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={`${avatar.displayName} 的头像`}
        className="userAvatar isImage"
        height={size}
        src={`/api/avatar/${avatar.userId}?v=${encodeURIComponent(avatar.avatarVersion)}`}
        style={{ width: size, height: size }}
        width={size}
      />
    );
  }
  const char = avatar.avatarChar || [...avatar.displayName.trim()][0]?.toUpperCase() || "登";
  return (
    <span
      aria-hidden="true"
      className={`userAvatar seal-${avatar.avatarColor}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
    >
      {char}
    </span>
  );
}
