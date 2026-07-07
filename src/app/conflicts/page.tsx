import Link from "next/link";
import { ConflictPruneButton } from "@/components/ConflictPruneButton";
import { requirePageSession } from "@/lib/page-auth";
import { listConflictHistory, type ConflictHistoryItem } from "@/lib/sync";

export const dynamic = "force-dynamic";

const fieldLabels: Record<string, string> = {
  plan: "计划",
  diary: "日记",
  summary: "总结",
  blockers: "阻塞",
  tomorrow: "明日",
};

export default async function ConflictsPage() {
  await requirePageSession("/conflicts");

  const conflicts = listConflictHistory() as ConflictHistoryItem[];
  const openCount = conflicts.filter((conflict) => conflict.status === "open").length;
  const resolvedBefore = pruneBoundary();

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <span className="eyebrow">Sync Audit</span>
        <h1>同步冲突</h1>
        <p>查看多端草稿冲突的打开、解决和清理状态。正在打开的冲突仍建议回到对应日期页完成合并。</p>
      </div>

      <section className="metricGrid compact">
        <div className="metricCard danger"><strong>{openCount}</strong><span>打开冲突</span></div>
        <div className="metricCard"><strong>{conflicts.length - openCount}</strong><span>已解决记录</span></div>
        <div className="metricCard"><strong>{conflicts.length}</strong><span>总记录</span></div>
      </section>

      <section className="card">
        <div className="sectionTitle splitTitle">
          <div>
            <span className="eyebrow">History</span>
            <h2>冲突历史</h2>
          </div>
          <ConflictPruneButton resolvedBefore={resolvedBefore} />
        </div>
        <div className="conflictHistoryList">
          {conflicts.map((conflict) => (
            <ConflictHistoryRow conflict={conflict} key={conflict.id} />
          ))}
          {!conflicts.length ? <p className="empty">暂无同步冲突。</p> : null}
        </div>
      </section>
    </div>
  );
}

function ConflictHistoryRow({ conflict }: { conflict: ConflictHistoryItem }) {
  const local = conflict.local.content ?? "";
  const incoming = conflict.incoming.content ?? "";
  return (
    <article className={`conflictHistoryRow status-${conflict.status}`}>
      <div className="conflictHistoryMeta">
        <span>{conflict.status === "open" ? "待处理" : "已解决"}</span>
        <strong>{conflict.scopeId} · {fieldLabels[conflict.field] || conflict.field}</strong>
        <small>base v{conflict.baseVersion}{conflict.resolvedAt ? ` · ${conflict.resolvedAt}` : ""}</small>
      </div>
      <div className="conflictHistoryText">
        <p><b>本地</b>{local}</p>
        <p><b>远端</b>{incoming}</p>
      </div>
      <Link className="secondaryButton" href={`/day/${conflict.scopeId}`}>
        打开日期
      </Link>
    </article>
  );
}

function pruneBoundary(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 30);
  return date.toISOString().slice(0, 19).replace("T", " ");
}
