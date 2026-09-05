import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

loadLocalEnv();

const baseUrl = process.env.PLUGIN_AUDIT_URL || "http://localhost:3000";
const email = process.env.APP_LOGIN_EMAIL || "qa@zgca.local";
const password = process.env.APP_LOGIN_PASSWORD || process.env.APP_BASIC_AUTH_PASSWORD || "";
const day = process.env.PLUGIN_AUDIT_DAY || new Date().toISOString().slice(0, 10);

if (!password) throw new Error("Set APP_LOGIN_PASSWORD or APP_BASIC_AUTH_PASSWORD before running plugin audit.");

const executablePath = findChromiumExecutable();
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage();
const unique = Date.now().toString(36);
const problemTitle = `插件审计 A+B ${unique}`;

try {
  await login();
  await ensurePluginEnabled();

  await page.goto(`${baseUrl}/practice/algorithms?tab=library`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "新建题目" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("题目名称").fill(problemTitle);
  await editor.getByLabel("来源链接").fill(`https://bailian.openjudge.cn/practice/${unique}/`);
  await editor.getByLabel("平台题号").fill(unique);
  await editor.getByLabel("难度").selectOption("foundation");
  await editor.getByLabel("标签").fill("基础，边界");
  await editor.getByLabel("备注").fill("隔离端到端验证数据");
  await editor.getByLabel("题面 Markdown").fill("# A+B\n\n读取两个整数并输出和。");
  await editor.getByRole("button", { name: "保存题目" }).click();
  const problem = page.getByRole("row").filter({ hasText: problemTitle });
  await problem.waitFor({ state: "visible" });
  await problem.click();
  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="编辑题目"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  const inspector = page.locator("aside").filter({ hasText: problemTitle });
  await inspector.getByLabel("计划日期").fill(day);
  await inspector.getByRole("button", { name: "加入计划" }).click();
  await page.goto(`${baseUrl}/practice/algorithms?day=${day}`, { waitUntil: "networkidle" });
  await expectText(page.locator("main").last(), problemTitle, "algorithm plan linked to selected day");
  await page.getByRole("button", { name: `完成 ${problemTitle}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: /完成并安排复习|今天完成并安排复习/ }).click();

  await page.goto(`${baseUrl}/analytics`, { waitUntil: "networkidle" });
  const analytics = page.locator('[data-plugin="algorithms"]');
  await analytics.waitFor({ state: "visible" });
  await expectText(analytics, "首次独立通过率", "algorithm analytics contribution");
  await expectText(analytics, "100%", "algorithm analytics rate");

  await page.goto(`${baseUrl}/extensions`, { waitUntil: "networkidle" });
  await page.getByLabel("停用算法训练").uncheck();
  await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="启用算法训练"]');
    return input instanceof HTMLInputElement && !input.disabled;
  });
  const disabledResponse = await page.goto(`${baseUrl}/practice/algorithms`, { waitUntil: "networkidle" });
  await expectText(page.locator("main"), "算法训练插件还没有启用", `disabled route protected (HTTP ${disabledResponse?.status() ?? "unknown"})`);

  await page.goto(`${baseUrl}/extensions`, { waitUntil: "networkidle" });
  await page.getByLabel("启用算法训练").check();
  await page.goto(`${baseUrl}/practice/algorithms`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "题库", exact: true }).click();
  await expectText(page.locator("main").last(), problemTitle, "plugin data survives disable and re-enable");
  await assertNoHorizontalOverflow();
  console.log(`plugin algorithm audit passed for ${baseUrl}`);
} finally {
  await browser.close();
}

async function login() {
  await page.goto(`${baseUrl}/login?next=/extensions`, { waitUntil: "networkidle" });
  await page.getByLabel("账号").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 10_000 });
  if (new URL(page.url()).pathname === "/onboarding") {
    await completeOnboarding();
  }
}

async function completeOnboarding() {
  for (let step = 0; step < 4; step += 1) {
    const next = page.getByRole("button", { name: /下一步|完成设置|进入 Ascend/ }).last();
    if (await next.count()) {
      await next.click();
      await page.waitForTimeout(100);
    }
  }
  await page.waitForURL((url) => url.pathname !== "/onboarding", { timeout: 10_000 });
}

async function ensurePluginEnabled() {
  await page.goto(`${baseUrl}/extensions`, { waitUntil: "networkidle" });
  const enable = page.getByLabel("启用算法训练");
  if (await enable.count()) {
    await enable.check();
    await page.getByRole("link", { name: "打开扩展" }).waitFor({ state: "visible" });
  }
}

async function expectText(locator, text, label) {
  await locator.getByText(text, { exact: false }).first().waitFor({ state: "visible" });
  console.log(`${label} passed`);
}

async function assertNoHorizontalOverflow() {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (metrics.scrollWidth > metrics.clientWidth + 1) {
    throw new Error(`horizontal overflow: ${JSON.stringify(metrics)}`);
  }
}

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function findChromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}
