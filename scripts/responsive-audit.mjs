import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

loadLocalEnv();

const baseUrl = process.env.RESPONSIVE_AUDIT_URL || "http://localhost:3000";
const day = process.env.RESPONSIVE_AUDIT_DAY || new Date().toISOString().slice(0, 10);
const email = process.env.APP_LOGIN_EMAIL || "qa@zgca.local";
const password = process.env.APP_LOGIN_PASSWORD || process.env.APP_BASIC_AUTH_PASSWORD || "";

if (!password) {
  throw new Error("Set APP_LOGIN_PASSWORD or APP_BASIC_AUTH_PASSWORD before running responsive audit.");
}

const executablePath = findChromiumExecutable();
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage();

try {
  await auditLogin("login-desktop", 1440, 900);
  await auditLogin("login-mobile", 390, 844);
  await login();
  await auditDay("desktop", 1440, 900, {
    sidebar: true,
    capturePanel: true,
    mobileNav: false,
  });
  await auditDay("tablet", 1024, 900, {
    sidebar: true,
    capturePanel: true,
    mobileNav: false,
  });
  await auditDay("mobile", 390, 844, {
    sidebar: false,
    capturePanel: false,
    mobileNav: true,
  });
  await page.getByRole("button", { name: "收纳" }).click();
  await expectVisible('[data-testid="capture-panel"]', "mobile capture panel opens");
  await expectVisible('[data-testid="capture-backdrop"]', "mobile capture backdrop opens");
  await assertNoHorizontalOverflow("mobile capture open");
  console.log(`responsive audit passed for ${baseUrl}`);
} finally {
  await browser.close();
}

async function auditLogin(name, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/login?next=/day/${day}`, { waitUntil: "networkidle" });
  await expectText("h1", "回到今天的学习现场", `${name} login heading`);
  await expectVisible(".loginCard", `${name} login card`);
  await assertNoHorizontalOverflow(name);
}

async function login() {
  await page.goto(`${baseUrl}/login?next=/day/${day}`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.waitForURL(`${baseUrl}/day/${day}`, { timeout: 10_000 });
}

async function auditDay(name, width, height, expected) {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/day/${day}`, { waitUntil: "networkidle" });
  await expectText("h1", day, `${name} day heading`);
  await expectVisibility(".sidebar", expected.sidebar, `${name} sidebar`);
  await expectVisibility('[data-testid="capture-panel"]', expected.capturePanel, `${name} capture panel`);
  await expectVisibility('[data-testid="mobile-nav"]', expected.mobileNav, `${name} mobile nav`);
  await assertNoHorizontalOverflow(name);
}

async function expectText(selector, expected, label) {
  const text = await page.locator(selector).first().textContent();
  if (!text?.includes(expected)) throw new Error(`${label}: expected ${selector} to contain ${expected}, got ${text}`);
}

async function expectVisible(selector, label) {
  await expectVisibility(selector, true, label);
}

async function expectVisibility(selector, expected, label) {
  const target = page.locator(selector).first();
  if (expected) {
    await target.waitFor({ state: "visible", timeout: 3_000 });
  }
  const visible = await target.isVisible().catch(() => false);
  if (visible !== expected) throw new Error(`${label}: expected visible=${expected}, got ${visible}`);
}

async function assertNoHorizontalOverflow(label) {
  const sizes = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (sizes.scrollWidth > sizes.clientWidth + 1) {
    throw new Error(`${label}: horizontal overflow ${sizes.scrollWidth} > ${sizes.clientWidth}`);
  }
}

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator);
    if (process.env[key]) continue;
    process.env[key] = trimmed.slice(separator + 1).replace(/^['"]|['"]$/g, "");
  }
}

function findChromiumExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];
  return candidates.find((candidate) => existsSync(candidate));
}
