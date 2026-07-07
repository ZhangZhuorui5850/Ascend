"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    setSubmitting(false);

    if (!response.ok) {
      setError("邮箱或密码不正确");
      return;
    }

    router.replace(nextPath || "/");
    router.refresh();
  }

  return (
    <form className="loginCard" onSubmit={submit}>
      <span className="eyebrow">ZGCA Workbench</span>
      <h1>回到今天的学习现场</h1>
      <p>日期、资料、错题和总结都在一个私有工作台里继续。</p>
      <label className="field">
        邮箱
        <input autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label className="field">
        密码
        <input
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error ? <p className="formError">{error}</p> : null}
      <button className="primaryButton" disabled={isSubmitting} type="submit">
        {isSubmitting ? "登录中..." : "进入工作台"}
      </button>
    </form>
  );
}
