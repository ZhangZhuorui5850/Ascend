import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, CheckCircle2, Eye, FileText, ShieldCheck } from "lucide-react";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getAdminUser } from "@/lib/repo/admin";
import { getSubjectOverviews } from "@/lib/repo/knowledge";
import { listTasks } from "@/lib/repo/planner";
import { getHomeSnapshot } from "@/lib/repo/stats";

export default async function AdminUserWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const user = getAdminUser(db, id);
  if (!user || user.role !== "user" || !user.workspace_id) notFound();
  const scope = { workspaceId: user.workspace_id };
  const today = todayKey();
  const snapshot = getHomeSnapshot(db, scope, today);
  const tasks = listTasks(db, scope, today);
  const subjects = getSubjectOverviews(db, scope, today);
  const assets = db.prepare(`
    SELECT id, original_name, day, size FROM assets
    WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 8
  `).all(scope.workspaceId) as Array<{ id: number; original_name: string; day: string; size: number }>;

  return (
    <div className="pageStack adminWorkspacePage">
      <div className="managementBanner"><ShieldCheck size={18} /><div><strong>管理查看模式</strong><span>正在查看 {user.display_name}（{user.email}）的学习空间。所有业务数据仍归该用户所有。</span></div><span className="statusBadge info"><Eye size={13} />只读审阅</span></div>
      <header className="pageHeader"><div><span className="eyebrow">ADMIN · WORKSPACE</span><h1>{user.display_name} 的学习概览</h1><p>{today} · 用于支持与排障，不会混入管理员自己的数据。</p></div><Link className="secondaryButton" href={`/admin/users/${user.id}`}><ArrowLeft size={15} />账号管理</Link></header>
      <section className="homeStats">
        <div className="homeStat"><CheckCircle2 size={18} /><strong>{snapshot.doneTasks}/{snapshot.doneTasks + snapshot.openTasks}</strong><span>今日任务</span></div>
        <div className="homeStat"><BookOpen size={18} /><strong>{snapshot.dueReviews + snapshot.dueMistakes}</strong><span>待处理</span></div>
        <div className="homeStat"><strong>{snapshot.today.studyMinutes}</strong><span>今日分钟</span></div>
        <div className="homeStat"><FileText size={18} /><strong>{assets.length}</strong><span>近期资料</span></div>
      </section>
      <div className="grid2">
        <section className="card"><div className="sectionTitle"><h2>今日任务</h2><span className="sectionHint">{tasks.length} 条</span></div><div className="list">{tasks.map((task) => <div className={task.done ? "listRow graduated" : "listRow"} key={task.id}><span className="rowBadge">{task.subject_code || "任务"}</span><strong>{task.title}</strong><small>{task.done ? "已完成" : "未完成"}</small></div>)}{!tasks.length ? <p className="empty">今天还没有任务。</p> : null}</div></section>
        <section className="card"><div className="sectionTitle"><h2>需要关注的科目</h2></div><div className="subjectProgressList">{subjects.slice(0, 7).map((subject) => <div className="subjectProgressRow" key={subject.code}><b>{subject.code}</b><strong>{subject.name}</strong><div className="progressTrack"><span style={{ transform: `scaleX(${subject.pointCount ? subject.masteredCount / subject.pointCount : 0})` }} /></div><small>{subject.masteredCount}/{subject.pointCount}</small><em className={subject.dueCount ? "flag due" : "flag subtle"}>{subject.dueCount ? `${subject.dueCount} 待复习` : "正常"}</em></div>)}</div></section>
      </div>
      <section className="card"><div className="sectionTitle"><h2>最近资料</h2><span className="sectionHint">文件内容受权限保护</span></div><div className="list">{assets.map((asset) => <div className="listRow" key={asset.id}><FileText size={15} /><strong>{asset.original_name}</strong><small>{asset.day} · {formatBytes(asset.size)}</small></div>)}{!assets.length ? <p className="empty">暂无资料。</p> : null}</div></section>
    </div>
  );
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
