import { getAlgorithmAnalytics } from "../repo/algorithm-analytics";
import { getAlgorithmDashboard } from "../repo/algorithms";
import {
  registerPluginContribution,
  type PluginAnalyticsSection,
  type PluginContributionContext,
  type PluginTodayRecommendation,
} from "./contributions";

registerPluginContribution("algorithms", {
  todayRecommendations: algorithmTodayRecommendations,
  analytics: algorithmAnalyticsSections,
});

function algorithmTodayRecommendations(
  { db, scope, today }: PluginContributionContext,
): PluginTodayRecommendation[] {
  const dashboard = getAlgorithmDashboard(db, scope, today);
  if (dashboard.metrics.dueCount === 0) return [];
  return [{
    pluginId: "algorithms",
    key: "algorithms:due-review",
    label: "算法训练",
    title: `${dashboard.metrics.dueCount} 道算法题到期复测`,
    description: "优先重新独立作答，再决定是否查看提示。",
    href: "/practice/algorithms",
    count: dashboard.metrics.dueCount,
  }];
}

function algorithmAnalyticsSections(
  { db, scope, today }: PluginContributionContext,
): PluginAnalyticsSection[] {
  const dashboard = getAlgorithmDashboard(db, scope, today);
  const metrics = getAlgorithmAnalytics(db, scope, today);
  return [{
    pluginId: "algorithms",
    title: "算法训练证据",
    href: "/practice/algorithms",
    sampleLabel: `有效题目 ${metrics.firstAttempt.samples} · Provider 验证 ${metrics.providerVerifiedAttempts}`,
    cards: [
      metricCard("首次独立通过率", metrics.firstAttempt.successes, metrics.firstAttempt.samples, `按题目首个有效结果计数 ${metrics.firstAttempt.successes}/${metrics.firstAttempt.samples}；重复提交不增加分母`),
      metricCard("7–20 天保持率", metrics.delayed7To20.successes, metrics.delayed7To20.samples, `完成关联复测且独立 AC ${metrics.delayed7To20.successes}/${metrics.delayed7To20.samples}`),
      metricCard("21+ 天保持率", metrics.delayed21Plus.successes, metrics.delayed21Plus.samples, `长间隔关联复测且独立 AC ${metrics.delayed21Plus.successes}/${metrics.delayed21Plus.samples}`),
      metricCard("未见变式迁移", metrics.transfer.successes, metrics.transfer.samples, `未见变式独立 AC ${metrics.transfer.successes}/${metrics.transfer.samples}`),
      metricCard("掌握复发率", metrics.recurrence.lapses, metrics.recurrence.samples, `曾独立通过后，最近一次再次失败 ${metrics.recurrence.lapses}/${metrics.recurrence.samples} 题；越低越好`),
      {
        label: "信心校准误差",
        value: metrics.calibration.brierScore === null ? "—" : metrics.calibration.brierScore.toFixed(2),
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
  }];
}

function metricCard(label: string, successes: number, samples: number, detail: string) {
  return { label, value: rateLabel(successes, samples), detail, samples };
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
