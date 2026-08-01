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
