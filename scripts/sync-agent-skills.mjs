import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const source = path.join(root, ".agents/skills/verify/SKILL.md");
const target = path.join(root, ".claude/skills/verify/SKILL.md");
const expected = await readFile(source, "utf8");
const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  const actual = await readFile(target, "utf8").catch(() => "");
  if (actual !== expected) {
    process.stderr.write("verify skill mirror is stale; run npm run skills:sync\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("verify skill mirror is current\n");
  }
} else {
  await writeFile(target, expected);
  process.stdout.write("synced .agents/skills/verify to .claude/skills/verify\n");
}
