"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAutosyncedFields } from "@/hooks/useAutosyncedFields";

type DayWorkspaceProps = {
  date: string;
  entry: Record<string, string>;
  draftVersions?: Record<string, number>;
  conflicts?: DraftConflictView[];
};

type DraftConflictView = {
  id: string;
  field: string;
  local: { content?: string };
  incoming: { content?: string; version?: number };
};

const fieldLabels: Record<string, string> = {
  plan: "今日计划",
  diary: "日记",
  summary: "晚间总结",
  blockers: "阻塞",
  tomorrow: "明日第一步",
};

export function DayWorkspace({ date, entry, draftVersions = {}, conflicts = [] }: DayWorkspaceProps) {
  const router = useRouter();
  const initialFields = useMemo(() => ({
    plan: entry.plan || "",
    diary: entry.diary || "",
    summary: entry.summary || "",
    blockers: entry.blockers || "",
    tomorrow: entry.tomorrow || "",
  }), [entry.blockers, entry.diary, entry.plan, entry.summary, entry.tomorrow]);
  const {
    fields: form,
    updateField,
    statusByField,
    globalStatus,
  } = useAutosyncedFields({
    scopeType: "day",
    scopeId: date,
    initial: initialFields,
    initialVersions: draftVersions,
  });
  const [sessionTitle, setSessionTitle] = useState("");
  const [minutes, setMinutes] = useState(50);
  const [mistakeTitle, setMistakeTitle] = useState("");

  function update(key: keyof typeof form, value: string) {
    updateField(key, value);
  }

  async function saveDay() {
    await fetch(`/api/day/${date}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    router.refresh();
  }

  async function addSession() {
    if (!sessionTitle.trim()) return;
    await fetch("/api/study-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ day: date, title: sessionTitle, durationMinutes: minutes }),
    });
    setSessionTitle("");
    router.refresh();
  }

  async function addMistake() {
    if (!mistakeTitle.trim()) return;
    await fetch("/api/mistakes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ day: date, title: mistakeTitle, cause: "待归因" }),
    });
    setMistakeTitle("");
    router.refresh();
  }

  return (
    <section className="card dayEditor">
      <div className="sectionTitle">
        <span className="eyebrow">Daily Hub</span>
        <h2>日记 / 总结</h2>
      </div>
      <p className={`syncStatus sync-${globalStatus}`}>自动同步：{syncLabel(globalStatus)}</p>
      <ConflictList conflicts={conflicts} />
      <label className="field">
        今日计划
        <textarea value={form.plan} onChange={(event) => update("plan", event.target.value)} />
        <FieldStatus status={statusByField.plan} />
      </label>
      <label className="field">
        日记
        <textarea value={form.diary} onChange={(event) => update("diary", event.target.value)} />
        <FieldStatus status={statusByField.diary} />
      </label>
      <label className="field">
        晚间总结
        <textarea value={form.summary} onChange={(event) => update("summary", event.target.value)} />
        <FieldStatus status={statusByField.summary} />
      </label>
      <div className="grid2">
        <label className="field">
          阻塞
          <input value={form.blockers} onChange={(event) => update("blockers", event.target.value)} />
          <FieldStatus status={statusByField.blockers} />
        </label>
        <label className="field">
          明日第一步
          <input value={form.tomorrow} onChange={(event) => update("tomorrow", event.target.value)} />
          <FieldStatus status={statusByField.tomorrow} />
        </label>
      </div>
      <button className="primaryButton" onClick={saveDay} type="button">
        提交当天正式记录
      </button>

      <div className="inlineComposer">
        <input value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} placeholder="学习记录：PCA 推导重写" />
        <input value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} type="number" min="0" />
        <button onClick={addSession} type="button">添加学习</button>
      </div>
      <div className="inlineComposer">
        <input value={mistakeTitle} onChange={(event) => setMistakeTitle(event.target.value)} placeholder="错题：CNN 参数量漏 bias" />
        <button onClick={addMistake} type="button">添加错题</button>
      </div>
    </section>
  );
}

function ConflictList({ conflicts }: { conflicts: DraftConflictView[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(conflicts.map((conflict) => [conflict.id, conflict.local.content ?? ""])),
  );
  const [resolving, setResolving] = useState<string | null>(null);

  if (!conflicts.length) return null;

  async function resolve(conflict: DraftConflictView, content: string) {
    setResolving(conflict.id);
    await fetch("/api/conflicts/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conflictId: conflict.id, content, opId: crypto.randomUUID() }),
    });
    setResolving(null);
    router.refresh();
  }

  return (
    <div className="conflictStack">
      {conflicts.map((conflict) => {
        const local = conflict.local.content ?? "";
        const incoming = conflict.incoming.content ?? "";
        const merged = drafts[conflict.id] ?? local;
        return (
          <div className="conflictCard" key={conflict.id}>
            <div>
              <span className="eyebrow">Sync Conflict</span>
              <h3>{fieldLabels[conflict.field] || conflict.field} 有多端冲突</h3>
              <p>远端已有更新，你可以保留远端、使用本机内容，或编辑合并后的版本。</p>
            </div>
            <div className="conflictCompare">
              <label>
                本机尝试保存
                <textarea readOnly value={local} />
              </label>
              <label>
                当前远端版本
                <textarea readOnly value={incoming} />
              </label>
            </div>
            <label className="field">
              合并结果
              <textarea value={merged} onChange={(event) => setDrafts((current) => ({ ...current, [conflict.id]: event.target.value }))} />
            </label>
            <div className="conflictActions">
              <button disabled={resolving === conflict.id} onClick={() => resolve(conflict, incoming)} type="button">
                使用远端
              </button>
              <button disabled={resolving === conflict.id} onClick={() => resolve(conflict, local)} type="button">
                使用本机
              </button>
              <button disabled={resolving === conflict.id} onClick={() => resolve(conflict, merged)} type="button">
                保存合并
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FieldStatus({ status }: { status?: string }) {
  return <small className={`fieldStatus ${status === "error" || status === "conflict" ? "error" : ""}`}>{fieldStatusLabel(status)}</small>;
}

function fieldStatusLabel(status?: string) {
  if (status === "dirty") return "等待自动保存";
  if (status === "saving") return "保存中...";
  if (status === "saved") return "已保存草稿";
  if (status === "remote") return "已同步其它终端";
  if (status === "conflict") return "同步冲突：请复制本字段后刷新合并";
  if (status === "error") return "自动保存失败";
  return "自动保存";
}

function syncLabel(status: string) {
  if (status === "saving") return "保存中";
  if (status === "remote") return "已收到其它终端更新";
  if (status === "conflict") return "有字段冲突";
  if (status === "error") return "有字段失败";
  return "已保存草稿";
}
