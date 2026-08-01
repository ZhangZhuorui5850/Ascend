import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../access-context";
import {
  getPluginManifest,
  isPluginId,
  PLUGIN_MANIFESTS,
  type PluginId,
  type PluginManifest,
} from "../plugins/registry";
import {
  parseAlgorithmPilotEnrollment,
  type AlgorithmPilotEnrollment,
} from "./algorithm-pilot";

export type WorkspacePluginState =
  | "available"
  | "enabled"
  | "disabled"
  | "needs_reauth"
  | "incompatible"
  | "admin_disabled";

export type WorkspacePlugin = {
  manifest: PluginManifest;
  enabled: boolean;
  navOrder: number;
  state: WorkspacePluginState;
  installedVersion: string;
  configVersion: number;
  pilotEnrollment?: AlgorithmPilotEnrollment;
};

type PluginRow = {
  plugin_id: string;
  enabled: number;
  nav_order: number;
  state: string;
  installed_version: string;
  config_version: number;
  config_json: string;
};

export function listWorkspacePlugins(
  db: Database.Database,
  scope: WorkspaceScope,
): WorkspacePlugin[] {
  const rows = db.prepare(`
    SELECT plugin_id, enabled, nav_order, state, installed_version, config_version, config_json
    FROM workspace_plugins
    WHERE workspace_id = ?
  `).all(scope.workspaceId) as PluginRow[];
  const byId = new Map(rows.map((row) => [row.plugin_id, row]));

  return PLUGIN_MANIFESTS.map((manifest, index) => {
    const row = byId.get(manifest.id);
    const enabled = Boolean(row?.enabled);
    return {
      manifest,
      enabled,
      navOrder: row?.nav_order ?? index,
      state: normalizeState(row?.state, enabled),
      installedVersion: row?.installed_version || "",
      configVersion: row?.config_version ?? manifest.configVersion,
      pilotEnrollment: manifest.id === "algorithms"
        ? parseAlgorithmPilotEnrollment(row?.config_json)
        : undefined,
    };
  }).sort((left, right) => left.navOrder - right.navOrder || left.manifest.name.localeCompare(right.manifest.name));
}

export function listEnabledPluginIds(
  db: Database.Database,
  scope: WorkspaceScope,
): PluginId[] {
  return listWorkspacePlugins(db, scope)
    .filter((plugin) => plugin.enabled && plugin.state === "enabled")
    .map((plugin) => plugin.manifest.id);
}

export function setPluginEnabled(
  db: Database.Database,
  scope: WorkspaceScope,
  pluginId: string,
  enabled: boolean,
): WorkspacePlugin {
  const manifest = getPluginManifest(pluginId);
  const current = db.prepare(`
    SELECT nav_order FROM workspace_plugins
    WHERE workspace_id = ? AND plugin_id = ?
  `).get(scope.workspaceId, manifest.id) as { nav_order: number } | undefined;
  const nextOrder = current?.nav_order ?? getNextPluginOrder(db, scope);
  db.prepare(`
    INSERT INTO workspace_plugins
      (workspace_id, plugin_id, enabled, nav_order, config_version, installed_version, state)
    VALUES
      (@workspaceId, @pluginId, @enabled, @navOrder, @configVersion, @installedVersion, @state)
    ON CONFLICT(workspace_id, plugin_id) DO UPDATE SET
      enabled = excluded.enabled,
      config_version = excluded.config_version,
      installed_version = excluded.installed_version,
      state = excluded.state,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    workspaceId: scope.workspaceId,
    pluginId: manifest.id,
    enabled: enabled ? 1 : 0,
    navOrder: nextOrder,
    configVersion: manifest.configVersion,
    installedVersion: manifest.version,
    state: enabled ? "enabled" : "disabled",
  });
  return listWorkspacePlugins(db, scope).find((plugin) => plugin.manifest.id === manifest.id)!;
}

export function savePluginOrder(
  db: Database.Database,
  scope: WorkspaceScope,
  orderedPluginIds: string[],
): void {
  const unique = [...new Set(orderedPluginIds)];
  if (unique.length !== PLUGIN_MANIFESTS.length || unique.some((id) => !isPluginId(id))) {
    throw new Error("扩展排序不完整");
  }
  const update = db.prepare(`
    INSERT INTO workspace_plugins
      (workspace_id, plugin_id, nav_order, config_version, installed_version, state)
    VALUES
      (@workspaceId, @pluginId, @navOrder, @configVersion, @installedVersion, 'available')
    ON CONFLICT(workspace_id, plugin_id) DO UPDATE SET
      nav_order = excluded.nav_order,
      updated_at = CURRENT_TIMESTAMP
  `);
  db.transaction(() => {
    unique.forEach((pluginId, navOrder) => {
      const manifest = getPluginManifest(pluginId);
      update.run({
        workspaceId: scope.workspaceId,
        pluginId,
        navOrder,
        configVersion: manifest.configVersion,
        installedVersion: manifest.version,
      });
    });
  })();
}

export function requirePluginEnabled(
  db: Database.Database,
  scope: WorkspaceScope,
  pluginId: string,
): PluginManifest {
  const manifest = getPluginManifest(pluginId);
  const row = db.prepare(`
    SELECT enabled, state
    FROM workspace_plugins
    WHERE workspace_id = ? AND plugin_id = ?
  `).get(scope.workspaceId, manifest.id) as { enabled: number; state: string } | undefined;
  if (!row?.enabled || row.state !== "enabled") throw new Error("扩展未启用");
  return manifest;
}

function getNextPluginOrder(db: Database.Database, scope: WorkspaceScope): number {
  const row = db.prepare(`
    SELECT COALESCE(MAX(nav_order), -1) + 1 AS next_order
    FROM workspace_plugins
    WHERE workspace_id = ?
  `).get(scope.workspaceId) as { next_order: number };
  return row.next_order;
}

function normalizeState(value: string | undefined, enabled: boolean): WorkspacePluginState {
  const states: WorkspacePluginState[] = [
    "available",
    "enabled",
    "disabled",
    "needs_reauth",
    "incompatible",
    "admin_disabled",
  ];
  if (value && states.includes(value as WorkspacePluginState)) return value as WorkspacePluginState;
  return enabled ? "enabled" : "available";
}
