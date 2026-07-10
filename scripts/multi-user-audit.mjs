import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

loadLocalEnv();

const baseUrl = process.env.MULTI_USER_AUDIT_URL || "http://localhost:3105";
const adminEmail = required("APP_ADMIN_EMAIL");
const adminPassword = required("APP_ADMIN_PASSWORD");
const ownerEmail = required("APP_LOGIN_EMAIL");
const ownerPassword = required("APP_LOGIN_PASSWORD");
const marker = Date.now().toString(36);
const friendEmail = `audit-${marker}@example.com`;
const friendName = `审计用户 ${marker}`;
const friendPassword = `Audit-${marker}-password!`;
const browser = await chromium.launch({ headless: true });
const adminContext = await browser.newContext();
const ownerContext = await browser.newContext();
const friendContext = await browser.newContext();

try {
  const admin = await adminContext.newPage();
  await login(admin, adminEmail, adminPassword, "/admin");
  await admin.goto(`${baseUrl}/admin/users`, { waitUntil: "networkidle" });
  await admin.getByLabel("显示名称").fill(friendName);
  await admin.getByLabel("邮箱").fill(friendEmail);
  await admin.getByRole("button", { name: "创建 24 小时邀请链接" }).click();
  const inviteUrl = await admin.getByLabel("邀请链接").inputValue({ timeout: 10_000 });
  assert(inviteUrl.startsWith(`${baseUrl}/invite/`), "Admin creates a same-origin invitation URL");

  const friend = await friendContext.newPage();
  await friend.goto(inviteUrl, { waitUntil: "networkidle" });
  await friend.getByLabel("新密码").fill(friendPassword);
  await friend.getByLabel("再次输入").fill(friendPassword);
  await friend.getByRole("button", { name: "激活账号" }).click();
  await friend.waitForURL(`${baseUrl}/`, { timeout: 15_000 });
  assert(await friend.getByText(friendName).count(), "Invited user activates and receives a session");

  const owner = await ownerContext.newPage();
  await login(owner, ownerEmail, ownerPassword, "/");

  const ownerAsset = await createUserContent(owner, `owner-task-${marker}`, `owner-file-${marker}.txt`);
  const friendAsset = await createUserContent(friend, `friend-task-${marker}`, `friend-file-${marker}.txt`);
  assert(ownerAsset !== friendAsset, "Two users create distinct asset records");

  const ownerCross = await ownerContext.request.get(`${baseUrl}${friendAsset}`);
  const friendCross = await friendContext.request.get(`${baseUrl}${ownerAsset}`);
  assert(ownerCross.status() === 404 && friendCross.status() === 404, "Cross-workspace file access returns 404");

  await admin.goto(`${baseUrl}/admin/users`, { waitUntil: "networkidle" });
  assert(await admin.getByText(ownerEmail).count(), "Admin can see the original user summary");
  await admin.getByRole("link", { name: new RegExp(friendName) }).click();
  await admin.waitForURL("**/admin/users/*", { timeout: 10_000 });
  await admin.getByRole("heading", { name: friendName }).waitFor({ timeout: 10_000 });
  assert(true, "Admin can open the invited user's summary");
  await admin.getByRole("button", { name: "停用账号" }).click();
  await admin.getByText("账号已停用并退出全部设备").waitFor({ timeout: 10_000 });

  await friend.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  assert(friend.url().includes("/login"), "Suspending a user invalidates the existing session");

  await admin.goto(`${baseUrl}/admin/audit`, { waitUntil: "networkidle" });
  assert(await admin.getByText("user.suspended").count(), "Admin audit contains the suspension entry");
  assert(await admin.getByText(friendName).count(), "Admin audit identifies the target user");
  console.log(JSON.stringify({ ok: true, friendEmail, checks: 9 }, null, 2));
} finally {
  await Promise.all([adminContext.close(), ownerContext.close(), friendContext.close()]);
  await browser.close();
}

async function login(page, email, password, nextPath) {
  await page.goto(`${baseUrl}/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.waitForURL((url) => url.pathname === nextPath || url.pathname === "/change-password", { timeout: 15_000 });
  if (new URL(page.url()).pathname === "/change-password") {
    const replacement = `Changed-${marker}-password!`;
    await page.getByLabel("当前密码").fill(password);
    await page.getByLabel("新密码", { exact: true }).fill(replacement);
    await page.getByLabel("再次输入新密码").fill(replacement);
    await page.getByRole("button", { name: "更新密码并继续" }).click();
  }
  await page.waitForURL(`${baseUrl}${nextPath}`, { timeout: 15_000 });
}

async function createUserContent(page, taskName, fileName) {
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  await page.goto(`${baseUrl}/day/${day}`, { waitUntil: "networkidle" });
  await page.locator(".taskCreate input").fill(taskName);
  await page.locator('.taskCreate button[aria-label="添加任务"]').click();
  await page.waitForFunction(
    (expected) => Array.from(document.querySelectorAll(".taskTitle")).some((node) => node.value === expected),
    taskName,
    { timeout: 10_000 },
  );

  await page.goto(`${baseUrl}/assets`, { waitUntil: "networkidle" });
  await page.locator('.driveExplorer input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from(`workspace audit ${fileName}`),
  });
  const row = page.locator(".driveRow", { hasText: fileName });
  await row.waitFor({ timeout: 15_000 });
  await row.click();
  const href = await page.locator('.driveDetails a[href*="/api/assets/"]').getAttribute("href");
  if (!href) throw new Error(`No asset download URL for ${fileName}`);
  return href;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS | ${message}`);
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before running the multi-user audit.`);
  return value;
}

function loadLocalEnv() {
  const envPath = path.resolve(".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match || process.env[match[1].trim()]) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}
