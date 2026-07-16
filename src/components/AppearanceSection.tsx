"use client";

import { useEffect, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";
type Skin = "default" | "aurora" | "brutal" | "cloud" | "terminal";

const OPTIONS: Array<{ value: Theme; label: string; hint: string; icon: typeof Sun }> = [
  { value: "system", label: "跟随系统", hint: "白天浅色、夜间深色，随系统切换", icon: Laptop },
  { value: "light", label: "浅色", hint: "固定使用浅色主题", icon: Sun },
  { value: "dark", label: "深色", hint: "固定使用深色主题", icon: Moon },
];

/** 风格包，swatch 为该风格代表色 [底色, 点色, 高光]，与 tokens.css 中 data-skin 定义一致 */
const SKINS: Array<{ value: Skin; label: string; hint: string; swatch: [string, string, string] }> = [
  { value: "default", label: "朱砂手帐", hint: "宣纸墨色，朱砂印章红", swatch: ["#f2eee3", "#b13a20", "#262015"] },
  { value: "aurora", label: "曜夜极光", hint: "玻璃拟态，极光渐变氛围", swatch: ["#0b0d17", "#a095ff", "#146b9e"] },
  { value: "brutal", label: "新粗野", hint: "黑框硬影，酸性荧光", swatch: ["#f4f1e6", "#b73500", "#d3f524"] },
  { value: "cloud", label: "云软", hint: "无边悬浮，奶油软阴影", swatch: ["#f2f5fb", "#1f65b5", "#ffbdb0"] },
  { value: "terminal", label: "终端磷光", hint: "CRT 扫描线，等宽提示符", swatch: ["#0a0f0b", "#35d883", "#cdeed6"] },
];

const SKIN_VALUES = new Set(SKINS.map((skin) => skin.value));

/** 与顶栏 ThemeSwitcher 共用 zgca-theme localStorage 和 data-theme 属性；配色走 zgca-skin/data-skin。 */
export function AppearanceSection() {
  const [theme, setTheme] = useState<Theme>("system");
  const [skin, setSkin] = useState<Skin>("default");

  useEffect(() => {
    const stored = localStorage.getItem("zgca-theme");
    const storedSkin = localStorage.getItem("zgca-skin");
    window.setTimeout(() => {
      if (stored === "light" || stored === "dark" || stored === "system") setTheme(stored);
      if (storedSkin && SKIN_VALUES.has(storedSkin as Skin)) setSkin(storedSkin as Skin);
    }, 0);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    localStorage.setItem("zgca-theme", next);
    if (next === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", next);
  }

  function applySkin(next: Skin) {
    setSkin(next);
    localStorage.setItem("zgca-skin", next);
    if (next === "default") document.documentElement.removeAttribute("data-skin");
    else document.documentElement.setAttribute("data-skin", next);
  }

  return (
    <>
      <section className="card" aria-label="明暗模式">
        <div className="sectionTitle">
          <h2>明暗模式</h2>
          <span className="sectionHint">只影响当前浏览器</span>
        </div>
        <div className="themeOptions" role="radiogroup" aria-label="明暗模式">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                aria-checked={theme === option.value}
                className={`themeOption ${theme === option.value ? "isActive" : ""}`}
                key={option.value}
                onClick={() => apply(option.value)}
                role="radio"
                type="button"
              >
                <Icon size={17} />
                <span className="themeOptionCopy">
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="card" aria-label="配色方案">
        <div className="sectionTitle">
          <h2>配色方案</h2>
          <span className="sectionHint">与明暗模式可自由组合</span>
        </div>
        <div className="themeOptions" role="radiogroup" aria-label="配色方案">
          {SKINS.map((option) => (
            <button
              aria-checked={skin === option.value}
              className={`themeOption ${skin === option.value ? "isActive" : ""}`}
              key={option.value}
              onClick={() => applySkin(option.value)}
              role="radio"
              type="button"
            >
              <span aria-hidden className="skinSwatch">
                {option.swatch.map((color) => (
                  <i key={color} style={{ background: color }} />
                ))}
              </span>
              <span className="themeOptionCopy">
                <strong>{option.label}</strong>
                <small>{option.hint}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
