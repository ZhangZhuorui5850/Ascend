export type AlgorithmProviderCapabilities = {
  externalLink: boolean;
  search: boolean;
  problemFetch: boolean;
  accountConnection: boolean;
  historyImport: boolean;
  remoteSubmit: boolean;
  verifiedEvidence: boolean;
};

export type AlgorithmProviderDescriptor = {
  id: string;
  label: string;
  mode: "external_record" | "official_read" | "official_submit";
  capabilities: AlgorithmProviderCapabilities;
  authentication: "none" | "oauth" | "token";
  cachePolicy: "link_metadata_only" | "licensed_content";
  evidenceSource: "user_reported" | "provider_verified";
  matchUrl(url: URL): boolean;
};

const EXTERNAL_RECORD_CAPABILITIES: AlgorithmProviderCapabilities = Object.freeze({
  externalLink: true,
  search: false,
  problemFetch: false,
  accountConnection: false,
  historyImport: false,
  remoteSubmit: false,
  verifiedEvidence: false,
});

export const ALGORITHM_PROVIDERS: readonly AlgorithmProviderDescriptor[] = Object.freeze([
  externalProvider("bailian", "百炼", (host) => (
    host === "bailian.openjudge.cn" || host.endsWith(".bailian.openjudge.cn")
  )),
  externalProvider("openjudge", "OpenJudge", (host) => (
    host === "openjudge.cn" || host.endsWith(".openjudge.cn")
  )),
  externalProvider("luogu", "洛谷", (host) => (
    host === "luogu.com.cn" || host.endsWith(".luogu.com.cn")
  )),
]);

export const FALLBACK_ALGORITHM_PROVIDER: AlgorithmProviderDescriptor = Object.freeze({
  id: "external",
  label: "外部题目",
  mode: "external_record",
  capabilities: EXTERNAL_RECORD_CAPABILITIES,
  authentication: "none",
  cachePolicy: "link_metadata_only",
  evidenceSource: "user_reported",
  matchUrl: () => true,
});

export function identifyAlgorithmProvider(value: string | URL): AlgorithmProviderDescriptor {
  const url = typeof value === "string" ? new URL(value) : value;
  return ALGORITHM_PROVIDERS.find((provider) => provider.matchUrl(url))
    || FALLBACK_ALGORITHM_PROVIDER;
}

export function getAlgorithmProviderDescriptor(providerId: string): AlgorithmProviderDescriptor {
  return ALGORITHM_PROVIDERS.find((provider) => provider.id === providerId)
    || FALLBACK_ALGORITHM_PROVIDER;
}

/** 程序设计实习 MOOC 的课程归属建议（与导入时手动设置的 course_key 哈希方案天然一致） */
export const CXSJ_MOOC_COURSE_NAME = "程序设计实习";

export type AlgorithmCourseSuggestion = {
  courseName: string;
  stageKey: string;
};

/**
 * 按来源链接推断课程归属。目前仅识别程设实习 MOOC 课程站：
 * `/book/*` 是教材例题，其余学期作业组（如 /2023t2spring/…）是课后习题。
 * 返回 null 表示没有可靠建议，导入弹窗退回用户手填的课程设置。
 */
export function suggestCourseForSource(value: string): AlgorithmCourseSuggestion | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "cxsjsxmooc.openjudge.cn" && !host.endsWith(".cxsjsxmooc.openjudge.cn")) return null;
  return {
    courseName: CXSJ_MOOC_COURSE_NAME,
    stageKey: /^\/book(?:\/|$)/i.test(url.pathname) ? "例题" : "课后习题",
  };
}

/* ---------- 统一文件结构契约 ----------
   资料库网盘、算法训练库、VS Code 插件共用同一棵目录树：
     算法/<课程>/<阶段>/<题号-标题>.cpp
   所有写入路径一律经由 algorithmAssetFolderPath() 生成，
   禁止各端手写目录拼接。 */

export const ALGORITHM_ASSET_ROOT = "算法";

export function sanitizePathSegment(input: string): string {
  return input.replace(/[<>:"/\\|?*]/g, "-").slice(0, 80);
}

export function algorithmAssetFolderPath(parts: {
  courseName?: string;
  stageKey?: string;
  fileName?: string;
}): string {
  return [
    ALGORITHM_ASSET_ROOT,
    parts.courseName,
    parts.stageKey,
    parts.fileName,
  ]
    .filter((segment): segment is string => Boolean(segment))
    .map(sanitizePathSegment)
    .join("/");
}

function externalProvider(
  id: string,
  label: string,
  matchesHost: (host: string) => boolean,
): AlgorithmProviderDescriptor {
  return Object.freeze({
    id,
    label,
    mode: "external_record",
    capabilities: EXTERNAL_RECORD_CAPABILITIES,
    authentication: "none",
    cachePolicy: "link_metadata_only",
    evidenceSource: "user_reported",
    matchUrl: (url: URL) => matchesHost(url.hostname.toLowerCase()),
  });
}
