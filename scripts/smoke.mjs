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

const BASE = process.env.SMOKE_URL || "http://localhost:3105";
const marker = Date.now().toString(36);
const results = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (err) => results.push(["PAGEERROR", err.message]));

function ok(name, condition, extra = "") {
  results.push([condition ? "PASS" : "FAIL", name, extra]);
}

try {
  // 1. unauthenticated redirect
  await page.goto(`${BASE}/calendar`);
  await page.waitForURL("**/login**", { timeout: 10000 });
  ok("redirects to login", page.url().includes("/login"), page.url());

  // 2. login via server action form
  await page.fill('input[name="email"]', env.APP_LOGIN_EMAIL);
  await page.fill('input[name="password"]', env.APP_LOGIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/calendar", { timeout: 15000 });
  ok("login lands back on calendar", page.url().includes("/calendar"));

  // 3. home renders clock + settings countdown flow
  await page.goto(BASE);
  await page.waitForSelector(".homeFocus, .onboardingPane", { timeout: 10000 });
  if (page.url().includes("/onboarding")) {
    await page.fill(".onboardingPane textarea", "冒烟测试学习目标");
    await page.click('.onboardingActions button:has-text("下一步")');
    await page.click('.onboardingActions button:has-text("下一步")');
    await page.click('.onboardingActions button:has-text("下一步")');
    await page.click('.onboardingActions button:has-text("保存并进入工作台")');
    await page.waitForURL(BASE + "/", { timeout: 10000 });
    ok("onboarding completes", true);
  }
  await page.waitForSelector(".homeFocus");
  await page.waitForFunction(() => /\d{2}:\d{2}:\d{2}/.test(document.querySelector(".homeClock strong")?.textContent || ""));
  ok("home renders live clock", true);

  await page.goto(`${BASE}/settings`);
  await page.fill('.countdownEditorRow input[aria-label="考试名称"] >> nth=0', "冒烟考试");
  await page.fill('.countdownEditorRow input[aria-label="考试日期"] >> nth=0', "2026-09-01");
  await page.click('button:has-text("保存设置")');
  await page.waitForSelector(".saveStatus.save-saved", { timeout: 10000 });
  ok("settings save countdown", true);
  await page.goto(BASE);
  await page.waitForSelector('.countdownChip:has-text("冒烟考试")', { timeout: 10000 });
  ok("home shows exam countdown", true);

  await page.click('.homeFocusActions .primaryButton');
  await page.waitForURL("**/day/**");
  ok("home CTA enters today workspace", /\/day\/\d{4}-\d{2}-\d{2}/.test(page.url()), page.url());
  const dayUrl = page.url();

  // 4a. tasks: add, tag, toggle
  const taskName = `冒烟任务-${marker}`;
  await page.fill(".taskComposerTitle", taskName);
  await page.selectOption('.taskCreate select[aria-label="科目标签"]', { index: 1 });
  await page.selectOption('.taskCreate select[aria-label="任务优先级"]', "1");
  await page.selectOption('.taskCreate select[aria-label="预计时长"]', "45");
  await page.fill('.taskCreate input[aria-label="计划开始时间"]', "09:30");
  await page.click('.taskCreate button[aria-label="添加任务"]');
  await page.waitForFunction((name) => Array.from(document.querySelectorAll(".taskTitle")).some((node) => node.value === name), taskName);
  const smokeTaskIndex = await page.locator(".taskLine").evaluateAll((rows, name) => rows.findIndex((row) => row.querySelector(".taskTitle")?.value === name), taskName);
  const smokeTask = page.locator(".taskLine").nth(smokeTaskIndex);
  ok("task created", true);
  ok("task schedule metadata renders", await smokeTask.locator('.taskTiming:has-text("09:30 · 45m")').count() === 1);
  await smokeTask.locator(".taskExpand").click();
  ok("task detail editor expands", await smokeTask.locator(".taskLineDetails").isVisible());
  await smokeTask.locator(".taskCheck").click();
  await smokeTask.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction((name) => Array.from(document.querySelectorAll(".taskLine.done .taskTitle")).some((node) => node.value === name), taskName);
  ok("task toggled done", true);

  const inboxTaskName = `待排任务-${marker}`;
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  await page.fill(".taskComposerTitle", inboxTaskName);
  const composerStart = page.locator('.taskCreate input[aria-label="计划开始时间"]');
  await composerStart.fill("");
  await page.waitForFunction(() => document.querySelector('.taskCreate input[aria-label="计划开始时间"]')?.value === "");
  await page.click('.taskCreate button[aria-label="添加任务"]');
  await page.waitForFunction((name) => Array.from(document.querySelectorAll(".taskTitle")).some((node) => node.value === name), inboxTaskName);
  ok("unscheduled task created", true);

  // 4b. notes: add a tip card
  await page.fill(".noteCard.composer textarea", "冒烟随笔：一个小想法");
  await page.click(".noteCard.composer .noteAdd");
  await page.waitForFunction(() => document.querySelectorAll(".noteGrid .noteCard").length >= 2, { timeout: 10000 });
  ok("note card created", true);

  // 4c. journal autosave
  await page.fill(".dayJournal textarea >> nth=0", `冒烟总结 ${Date.now()}`);
  await page.waitForSelector(".dayJournal .saveStatus.save-saved", { timeout: 10000 });
  ok("day journal autosaves", true);

  // 5. quick log a study session
  await page.fill(".quickLogForm input >> nth=0", "冒烟学习记录");
  await page.click(".quickLogRow .primaryButton");
  await page.waitForSelector('.listRow:has-text("冒烟学习记录")', { timeout: 10000 });
  ok("quick log adds study session", true);

  // 6. quick log a mistake
  await page.click('.segmented button:has-text("错题")');
  await page.fill(".quickLogForm input >> nth=0", "冒烟错题");
  await page.click('.quickLogRow .primaryButton:has-text("记错题")');
  await page.waitForSelector('.listRow:has-text("冒烟错题")', { timeout: 10000 });
  ok("quick log adds mistake", true);

  // 7. subjects page
  await page.goto(`${BASE}/subjects`);
  await page.waitForSelector(".subjectCard");
  const subjectCount = await page.locator(".subjectCard").count();
  ok("subjects list renders", subjectCount >= 7, `count=${subjectCount}`);

  // 8. subject detail: add chapter + point
  await page.click(".subjectCard >> nth=0");
  await page.waitForSelector(".subjectWorkbench");
  const chapterName = `冒烟章节${Date.now() % 10000}`;
  await page.fill(".chapterCreate input", chapterName);
  await page.click('.chapterCreate button:has-text("添加章节")');
  await page.waitForSelector(`.chapterHead input[value="${chapterName}"]`, { timeout: 10000 });
  ok("chapter created", true);
  const block = page.locator(".chapterBlock", { has: page.locator(`input[value="${chapterName}"]`) });
  await block.locator(".pointCreate input").fill("冒烟知识点");
  await block.locator(".pointCreate button").click();
  await page.locator('.pointTitle.pointTitleView', { hasText: "冒烟知识点" }).first().waitFor({ timeout: 10000 });
  ok("point created", true);

  // 9. delete the chapter again (cascade)
  await block.locator(".chapterTools .iconDanger").click();
  await page.locator(".confirmDialog .dangerButton").click();
  await page.waitForSelector(`.chapterHead input[value="${chapterName}"]`, { state: "detached", timeout: 10000 });
  ok("chapter cascade delete", true);

  // 10. library: create folder, upload file, rename, move, delete
  await page.goto(`${BASE}/assets`);
  await page.waitForSelector(".driveExplorer");
  await page.click('button:has-text("新建文件夹")');
  const folderName = `冒烟目录-${marker}`;
  await page.fill(".driveRow.creating input", folderName);
  await page.keyboard.press("Enter");
  await page.waitForSelector(`.driveName:has-text("${folderName}")`, { timeout: 10000 });
  ok("folder created", true);

  const fileInput = page.locator('.driveExplorer input[type="file"]');
  const uploadName = `smoke-upload-${marker}.txt`;
  await fileInput.setInputFiles({ name: uploadName, mimeType: "text/plain", buffer: Buffer.from("hello ascend") });
  await page.waitForSelector(`.driveRow:has-text("${uploadName}")`, { timeout: 15000 });
  ok("file uploaded to current folder", true);

  // open folder via click, then go back to root via breadcrumb root button
  await page.click(`.driveName.asButton:has-text("${folderName}")`);
  await page.waitForURL("**/assets?folder=**");
  ok("folder navigation via URL", decodeURIComponent(page.url()).includes(folderName), page.url());
  await page.click('.drivePath button:has-text("资料库")');
  await page.waitForURL("**/assets");

  // search
  await page.fill('.driveSearch input', uploadName);
  await page.press('.driveSearch input', "Enter");
  await page.waitForURL("**/assets?q=**");
  await page.waitForSelector(`.driveRow:has-text("${uploadName}")`);
  ok("search finds uploaded file", true);
  await page.goto(`${BASE}/assets`);

  // delete file
  const fileRow = page.locator(`.driveRow:has-text("${uploadName}")`);
  await fileRow.hover();
  await fileRow.locator('button[aria-label="删除文件"]').click();
  await page.locator(".confirmDialog .dangerButton").click();
  await page.waitForSelector(`.driveRow:has-text("${uploadName}")`, { state: "detached", timeout: 10000 });
  ok("file deleted", true);

  // delete folder
  const folderRow = page.locator(`.driveRow:has(.driveName:has-text("${folderName}"))`);
  await folderRow.hover();
  await folderRow.locator('button[aria-label="删除文件夹"]').click();
  await page.locator(".confirmDialog .dangerButton").click();
  await page.waitForSelector(`.driveName:has-text("${folderName}")`, { state: "detached", timeout: 10000 });
  ok("empty folder deleted", true);

  // 11. mistakes page shows the smoke mistake in open queue (next_review = tomorrow)
  await page.goto(`${BASE}/mistakes`);
  await page.waitForSelector(".pageHeader");
  const hasMistake = await page.locator('.listRow:has-text("冒烟错题"), .queueCard:has-text("冒烟错题")').count();
  ok("mistake book lists new mistake", hasMistake > 0, `count=${hasMistake}`);

  // 12. analytics renders
  await page.goto(`${BASE}/analytics`);
  await page.waitForSelector(".metricGrid");
  ok("analytics renders", true);

  // 13. calendar renders with fullcalendar
  await page.goto(`${BASE}/calendar`);
  await page.waitForSelector(".fc-daygrid", { timeout: 10000 });
  ok("calendar renders", true);
  await page.waitForSelector(`.calendarInboxTask:has-text("${inboxTaskName}")`, { timeout: 10000 });
  ok("calendar inbox receives unscheduled task", true);

  // 14. capture panel: upload via panel with subject binding
  await page.goto(dayUrl);
  await page.waitForSelector(".capturePanel", { state: "attached" });
  await page.click(".captureFab");
  await page.waitForSelector(".captureOpen .capturePanel");
  const panelInput = page.locator('.capturePanel input[type="file"]:not([capture]):not([accept])');
  await panelInput.setInputFiles({ name: "capture-smoke.png", mimeType: "image/png", buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) });
  await page.selectOption(".capturePanel select >> nth=0", { index: 1 });
  await page.click(".sendCapture");
  await page.waitForSelector(".attachmentStatus.status-uploaded", { timeout: 15000 });
  ok("capture panel uploads with subject binding", true);
  await page.waitForSelector('.assetRow:has-text("capture-smoke.png")', { timeout: 10000 });
  ok("day page shows captured asset", true);

  // 15. logout
  await page.click(".capturePanel .captureClose");
  await page.click(".sidebarFooterActions form button");
  await page.waitForURL("**/login", { timeout: 10000 });
  ok("logout returns to login", true);
} catch (error) {
  results.push(["ERROR", error.message.slice(0, 300)]);
  try {
    await page.screenshot({ path: "smoke-fail.png", fullPage: true });
    results.push(["INFO", `url=${page.url()}`]);
  } catch {}
}

await browser.close();
for (const row of results) console.log(row.join(" | "));
const failed = results.filter((r) => r[0] === "FAIL" || r[0] === "ERROR" || r[0] === "PAGEERROR").length;
process.exit(failed ? 1 : 0);
