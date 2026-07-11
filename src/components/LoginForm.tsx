"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="loginCard">
      <span className="eyebrow">登峰 · ASCEND</span>
      <h1>回到今天的学习现场</h1>
      <p>计划、资料、错题和复盘，都在一个私有工作台里继续。</p>
      <input name="next" type="hidden" value={nextPath || "/"} />
      <label className="field">
        账号
        <input autoComplete="username" name="email" required type="text" />
      </label>
      <label className="field">
        密码
        <input autoComplete="current-password" name="password" required type="password" />
      </label>
      {state.error ? <p className="formError">{state.error}</p> : null}
      <button className="primaryButton" disabled={pending} type="submit">
        {pending ? "登录中…" : "进入工作台"}
      </button>
    </form>
  );
}
