#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { ZodError } from "zod";
import { resolveAgentContext } from "../src/lib/agent/context";
import { getDb } from "../src/lib/db";
import { importZhongguancun } from "../src/lib/import/zhongguancun";

const DEFAULT_PLAN = process.env.ASCEND_ZHONGGUANCUN_PLAN;
const DEFAULT_RESOURCES = process.env.ASCEND_ZHONGGUANCUN_RESOURCES;
const DEFAULT_EMAIL = process.env.ASCEND_AGENT_EMAIL;

function option(args: string[], name: string, fallback: string | undefined): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value) throw new Error(`${name} 缺少值`);
  return value;
}

function printHelp(): void {
  process.stdout.write(`中关村学院资料导入\n\n用法：\n  zsh -lic 'npx tsx scripts/import-zhongguancun.ts --dry-run'\n  zsh -lic 'npx tsx scripts/import-zhongguancun.ts'\n\n可选参数：\n  --plan <path>       冲刺计划 Markdown 路径\n  --resources <path>  机试资源 Markdown 路径\n  --email <email>     目标学习账号（默认读取 ASCEND_AGENT_EMAIL）\n  --dry-run           只解析和统计，不写入数据库\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  const planPath = option(args, "--plan", DEFAULT_PLAN);
  const resourcesPath = option(args, "--resources", DEFAULT_RESOURCES);
  const email = option(args, "--email", DEFAULT_EMAIL);
  const dryRun = args.includes("--dry-run");
  if (!planPath || !resourcesPath) {
    throw new Error("请通过 --plan/--resources 或 ASCEND_ZHONGGUANCUN_PLAN/ASCEND_ZHONGGUANCUN_RESOURCES 指定 Markdown 文件");
  }
  if (!email) {
    throw new Error("请通过 --email 或 ASCEND_AGENT_EMAIL 指定目标学习账号");
  }
  const db = getDb();
  const context = resolveAgentContext(db, email);
  const result = await importZhongguancun({
    db,
    scope: context,
    planMarkdown: readFileSync(planPath, "utf8"),
    resourcesMarkdown: readFileSync(resourcesPath, "utf8"),
    planFileName: planPath.split("/").pop() || "中关村学院-冲刺备考计划.md",
    resourcesFileName: resourcesPath.split("/").pop() || "中关村学院-机试学习资源.md",
    importDay: "2026-08-04",
    dryRun,
  });
  process.stdout.write(`${JSON.stringify({ ok: true, workspaceId: context.workspaceId, result }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const details = error instanceof ZodError ? error.issues : undefined;
  process.stderr.write(`${JSON.stringify({ ok: false, error: message, details }, null, 2)}\n`);
  process.exitCode = 1;
});
