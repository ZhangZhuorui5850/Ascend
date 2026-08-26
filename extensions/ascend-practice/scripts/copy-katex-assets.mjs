import { copyFile, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const katexSource = path.join(extensionRoot, "node_modules", "katex", "dist");
const katexTarget = path.join(extensionRoot, "dist", "katex");

await mkdir(katexTarget, { recursive: true });
await copyFile(path.join(katexSource, "katex.min.css"), path.join(katexTarget, "katex.min.css"));
await cp(path.join(katexSource, "fonts"), path.join(katexTarget, "fonts"), { recursive: true, force: true });
