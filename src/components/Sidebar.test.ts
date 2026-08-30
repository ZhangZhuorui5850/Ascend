import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyModulePrefs, getNavigation } from "./Sidebar";

const source = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");

describe("canonical information architecture", () => {
  it("keeps exactly five stable desktop primary destinations", () => {
    const primary = getNavigation("user").filter((item) => item.group === "主要");
    expect(primary.map((item) => [item.label, item.href])).toEqual([
      ["今天", "/"],
      ["任务", "/tasks"],
      ["学习", "/subjects"],
      ["复习", "/review"],
      ["资料", "/assets"],
    ]);
  });

  it("keeps primary destinations visible when optional modules are disabled", () => {
    const visible = applyModulePrefs(getNavigation("user"), [
      { key: "subjects", enabled: false },
      { key: "mistakes", enabled: false },
      { key: "mock-exams", enabled: false },
      { key: "assets", enabled: false },
      { key: "analytics", enabled: false },
    ]);
    expect(visible.filter((item) => item.group === "主要").map((item) => item.label))
      .toEqual(["今天", "任务", "学习", "复习", "资料"]);
    expect(visible.some((item) => item.href === "/mistakes")).toBe(false);
  });

  it("highlights calendar and mistakes as their own destinations", () => {
    expect(source).toContain('activeAliases: ["/day"]');
    expect(source).not.toContain('activeAliases: ["/calendar"]');
    expect(source).not.toContain('activeAliases: ["/mistakes"]');
    expect(source).not.toContain("parentActiveOnly");
    const calendar = getNavigation("user").find((item) => item.href === "/calendar");
    const mistakes = getNavigation("user").find((item) => item.href === "/mistakes");
    expect(calendar?.label).toBe("日历");
    expect(mistakes?.label).toBe("错题本");
  });
});
