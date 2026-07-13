// 登峰 / Ascend 品牌资产生成器 —— 单一源头
// 跑法：node scripts/render-brand.mjs
// 依赖 Playwright Chromium（PNG 渲染用系统字体 Bahnschrift / Noto Serif SC）
//
// 产物一览：
//   public/brand/<skin>/mark.svg        图形徽标（透明底，独用）
//   public/brand/<skin>/lockup-h.svg    横版锁定稿（徽标+字标）
//   public/brand/<skin>/lockup-v.svg    竖版锁定稿
//   public/brand/<skin>/mark-512.png    透明底位图
//   public/brand/<skin>/lockup-h.png    带底色位图（2x）
//   public/brand/<skin>/lockup-v.png    带底色位图（2x）
//   src/app/icon.svg                    浏览器标签页 favicon（朱砂默认色瓦片）
//   src/app/apple-icon.png              iOS 主屏（180，满铺）
//   public/icons/icon-192.png           PWA any
//   public/icons/icon-512.png           PWA any
//   public/icons/icon-maskable-512.png  PWA maskable（满铺+安全区）
//   public/icons/app-icon.svg           系统图标主源（朱砂瓦片版）
//
// 站内自适应 logo 不在此列 —— 见 src/components/BrandLogo.tsx（CSS 变量驱动）。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SANS = "'Bahnschrift','Segoe UI Semibold','Segoe UI',sans-serif";
const SERIF_CN = "'Noto Serif SC','Source Han Serif SC','Songti SC','SimSun',serif";

/* ---------- 几何（mark 网格 0..500 × 0..340）---------- */
const GEO = {
  ridgeL: "M0,332 L172,112 L272,252 L164,332 Z",
  ridgeR: "M500,332 L368,148 L272,252 L404,332 Z",
  peak: "M16,332 L248,0 L480,332 Z",
  snow: "M248,0 L192,108 L248,84 L304,108 Z",
  route: "M140,332 L216,240 L180,220 L248,128 L248,84",
};

/* ---------- 五套皮肤（与 src/styles/tokens.css 对应，亮色取值）---------- */
const SKINS = [
  { name: "default", label: "默认 · 朱砂手帐",
    bg: "#f2eee3", peak: ["#3a3226", "#1f1a10"], ridgeL: "#d8cfc0", ridgeR: "#b3a68e",
    snow: "#faf7ef", route: "#b13a20", ink: "#262015", sub: "#8d8474" },
  { name: "aurora", label: "aurora · 极光",
    bg: "#eef0f8", peak: ["#303a66", "#181d33"], ridgeL: "#c3c9e6", ridgeR: "#9aa3cf",
    snow: "#ffffff", route: "#6455e8", ink: "#1d2030", sub: "#8a8fa8" },
  { name: "brutal", label: "brutal · 硬核",
    bg: "#f4f1e6", peak: ["#2a2a2a", "#0f0f0f"], ridgeL: "#cfc9b8", ridgeR: "#a39c86",
    snow: "#fbf9f0", route: "#e04400", ink: "#141414", sub: "#8f8a7a" },
  { name: "cloud", label: "cloud · 云端",
    bg: "#f2f5fb", peak: ["#33405f", "#1a2033"], ridgeL: "#ccd7ea", ridgeR: "#9fb1d1",
    snow: "#ffffff", route: "#2f7cd6", ink: "#252b3d", sub: "#8b94a8" },
  { name: "terminal", label: "terminal · 终端",
    bg: "#f0f2ec", peak: ["#1f4030", "#0e2318"], ridgeL: "#c6d4c4", ridgeR: "#93ab94",
    snow: "#f8faf4", route: "#0c7a44", ink: "#17301f", sub: "#7f907f" },
];
const DEFAULT = SKINS[0];

/* ---------- 部件 ---------- */
// 图形本体。simplified：去远山、加粗路线（小尺寸/图标用）
function markBody(p, id, { simplified = false } = {}) {
  return `
  <defs><linearGradient id="pk${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${p.peak[0]}"/><stop offset="1" stop-color="${p.peak[1]}"/>
  </linearGradient></defs>
  ${simplified ? "" : `<path d="${GEO.ridgeL}" fill="${p.ridgeL}"/><path d="${GEO.ridgeR}" fill="${p.ridgeR}"/>`}
  <path d="${GEO.peak}" fill="url(#pk${id})"/>
  <path d="${GEO.snow}" fill="${p.snow}"/>
  <path d="${GEO.route}" fill="none" stroke="${p.route}" stroke-width="${simplified ? 26 : 16}"
        stroke-linecap="round" stroke-linejoin="round"/>`;
}

function markSVG(p) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 520 360">${markBody(p, "m")}</svg>`;
}

function lockupV(p, { withBg = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 520">
  ${withBg ? `<rect width="560" height="520" fill="${p.bg}"/>` : ""}
  <g transform="translate(60,28) scale(0.88)">${markBody(p, "v")}</g>
  <text x="280" y="415" fill="${p.ink}" font-family="${SANS}" font-size="62" font-weight="700"
        letter-spacing="5" text-anchor="middle">ASCEND</text>
  <text x="286" y="470" fill="${p.sub}" font-family="${SERIF_CN}" font-size="22" font-weight="600"
        letter-spacing="12" text-anchor="middle">登 峰</text>
</svg>`;
}

function lockupH(p, { withBg = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 250">
  ${withBg ? `<rect width="780" height="250" fill="${p.bg}"/>` : ""}
  <g transform="translate(24,22) scale(0.6)">${markBody(p, "h")}</g>
  <text x="356" y="128" fill="${p.ink}" font-family="${SANS}" font-size="74" font-weight="700"
        letter-spacing="5">ASCEND</text>
  <text x="360" y="186" fill="${p.sub}" font-family="${SERIF_CN}" font-size="26" font-weight="600"
        letter-spacing="10">登 峰 · 学习工作台</text>
</svg>`;
}

/* ---------- 系统图标（固定朱砂默认色）---------- */
// tile：圆角纸底瓦片（favicon / PWA any）；bleed：满铺（maskable / apple）
function osIcon({ bleed = false, safe = false } = {}) {
  const scale = safe ? 0.56 : 0.72;
  const w = 500 * scale, h = 340 * scale;
  const x = (512 - w) / 2, y = (512 - h) / 2 + (safe ? 6 : 8);
  const shape = bleed
    ? `<rect width="512" height="512" fill="url(#paper)"/>`
    : `<rect x="16" y="16" width="480" height="480" rx="112" fill="url(#paper)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f7f3e8"/><stop offset="1" stop-color="#ece5d2"/>
  </linearGradient></defs>
  ${shape}
  <g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${scale})">${markBody(DEFAULT, "i", { simplified: true })}</g>
</svg>`;
}

/* ---------- 生成 ---------- */
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });

async function shot(svg, w, h, file, { transparent = false } = {}) {
  await page.setViewportSize({ width: w, height: h });
  const html = `<!doctype html><meta charset=utf-8><style>*{margin:0;padding:0}
    html,body{width:${w}px;height:${h}px;background:${transparent ? "transparent" : "#fff"}}
    svg{display:block;width:${w}px;height:${h}px}</style>${svg}`;
  await page.goto("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(file, await page.screenshot({ omitBackground: transparent, type: "png" }));
  console.log("png ", file.replace(ROOT + "\\", ""));
}

for (const p of SKINS) {
  const dir = `${ROOT}/public/brand/${p.name}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/mark.svg`, markSVG(p));
  writeFileSync(`${dir}/lockup-h.svg`, lockupH(p));
  writeFileSync(`${dir}/lockup-v.svg`, lockupV(p));
  console.log("svg ", `public/brand/${p.name}/{mark,lockup-h,lockup-v}.svg`);
  await shot(markSVG(p), 512, 355, `${dir}/mark-512.png`, { transparent: true });
  await shot(lockupV(p, { withBg: true }), 560, 520, `${dir}/lockup-v.png`);
  await shot(lockupH(p, { withBg: true }), 780, 250, `${dir}/lockup-h.png`);
}

// 系统级图标（朱砂默认）
const tile = osIcon();
writeFileSync(`${ROOT}/src/app/icon.svg`, tile);
writeFileSync(`${ROOT}/public/icons/app-icon.svg`, tile);
const page1 = await browser.newPage({ deviceScaleFactor: 1 });

async function shot1(svg, size) {
  await page1.setViewportSize({ width: size, height: size });
  const html = `<!doctype html><meta charset=utf-8><style>*{margin:0;padding:0}html,body{width:${size}px;height:${size}px;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`;
  await page1.goto("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await page1.evaluate(() => document.fonts.ready);
  return page1.screenshot({ omitBackground: true, type: "png" });
}

{
  const shots = [
    [tile, 192, `${ROOT}/public/icons/icon-192.png`],
    [tile, 512, `${ROOT}/public/icons/icon-512.png`],
    [osIcon({ bleed: true, safe: true }), 512, `${ROOT}/public/icons/icon-maskable-512.png`],
    [osIcon({ bleed: true }), 180, `${ROOT}/src/app/apple-icon.png`],
  ];
  for (const [svg, size, file] of shots) {
    writeFileSync(file, await shot1(svg, size));
    console.log("png ", file.replace(ROOT + "\\", ""));
  }
}

// favicon.ico：16/32/48 三帧 PNG 装 ICO 容器（现代浏览器均支持 PNG 帧）
function packIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);              // type: icon
  header.writeUInt16LE(frames.length, 4);
  const entries = [];
  let offset = 6 + 16 * frames.length;
  for (const { size, buf } of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);             // planes
    entry.writeUInt16LE(32, 6);            // bpp
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buf.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...frames.map((f) => f.buf)]);
}

{
  const frames = [];
  for (const size of [16, 32, 48]) frames.push({ size, buf: await shot1(tile, size) });
  writeFileSync(`${ROOT}/src/app/favicon.ico`, packIco(frames));
  console.log("ico ", "src/app/favicon.ico");
}

await browser.close();
console.log("done.");
