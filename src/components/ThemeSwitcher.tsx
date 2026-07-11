"use client";

import { useEffect, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";

const nextTheme: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const labels: Record<Theme, string> = { system: "跟随系统", light: "浅色模式", dark: "深色模式" };

export function ThemeSwitcher() {
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
    else document.documentElement.dataset.theme = next;
  }

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Laptop;
  return (
    <button aria-label={`${labels[theme]}，点击切换`} className="topbarIconButton" onClick={() => apply(nextTheme[theme])} title={labels[theme]} type="button">
      <Icon size={17} />
    </button>
  );
}
