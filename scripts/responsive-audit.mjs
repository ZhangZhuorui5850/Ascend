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
  await auditPwaContract();
  await auditLogin("login-desktop", 1440, 900);
  await auditLogin("login-mobile", 390, 844);
  await auditLogin("login-small-mobile", 360, 800);
  await auditServiceWorkerRuntime();
  await login();
  await ensureOnboarding();
  await auditPage("home-desktop", "/", 1440, 900, ".homeFocus");
  await auditDay("desktop", 1440, 900, { sidebar: true, capturePanel: false, mobileNav: false });
  await auditPage("files-desktop", "/assets", 1440, 900, ".driveExplorer");
  await auditPage("subjects-tablet", "/subjects", 1024, 900, ".subjectCards");
  await auditPage("home-mobile", "/", 390, 844, ".homeFocus");
  await auditDay("mobile", 390, 844, { sidebar: false, capturePanel: false, mobileNav: true });
  await auditMobileTaskLayout();
  await auditPage("files-mobile", "/assets", 390, 844, ".driveExplorer");
  await auditPage("day-landscape", `/day/${day}`, 844, 390, ".dayHeader");
  await auditRouteMatrix();
  await auditNavigationPositioning();
  await auditStandaloneSafeArea();
  await auditWeakPointDeepLink();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.keyboard.press("Control+K");
  await expectVisible(".commandPalette", "keyboard command palette opens");
  await page.getByLabel("搜索功能").fill("资料库");
  await page.keyboard.press("Enter");
  await page.waitForURL(`${baseUrl}/assets`, { timeout: 10_000 });
  console.log("command palette keyboard navigation passed");
  await page.locator("button.topbarIconButton").first().click();
  const explicitTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (explicitTheme !== "light" && explicitTheme !== "dark") throw new Error(`theme switch did not set an explicit theme: ${explicitTheme}`);
  await assertNoHorizontalOverflow("explicit theme");
  console.log(`theme switch passed (${explicitTheme})`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "更多" }).click();
  await expectVisible(".mobileMoreSheet", "mobile More sheet opens");
  await page.getByRole("button", { name: "关闭更多菜单" }).click();

  await page.goto(`${baseUrl}/day/${day}`, { waitUntil: "networkidle" });
  await page.getByTestId("mobile-nav").getByRole("button", { name: "收纳", exact: true }).click();
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
  if (width <= 900) await assertMobileBaseline(name);
}

async function login() {
  await page.goto(`${baseUrl}/login?next=/day/${day}`, { waitUntil: "networkidle" });
  await page.getByLabel("账号").fill(email);
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
  if (width <= 900) await assertMobileBaseline(name);
}

async function auditPage(name, pathname, width, height, selector) {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle" });
  await expectVisible(selector, `${name} key content`);
  await assertNoHorizontalOverflow(name);
  if (width <= 900) await assertMobileBaseline(name);
}

async function auditRouteMatrix() {
  const routes = [
    ["home", "/", ".homeFocus"],
    ["day", `/day/${day}`, ".dayHeader"],
    ["calendar", "/calendar", ".pageStack"],
    ["subjects", "/subjects", ".subjectCards"],
    ["assets", "/assets", ".driveExplorer"],
    ["mistakes", "/mistakes", ".pageStack"],
    ["mock-exams", "/mock-exams", ".pageStack"],
    ["analytics", "/analytics", ".analyticsMetricGrid"],
    ["settings", "/settings", ".settingsTabs"],
  ];
  const viewports = [
    ["small-phone", 320, 568],
    ["iphone", 390, 844],
    ["large-phone", 430, 932],
    ["tablet-portrait", 768, 1024],
    ["tablet-landscape", 1024, 768],
    ["desktop", 1440, 900],
  ];

  for (const [viewportName, width, height] of viewports) {
    for (const [routeName, pathname, selector] of routes) {
      await page.setViewportSize({ width, height });
      await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle" });
      await expectVisible(selector, `${viewportName}/${routeName} key content`);
      await assertNoHorizontalOverflow(`${viewportName}/${routeName}`);
      await assertShellWithinViewport(`${viewportName}/${routeName}`, width, height);
    }
  }
  console.log(`route matrix passed (${routes.length} routes × ${viewports.length} viewports)`);
}

async function auditNavigationPositioning() {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  if (await page.evaluate(() => window.scrollY) < 100) throw new Error("navigation reset test page is not scrollable");
  await page.getByTestId("mobile-nav").getByRole("link", { name: "总览" }).click();
  await page.waitForURL(`${baseUrl}/`, { timeout: 10_000 });
  await page.waitForTimeout(350);
  const resetY = await page.evaluate(() => window.scrollY);
  if (resetY > 1) throw new Error(`cross-route navigation retained scroll position ${resetY}px`);

  const taskLink = page.locator(`a[href="/day/${day}#day-tasks"]`).first();
  await taskLink.click();
  await page.waitForURL(`${baseUrl}/day/${day}#day-tasks`, { timeout: 10_000 });
  await assertHashTargetClear("#day-tasks", "home → today task anchor");

  await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle" });
  await page.locator('.settingsTabs a[href="#study"]').click();
  await assertHashTargetClear("#study", "settings study anchor");
  console.log("route reset and sticky-header anchor positioning passed");
}

async function auditStandaloneSafeArea() {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/day/${day}`, { waitUntil: "networkidle" });
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    root.dataset.appMode = "standalone";
    root.style.setProperty("--app-safe-top", "47px");
    root.style.setProperty("--app-safe-right", "0px");
    root.style.setProperty("--app-safe-bottom", "34px");
    root.style.setProperty("--app-safe-left", "0px");
    const nav = document.querySelector(".mobileNav");
    const topbar = document.querySelector(".topbar");
    const main = document.querySelector(".mainPane");
    if (!nav || !topbar || !main) throw new Error("standalone shell is incomplete");
    const navRect = nav.getBoundingClientRect();
    const topbarRect = topbar.getBoundingClientRect();
    const navStyle = getComputedStyle(nav);
    const fillStyle = getComputedStyle(nav, "::after");
    const result = {
      navHeight: navRect.height,
      navBottomGap: innerHeight - navRect.bottom,
      navPaddingBottom: Number.parseFloat(navStyle.paddingBottom),
      safeFillDisplay: fillStyle.display,
      safeFillHeight: Number.parseFloat(fillStyle.height),
      topbarHeight: topbarRect.height,
      mainPaddingBottom: Number.parseFloat(getComputedStyle(main).paddingBottom),
    };
    root.style.removeProperty("--app-safe-top");
    root.style.removeProperty("--app-safe-right");
    root.style.removeProperty("--app-safe-bottom");
    root.style.removeProperty("--app-safe-left");
    delete root.dataset.appMode;
    return result;
  });
  if (metrics.navHeight > 72 || metrics.navPaddingBottom > 8) {
    throw new Error(`standalone nav double-counts safe area: ${JSON.stringify(metrics)}`);
  }
  if (Math.abs(metrics.navBottomGap - 34) > 1 || metrics.safeFillDisplay !== "block" || Math.abs(metrics.safeFillHeight - 34) > 1) {
    throw new Error(`standalone home-indicator area is not continuously filled: ${JSON.stringify(metrics)}`);
  }
  if (Math.abs(metrics.topbarHeight - 105) > 1 || metrics.mainPaddingBottom < 116) {
    throw new Error(`standalone shell does not clear safe areas: ${JSON.stringify(metrics)}`);
  }
  console.log("iPhone standalone safe-area geometry passed");
}

async function auditWeakPointDeepLink() {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/analytics`, { waitUntil: "networkidle" });
  const link = page.locator(".weakPointActionRow > a").first();
  if (!(await link.count())) {
    console.log("weak-point deep-link skipped (isolated data has no weak point)");
    return;
  }
  await link.click();
  await page.waitForURL(/\/subjects\/[^?]+\?focus=/, { timeout: 10_000 });
  await expectVisible('[data-focus-target="true"]', "weak-point deep-link target");
  await page.waitForTimeout(450);
  const shell = await page.evaluate(() => {
    const topbar = document.querySelector(".topbar")?.getBoundingClientRect();
    const target = document.querySelector('[data-focus-target="true"]')?.getBoundingClientRect();
    return { topbarTop: topbar?.top ?? -1, targetTop: target?.top ?? -1, targetBottom: target?.bottom ?? -1, viewportHeight: innerHeight };
  });
  if (Math.abs(shell.topbarTop) > 1 || shell.targetTop < 0 || shell.targetBottom > shell.viewportHeight) {
    throw new Error(`weak-point transition produced unstable positioning: ${JSON.stringify(shell)}`);
  }
  const targetText = await page.locator('[data-focus-target="true"] .pointTitleView').textContent();
  if (!targetText?.trim()) throw new Error("weak-point deep-link target has no title");
  console.log("analytics weak-point deep-link passed");
}

async function assertHashTargetClear(selector, label) {
  await page.waitForTimeout(350);
  const geometry = await page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector)?.getBoundingClientRect();
    const topbar = document.querySelector(".topbar")?.getBoundingClientRect();
    return { targetTop: target?.top ?? -1, topbarBottom: topbar?.bottom ?? 0 };
  }, selector);
  if (geometry.targetTop < geometry.topbarBottom + 8) {
    throw new Error(`${label}: target ${geometry.targetTop}px is hidden by topbar ending at ${geometry.topbarBottom}px`);
  }
}

async function assertShellWithinViewport(label, width, height) {
  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element || getComputedStyle(element).display === "none") return null;
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const topbarControls = Array.from(document.querySelectorAll(".topbar button, .topbar a"))
      .filter((element) => getComputedStyle(element).display !== "none")
      .map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      });
    return { nav: rect(".mobileNav"), sidebar: rect(".sidebar"), topbar: rect(".topbar"), topbarControls };
  });
  for (const [name, rect] of Object.entries({ nav: result.nav, sidebar: result.sidebar, topbar: result.topbar })) {
    if (!rect) continue;
    if (rect.left < -1 || rect.right > width + 1 || rect.top < -1 || rect.bottom > height + 1) {
      throw new Error(`${label}: ${name} escapes viewport ${JSON.stringify(rect)} in ${width}x${height}`);
    }
  }
  const escapedControl = result.topbarControls.find((rect) => rect.left < -1 || rect.right > width + 1);
  if (escapedControl) throw new Error(`${label}: topbar control escapes viewport ${JSON.stringify(escapedControl)}`);
}

async function auditMobileTaskLayout() {
  const layout = await page.evaluate(() => {
    const create = document.querySelector(".dayTasks .taskCreate");
    const input = create?.querySelector("input");
    const select = create?.querySelector("select");
    const add = create?.querySelector("button");
    const inputRect = input?.getBoundingClientRect();
    const selectRect = select?.getBoundingClientRect();
    const addRect = add?.getBoundingClientRect();
    const title = document.querySelector(".dayTasks .taskTitle");
    const titleRect = title?.getBoundingClientRect();
    return {
      display: create ? getComputedStyle(create).display : "",
      inputBottom: inputRect?.bottom || 0,
      selectTop: selectRect?.top || 0,
      addHeight: addRect?.height || 0,
      titleTag: title?.tagName || "",
      titleHeight: titleRect?.height || 0,
      titleScrollHeight: title instanceof HTMLTextAreaElement ? title.scrollHeight : 0,
    };
  });
  if (layout.display !== "grid" || layout.selectTop < layout.inputBottom + 6) {
    throw new Error(`mobile task creator must wrap into two rows: ${JSON.stringify(layout)}`);
  }
  if (layout.addHeight < 44) throw new Error(`mobile add-task target is only ${layout.addHeight}px high`);
  if (layout.titleTag && layout.titleTag !== "TEXTAREA") throw new Error(`task title must support wrapping, got ${layout.titleTag}`);
  if (layout.titleTag && layout.titleHeight + 1 < layout.titleScrollHeight) {
    throw new Error(`task title is vertically clipped: ${layout.titleHeight} < ${layout.titleScrollHeight}`);
  }
}

async function auditPwaContract() {
  const manifestResponse = await fetch(`${baseUrl}/site.webmanifest`);
  if (!manifestResponse.ok) throw new Error(`manifest unavailable: ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  if (manifest.display !== "standalone" || manifest.start_url !== "/") {
    throw new Error(`manifest install contract invalid: ${JSON.stringify({ display: manifest.display, start_url: manifest.start_url })}`);
  }
  for (const size of ["192x192", "512x512"]) {
    if (!manifest.icons?.some((icon) => icon.sizes === size)) throw new Error(`manifest missing ${size} icon`);
  }

  const swResponse = await fetch(`${baseUrl}/sw.js`);
  const swCacheControl = swResponse.headers.get("cache-control") || "";
  if (!swResponse.ok || !swCacheControl.includes("no-store")) {
    throw new Error(`service worker must be served with no-store, got ${swResponse.status} ${swCacheControl}`);
  }
  const sw = await swResponse.text();
  for (const forbidden of ["/_next/", "/api/", "request.destination", "cache.put(request"]) {
    if (sw.includes(forbidden)) throw new Error(`service worker contains unsafe runtime-cache marker: ${forbidden}`);
  }
  if (!sw.includes('request.mode !== "navigate"') || !sw.includes('caches.match("/offline.html")')) {
    throw new Error("service worker navigation fallback contract missing");
  }

  const offlineResponse = await fetch(`${baseUrl}/offline.html`);
  if (!offlineResponse.ok || !(await offlineResponse.text()).includes("离线评分")) {
    throw new Error("identity-free offline fallback unavailable");
  }
  console.log("PWA manifest and conservative service-worker contract passed");
}

async function ensureOnboarding() {
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  if (!page.url().includes("/onboarding")) return;
  await page.locator(".onboardingPane textarea").fill("响应式审计学习目标");
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "进入今日工作台" }).click();
  await page.waitForURL(`${baseUrl}/`, { timeout: 10_000 });
}

async function auditServiceWorkerRuntime() {
  const state = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return { supported: false, entries: [] };
    const registration = await navigator.serviceWorker.ready;
    const names = await caches.keys();
    const entries = [];
    for (const name of names) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      entries.push({ name, paths: requests.map((request) => new URL(request.url).pathname).sort() });
    }
    return { supported: true, scope: registration.scope, entries };
  });
  if (!state.supported || !state.scope.endsWith("/")) throw new Error("service worker did not reach ready state");
  const zgcaCaches = state.entries.filter((entry) => entry.name.startsWith("zgca-"));
  if (zgcaCaches.length !== 1) throw new Error(`unexpected PWA cache count: ${JSON.stringify(zgcaCaches)}`);
  const allowed = new Set(["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"]);
  const leaked = zgcaCaches.flatMap((entry) => entry.paths).filter((pathname) => !allowed.has(pathname));
  if (leaked.length) throw new Error(`private/dynamic paths leaked into Cache Storage: ${leaked.join(", ")}`);
  console.log("service-worker runtime cache boundary passed");
}

async function assertMobileBaseline(label) {
  const result = await page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll("input, textarea, select"))
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && !["checkbox", "radio", "hidden"].includes(element.getAttribute("type") || "");
      })
      .map((element) => ({ tag: element.tagName, fontSize: Number.parseFloat(getComputedStyle(element).fontSize) }));
    const nav = document.querySelector('[data-testid="mobile-nav"]');
    const navTargets = nav
      ? Array.from(nav.querySelectorAll("a, button")).map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        })
      : [];
    const main = document.querySelector(".mainPane");
    const navHeight = nav?.getBoundingClientRect().height || 0;
    const mainBottomPadding = main ? Number.parseFloat(getComputedStyle(main).paddingBottom) : 0;
    const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute("content") || "";
    return { controls, navTargets, viewport, navHeight, mainBottomPadding };
  });
  const undersizedFont = result.controls.find((control) => control.fontSize < 16);
  if (undersizedFont) throw new Error(`${label}: focusable ${undersizedFont.tag} font is ${undersizedFont.fontSize}px`);
  const undersizedNav = result.navTargets.find((target) => target.height < 44 || target.width < 44);
  if (undersizedNav) throw new Error(`${label}: mobile nav target is ${undersizedNav.width}x${undersizedNav.height}`);
  if (result.navHeight && result.mainBottomPadding < result.navHeight + 16) {
    throw new Error(`${label}: main bottom padding ${result.mainBottomPadding}px does not clear ${result.navHeight}px navigation`);
  }
  if (!result.viewport.includes("viewport-fit=cover") || result.viewport.includes("user-scalable=no") || result.viewport.includes("maximum-scale")) {
    throw new Error(`${label}: inaccessible viewport contract: ${result.viewport}`);
  }
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
