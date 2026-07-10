import Link from "next/link";
import { HardDrive, ScrollText, UserCheck, Users } from "lucide-react";
import { getDb } from "@/lib/db";
import { listAdminUsers, listAuditLogs } from "@/lib/repo/admin";

export default function AdminPage() {
  const db = getDb();
  const users = listAdminUsers(db);
  const ordinaryUsers = users.filter((user) => user.role === "user");
  const activeUsers = ordinaryUsers.filter((user) => user.status === "active");
  const usedBytes = ordinaryUsers.reduce((total, user) => total + user.storage_used_bytes, 0);
  const recentAudit = listAuditLogs(db, 8);

  return (
    <div className="pageStack">
      <header className="pageHeader">
        <div>
          <span className="eyebrow">ADMIN</span>
          <h1>管理概览</h1>
          <p>账号、空间容量和安全操作的集中控制台。</p>
        </div>
        <Link className="primaryButton" href="/admin/users">邀请用户</Link>
      </header>

      <section className="homeStats" aria-label="系统概览">
        <div className="homeStat"><Users size={18} /><strong>{ordinaryUsers.length}</strong><span>普通用户</span></div>
        <div className="homeStat"><UserCheck size={18} /><strong>{activeUsers.length}</strong><span>活跃账号</span></div>
        <div className="homeStat"><HardDrive size={18} /><strong>{formatBytes(usedBytes)}</strong><span>已用文件容量</span></div>
        <div className="homeStat"><ScrollText size={18} /><strong>{recentAudit.length}</strong><span>近期管理操作</span></div>
      </section>

      <div className="grid2">
        <section className="card">
          <div className="sectionTitle"><h2>账号状态</h2><Link className="sectionLink" href="/admin/users">查看全部</Link></div>
          <div className="list">
            {ordinaryUsers.slice(0, 6).map((user) => (
              <Link className="listRow" href={`/admin/users/${user.id}`} key={user.id}>
                <div><strong>{user.display_name}</strong><small>{user.email}</small></div>
                <span className="rowBadge">{statusLabel(user.status)}</span>
              </Link>
            ))}
            {!ordinaryUsers.length ? <p className="emptyState">还没有普通用户，先创建第一份邀请。</p> : null}
          </div>
        </section>

        <section className="card">
          <div className="sectionTitle"><h2>最近操作</h2><Link className="sectionLink" href="/admin/audit">完整日志</Link></div>
          <div className="list">
            {recentAudit.map((log) => (
              <div className="listRow" key={log.id}>
                <div><strong>{actionLabel(log.action)}</strong><small>{log.target_name || log.entity_type}</small></div>
                <time>{formatDate(log.created_at)}</time>
              </div>
            ))}
            {!recentAudit.length ? <p className="emptyState">暂无管理操作。</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusLabel(status: string): string {
  return status === "active" ? "正常" : status === "invited" ? "待激活" : "已停用";
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    "invitation.created": "创建邀请",
    "invitation.activated": "激活账号",
    "user.suspended": "停用账号",
    "user.reactivated": "恢复账号",
    "sessions.revoked": "退出全部设备",
    "password.reset": "重置密码",
    "workspace.quota_updated": "调整容量",
  };
  return labels[action] || action;
}

function formatDate(value: string): string {
  return new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z")).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
