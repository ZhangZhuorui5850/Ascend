import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import type { PluginId } from "./registry";

export type PluginTodayRecommendation = {
  pluginId: PluginId;
  key: string;
  label: string;
  title: string;
  description: string;
  href: string;
  count: number;
};

export type PluginAnalyticsSection = {
  pluginId: PluginId;
  title: string;
  href: string;
  sampleLabel: string;
  cards: Array<{ label: string; value: string; detail: string; samples: number }>;
  caveat: string;
};

export type PluginContributionContext = {
  db: Database.Database;
  scope: WorkspaceScope;
  today: string;
};

export type PluginContribution = {
  todayRecommendations?: (context: PluginContributionContext) => PluginTodayRecommendation[];
  analytics?: (context: PluginContributionContext) => PluginAnalyticsSection[];
};

const contributions = new Map<PluginId, PluginContribution>();

export function registerPluginContribution(pluginId: PluginId, contribution: PluginContribution): void {
  if (contributions.has(pluginId)) throw new Error(`扩展贡献已注册：${pluginId}`);
  contributions.set(pluginId, contribution);
}

export function getPluginContribution(pluginId: PluginId): PluginContribution | undefined {
  return contributions.get(pluginId);
}
