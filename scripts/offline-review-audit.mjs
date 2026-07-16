import { chromium } from "playwright";

const baseUrl = process.env.OFFLINE_AUDIT_URL || "http://localhost:3105";
const email = required("APP_LOGIN_EMAIL");
const password = required("APP_LOGIN_PASSWORD");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto(`${baseUrl}/login?next=/`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.waitForURL((url) => ["/", "/onboarding"].includes(url.pathname), { timeout: 15_000 });
  if (new URL(page.url()).pathname === "/onboarding") await completeOnboarding();

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  await page.goto(`${baseUrl}/day/${today}`, { waitUntil: "networkidle" });
  const firstCard = page.locator(".queueCard").first();
  await firstCard.waitFor({ timeout: 10_000 });
  await firstCard.getByRole("button", { name: "显示答案" }).click();

  await context.setOffline(true);
  await firstCard.getByRole("button", { name: "基本会" }).click();
  await page.locator(".offlineReviewStatus").filter({ hasText: "待同步 1 条" }).waitFor({ timeout: 10_000 });
  const pending = await page.evaluate(async () => {
    const request = indexedDB.open("ascend-learning", 2);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const countRequest = db.transaction("outbox", "readonly").objectStore("outbox").count();
    const count = await new Promise((resolve, reject) => {
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });
    db.close();
    return count;
  });
  if (pending !== 1) throw new Error(`IndexedDB outbox expected 1 operation, got ${pending}`);

  await context.setOffline(false);
  await page.locator(".offlineReviewStatus").waitFor({ state: "detached", timeout: 15_000 });
  console.log(JSON.stringify({ ok: true, checks: ["offline_queue", "indexeddb_outbox", "online_flush"] }, null, 2));
} finally {
  await context.setOffline(false).catch(() => undefined);
  await browser.close();
}

async function completeOnboarding() {
  await page.locator(".onboardingPane textarea").fill("离线复习审计目标");
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "进入今日工作台" }).click();
  await page.waitForURL(`${baseUrl}/`, { timeout: 10_000 });
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before running offline review audit.`);
  return value;
}
