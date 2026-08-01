import Link from "next/link";
import { Activity, Gauge, HardDrive, ScrollText, UserCheck, Users } from "lucide-react";
import { getDb } from "@/lib/db";
import { getObservabilityOverview, type OperationalEventType } from "@/lib/observability";
import { listAdminUsers, listAuditLogs } from "@/lib/repo/admin";
import { getAlgorithmPilotOverview } from "@/lib/repo/algorithm-pilot";

export default function AdminPage() {
  const db = getDb();
  const users = listAdminUsers(db);
  const ordinaryUsers = users.filter((user) => user.role === "user");
  const activeUsers = ordinaryUsers.filter((user) => user.status === "active");
  const usedBytes = ordinaryUsers.reduce((total, user) => total + user.storage_used_bytes, 0);
  const recentAudit = listAuditLogs(db, 8);
  const operations = getObservabilityOverview(db);
  const algorithmPilot = getAlgorithmPilotOverview(db);
  const lcp = operations.vitals.find((metric) => metric.name === "LCP")!;
  const inp = operations.vitals.find((metric) => metric.name === "INP")!;
  const ttfb = operations.vitals.find((metric) => metric.name === "TTFB")!;
  const failureTotal = operations.failures.reduce((sum, failure) => sum + failure.last24Hours, 0);

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

      <section className="card" aria-label="运行质量">
        <div className="sectionTitle">
          <div><span className="sectionKicker">REAL USER MONITORING</span><h2>运行质量</h2></div>
          <span className="sectionHint">真实登录会话 · 最近 {operations.windowDays} 天</span>
        </div>
        <div className="homeStats">
          <div className="homeStat"><Gauge size={18} /><strong>{formatVital(lcp)}</strong><span>LCP p75 · n={lcp.samples}</span></div>
          <div className="homeStat"><Activity size={18} /><strong>{formatVital(inp)}</strong><span>INP p75 · n={inp.samples}</span></div>
          <div className="homeStat"><Gauge size={18} /><strong>{formatVital(ttfb)}</strong><span>TTFB p75 · n={ttfb.samples}</span></div>
          <div className={failureTotal ? "homeStat danger" : "homeStat"}><Activity size={18} /><strong>{failureTotal}</strong><span>近 24 小时失败</span></div>
        </div>
        <p className="outcomeCaveat">
          只保存规范化路由和性能值，不保存账号、IP、查询参数或页面内容。样本少时只作诊断线索，不代表全部设备体验。
        </p>
      </section>

      <section className="card" aria-label="算法评测试点">
        <div className="sectionTitle">
          <div><span className="sectionKicker">ALGORITHM PILOT</span><h2>隔离 Judge 试点</h2></div>
          <Link className="sectionLink" href="/admin/users">管理准入</Link>
        </div>
        <div className="homeStats">
          <div className="homeStat"><UserCheck size={18} /><strong>{algorithmPilot.enabledApprovedWorkspaces}</strong><span>已批准且启用</span></div>
          <div className="homeStat"><Users size={18} /><strong>{algorithmPilot.enrollment.requested}</strong><span>等待批准</span></div>
          <div className="homeStat"><Activity size={18} /><strong>{algorithmPilot.formalSubmissions}</strong><span>正式提交</span></div>
          <div className={algorithmPilot.gatewayFailures ? "homeStat danger" : "homeStat"}><Gauge size={18} /><strong>{algorithmPilot.gatewayFailures}</strong><span>基础设施失败</span></div>
        </div>
        <p className="outcomeCaveat">
          Gateway 创建延迟 p95：{algorithmPilot.gatewayP95LatencyMs === null
            ? "—"
            : `${Math.round(algorithmPilot.gatewayP95LatencyMs)}ms`}。
          {algorithmPilot.outcome.reportable
            ? ` 独立 AC ${algorithmPilot.outcome.acceptedIndependent}/${algorithmPilot.outcome.judgedSubmissions}；这是描述性数据，不是教学因果证据。`
            : ` 学习结果需至少 ${algorithmPilot.outcome.minimumWorkspaces} 个实际提交工作区才显示，当前 ${algorithmPilot.submittedWorkspaces} 个。`}
        </p>
      </section>

      <div className="grid2">
        <section className="card">
          <div className="sectionTitle"><h2>主要路由 TTFB p75</h2><span className="sectionHint">最近 {operations.windowDays} 天</span></div>
          <div className="list">
            {operations.ttfbRoutes.map((route) => (
              <div className="listRow" key={route.route}>
                <div><strong>{route.route}</strong><small>{route.samples} 个样本</small></div>
                <span>{Math.round(route.p75)} ms</span>
              </div>
            ))}
            {!operations.ttfbRoutes.length ? <p className="emptyState">尚无真实用户性能样本。</p> : null}
          </div>
        </section>

        <section className="card">
          <div className="sectionTitle"><h2>失败趋势</h2><span className="sectionHint">近 24h / 前 24h</span></div>
          <div className="list">
            {operations.failures.map((failure) => (
              <div className="listRow" key={failure.eventType}>
                <div>
                  <strong>{failureLabel(failure.eventType)}</strong>
                  <small>{failure.scopes.map((scope) => `${scope.scope || "未分类"} ${scope.count}`).join(" · ") || "无失败样本"}</small>
                </div>
                <span>{failure.last24Hours} / {failure.previous24Hours}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid2">
        <section className="card">
          <div className="sectionTitle"><h2>账号状态</h2><Link className="sectionLink" href="/admin/users">查看全部</Link></div>
          <div className="list">
            {ordinaryUsers.slice(0, 6).map((user) => (
              <Link className="listRow" href={`/admin/users/${user.id}`} key={user.id}>
                <div><strong>{user.display_name}</strong><small>{user.email}</small></div>
                <span className={`statusBadge status-${user.status}`}>{statusLabel(user.status)}</span>
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

function formatVital(metric: { name: string; p75: number | null }): string {
  if (metric.p75 === null) return "—";
  return metric.name === "CLS" ? metric.p75.toFixed(2) : `${Math.round(metric.p75)}ms`;
}

function failureLabel(eventType: OperationalEventType): string {
  const labels: Record<OperationalEventType, string> = {
    action_failure: "Server Action 失败",
    login_failure: "登录失败",
    mcp_failure: "MCP 失败",
    offline_sync_failure: "离线补传失败",
    upload_failure: "上传失败",
  };
  return labels[eventType];
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
    "access.revoked": "撤销全部访问",
    "password.changed": "用户更新密码",
    "password.reset": "重置密码",
    "workspace.quota_updated": "调整容量",
    "algorithm_pilot.requested": "申请算法试点",
    "algorithm_pilot.approved": "批准算法试点",
    "algorithm_pilot.paused": "暂停算法试点",
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
