import Link from "next/link";
import { InviteUserForm } from "@/components/admin/InviteUserForm";
import { getDb } from "@/lib/db";
import { listAdminUsers } from "@/lib/repo/admin";

export default function AdminUsersPage() {
  const users = listAdminUsers(getDb()).filter((user) => user.role === "user");
  return (
    <div className="pageStack">
      <header className="pageHeader">
        <div><span className="eyebrow">ADMIN · USERS</span><h1>用户管理</h1><p>邀请朋友，并分别管理账号、空间和登录设备。</p></div>
      </header>
      <div className="grid2 adminUsersGrid">
        <InviteUserForm />
        <section className="card">
          <div className="sectionTitle"><h2>{users.length} 位普通用户</h2></div>
          <div className="list">
            {users.map((user) => (
              <Link className="listRow" href={`/admin/users/${user.id}`} key={user.id}>
                <div><strong>{user.display_name}</strong><small>{user.email}</small></div>
                <div className="rowMeta"><span className={`statusBadge status-${user.status}`}>{statusLabel(user.status)}</span><small>{formatBytes(user.storage_used_bytes)}</small></div>
              </Link>
            ))}
            {!users.length ? <p className="emptyState">还没有用户。创建邀请链接后，把它发给朋友即可。</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function statusLabel(status: string): string {
  return status === "active" ? "正常" : status === "invited" ? "待激活" : "已停用";
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
