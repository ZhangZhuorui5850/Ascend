import Link from "next/link";
import { notFound } from "next/navigation";
import { UserStatusActions } from "@/components/admin/UserStatusActions";
import { getDb } from "@/lib/db";
import { getAdminUser } from "@/lib/repo/admin";

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = getAdminUser(getDb(), id);
  if (!user || user.role !== "user") notFound();

  return (
    <div className="pageStack">
      <header className="pageHeader">
        <div><span className="eyebrow">ADMIN · USER</span><h1>{user.display_name}</h1><p>{user.email}</p></div>
        <Link className="secondaryButton" href="/admin/users">返回用户列表</Link>
      </header>
      <section className="homeStats" aria-label="用户概览">
        <div className="homeStat"><strong>{statusLabel(user.status)}</strong><span>账号状态</span></div>
        <div className="homeStat"><strong>{user.session_count}</strong><span>登录设备</span></div>
        <div className="homeStat"><strong>{formatBytes(user.storage_used_bytes)}</strong><span>已用容量</span></div>
        <div className="homeStat"><strong>{formatBytes(user.storage_quota_bytes || 0)}</strong><span>容量配额</span></div>
      </section>
      <UserStatusActions
        userId={user.id}
        status={user.status}
        quotaBytes={user.storage_quota_bytes || 0}
      />
    </div>
  );
}

function statusLabel(status: string): string {
  return status === "active" ? "正常" : status === "invited" ? "待激活" : "已停用";
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 MB";
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
