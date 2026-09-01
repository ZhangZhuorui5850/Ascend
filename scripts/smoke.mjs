import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";

const envPath = new URL("../.env.local", import.meta.url);
const fileEnv = existsSync(envPath) ? Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
) : {};
const env = { ...fileEnv, ...process.env };
const baseUrl = process.env.SMOKE_URL || "http://localhost:3105";
const marker = Date.now().toString(36);
const results = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on("pageerror", (error) => results.push(["PAGEERROR", error.message]));

function pass(name, extra = "") {
  results.push(["PASS", name, extra]);
}

async function finishOnboardingIfNeeded() {
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  if (!page.url().includes("/onboarding")) return;
  const createSubject = page.getByRole("button", { name: "创建新科目" });
  if (await createSubject.count()) await createSubject.click();
  const subjectCode = page.getByLabel("科目编号");
  if (await subjectCode.count()) {
    await subjectCode.fill(`QA${marker.slice(-4).toUpperCase()}`);
    await page.getByLabel("科目名称").fill("冒烟测试科目");
  }
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByLabel("当前目标").fill("验证核心学习闭环");
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByLabel("第一件事").fill(`完成冒烟验收-${marker}`);
  await page.getByRole("button", { name: "进入今天" }).click();
  await page.waitForURL(`${baseUrl}/`, { timeout: 15_000 });
  pass("three-step onboarding completes");
}

try {
  await page.goto(`${baseUrl}/calendar`);
  await page.waitForURL("**/login**", { timeout: 10_000 });
  pass("unauthenticated route redirects to login");

  await page.getByLabel("账号").fill(env.APP_LOGIN_EMAIL);
  await page.getByLabel("密码").fill(env.APP_LOGIN_PASSWORD);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.waitForURL(/\/(calendar|onboarding)$/, { timeout: 15_000 });
  pass("login succeeds");

  await finishOnboardingIfNeeded();
  await page.locator("[data-today-page]").waitFor();
  for (const selector of ["[data-today-now]", "[data-today-timeline]", "[data-today-review]", "[data-today-capture]"]) {
    await page.locator(selector).waitFor();
  }
  pass("Today renders NOW, timeline, review, and capture");

  const firstOpenTask = page.getByRole("checkbox", { name: /^完成任务：/ }).first();
  if (await firstOpenTask.count()) {
    await firstOpenTask.click();
    const undo = page.getByRole("button", { name: "撤销" });
    await undo.waitFor({ timeout: 10_000 });
    await undo.click();
    await page.getByRole("checkbox", { name: /^完成任务：/ }).first().waitFor({ timeout: 10_000 });
    pass("Today quick completion supports undo");
  }

  await page.keyboard.press("Control+K");
  const capture = page.getByTestId("capture-panel");
  await capture.waitFor();
  await capture.getByRole("tab", { name: "任务" }).click();
  const inboxTaskName = `待排任务-${marker}`;
  await capture.getByLabel("准备完成什么？").fill(`${inboxTaskName} 今天 25分钟`);
  await capture.getByRole("button", { name: "记录任务" }).click();
  await capture.waitFor({ state: "detached", timeout: 15_000 });
  pass("universal Capture creates a canonical task");

  await page.goto(`${baseUrl}/tasks`, { waitUntil: "networkidle" });
  await page.locator("[data-planner-shell]").waitFor();
  await page.getByRole("heading", { name: "计划", exact: true }).waitFor();
  await page.getByRole("navigation", { name: "计划视图" }).getByRole("link", { name: "日历" }).click();
  await page.waitForURL(`${baseUrl}/calendar`, { timeout: 10_000 });
  await page.locator('[data-planner-workspace="calendar"]').waitFor({ timeout: 15_000 });
  const inboxTask = page.getByText(inboxTaskName, { exact: true }).locator("xpath=ancestor::article");
  await inboxTask.getByRole("button", { name: "安排", exact: true }).click();
  await page.getByRole("button", { name: `排入 ${inboxTaskName}` }).click();
  await inboxTask.waitFor({ state: "detached", timeout: 10_000 });
  pass("Tasks and Calendar share the Planner shell");

  await page.locator(".commandTrigger").click();
  const dialogs = page.getByRole("dialog");
  await dialogs.filter({ has: page.getByLabel("搜索功能") }).waitFor();
  await page.keyboard.press("Escape");
  pass("accessible command dialog opens and closes");

  await page.goto(`${baseUrl}/review`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "复习", exact: true }).waitFor();
  pass("Review route is stable");

  await page.goto(`${baseUrl}/assets`, { waitUntil: "networkidle" });
  await page.locator(".driveExplorer").waitFor();
  pass("Assets route renders");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.getByTestId("mobile-nav").getByRole("button", { name: "记录", exact: true }).click();
  await page.locator('[data-planner-surface="sheet"]').waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) throw new Error("mobile Today has horizontal overflow");
  pass("mobile Capture uses a sheet without horizontal overflow");
} catch (error) {
  results.push(["ERROR", error instanceof Error ? error.message.slice(0, 500) : String(error)]);
  try {
    await page.screenshot({ path: "smoke-fail.png", fullPage: true });
    results.push(["INFO", `url=${page.url()}`]);
  } catch {}
} finally {
  await context.close();
  await browser.close();
}

for (const row of results) console.log(row.join(" | "));
const failed = results.some((row) => ["FAIL", "ERROR", "PAGEERROR"].includes(row[0]));
process.exit(failed ? 1 : 0);
