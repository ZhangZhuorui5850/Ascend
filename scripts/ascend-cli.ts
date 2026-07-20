#!/usr/bin/env node
import { ZodError } from "zod";
import { resolveAgentContext } from "../src/lib/agent/context";
import { executeAgentOperation, getAgentOperation, operationManifest } from "../src/lib/agent/operations";
import { getDb } from "../src/lib/db";

type CliOptions = {
  email?: string;
  pretty: boolean;
  input: Record<string, unknown>;
};

function parseValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    return JSON.parse(value);
  }
  return value;
}

function parseOptions(args: string[]): CliOptions {
  const input: Record<string, unknown> = {};
  let email: string | undefined;
  let pretty = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--pretty") {
      pretty = true;
      continue;
    }
    const equals = token.indexOf("=");
    const key = token.startsWith("--") ? token.slice(2, equals > 0 ? equals : undefined) : "";
    if (!key) throw new Error(`无法解析参数：${token}`);
    const raw = equals > 0 ? token.slice(equals + 1) : args[++index];
    if (raw === undefined) throw new Error(`参数 --${key} 缺少值`);
    if (key === "email") email = raw;
    else if (key === "input") Object.assign(input, JSON.parse(raw));
    else input[key] = parseValue(raw);
  }
  return { email, pretty, input };
}

function printHelp(): void {
  process.stdout.write(
    `Ascend CLI\n\n用法：\n  npm run ascend -- tools\n  npm run ascend -- <operation> [--key value] [--email user@example.com] [--pretty]\n  npm run ascend -- <operation> --input '{"key":"value"}'\n\n示例：\n  npm run ascend -- status --pretty\n  npm run ascend -- task.list --from 2026-07-19 --to 2026-07-26 --pretty\n  npm run ascend -- task.create --day 2026-07-19 --title "复习线性代数"\n`,
  );
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "tools") {
    process.stdout.write(`${JSON.stringify(operationManifest(), null, 2)}\n`);
    return;
  }

  const options = parseOptions(args);
  const db = getDb();
  const context = resolveAgentContext(db, options.email);
  const result = await executeAgentOperation({ db, context }, getAgentOperation(command), options.input);
  process.stdout.write(`${JSON.stringify({ ok: true, operation: command, result }, null, options.pretty ? 2 : 0)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const details = error instanceof ZodError ? error.issues : undefined;
  process.stderr.write(`${JSON.stringify({ ok: false, error: message, details }, null, 2)}\n`);
  process.exitCode = 1;
});
