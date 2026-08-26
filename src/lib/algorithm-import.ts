import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { parseAlgorithmCpp, type ParsedAlgorithmExercise } from "./algorithm-import-parser";

const MAX_EXERCISES = 500;
const MAX_CPP_BYTES = 512 * 1024;

export type AlgorithmImportScan = {
  rootPath: string;
  rootName: string;
  contentSha256: string;
  templateSourceCode: string;
  exercises: ParsedAlgorithmExercise[];
  warningCount: number;
};

export function scanAlgorithmDirectory(inputPath: string): AlgorithmImportScan {
  const rootPath = resolveAllowedImportRoot(inputPath);
  const relativeFiles = collectCppFiles(rootPath);
  if (!relativeFiles.length) throw new Error("目录中没有可导入的 C++ 题目");
  if (relativeFiles.length > MAX_EXERCISES) {
    throw new Error(`一次最多导入 ${MAX_EXERCISES} 道题`);
  }
  const exercises = relativeFiles.map((relativePath) => {
    const absolutePath = path.join(rootPath, relativePath);
    const stat = lstatSync(absolutePath);
    if (stat.size > MAX_CPP_BYTES) throw new Error(`${relativePath} 超过 512 KiB`);
    return parseAlgorithmCpp(relativePath.replaceAll(path.sep, "/"), readFileSync(absolutePath, "utf8"));
  });
  const templateSourceCode = readPracticeTemplate(rootPath);
  const contentSha256 = createHash("sha256")
    .update(`${createHash("sha256").update(templateSourceCode).digest("hex")}\n`)
    .update(exercises.map((item) => `${item.sourcePath}\0${item.contentSha256}`).join("\n"))
    .digest("hex");
  return {
    rootPath,
    rootName: path.basename(rootPath),
    contentSha256,
    templateSourceCode,
    exercises,
    warningCount: exercises.reduce((total, item) => total + item.warnings.length, 0),
  };
}

function readPracticeTemplate(rootPath: string): string {
  const templatePath = path.join(rootPath, "template.cpp");
  if (!existsSync(templatePath)) return defaultCppTemplate();
  const stat = lstatSync(templatePath);
  if (!stat.isFile() || stat.size > MAX_CPP_BYTES) return defaultCppTemplate();
  const source = readFileSync(templatePath, "utf8").trimEnd();
  return source ? `${source}\n` : defaultCppTemplate();
}

function defaultCppTemplate(): string {
  return `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`;
}

export function configuredAlgorithmImportRoots(): string[] {
  const rawRoots = [process.env.ASCEND_ALGORITHM_IMPORT_ROOTS, process.env.ASCEND_AGENT_IMPORT_ROOTS]
    .filter(Boolean)
    .join(",");
  const roots = rawRoots
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (process.env.ZGCA_SOURCE_ROOT?.trim()) {
    roots.push(path.join(process.env.ZGCA_SOURCE_ROOT.trim(), "algorithm"));
  }
  return [...new Set(roots.map((root) => path.resolve(root)))];
}

function resolveAllowedImportRoot(inputPath: string): string {
  const requested = inputPath.trim();
  if (!requested) throw new Error("请填写算法题目录");
  const roots = configuredAlgorithmImportRoots();
  if (!roots.length) {
    throw new Error("请先配置 ASCEND_ALGORITHM_IMPORT_ROOTS");
  }
  const resolved = realpathSync(path.resolve(requested));
  const allowed = roots.some((candidate) => {
    let realCandidate: string;
    try {
      realCandidate = realpathSync(candidate);
    } catch {
      return false;
    }
    return resolved === realCandidate || resolved.startsWith(`${realCandidate}${path.sep}`);
  });
  if (!allowed) throw new Error("该目录未列入算法导入白名单");
  if (!lstatSync(resolved).isDirectory()) throw new Error("算法导入路径需要指向文件夹");
  return resolved;
}

function collectCppFiles(rootPath: string): string[] {
  const output: string[] = [];
  const visit = (currentPath: string) => {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "scratch" || entry.name === "bin" || entry.name === "tools") continue;
        visit(absolutePath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".cpp")) {
        if (currentPath === rootPath && entry.name.toLowerCase() === "template.cpp") continue;
        output.push(path.relative(rootPath, absolutePath));
      }
    }
  };
  visit(rootPath);
  return output.sort((left, right) => left.localeCompare(right, "zh-CN"));
}
