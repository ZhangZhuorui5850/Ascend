"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Stamp } from "lucide-react";
import { saveSealAvatarAction, uploadAvatarImageAction } from "@/app/actions/profile";
import { useFeedback } from "@/components/FeedbackProvider";
import { UserAvatar } from "@/components/UserAvatar";
import type { AvatarInfo } from "@/components/UserAvatar";
import { SEAL_COLORS, type SealColor } from "@/lib/repo/profile";

const SEAL_COLOR_NAMES: Record<SealColor, string> = {
  cinnabar: "朱砂",
  ink: "墨黑",
  indigo: "黛蓝",
  bamboo: "竹青",
  rattan: "藤黄",
};

export function AvatarEditor({ profile }: { profile: AvatarInfo }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [pending, startTransition] = useTransition();
  const [char, setChar] = useState(profile.avatarChar);
  const [color, setColor] = useState<SealColor>(profile.avatarColor);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const preview: AvatarInfo =
    profile.avatarKind === "image"
      ? profile
      : { ...profile, avatarKind: "seal", avatarChar: char, avatarColor: color };

  function saveSeal() {
    startTransition(async () => {
      const result = await saveSealAvatarAction({ char, color });
      if (result.ok) {
        notify(profile.avatarKind === "image" ? "已恢复为印章头像" : "印章头像已保存", "success");
        router.refresh();
      } else {
        notify(result.error || "头像保存失败", "error");
      }
    });
  }

  function uploadImage(file: File | undefined) {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file, file.name);
    startTransition(async () => {
      const result = await uploadAvatarImageAction(formData);
      if (result.ok) {
        notify("头像已更新", "success");
        router.refresh();
      } else {
        notify(result.error || "头像上传失败", "error");
      }
    });
  }

  return (
    <div className="avatarEditor">
      <div className="avatarEditorPreview">
        <UserAvatar avatar={preview} size={72} />
        <div className="avatarEditorUpload">
          <button className="secondaryButton" disabled={pending} onClick={() => fileInputRef.current?.click()} type="button">
            <ImageUp size={14} />
            上传图片
          </button>
          <small>JPG / PNG / WebP，2MB 以内</small>
        </div>
      </div>
      <div className="avatarEditorSeal">
        <label className="inlineField avatarSealChar">
          印章字
          <input
            maxLength={2}
            onChange={(event) => setChar([...event.target.value.trim()].slice(0, 1).join(""))}
            placeholder={[...profile.displayName.trim()][0]?.toUpperCase() || "登"}
            value={char}
          />
        </label>
        <div className="sealPalette" role="radiogroup" aria-label="印章底色">
          {SEAL_COLORS.map((option) => (
            <button
              aria-checked={color === option}
              aria-label={SEAL_COLOR_NAMES[option]}
              className={`sealSwatch seal-${option} ${color === option ? "isActive" : ""}`}
              key={option}
              onClick={() => setColor(option)}
              role="radio"
              title={SEAL_COLOR_NAMES[option]}
              type="button"
            />
          ))}
        </div>
        <button className="secondaryButton" disabled={pending} onClick={saveSeal} type="button">
          <Stamp size={14} />
          {profile.avatarKind === "image" ? "恢复印章头像" : "保存印章"}
        </button>
      </div>
      <input
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          uploadImage(event.target.files?.[0]);
          event.target.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />
    </div>
  );
}
