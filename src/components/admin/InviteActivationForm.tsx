"use client";

import { useActionState } from "react";
import { activateInvite, type InviteActivationState } from "@/app/actions/invite";

const initialState: InviteActivationState = {};

export function InviteActivationForm({ token, displayName, email }: { token: string; displayName: string; email: string }) {
  const [state, formAction, pending] = useActionState(activateInvite, initialState);
  return (
    <form action={formAction} className="loginCard">
      <input name="token" type="hidden" value={token} />
      <h1>{displayName}，设置你的密码</h1>
      <p>{email} · 设置密码后会直接进入你的个人工作台。</p>
      <label className="field"><span>新密码</span><input autoComplete="new-password" name="password" required type="password" /></label>
      <label className="field"><span>再次输入</span><input autoComplete="new-password" name="passwordConfirmation" required type="password" /></label>
      {state.error ? <p className="formError" role="alert">{state.error}</p> : null}
      <button className="primaryButton" disabled={pending} type="submit">{pending ? "正在创建空间…" : "激活账号"}</button>
    </form>
  );
}
