# 登峰 / Ascend 品牌资产体系

所有资产由 `node scripts/render-brand.mjs` 从同一套几何生成。**改设计只改脚本，不要手改产物。**

## 三种形态，各司其职

| 形态 | 文件 | 用在哪 |
|---|---|---|
| **Mark（图形独用）** | `<skin>/mark.svg` · `mark-512.png` | 头像、水印、收起的侧栏、社交小图、任何空间紧张处 |
| **横版锁定稿** | `<skin>/lockup-h.svg` · `.png` | 页眉、邮件签名、文档页脚、宽幅场景 |
| **竖版锁定稿** | `<skin>/lockup-v.svg` · `.png` | 登录页、启动屏、海报封面、居中场景 |

规则：
- 有字标就不再另配文字；mark 独用时旁边可以排自己的文字。
- 最小尺寸：mark ≥ 20px 高；锁定稿 ≥ 120px 宽。再小只用 mark。
- 不要拉伸、改色、加描边、加投影。要新配色 → 加进脚本的 `SKINS` 重新生成。

## 皮肤对应

五个目录与 `src/styles/tokens.css` 的皮肤一一对应：
`default`（朱砂手帐）· `aurora`（极光）· `brutal`（硬核）· `cloud`（云端）· `terminal`（终端）。

- **站内界面**不用这些静态文件——用 `<BrandLogo>` 组件（`src/components/BrandLogo.tsx`），
  颜色吃 CSS 变量，换肤/明暗自动跟随。
- **对外物料**（社交、文档、宣传）按内容气质挑皮肤目录，拿不准就用 `default`。

## 系统级图标（固定朱砂色，不随皮肤）

浏览器标签、手机桌面、Windows 磁贴看不到页面主题，统一用默认朱砂色：

| 文件 | 用途 |
|---|---|
| `src/app/icon.svg` | 浏览器标签页 favicon（Next.js 约定） |
| `src/app/apple-icon.png` | iOS 主屏（180，满铺，系统自己切圆角） |
| `public/icons/icon-192.png` / `icon-512.png` | PWA 常规图标（圆角瓦片） |
| `public/icons/icon-maskable-512.png` | PWA maskable（满铺 + 内容缩进安全区，安卓裁圆用） |
| `public/icons/app-icon.svg` | 上述图标的矢量主源 |

SVG 里的字标依赖本机字体（Bahnschrift / Noto Serif SC），跨平台分享时优先用 PNG。
