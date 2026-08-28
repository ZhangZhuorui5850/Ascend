export type AlgorithmCatalogEntry = {
  providerId: "bailian" | "openjudge";
  externalProblemId: string;
  title: string;
  aliases: string[];
  courseName: string;
  stageKey: string;
  topics: string[];
};

export const ALGORITHM_CATALOG: AlgorithmCatalogEntry[] = [
  entry("2742", "统计字符数", "W1", ["字符串", "模拟"]),
  entry("2754", "八皇后", "W3", ["回溯", "枚举"]),
  entry("2767", "简单密码", "W1", ["字符串", "模拟"]),
  entry("2692", "假币问题", "W2", ["枚举", "推理"]),
  entry("1222", "熄灯问题", "W2", ["枚举", "位运算"]),
  entry("2811", "熄灯问题", "W2", ["枚举", "位运算"]),
  entry("0811", "城堡问题", "W4", ["搜索", "连通块"]),
];

export function findCatalogByIdentity(providerId: string, externalProblemId: string): AlgorithmCatalogEntry | null {
  if (!externalProblemId) return null;
  return ALGORITHM_CATALOG.find(
    (item) => item.externalProblemId === externalProblemId && compatibleProvider(item.providerId, providerId),
  ) ?? null;
}

export function findCatalogCandidates(value: string): AlgorithmCatalogEntry[] {
  const key = normalizeAlgorithmAlias(value);
  if (!key) return [];
  return ALGORITHM_CATALOG.filter((item) =>
    [item.title, ...item.aliases].some((candidate) => {
      const normalized = normalizeAlgorithmAlias(candidate);
      return normalized === key || normalized.includes(key) || key.includes(normalized);
    }),
  ).slice(0, 5);
}

export function normalizeAlgorithmAlias(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/\.(?:cpp|cc|cxx)$/i, "")
    .replace(/^(?:bailian|openjudge|poj)[-_\s]*/i, "")
    .replace(/^\d{3,6}[-_\s]*/, "")
    .replace(/(?:[-_\s]*未完成)$/i, "")
    .replace(/[\s_\-—–·:：，,。.!！?？()（）\[\]【】]+/g, "")
    .slice(0, 160);
}

function entry(
  externalProblemId: string,
  title: string,
  stageKey: string,
  topics: string[],
): AlgorithmCatalogEntry {
  return {
    providerId: "bailian",
    externalProblemId,
    title,
    aliases: [`${externalProblemId}${title}`, `${externalProblemId}-${title}`],
    courseName: "郭炜算法基础",
    stageKey,
    topics,
  };
}

function compatibleProvider(catalogProvider: string, providerId: string): boolean {
  return catalogProvider === providerId || (catalogProvider === "bailian" && providerId === "openjudge");
}
