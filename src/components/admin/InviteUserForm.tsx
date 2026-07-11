"use client";

import { useState, useTransition } from "react";
import { Check, Copy, UserPlus } from "lucide-react";
import { inviteUserAction } from "@/app/actions/admin";

export function InviteUserForm() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await inviteUserAction({ email, displayName });
      if (!result.ok || !result.invitationToken) {
        setError(result.error || "创建邀请失败");
        return;
      }
      setInviteUrl(`${window.location.origin}/invite/${result.invitationToken}`);
    });
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="card">
      <div className="sectionTitle"><h2><UserPlus size={18} />邀请朋友</h2></div>
      <form className="pageStack compact" onSubmit={submit}>
        <label className="field"><span>显示名称</span><input autoComplete="name" onChange={(e) => setDisplayName(e.target.value)} required value={displayName} /></label>
        <label className="field"><span>邮箱</span><input autoComplete="email" onChange={(e) => setEmail(e.target.value)} required type="email" value={email} /></label>
        {error ? <p className="formError" role="alert">{error}</p> : null}
        <button className="primaryButton" disabled={pending} type="submit">{pending ? "正在创建…" : "创建 24 小时邀请链接"}</button>
      </form>
      {inviteUrl ? (
        <div className="inviteResult">
          <p>链接只显示在这里一次，请复制后通过微信等方式发给对方。</p>
          <input aria-label="邀请链接" readOnly value={inviteUrl} />
          <button className="secondaryButton" onClick={copyInvite} type="button">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "已复制" : "复制链接"}</button>
        </div>
      ) : null}
    </section>
  );
}
