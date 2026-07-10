import { getDb } from "@/lib/db";
import { listAuditLogs } from "@/lib/repo/admin";

export default function AdminAuditPage() {
  const logs = listAuditLogs(getDb(), 200);
  return (
    <div className="pageStack">
      <header className="pageHeader"><div><span className="eyebrow">ADMIN · AUDIT</span><h1>操作日志</h1><p>只记录管理动作和脱敏摘要，不记录密码、令牌或表单原文。</p></div></header>
      <section className="card">
        <div className="list">
          {logs.map((log) => (
            <article className="listRow auditRow" key={log.id}>
              <div><strong>{log.action}</strong><small>{log.actor_name} → {log.target_name || log.entity_type}</small></div>
              <code>{log.summary_json}</code>
              <time>{log.created_at}</time>
            </article>
          ))}
          {!logs.length ? <p className="emptyState">暂无管理操作。</p> : null}
        </div>
      </section>
    </div>
  );
}
