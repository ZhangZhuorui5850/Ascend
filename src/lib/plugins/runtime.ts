import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { getAlgorithmAnalytics } from "../repo/algorithm-analytics";
import { getAlgorithmDashboard } from "../repo/algorithms";
import { listEnabledPluginIds } from "../repo/plugins";

export type PluginTodayRecommendation = {
  pluginId: string;
  key: string;
  label: string;
  title: string;
  description: string;
  href: string;
  count: number;
};

export type PluginAnalyticsSection = {
  pluginId: string;
  title: string;
  href: string;
  sampleLabel: string;
  cards: Array<{
    label: string;
    value: string;
    detail: string;
    samples: number;
  }>;
  caveat: string;
};

export function getPluginTodayRecommendations(
  db: Database.Database,
  scope: WorkspaceScope,
  today: string,
): PluginTodayRecommendation[] {
  const enabled = new Set(listEnabledPluginIds(db, scope));
  const recommendations: PluginTodayRecommendation[] = [];
  if (enabled.has("algorithms")) {
    const dashboard = getAlgorithmDashboard(db, scope, today);
    if (dashboard.metrics.dueCount > 0) {
      recommendations.push({
        pluginId: "algorithms",
        key: "algorithms:due-review",
        label: "算法训练",
        title: `${dashboard.metrics.dueCount} 道算法题到期复测`,
        description: "优先重新独立作答，再决定是否查看提示。",
        href: "/practice/algorithms",
        count: dashboard.metrics.dueCount,
      });
    }
  }
  return recommendations;
}

export function getPluginAnalyticsSections(
  db: Database.Database,
  scope: WorkspaceScope,
  today: string,
): PluginAnalyticsSection[] {
  const enabled = new Set(listEnabledPluginIds(db, scope));
  const sections: PluginAnalyticsSection[] = [];
  if (enabled.has("algorithms")) {
    const dashboard = getAlgorithmDashboard(db, scope, today);
    const metrics = getAlgorithmAnalytics(db, scope, today);
    sections.push({
      pluginId: "algorithms",
      title: "算法训练证据",
      href: "/practice/algorithms",
      sampleLabel: `有效题目 ${metrics.firstAttempt.samples} · Provider 验证 ${metrics.providerVerifiedAttempts}`,
      cards: [
        {
          label: "首次独立通过率",
          value: rateLabel(metrics.firstAttempt.successes, metrics.firstAttempt.samples),
          detail: `按题目首个有效结果计数 ${metrics.firstAttempt.successes}/${metrics.firstAttempt.samples}；重复提交不增加分母`,
          samples: metrics.firstAttempt.samples,
        },
        {
          label: "7–20 天保持率",
          value: rateLabel(metrics.delayed7To20.successes, metrics.delayed7To20.samples),
          detail: `完成关联复测且独立 AC ${metrics.delayed7To20.successes}/${metrics.delayed7To20.samples}`,
          samples: metrics.delayed7To20.samples,
        },
        {
          label: "21+ 天保持率",
          value: rateLabel(metrics.delayed21Plus.successes, metrics.delayed21Plus.samples),
          detail: `长间隔关联复测且独立 AC ${metrics.delayed21Plus.successes}/${metrics.delayed21Plus.samples}`,
          samples: metrics.delayed21Plus.samples,
        },
        {
          label: "未见变式迁移",
          value: rateLabel(metrics.transfer.successes, metrics.transfer.samples),
          detail: `未见变式独立 AC ${metrics.transfer.successes}/${metrics.transfer.samples}`,
          samples: metrics.transfer.samples,
        },
        {
          label: "掌握复发率",
          value: rateLabel(metrics.recurrence.lapses, metrics.recurrence.samples),
          detail: `曾独立通过后，最近一次再次失败 ${metrics.recurrence.lapses}/${metrics.recurrence.samples} 题；越低越好`,
          samples: metrics.recurrence.samples,
        },
        {
          label: "信心校准误差",
          value: metrics.calibration.brierScore === null
            ? "—"
            : metrics.calibration.brierScore.toFixed(2),
          detail: `Brier score，0 最好、1 最差；基于 ${metrics.calibration.samples} 次提交前信心`,
          samples: metrics.calibration.samples,
        },
        {
          label: "有效作答中位数",
          value: durationLabel(metrics.activeTime.medianSeconds),
          detail: "只累计页面可见、有焦点且最近有操作的时段",
          samples: metrics.activeTime.samples,
        },
        {
          label: "Gateway 延迟",
          value: latencyLabel(metrics.gateway.p50LatencyMs, metrics.gateway.p95LatencyMs),
          detail: `创建请求 P50/P95；基础设施失败 ${metrics.gateway.failures}/${metrics.gateway.samples}`,
          samples: metrics.gateway.samples,
        },
      ],
      caveat: `当前题库 ${dashboard.metrics.problemCount} 题、到期 ${dashboard.metrics.dueCount} 题。外部平台记录仍是用户自报；每项样本少于 5 时只作描述，不形成能力结论，也不跨语言或难度直接比较。`,
    });
  }
  return sections;
}

function durationLabel(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.round(seconds / 60)} 分`;
}

function latencyLabel(p50: number | null, p95: number | null): string {
  if (p50 === null || p95 === null) return "—";
  return `${p50}/${p95} ms`;
}

function rateLabel(successes: number, samples: number): string {
  if (!samples) return "—";
  return `${Math.round((successes / samples) * 100)}%`;
}
