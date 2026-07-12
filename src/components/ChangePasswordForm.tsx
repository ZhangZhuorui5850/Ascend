"use client";

import { useActionState } from "react";
import { updateRequiredPassword, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = {};

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(updateRequiredPassword, initialState);
  return (
    <form action={formAction} className="loginCard">
      <h1>先设置你的正式密码</h1>
      <p>这是首次登录或管理员重置后的安全步骤。更新后，其他设备上的旧会话会全部失效。</p>
      <label className="field"><span>当前密码</span><input autoComplete="current-password" name="currentPassword" required type="password" /></label>
      <label className="field"><span>新密码</span><input autoComplete="new-password" name="newPassword" required type="password" /></label>
      <label className="field"><span>再次输入新密码</span><input autoComplete="new-password" name="passwordConfirmation" required type="password" /></label>
      {state.error ? <p className="formError" role="alert">{state.error}</p> : null}
      <button className="primaryButton" disabled={pending} type="submit">{pending ? "正在更新…" : "更新密码并继续"}</button>
    </form>
  );
}
