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

  await page.goto(`${baseUrl}/practice/algorithms`, { waitUntil: "networkidle" });
  const managedProblems = page.locator(".algorithmProblemCard").filter({ hasText: "Ascend 原创" });
  if (await managedProblems.count() !== 30) {
    throw new Error(`expected 30 managed pilot problems, found ${await managedProblems.count()}`);
  }
  const managedProblem = page.locator(".algorithmProblemCard").filter({ hasText: "两数求和" });
  await managedProblem.waitFor({ state: "visible" });
  await managedProblem.getByRole("button", { name: "开始训练" }).click();
  await expectText(managedProblem, "题目与约束", "managed problem statement");
  await expectText(managedProblem, "先写思路，再写代码", "plan-before-code workflow");
  await expectText(managedProblem, "草稿加密持久化", "encrypted draft disclosure");
  await expectText(managedProblem, "正式 Judge 尚未开放", "safe no-gateway state");

  await page.getByLabel("题目链接").fill(`https://bailian.openjudge.cn/practice/${unique}/`);
  await page.getByLabel("题目名称").fill(problemTitle);
  await page.getByLabel("平台题号").fill(unique);
  await page.getByLabel("难度").selectOption("foundation");
  await page.getByLabel("技能标签").fill("基础，边界");
  await page.getByLabel("训练备注").fill("隔离端到端验证数据");
  await page.getByRole("button", { name: "加入训练" }).click();
  const problem = page.locator(".algorithmProblemCard").filter({ hasText: problemTitle });
  await problem.waitFor({ state: "visible" });

  await problem.getByRole("button", { name: "记录本次训练" }).click();
  await problem.getByLabel("训练类型").selectOption("initial");
  await problem.getByLabel("结果").selectOption("AC");
  await problem.getByLabel("有效训练分钟").fill("37");
  await problem.getByLabel("最高提示级别").selectOption("0");
  await problem.getByLabel("提交前信心").selectOption("2");
  await problem.getByLabel("纠正规则与复盘").fill("先核对输入范围，再覆盖空集与边界。");
  await problem.getByRole("button", { name: "保存证据" }).click();
  await problem.getByText("独立完成", { exact: true }).waitFor({ state: "visible" });
  await expectText(problem, "1 次记录", "algorithm attempt persisted");

  await problem.getByRole("button", { name: "加入今日" }).click();
  await page.goto(`${baseUrl}/day/${day}`, { waitUntil: "networkidle" });
  await expectText(page.locator("main"), `算法训练：${problemTitle}`, "algorithm task linked to today");

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
  const renderedAlgorithmBoard = await page.locator(".algorithmBoard").count();
  if (renderedAlgorithmBoard > 0) {
    throw new Error(`disabled algorithm route rendered protected content (HTTP ${disabledResponse?.status() ?? "unknown"})`);
  }

  await page.goto(`${baseUrl}/extensions`, { waitUntil: "networkidle" });
  await page.getByLabel("启用算法训练").check();
  await page.goto(`${baseUrl}/practice/algorithms`, { waitUntil: "networkidle" });
  await expectText(page.locator(".algorithmProblemList"), problemTitle, "plugin data survives disable and re-enable");
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
