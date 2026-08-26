import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import { listEnabledPluginIds } from "../repo/plugins";
import "./algorithms-contribution";
import {
  getPluginContribution,
  type PluginAnalyticsSection,
  type PluginTodayRecommendation,
} from "./contributions";
import { isPluginId } from "./registry";

export type { PluginAnalyticsSection, PluginTodayRecommendation } from "./contributions";

export function getPluginTodayRecommendations(
  db: Database.Database,
  scope: WorkspaceScope,
  today: string,
): PluginTodayRecommendation[] {
  return enabledContributions(db, scope).flatMap((contribution) =>
    contribution.todayRecommendations?.({ db, scope, today }) ?? []
  );
}

export function getPluginAnalyticsSections(
  db: Database.Database,
  scope: WorkspaceScope,
  today: string,
): PluginAnalyticsSection[] {
  return enabledContributions(db, scope).flatMap((contribution) =>
    contribution.analytics?.({ db, scope, today }) ?? []
  );
}

function enabledContributions(db: Database.Database, scope: WorkspaceScope) {
  return listEnabledPluginIds(db, scope)
    .filter(isPluginId)
    .map(getPluginContribution)
    .filter((contribution) => contribution !== undefined);
}
