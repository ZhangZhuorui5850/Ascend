"use client";

import { useEffect, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";

const OPTIONS: Array<{ value: Theme; label: string; hint: string; icon: typeof Sun }> = [
  { value: "system", label: "跟随系统", hint: "白天浅色、夜间深色，随系统切换", icon: Laptop },
  { value: "light", label: "浅色", hint: "固定使用浅色主题", icon: Sun },
  { value: "dark", label: "深色", hint: "固定使用深色主题", icon: Moon },
];

/** 与顶栏 ThemeSwitcher 共用 zgca-theme localStorage 和 data-theme 属性。 */
export function AppearanceSection() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem("zgca-theme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      window.setTimeout(() => setTheme(stored), 0);
    }
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    localStorage.setItem("zgca-theme", next);
    if (next === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <section className="card" aria-label="主题">
      <div className="sectionTitle">
        <h2>主题</h2>
        <span className="sectionHint">只影响当前浏览器</span>
      </div>
      <div className="themeOptions" role="radiogroup" aria-label="主题选择">
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
  );
}
