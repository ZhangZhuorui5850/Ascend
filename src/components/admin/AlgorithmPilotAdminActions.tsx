"use client";

import { useState, useTransition } from "react";
import { setAlgorithmPilotStatusAction } from "@/app/actions/admin";
import type { AlgorithmPilotEnrollment } from "@/lib/repo/algorithm-pilot";

export function AlgorithmPilotAdminActions({ initial, userId }: { initial: AlgorithmPilotEnrollment; userId: string }) {
  const [enrollment, setEnrollment] = useState(initial);
  const [cohort, setCohort] = useState(initial.cohort || defaultCohort());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const canApprove = enrollment.status === "requested" || enrollment.status === "paused";
  const canPause = enrollment.status === "requested" || enrollment.status === "approved";

  function update(status: "approved" | "paused"): void {
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await setAlgorithmPilotStatusAction(userId, {
        status,
        cohort: status === "approved" ? cohort : undefined,
      });
      if (!result.ok || !result.enrollment) {
        setError(result.error || "试点状态更新失败");
        return;
      }
      setEnrollment(result.enrollment);
      setMessage(status === "approved" ? "在线评测试点已批准" : "在线评测试点已暂停");
    });
  }

  return (
    <section className="card algorithmPilotAdmin">
      <div className="sectionTitle">
        <div>
          <span className="sectionKicker">ALGORITHM PILOT</span>
          <h2>隔离 Judge 试点准入</h2>
        </div>
        <span className="algorithmPilotBadge" data-status={enrollment.status}>
          {statusLabel(enrollment.status)}
        </span>
      </div>
      <p>用户必须先明确申请；批准只开放在线评测，不改变题目、提示和草稿权限。 暂停会由服务端阻断新提交与轮询。</p>
      <dl className="algorithmPilotFacts">
        <div>
          <dt>同意版本</dt>
          <dd>{enrollment.consentVersion ?? "—"}</dd>
        </div>
        <div>
          <dt>申请时间</dt>
          <dd>{formatTimestamp(enrollment.requestedAt)}</dd>
        </div>
        <div>
          <dt>批准时间</dt>
          <dd>{formatTimestamp(enrollment.approvedAt)}</dd>
        </div>
        <div>
          <dt>暂停时间</dt>
          <dd>{formatTimestamp(enrollment.pausedAt)}</dd>
        </div>
      </dl>
      <label className="field">
        <span>试点批次</span>
        <input disabled={pending} maxLength={64} onChange={(event) => setCohort(event.target.value)} value={cohort} />
      </label>
      <div className="dayHeaderActions">
        <button
          className="primaryButton"
          disabled={pending || !canApprove || !cohort.trim()}
          onClick={() => update("approved")}
          type="button"
        >
          {pending ? "处理中…" : enrollment.status === "paused" ? "恢复并批准" : "批准试点"}
        </button>
        <button
          className="secondaryButton"
          disabled={pending || !canPause}
          onClick={() => update("paused")}
          type="button"
        >
          暂停试点
        </button>
      </div>
      <div aria-live="polite">
        {error ? <p className="formError">{error}</p> : <p>{message || "所有变更都会写入审计日志。"}</p>}
      </div>
    </section>
  );
}

function statusLabel(status: AlgorithmPilotEnrollment["status"]): string {
  if (status === "requested") return "待批准";
  if (status === "approved") return "已批准";
  if (status === "paused") return "已暂停";
  return "未申请";
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function defaultCohort(): string {
  const now = new Date();
  return `pilot-${now.getFullYear()}q${Math.floor(now.getMonth() / 3) + 1}`;
}
