import { createHash } from "node:crypto";

export type ParsedAlgorithmExercise = {
  sourcePath: string;
  contentSha256: string;
  title: string;
  sourceUrl: string;
  providerId: string;
  externalProblemId: string;
  phase: string;
  priority: string;
  topics: string[];
  origins: string[];
  materialStatus: "todo" | "doing" | "review" | "done";
  statementConfidence: string;
  verified: string;
  fetched: string;
  statementMarkdown: string;
  inputSpecification: string;
  outputSpecification: string;
  examples: Array<{ input: string; output: string }>;
  sourceCode: string;
  warnings: string[];
};

const SECTION_HEADINGS = new Map([
  ["描述", "题目描述"],
  ["题目描述", "题目描述"],
  ["输入", "输入"],
  ["输入格式", "输入"],
  ["输出", "输出"],
  ["输出格式", "输出"],
  ["来源", "来源"],
  ["提示", "提示"],
]);

export function parseAlgorithmCpp(sourcePath: string, rawContent: string): ParsedAlgorithmExercise {
  const content = rawContent.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  const match = content.match(/^\s*\/\*([\s\S]*?)\*\/\s*([\s\S]*)$/);
  if (!match) throw new Error(`${sourcePath} 缺少文件头块注释`);
  const header = match[1];
  const sourceCode = match[2].trimEnd() + "\n";
  const lines = header.split("\n").map((line) => line.replace(/\s+$/, ""));
  const metadata = new Map<string, string>();
  let title = "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const titleMatch = line.match(/^题目[：:]\s*(.+)$/);
    if (titleMatch) title = titleMatch[1].trim();
    const metadataMatch = line.match(/^@([a-zA-Z_-]+)\s+(.+)$/);
    if (metadataMatch) metadata.set(metadataMatch[1].toLowerCase(), metadataMatch[2].trim());
  }

  const sourceUrl = metadata.get("source") || "";
  const { providerId, externalProblemId } = identifySource(sourceUrl, sourcePath);
  const examples = extractExamples(lines);
  const inputSpecification = extractSection(lines, ["输入", "输入格式"], ["输出", "输出格式"]);
  const outputSpecification = extractSection(lines, ["输出", "输出格式"], ["样例输入", "样例 1", "样例1", "样例"]);
  const warnings: string[] = [];
  if (!title) warnings.push("缺少题目名称");
  if (!sourceUrl) warnings.push("缺少来源");
  if (!inputSpecification) warnings.push("缺少输入说明");
  if (!outputSpecification) warnings.push("缺少输出说明");
  if (!examples.length) warnings.push("缺少可解析样例");

  return {
    sourcePath,
    contentSha256: createHash("sha256").update(content).digest("hex"),
    title: title || filenameTitle(sourcePath),
    sourceUrl,
    providerId,
    externalProblemId,
    phase: normalizePhase(metadata.get("phase")),
    priority: normalizePriority(metadata.get("priority")),
    topics: splitMetadataList(metadata.get("topics")),
    origins: splitMetadataList(metadata.get("origin"), /[+,，、]/),
    materialStatus: normalizeMaterialStatus(metadata.get("status")),
    statementConfidence: metadata.get("statement") || "",
    verified: metadata.get("verified") || "",
    fetched: metadata.get("fetched") || "",
    statementMarkdown: buildStatementMarkdown(lines, title || filenameTitle(sourcePath)),
    inputSpecification,
    outputSpecification,
    examples,
    sourceCode,
    warnings,
  };
}

function buildStatementMarkdown(lines: string[], title: string): string {
  const output: string[] = [`# ${title}`, ""];
  let previousBlank = true;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed || /^题目[：:]/.test(trimmed) || /^@[a-zA-Z_-]+\s+/.test(trimmed)) {
      if (!previousBlank) output.push("");
      previousBlank = true;
      continue;
    }
    const heading = trimmed.match(/^([^：:]{1,12})[：:]\s*(.*)$/);
    if (heading && SECTION_HEADINGS.has(heading[1])) {
      output.push(`## ${SECTION_HEADINGS.get(heading[1])}`, "");
      if (heading[2]) output.push(heading[2]);
      previousBlank = !heading[2];
      continue;
    }
    if (/^样例(?:\s*\d+)?(?:输入|输出)?[：:]?$/.test(trimmed)) {
      output.push(`## ${trimmed.replace(/[：:]$/, "")}`, "");
      previousBlank = true;
      continue;
    }
    output.push(line.replace(/^\s{4}/, ""));
    previousBlank = false;
  }
  return output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractExamples(lines: string[]): Array<{ input: string; output: string }> {
  const examples: Array<{ input: string; output: string }> = [];
  let currentInput: string[] | null = null;
  let currentOutput: string[] | null = null;
  let mode: "input" | "output" | null = null;
  const flush = () => {
    if (currentInput && currentOutput) {
      examples.push({
        input: trimBlock(currentInput),
        output: trimBlock(currentOutput),
      });
    }
    currentInput = null;
    currentOutput = null;
    mode = null;
  };
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    const inputHeading = trimmed.match(/^样例(?:\s*\d+)?输入[：:]?\s*(.*)$/);
    if (inputHeading) {
      flush();
      currentInput = inputHeading[1] ? [inputHeading[1]] : [];
      currentOutput = [];
      mode = "input";
      continue;
    }
    const outputHeading = trimmed.match(/^样例(?:\s*\d+)?输出[：:]?\s*(.*)$/);
    if (outputHeading && currentInput) {
      currentOutput = outputHeading[1] ? [outputHeading[1]] : [];
      mode = "output";
      continue;
    }
    if (mode && isSectionBoundary(trimmed)) {
      flush();
      continue;
    }
    if (mode === "input") currentInput!.push(line.replace(/^\s{4}/, ""));
    if (mode === "output") currentOutput!.push(line.replace(/^\s{4}/, ""));
  }
  flush();
  return examples.filter((example) => example.input || example.output).slice(0, 12);
}

function extractSection(lines: string[], starts: string[], ends: string[]): string {
  let collecting = false;
  const output: string[] = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!collecting) {
      const start = starts.find((label) => new RegExp(`^${escapeRegex(label)}[：:]`).test(trimmed));
      if (!start) continue;
      collecting = true;
      const inline = trimmed.replace(new RegExp(`^${escapeRegex(start)}[：:]\\s*`), "");
      if (inline) output.push(inline);
      continue;
    }
    if (ends.some((label) => trimmed.startsWith(label))) break;
    if (/^@[a-zA-Z_-]+\s+/.test(trimmed)) break;
    output.push(rawLine.replace(/^\s{4}/, "").trimEnd());
  }
  return trimBlock(output);
}

function identifySource(
  source: string,
  sourcePath: string,
): {
  providerId: string;
  externalProblemId: string;
} {
  const openJudge = source.match(/openjudge\.cn\/(?:practice|[^/]+)\/(\d+)\/?/i);
  if (openJudge) {
    return {
      providerId: /(^|\.)bailian\.openjudge\.cn/i.test(safeHostname(source)) ? "bailian" : "openjudge",
      externalProblemId: openJudge[1],
    };
  }
  const poj = source.match(/poj\.org\/problem\?id=(\d+)/i);
  if (poj) return { providerId: "poj", externalProblemId: poj[1] };
  if (/中关村学院/.test(source)) {
    return { providerId: "zgca-official", externalProblemId: sourcePath.replace(/\.cpp$/i, "") };
  }
  return {
    providerId: "local-import",
    externalProblemId: sourcePath.replace(/\.cpp$/i, ""),
  };
}

function safeHostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function normalizeMaterialStatus(value: string | undefined): ParsedAlgorithmExercise["materialStatus"] {
  if (value === "doing" || value === "review" || value === "done") return value;
  return "todo";
}

function normalizePhase(value: string | undefined): string {
  const phase = (value || "Extra").trim();
  return phase.slice(0, 40);
}

function normalizePriority(value: string | undefined): string {
  return /^(P1|P2|P3)$/.test(value || "") ? value! : "";
}

function splitMetadataList(value: string | undefined, separator = /[;,，、]/): string[] {
  return [
    ...new Set(
      (value || "")
        .split(separator)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 32);
}

function filenameTitle(sourcePath: string): string {
  const filename = sourcePath.split(/[\\/]/).pop() || "未命名题目";
  return filename.replace(/\.cpp$/i, "").replace(/^\d+[-_]/, "");
}

function isSectionBoundary(value: string): boolean {
  return (
    /^(来源|提示|说明|备注|数据范围)[：:]/.test(value) || /^题目[：:]/.test(value) || /^@[a-zA-Z_-]+\s+/.test(value)
  );
}

function trimBlock(lines: string[]): string {
  const copy = [...lines];
  while (copy.length && !copy[0].trim()) copy.shift();
  while (copy.length && !copy[copy.length - 1].trim()) copy.pop();
  return copy.join("\n").trimEnd();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
