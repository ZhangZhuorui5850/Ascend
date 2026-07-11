"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { changeAccountPasswordAction, updateProfileAction } from "@/app/actions/profile";
import { AvatarEditor } from "@/components/AvatarEditor";
import { useFeedback } from "@/components/FeedbackProvider";
import type { AvatarInfo } from "@/components/UserAvatar";

export function AccountSection({ profile, email }: { profile: AvatarInfo; email: string }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [namePending, startNameTransition] = useTransition();
  const [passwordPending, startPasswordTransition] = useTransition();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  function saveName() {
    startNameTransition(async () => {
      const result = await updateProfileAction({ displayName });
      if (result.ok) {
        notify("昵称已更新", "success");
        router.refresh();
      } else {
        notify(result.error || "昵称更新失败", "error");
      }
    });
  }

  function savePassword() {
    if (newPassword !== confirmation) {
      notify("两次输入的新密码不一致", "error");
      return;
    }
    if (newPassword === currentPassword) {
      notify("新密码不能与当前密码相同", "error");
      return;
    }
    startPasswordTransition(async () => {
      const result = await changeAccountPasswordAction({ currentPassword, newPassword });
      if (result.ok) {
        notify("密码已更新，其他设备已全部下线", "success");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmation("");
        router.refresh();
      } else {
        notify(result.error || "密码修改失败", "error");
      }
    });
  }

  return (
    <>
      <section className="card" aria-label="个人资料">
        <div className="sectionTitle">
          <h2>个人资料</h2>
          <span className="sectionHint">头像与昵称会显示在侧栏和账户菜单</span>
        </div>
        <AvatarEditor profile={profile} />
        <div className="profileFields">
          <label className="field">
            昵称
            <div className="inlineCreate">
              <input
                maxLength={30}
                onChange={(event) => setDisplayName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveName();
                  }
                }}
                value={displayName}
              />
              <button
                className="secondaryButton"
                disabled={namePending || !displayName.trim() || displayName.trim() === profile.displayName}
                onClick={saveName}
                type="button"
              >
                保存
              </button>
            </div>
          </label>
          <label className="field">
            登录邮箱
            <input disabled readOnly value={email} />
          </label>
        </div>
      </section>

      <section className="card" aria-label="修改密码">
        <div className="sectionTitle">
          <h2>修改密码</h2>
          <span className="sectionHint">改密后其他设备的登录会全部失效</span>
        </div>
        <div className="passwordFields">
          <label className="field">
            当前密码
            <input autoComplete="current-password" onChange={(event) => setCurrentPassword(event.target.value)} type="password" value={currentPassword} />
          </label>
          <label className="field">
            新密码（至少 12 个字符）
            <input autoComplete="new-password" minLength={12} onChange={(event) => setNewPassword(event.target.value)} type="password" value={newPassword} />
          </label>
          <label className="field">
            再次输入新密码
            <input autoComplete="new-password" minLength={12} onChange={(event) => setConfirmation(event.target.value)} type="password" value={confirmation} />
          </label>
        </div>
        <div className="settingsActions">
          <button
            className="primaryButton"
            disabled={passwordPending || !currentPassword || newPassword.length < 12 || !confirmation}
            onClick={savePassword}
            type="button"
          >
            <KeyRound size={14} />
            {passwordPending ? "正在更新…" : "更新密码"}
          </button>
        </div>
      </section>
    </>
  );
}
