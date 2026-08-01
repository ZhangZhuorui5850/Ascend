import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

loadLocalEnv();

const baseUrl = process.env.RESPONSIVE_AUDIT_URL || "http://localhost:3000";
const day = process.env.RESPONSIVE_AUDIT_DAY || new Date().toISOString().slice(0, 10);
const email = process.env.APP_LOGIN_EMAIL || "qa@zgca.local";
const password = process.env.APP_LOGIN_PASSWORD || process.env.APP_BASIC_AUTH_PASSWORD || "";
const screenshotDir = process.env.RESPONSIVE_AUDIT_SCREENSHOT_DIR ? path.resolve(process.env.RESPONSIVE_AUDIT_SCREENSHOT_DIR) : "";
const stateMatrix = process.env.RESPONSIVE_AUDIT_STATE_MATRIX === "1";
const keyboardMatrix = process.env.RESPONSIVE_AUDIT_KEYBOARD_MATRIX === "1";
const packageVersion = JSON.parse(readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")).version;
const buildIdentifier = process.env.NEXT_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA || packageVersion;

if (!password) {
  throw new Error("Set APP_LOGIN_PASSWORD or APP_BASIC_AUTH_PASSWORD before running responsive audit.");
}
if ((stateMatrix || keyboardMatrix) && !screenshotDir) {
  throw new Error("Set RESPONSIVE_AUDIT_SCREENSHOT_DIR when an opt-in Planner evidence matrix is enabled.");
}

const executablePath = findChromiumExecutable();
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await auditPwaContract();
  await auditLogin("login-desktop", 1440, 900);
  await auditLogin("login-mobile", 390, 844);
  await auditLogin("login-small-mobile", 360, 800);
  await auditServiceWorkerRuntime();
  await login();
  await ensureOnboarding();
  if (stateMatrix) await auditPlannerStateMatrix();
  await auditPlannerAppearanceMatrix();
  await auditPage("home-desktop", "/", 1440, 900, ".homeFocus");
  await auditDay("desktop", 1440, 900, { sidebar: true, capturePanel: false, mobileNav: false });
  await auditPage("files-desktop", "/assets", 1440, 900, ".driveExplorer");
  await auditPlannerTasks("tasks-desktop", "/tasks", 1440, 1000);
  await auditPlannerCalendar("calendar-desktop", "/calendar", 1440, 1000);
  await auditPage("subjects-tablet", "/subjects", 1024, 900, ".subjectCards");
  await auditPlannerTasks("tasks-tablet", "/tasks", 900, 1000, "drawer");
  await auditPlannerCalendar("calendar-tablet", "/calendar", 900, 1000, "drawer");
  await auditPage("home-mobile", "/", 390, 844, ".homeFocus");
  await auditDay("mobile", 390, 844, { sidebar: false, capturePanel: false, mobileNav: true });
  await auditMobileTaskLayout();
  await auditPage("files-mobile", "/assets", 390, 844, ".driveExplorer");
  await auditPlannerTasks("tasks-mobile", "/tasks", 390, 844, "sheet");
  await auditPlannerCalendar("calendar-mobile", "/calendar", 390, 844, "sheet");
  if (keyboardMatrix) await auditPlannerKeyboardMatrix();
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
  try {
    await context.close();
  } finally {
    await browser.close();
  }
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

async function auditPlannerTasks(name, pathname, width, height, expectedSurface) {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle" });
  await expectVisible('[data-planner-workspace="tasks"]', `${name} workspace`);
  if (await page.locator("[data-planner-task-open]").count() === 0) {
    await page
      .getByLabel("任务标题", { exact: true })
      .fill(`响应式审计任务-${Date.now()}`);
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    await page.locator("[data-planner-task-open]").first().waitFor({ state: "visible", timeout: 10_000 });
  }
  await assertPlannerTaskRowContract(name);
  await assertQuickCaptureContract(name);
  await assertPlannerFieldSkin(name, '[data-planner-workspace="tasks"]');
  await assertPlannerLocalizedCopy(name, '[data-planner-workspace="tasks"]');
  if (expectedSurface) {
    const trigger = page.locator("[data-planner-task-open]").first();
    await trigger.click();
    await expectVisible(`[data-planner-surface="${expectedSurface}"]`, `${name} detail surface`);
    await assertPlannerFieldSkin(`${name} detail`, `[data-planner-surface="${expectedSurface}"]`);
    await assertPlannerLocalizedCopy(`${name} detail`, `[data-planner-surface="${expectedSurface}"]`);
    await assertNoPlannerOverlayIntersections(`${name} detail`, `[data-planner-surface="${expectedSurface}"]`);
    if (width <= 760) {
      await assertPlannerSingleColumn(`${name} 380px inspector`, `[data-planner-surface="${expectedSurface}"]`, 380);
    }
    await capturePlannerEvidence(name, pathname, expectedSurface);
    await page.keyboard.press("Escape");
    if (!(await trigger.evaluate((element) => element === document.activeElement))) {
      throw new Error(`${name}: task detail did not restore trigger focus`);
    }
  }
  else {
    await assertNoPlannerOverlayIntersections(`${name} inline inspector`, '[aria-label="任务详情"]');
    await capturePlannerEvidence(name, pathname, "inline");
  }
  await assertNoHorizontalOverflow(name);
  if (width <= 900) await assertMobileBaseline(name);
}

async function auditPlannerCalendar(name, pathname, width, height, expectedSurface) {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle" });
  await expectVisible('[data-planner-workspace="calendar"]', `${name} workspace`);
  if (width <= 760) await expectVisible('[aria-label="议程日期"]', `${name} agenda`);
  else await expectVisible(".fc", `${name} calendar canvas`);
  await assertPlannerFieldSkin(name, '[data-planner-workspace="calendar"]');
  await assertPlannerLocalizedCopy(name, '[data-planner-workspace="calendar"]');
  if (expectedSurface) {
    const trigger = page.getByRole("button", { name: "新建事件" });
    await trigger.click();
    await expectVisible(`[data-planner-surface="${expectedSurface}"]`, `${name} context surface`);
    await assertPlannerFieldSkin(`${name} context`, `[data-planner-surface="${expectedSurface}"]`);
    await assertPlannerLocalizedCopy(`${name} context`, `[data-planner-surface="${expectedSurface}"]`);
    await assertNoPlannerOverlayIntersections(`${name} context`, `[data-planner-surface="${expectedSurface}"]`);
    if (width <= 760) {
      await assertPlannerSingleColumn(`${name} 380px context`, `[data-planner-surface="${expectedSurface}"]`, 380);
    }
    await capturePlannerEvidence(name, pathname, expectedSurface);
    await page.keyboard.press("Escape");
    if (!(await trigger.evaluate((element) => element === document.activeElement))) {
      throw new Error(`${name}: calendar context did not restore trigger focus`);
    }
  }
  else {
    if (width === 1440 && height === 1000) await auditCalendarDesktopViews();
    await assertNoPlannerOverlayIntersections(`${name} inline context`, '[aria-label="日历上下文"]');
    await capturePlannerEvidence(name, pathname, "inline");
  }
  await assertNoHorizontalOverflow(name);
  if (width <= 900) await assertMobileBaseline(name);
}

async function auditCalendarDesktopViews() {
  const views = [
    { name: "月视图", state: "month-view", core: ".fc-dayGridMonth-view" },
    { name: "周视图", state: "week-view", core: ".fc-timeGridWeek-view" },
    { name: "日视图", state: "day-view", core: ".fc-timeGridDay-view" },
    { name: "议程视图", state: "agenda-view", core: '[aria-label="议程日期"]' },
  ];
  for (const view of views) {
    const trigger = page.getByRole("button", { name: view.name, exact: true });
    await trigger.click();
    if ((await trigger.getAttribute("data-active")) !== "true") throw new Error(`calendar ${view.name}: trigger did not become active`);
    await expectVisible(view.core, `calendar ${view.name} core content`);
    await capturePlannerEvidence(`calendar-desktop-${view.state}`, "/calendar", view.state);
  }
  const month = page.getByRole("button", { name: "月视图", exact: true });
  await month.click();
  if ((await month.getAttribute("data-active")) !== "true") throw new Error("calendar desktop baseline did not return to month view");
  await expectVisible(".fc-dayGridMonth-view", "calendar desktop baseline month core content");
}

async function auditPlannerStateMatrix() {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/tasks`, { waitUntil: "networkidle" });
  const emptyTaskCount = await page.locator("[data-planner-task-open]").count();
  if (emptyTaskCount !== 0) throw new Error(`state matrix requires an empty isolated data root, found ${emptyTaskCount} tasks`);
  await capturePlannerEvidence("tasks-state-empty", "/tasks", "state-empty");

  await page.goto(`${baseUrl}/calendar`, { waitUntil: "networkidle" });
  await expectVisible('[data-planner-workspace="calendar"]', "calendar empty workspace");
  await expectText('[aria-label="日历概览"]', "待排 0 项", "calendar empty inbox count");
  await expectText('[aria-label="日历上下文"]', "任务均已安排", "calendar empty inbox state");
  await capturePlannerEvidence("calendar-state-empty", "/calendar", "state-empty");

  const matrixTitles = Array.from({ length: 12 }, (_, index) => `审计密集任务-${String(index + 1).padStart(2, "0")}`);
  await page.goto(`${baseUrl}/tasks`, { waitUntil: "networkidle" });
  for (const title of matrixTitles) await createQuickCaptureTaskAndWaitForPersistence(title);
  await capturePlannerEvidence("tasks-state-dense", "/tasks", "state-dense", { taskCount: matrixTitles.length });

  await page.goto(`${baseUrl}/calendar`, { waitUntil: "networkidle" });
  const inboxTrigger = page.getByRole("button", { name: "打开待排任务", exact: true });
  await inboxTrigger.click();
  await expectText('[aria-label="日历上下文"] h2', "待排任务", "calendar dense inbox heading");
  const inboxRows = await page.locator('[aria-label="日历上下文"] article').count();
  if (inboxRows < matrixTitles.length) throw new Error(`calendar dense inbox only shows ${inboxRows}/${matrixTitles.length} tasks`);
  await capturePlannerEvidence("calendar-state-dense", "/calendar", "state-dense", { inboxTaskCount: inboxRows });

  await auditPlannerNetworkRecovery(matrixTitles.at(-1));
  await auditPlannerConflictRecovery(matrixTitles[0]);
}

async function createQuickCaptureTaskAndWaitForPersistence(title) {
  const titleInput = page.getByLabel("任务标题", { exact: true });
  const submit = page.getByRole("button", { name: "添加任务", exact: true });
  const exactTitle = new RegExp(`^${escapeRegExp(title)}$`);
  const persistedRows = page.locator('[data-planner-task-open]:not([data-planner-task-id^="draft:"])').filter({
    has: page.locator("strong").filter({ hasText: exactTitle }),
  });
  let responseInfo = { status: "not observed", url: "not observed", nextAction: "not observed" };
  await titleInput.fill(title);
  const actionResponse = page.waitForResponse((response) => response.request().method() === "POST"
    && Boolean(response.request().headers()["next-action"])
    && response.ok(), { timeout: 10_000 });
  try {
    await submit.click();
    const response = await actionResponse;
    responseInfo = {
      status: String(response.status()),
      url: response.url(),
      nextAction: response.request().headers()["next-action"] || "missing",
    };
    await persistedRows.first().waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForFunction(
      () => document.querySelector('input[aria-label="任务标题"]')?.value === "",
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForFunction(() => {
      const button = document.querySelector('button[aria-label="添加任务"]');
      return Boolean(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true";
    }, undefined, { timeout: 10_000 });
  } catch (error) {
    const diagnostics = await quickCaptureSubmissionDiagnostics(title, responseInfo);
    throw new Error(`quick capture submission diagnostics: ${JSON.stringify(diagnostics)}; cause: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function quickCaptureSubmissionDiagnostics(title, response) {
  return page.evaluate(({ expectedTitle, response: responseDetails }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
    };
    const rows = [...document.querySelectorAll("[data-planner-task-open]")]
      .filter((button) => button.querySelector("strong")?.textContent === expectedTitle)
      .map((button) => ({
        id: button.getAttribute("data-planner-task-id"),
        visible: visible(button),
        text: button.textContent,
        title: button.querySelector("strong")?.textContent,
      }));
    const input = document.querySelector('input[aria-label="任务标题"]');
    const button = document.querySelector('button[aria-label="添加任务"]');
    return {
      title: expectedTitle,
      rows,
      inputValue: input?.value ?? null,
      button: button ? { disabled: button.disabled, ariaDisabled: button.getAttribute("aria-disabled") } : null,
      response: responseDetails,
    };
  }, { expectedTitle: title, response });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function auditPlannerNetworkRecovery(taskTitle) {
  await page.goto(`${baseUrl}/tasks`, { waitUntil: "networkidle" });
  let intercepted = false;
  let releaseFailure;
  const failureGate = new Promise((resolve) => { releaseFailure = resolve; });
  const failNextServerAction = async (route) => {
    const request = route.request();
    if (!intercepted && request.method() === "POST" && request.headers()["next-action"]) {
      intercepted = true;
      await failureGate;
      await route.abort("failed");
      return;
    }
    await route.continue();
  };
  await page.route("**/*", failNextServerAction);
  try {
    await page.getByRole("button", { name: `完成 ${taskTitle}`, exact: true }).click();
    await page.locator(`button[aria-label="完成 ${taskTitle}"]`).waitFor({ state: "hidden", timeout: 3_000 });
    releaseFailure();
    await expectVisible('[data-status="restored"]', "network failure restored status");
    if (!intercepted) throw new Error("network matrix did not intercept a real Next Server Action POST");
    await expectVisible('[role="alert"]', "network failure error message");
    await expectVisible(`button[aria-label="完成 ${taskTitle}"]`, "network rollback restored task action");
    await capturePlannerEvidence("tasks-network-error", "/tasks", "network-error", { interceptedServerAction: true });
  } finally {
    releaseFailure?.();
    await page.unroute("**/*", failNextServerAction);
  }
  await page.reload({ waitUntil: "networkidle" });
  await expectVisible(`button[aria-label="完成 ${taskTitle}"]`, "network recovery persisted original task state");
  await capturePlannerEvidence("tasks-network-recovery", "/tasks", "network-recovery");
}

async function auditPlannerConflictRecovery(taskTitle) {
  const peer = await page.context().newPage();
  const peerTitle = `${taskTitle}-另一页面`;
  try {
    await Promise.all([
      page.goto(`${baseUrl}/tasks`, { waitUntil: "networkidle" }),
      peer.goto(`${baseUrl}/tasks`, { waitUntil: "networkidle" }),
    ]);
    for (const current of [page, peer]) {
      await current.locator("[data-planner-task-open]").filter({ hasText: taskTitle }).first().click();
    }
    await peer.locator('[aria-label="任务详情"] input[name="title"]').fill(peerTitle);
    await peer.getByRole("button", { name: "保存任务", exact: true }).click();
    await peer.locator('[data-status="saved"]').first().waitFor({ state: "visible", timeout: 10_000 });

    await page.locator('[aria-label="任务详情"] input[name="title"]').fill(`${taskTitle}-冲突页面`);
    await page.getByRole("button", { name: "保存任务", exact: true }).click();
    await expectVisible('[data-status="conflict"]', "expectedVersion conflict status");
    await expectVisible('[data-kind="conflict"]', "expectedVersion conflict toast");
    await capturePlannerEvidence("tasks-conflict", "/tasks", "conflict", { source: "two-pages-same-browser-context" });

    await page.reload({ waitUntil: "networkidle" });
    const recoveredTrigger = page.locator("[data-planner-task-open]").filter({ hasText: peerTitle }).first();
    await recoveredTrigger.click();
    const recoveredTitle = await page.locator('[aria-label="任务详情"] input[name="title"]').inputValue();
    if (recoveredTitle !== peerTitle) throw new Error(`conflict recovery expected ${peerTitle}, got ${recoveredTitle}`);
    await capturePlannerEvidence("tasks-conflict-recovery", "/tasks", "conflict-recovery", { recoveredVersionSource: "reload-and-reopen" });
  } finally {
    await peer.close();
  }
}

async function auditPlannerKeyboardMatrix() {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/tasks`, { waitUntil: "networkidle" });
  if (await page.locator("[data-planner-task-open]").count() === 0) throw new Error("keyboard matrix requires an existing isolated task");
  await page.locator("[data-planner-task-open]").first().click();
  await expectVisible('[data-planner-surface="sheet"]', "keyboard matrix task sheet");
  const title = page.locator('[data-planner-surface="sheet"] input[name="title"]');
  await title.focus();
  const baselineHeight = await page.evaluate(() => window.visualViewport.height);
  const originalTitle = await title.inputValue();
  await page.setViewportSize({ width: 390, height: 560 });
  const shrunken = await page.evaluate(() => ({ height: window.visualViewport.height, width: window.visualViewport.width }));
  if (shrunken.height >= baselineHeight) throw new Error(`simulated visual viewport did not shrink: ${shrunken.height} >= ${baselineHeight}`);
  const titleRect = await title.boundingBox();
  if (!titleRect || titleRect.top < 0 || titleRect.bottom > shrunken.height) throw new Error(`keyboard matrix primary field is outside simulated visual viewport: ${JSON.stringify(titleRect)}`);
  await title.fill(`${originalTitle}（键盘矩阵草稿）`);
  const submit = page.getByRole("button", { name: "保存任务", exact: true });
  const scrollPath = await submit.evaluate((button) => {
    let current = button.parentElement;
    while (current) {
      const style = getComputedStyle(current);
      if (["auto", "scroll"].includes(style.overflowY) && current.scrollHeight > current.clientHeight) {
        return { clientHeight: current.clientHeight, scrollHeight: current.scrollHeight };
      }
      current = current.parentElement;
    }
    return null;
  });
  if (!scrollPath) throw new Error("keyboard matrix sheet has no scrollable submit path");
  await submit.scrollIntoViewIfNeeded();
  const submitRect = await submit.boundingBox();
  if (!submitRect || submitRect.top < 0 || submitRect.bottom > shrunken.height) throw new Error(`keyboard matrix submit path is not scroll-reachable: ${JSON.stringify(submitRect)}`);
  await assertNoPlannerOverlayIntersections("keyboard matrix sheet", '[data-planner-surface="sheet"]');
  await capturePlannerEvidence("tasks-keyboard-simulated", "/tasks", "sheet", {
    simulation: "simulated-visual-viewport-resize",
    visualViewport: { baselineHeight, ...shrunken },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
}

async function auditPlannerAppearanceMatrix() {
  const original = await page.evaluate(() => ({
    skin: document.documentElement.dataset.skin || "default",
    theme: document.documentElement.dataset.theme || "system",
  }));
  const skins = ["default", "aurora", "brutal", "cloud", "terminal"];
  try {
    for (const theme of ["light", "dark"]) for (const skin of skins) {
      await setPlannerAppearance(theme, skin);
      for (const [route, workspace] of [["/tasks", "tasks"], ["/calendar", "calendar"]]) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
        await expectVisible(`[data-planner-workspace="${workspace}"]`, `${theme}/${skin} ${workspace} workspace`);
        await assertPlannerFieldSkin(`${theme}/${skin} ${workspace}`, `[data-planner-workspace="${workspace}"]`);
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const [route, workspace] of [["/tasks", "tasks"], ["/calendar", "calendar"]]) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
      const reduce = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
      if (!reduce) throw new Error(`reduced-motion ${workspace}: browser media emulation did not apply`);
      await assertPlannerFieldSkin(`reduced-motion ${workspace}`, `[data-planner-workspace="${workspace}"]`);
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const [route, workspace] of [["/tasks", "tasks"], ["/calendar", "calendar"]]) {
      await auditAppReducedMotionRuntime(route, workspace);
    }
  } finally {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await setPlannerAppearance(original.theme, original.skin);
  }
}

async function auditAppReducedMotionRuntime(route, workspace) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector('[data-motion-provider="never"]'));
  const before = await page.evaluate(() => ({ url: location.href, navigations: performance.getEntriesByType("navigation").length }));
  await page.evaluate(() => {
    localStorage.setItem("zgca-motion", "reduce");
    document.documentElement.dataset.motion = "reduce";
  });
  await page.waitForFunction(() => document.querySelector('[data-motion-provider="always"]'));
  const reduced = await page.evaluate(() => ({
    motion: document.documentElement.dataset.motion,
    persisted: localStorage.getItem("zgca-motion"),
    url: location.href,
    navigations: performance.getEntriesByType("navigation").length,
  }));
  if (reduced.motion !== "reduce" || reduced.persisted !== "reduce" || reduced.url !== before.url || reduced.navigations !== before.navigations) {
    throw new Error(`app reduced-motion ${workspace}: runtime setting did not apply without reload: ${JSON.stringify({ before, reduced })}`);
  }
  await assertPlannerFieldSkin(`app reduced-motion ${workspace}`, `[data-planner-workspace="${workspace}"]`);
  await page.evaluate(() => {
    localStorage.setItem("zgca-motion", "auto");
    delete document.documentElement.dataset.motion;
  });
  await page.waitForFunction(() => document.querySelector('[data-motion-provider="never"]'));
}

async function setPlannerAppearance(theme, skin) {
  await page.evaluate(({ nextTheme, nextSkin }) => {
    localStorage.setItem("zgca-theme", nextTheme);
    localStorage.setItem("zgca-skin", nextSkin);
    if (nextTheme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = nextTheme;
    if (nextSkin === "default") document.documentElement.removeAttribute("data-skin");
    else document.documentElement.dataset.skin = nextSkin;
  }, { nextTheme: theme, nextSkin: skin });
}

async function capturePlannerEvidence(name, pathname, state, metadata = {}) {
  if (!screenshotDir) return;
  mkdirSync(screenshotDir, { recursive: true });
  const basename = name.replace(/[^a-z0-9_-]/gi, "-");
  let finalState;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await waitForCaptureStability();
    const before = await readPlannerCaptureState();
    await page.screenshot({ animations: "disabled", fullPage: false, path: path.join(screenshotDir, `${basename}.png`) });
    const after = await readPlannerCaptureState();
    if (JSON.stringify(before) === JSON.stringify(after)) {
      finalState = after;
      break;
    }
  }
  if (!finalState) throw new Error(`Planner evidence capture did not remain stable after 3 attempts: ${name}`);
  writeFileSync(path.join(screenshotDir, `${basename}.json`), `${JSON.stringify({ route: pathname, state, viewport: page.viewportSize(), fullPage: false, browser: "chromium", ...finalState.appearance, scroll: finalState.scroll, packageVersion, buildIdentifier, ...metadata }, null, 2)}\n`);
}

async function readPlannerCaptureState() {
  return page.evaluate(() => {
    const rectangle = (element) => element ? element.getBoundingClientRect().toJSON() : null;
    return {
      appearance: { theme: document.documentElement.dataset.theme || "system", skin: document.documentElement.dataset.skin || "default" },
      scroll: { x: window.scrollX, y: window.scrollY },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      topbar: rectangle(document.querySelector(".topbar")),
      sidebar: rectangle(document.querySelector(".sidebar")),
    };
  });
}

async function waitForCaptureStability() {
  await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const finiteAnimations = () => document.getAnimations({ subtree: true }).filter((animation) => {
      const iterations = animation.effect?.getTiming().iterations;
      return iterations !== Infinity && animation.playState !== "idle";
    });
    while (true) {
      const before = finiteAnimations();
      await Promise.allSettled(before.map((animation) => animation.finished));
      await frame();
      const after = finiteAnimations();
      if (after.length === 0 || after.every((animation) => animation.playState === "finished")) break;
    }
    window.scrollTo(0, 0);
    await frame();
  });
}

async function assertPlannerTaskRowContract(label) {
  const task = page.locator("[data-planner-task-open]").first();
  const leadingControls = async () => task.evaluate((openButton) => {
    const row = openButton.closest("article");
    return row ? row.querySelectorAll('input[type="checkbox"], button[aria-label^="完成 "], button[aria-label^="恢复 "]').length : -1;
  });
  const defaultCount = await leadingControls();
  if (defaultCount !== 1) throw new Error(`${label}: default task row must have exactly one leading status control, got ${defaultCount}`);

  const selectionTrigger = page.getByRole("button", { name: "选择", exact: true });
  await selectionTrigger.click();
  await expectText('[aria-live="polite"]', "已选 0 项", `${label} selection count`);
  await expectVisible('button[aria-pressed="true"]', `${label} selection exit`);
  const selectedCount = await leadingControls();
  if (selectedCount !== 1) throw new Error(`${label}: selection-mode task row must have exactly one leading status control, got ${selectedCount}`);
  await page.getByRole("button", { name: "退出选择", exact: true }).click();
}

async function assertQuickCaptureContract(label) {
  const visibleFields = await page.locator('form input, form select, form textarea').evaluateAll((fields) => fields.filter((field) => {
    const style = getComputedStyle(field);
    return style.display !== "none" && style.visibility !== "hidden" && field.getClientRects().length > 0;
  }).filter((field) => field.closest("form")?.querySelector('[aria-label="添加任务"]')).length);
  if (visibleFields > 2) throw new Error(`${label}: Quick Capture exposes ${visibleFields} fields by default; expected at most 2`);
}

async function assertPlannerFieldSkin(label, scopeSelector) {
  const result = await page.locator(scopeSelector).evaluate((scope) => {
    const rootStyle = getComputedStyle(document.documentElement);
    const token = {
      field: rootStyle.getPropertyValue("--planner-field").trim(),
      hover: rootStyle.getPropertyValue("--planner-field-hover").trim(),
      focus: rootStyle.getPropertyValue("--planner-field-focus").trim(),
      line: rootStyle.getPropertyValue("--planner-field-line").trim(),
      lineStrong: rootStyle.getPropertyValue("--line-strong").trim(),
      accent: rootStyle.getPropertyValue("--accent").trim(),
      radius: rootStyle.getPropertyValue("--radius-sm").trim(),
    };
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;border:1px solid var(--planner-field-line);border-radius:var(--radius-sm)";
    document.body.append(probe);
    const resolveBackground = (property) => {
      probe.style.background = `var(${property})`;
      return getComputedStyle(probe).backgroundColor;
    };
    const approved = {
      background: resolveBackground("--planner-field"),
      hover: resolveBackground("--planner-field-hover"),
      focus: resolveBackground("--planner-field-focus"),
      line: getComputedStyle(probe).borderTopColor,
      lineStrong: (() => {
        probe.style.borderTopColor = "var(--line-strong)";
        return getComputedStyle(probe).borderTopColor;
      })(),
      accent: (() => {
        probe.style.borderTopColor = "var(--accent)";
        return getComputedStyle(probe).borderTopColor;
      })(),
      radius: getComputedStyle(probe).borderTopLeftRadius,
    };
    probe.remove();
    const fields = [...scope.querySelectorAll("input, select, textarea")].filter((field) => {
      const type = field.getAttribute("type");
      const style = getComputedStyle(field);
      return !["checkbox", "radio", "hidden"].includes(type || "") && style.display !== "none" && style.visibility !== "hidden" && field.getClientRects().length > 0;
    }).map((field) => {
      const fieldStyle = getComputedStyle(field);
      const dateTimeSurface = field instanceof HTMLInputElement
        && ["date", "time"].includes(field.type)
        && Number.parseFloat(fieldStyle.opacity) === 0
        && field.parentElement?.querySelector(':scope > output[aria-hidden="true"]');
      const surface = dateTimeSurface ? field.parentElement : field;
      const style = getComputedStyle(surface);
      const label = field.getAttribute("aria-label") || field.getAttribute("name") || field.tagName;
      return {
        label: dateTimeSurface ? `${label} date/time surface` : label,
        background: style.backgroundColor,
        borderWidth: style.borderTopWidth,
        borderColor: style.borderTopColor,
        borderRightColor: style.borderRightColor,
        borderBottomWidth: style.borderBottomWidth,
        borderBottomColor: style.borderBottomColor,
        borderLeftColor: style.borderLeftColor,
        radius: style.borderTopLeftRadius,
        variant: field.getAttribute("data-planner-field-variant") || "default",
        focused: document.activeElement === field || field.matches(":focus-visible"),
        hovered: field.matches(":hover") || surface.matches(":hover"),
      };
    });
    return { token, approved, fields };
  });
  if (!result.token.field || !result.token.hover || !result.token.focus || !result.token.line || !result.token.lineStrong || !result.token.accent || !result.token.radius) throw new Error(`${label}: Planner field tokens are unavailable: ${JSON.stringify(result.token)}`);
  const transparent = (color) => color === "rgba(0, 0, 0, 0)" || color === "transparent";
  const pureWhite = (color) => /rgba?\(255,\s*255,\s*255(?:,\s*1)?\)/.test(color) || /color\(srgb\s+1(?:\.0+)?\s+1(?:\.0+)?\s+1(?:\.0+)?(?:\s*\/\s*1(?:\.0+)?)?\)/.test(color);
  const invalid = result.fields.find((field) => {
    const approvedBackgrounds = [result.approved.background];
    if (field.focused) approvedBackgrounds.push(result.approved.focus);
    if (field.hovered) approvedBackgrounds.push(result.approved.hover);
    const invalidBackground = !field.background
      || pureWhite(field.background)
      || (!transparent(field.background) && !approvedBackgrounds.includes(field.background));
    if (field.variant === "underline") {
      const approvedBottomLines = field.focused ? [result.approved.line, result.approved.accent] : [result.approved.line];
      return invalidBackground
        || Number.parseFloat(field.radius) !== 0
        || !transparent(field.borderColor)
        || !transparent(field.borderRightColor)
        || !transparent(field.borderLeftColor)
        || field.borderBottomWidth === "0px"
        || !approvedBottomLines.includes(field.borderBottomColor);
    }
    const approvedLines = field.hovered ? [result.approved.line, result.approved.lineStrong] : [result.approved.line];
    return invalidBackground
      || field.borderWidth === "0px"
      || (!transparent(field.borderColor) && !approvedLines.includes(field.borderColor))
      || !field.radius
      || field.radius !== result.approved.radius;
  });
  if (invalid) throw new Error(`${label}: Planner field must match approved --planner-field/--planner-field-line/--radius-sm surface: ${JSON.stringify({ invalid, approved: result.approved })}`);
}

async function assertPlannerSingleColumn(label, scopeSelector, width) {
  const original = page.viewportSize();
  await page.setViewportSize({ width, height: original?.height || 844 });
  const overlapping = await page.locator(scopeSelector).evaluate((scope) => {
    const fields = [...scope.querySelectorAll("input, select, textarea")].filter((field) => {
      const type = field.getAttribute("type");
      const style = getComputedStyle(field);
      return !["checkbox", "radio", "hidden"].includes(type || "") && style.display !== "none" && field.getClientRects().length > 0;
    }).map((field) => ({ label: field.getAttribute("aria-label") || field.getAttribute("name") || field.tagName, rect: field.getBoundingClientRect().toJSON() }));
    for (let index = 0; index < fields.length; index += 1) for (let next = index + 1; next < fields.length; next += 1) {
      const a = fields[index].rect; const b = fields[next].rect;
      const verticalOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const horizontalGap = Math.max(a.left, b.left) - Math.min(a.right, b.right);
      if (verticalOverlap > 2 && horizontalGap > 2) return [fields[index].label, fields[next].label];
    }
    return null;
  });
  if (overlapping) throw new Error(`${label}: key form fields must form one column at ${width}px; overlapping fields: ${overlapping.join(" / ")}`);
  if (original) await page.setViewportSize(original);
}

async function assertNoPlannerOverlayIntersections(label, scopeSelector) {
  const collisions = await page.evaluate((selector) => {
    const visible = (element) => { const style = getComputedStyle(element); return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0; };
    const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
    const numericZIndex = (element) => {
      for (let current = element; current instanceof HTMLElement; current = current.parentElement) {
        const style = getComputedStyle(current);
        const value = Number(style.zIndex);
        if (style.zIndex !== "auto" && Number.isFinite(value)) return value;
      }
      return null;
    };
    const describe = (element) => element.getAttribute("aria-label") || element.id || element.className || element.tagName;
    const scope = document.querySelector(selector);
    if (!scope) return [`missing ${selector}`];
    const overlaySurface = scope.closest("[data-planner-surface]");
    let overlayLayer = overlaySurface;
    while (overlayLayer && getComputedStyle(overlayLayer).position !== "fixed") overlayLayer = overlayLayer.parentElement;
    const overlayZIndex = overlayLayer ? numericZIndex(overlayLayer) : null;
    const controls = [...scope.querySelectorAll("input, select, textarea, button, summary, a")].filter(visible);
    const persistent = [...document.querySelectorAll("*")].filter((element) => visible(element)
      && !element.matches("[data-planner-backdrop]")
      && !element.matches('[data-base-ui-inert][aria-hidden="true"][role="presentation"]')
      && ["fixed", "sticky"].includes(getComputedStyle(element).position));
    return persistent.flatMap((layer) => {
      const layerStyle = getComputedStyle(layer);
      const layerZIndex = numericZIndex(layer);
      const insideScope = scope.contains(layer);
      const insideOverlay = overlayLayer?.contains(layer) || layer.contains(overlayLayer);
      if (!insideScope && overlayLayer && !insideOverlay && overlayZIndex !== null && layerZIndex !== null && layerZIndex < overlayZIndex) return [];
      return controls.filter((control) => !layer.contains(control) && overlaps(layer.getBoundingClientRect(), control.getBoundingClientRect())).map((control) => `${describe(layer)} [position=${layerStyle.position}; z-index=${layerStyle.zIndex}; effective-z=${layerZIndex ?? "unknown"}; overlay-z=${overlayZIndex ?? "none"}] overlaps ${describe(control)}`);
    });
  }, scopeSelector);
  if (collisions.length) throw new Error(`${label}: persistent Planner layer overlaps an interactive field: ${collisions.join("; ")}`);
}

async function assertPlannerLocalizedCopy(label, scopeSelector) {
  const forbidden = await page.locator(scopeSelector).evaluate((scope) => {
    const textFields = [...scope.querySelectorAll("input, textarea")].filter((field) => {
      const style = getComputedStyle(field);
      if (style.display === "none" || style.visibility === "hidden" || field.getClientRects().length === 0) return false;
      return field instanceof HTMLTextAreaElement || ["text", "search", "email", "tel", "url"].includes(field.type);
    });
    const text = [scope.innerText, ...textFields.map((field) => `${field.getAttribute("placeholder") || ""} ${field.value || ""}`)].join(" ");
    const english = /\b(?:Today|Upcoming|Completed|Trash|Open|min|pending|leased|sent|failed|canceled|in_app|web_push|date-only)\b/i.exec(text)?.[0];
    const localeDate = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|mm\/dd\/yyyy/i.exec(text)?.[0];
    return { english, localeDate };
  });
  if (forbidden.english || forbidden.localeDate) throw new Error(`${label}: Planner visible text contains untranslated/status or locale date copy: ${JSON.stringify(forbidden)}`);
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
