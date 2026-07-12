"use client";

import { useState, useTransition } from "react";
import {
  resetUserPasswordAction,
  revokeUserSessionsAction,
  setUserStatusAction,
  setWorkspaceQuotaAction,
} from "@/app/actions/admin";

export function UserStatusActions({
  userId,
  status,
  quotaBytes,
}: {
  userId: string;
  status: "invited" | "active" | "suspended";
  quotaBytes: number;
}) {
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [quotaGb, setQuotaGb] = useState(String(Math.max(0, quotaBytes / 1024 ** 3)));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function run(operation: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await operation();
      if (!result.ok) setError(result.error || "操作失败");
      else setMessage(success);
    });
  }

  return (
    <div className="grid2">
      <section className="card">
        <div className="sectionTitle"><h2>账号与设备</h2></div>
        <div className="pageStack compact">
          {status !== "invited" ? (
            <button className="secondaryButton" disabled={pending} onClick={() => run(() => setUserStatusAction(userId, status === "suspended" ? "active" : "suspended"), status === "suspended" ? "账号已恢复" : "账号已停用并退出全部设备")} type="button">
              {status === "suspended" ? "恢复账号" : "停用账号"}
            </button>
          ) : <p>该用户尚未使用邀请链接。</p>}
          <button className="secondaryButton" disabled={pending || status === "invited"} onClick={() => run(() => revokeUserSessionsAction(userId), "所有设备已退出")} type="button">退出全部设备</button>
        </div>
      </section>

      <section className="card">
        <div className="sectionTitle"><h2>容量配额</h2></div>
        <label className="field"><span>配额（GB）</span><input min="0" onChange={(e) => setQuotaGb(e.target.value)} step="0.25" type="number" value={quotaGb} /></label>
        <button className="secondaryButton" disabled={pending || status === "invited"} onClick={() => run(() => setWorkspaceQuotaAction(userId, Math.round(Number(quotaGb) * 1024 ** 3)), "容量配额已更新")} type="button">保存容量</button>
      </section>

      <section className="card">
        <div className="sectionTitle"><h2>重置密码</h2></div>
        <p>设置临时密码后，该用户会立即退出全部设备，并在下次登录后被要求更换密码。</p>
        <label className="field"><span>临时密码</span><input onChange={(e) => setTemporaryPassword(e.target.value)} type="password" value={temporaryPassword} /></label>
        <button className="secondaryButton" disabled={pending || status === "invited" || !temporaryPassword} onClick={() => run(() => resetUserPasswordAction(userId, temporaryPassword), "密码已重置，旧会话已失效")} type="button">重置密码</button>
      </section>
      <section className="card" aria-live="polite">
        <div className="sectionTitle"><h2>操作结果</h2></div>
        {error ? <p className="formError">{error}</p> : <p>{message || "管理操作会写入审计日志。"}</p>}
      </section>
    </div>
  );
}
