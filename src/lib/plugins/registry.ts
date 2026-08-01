export const PLUGIN_IDS = ["algorithms"] as const;

export type PluginId = (typeof PLUGIN_IDS)[number];

export type PluginPermission =
  | "core.tasks.write"
  | "core.study-events.write"
  | "core.analytics.contribute"
  | "plugin.algorithms.data"
  | "provider.network";

export type PluginManifest = {
  id: PluginId;
  version: string;
  apiVersion: 1;
  configVersion: number;
  name: string;
  description: string;
  icon: "code-2";
  route: string;
  navigation: {
    label: string;
    group: string;
  };
  permissions: PluginPermission[];
  slots: {
    navigation: boolean;
    commandPalette: boolean;
    todayRecommendations: boolean;
    workspaceSearch: boolean;
    analytics: boolean;
    dataExport: boolean;
    agentOperations: boolean;
  };
};

export const PLUGIN_MANIFESTS: readonly PluginManifest[] = [
  {
    id: "algorithms",
    version: "0.3.0",
    apiVersion: 1,
    configVersion: 2,
    name: "算法训练",
    description: "连接在线题目，记录独立作答、提示、错因与延迟复测证据。",
    icon: "code-2",
    route: "/practice/algorithms",
    navigation: {
      label: "算法训练",
      group: "扩展",
    },
    permissions: [
      "core.tasks.write",
      "core.study-events.write",
      "core.analytics.contribute",
      "plugin.algorithms.data",
      "provider.network",
    ],
    slots: {
      navigation: true,
      commandPalette: true,
      todayRecommendations: true,
      workspaceSearch: true,
      analytics: true,
      dataExport: true,
      agentOperations: true,
    },
  },
] as const;

const manifestById = new Map<PluginId, PluginManifest>(
  PLUGIN_MANIFESTS.map((manifest) => [manifest.id, manifest]),
);

export function isPluginId(value: string): value is PluginId {
  return (PLUGIN_IDS as readonly string[]).includes(value);
}

export function getPluginManifest(pluginId: string): PluginManifest {
  if (!isPluginId(pluginId)) throw new Error("未知扩展");
  return manifestById.get(pluginId)!;
}
