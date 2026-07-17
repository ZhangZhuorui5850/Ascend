"use client";

import { startTransition, useState } from "react";
import { ArrowDown, ArrowUp, BarChart3, BookOpen, GraduationCap, HardDrive, Tag, type LucideIcon } from "lucide-react";
import { saveModulePrefsAction } from "@/app/actions/settings";
import { useFeedback } from "@/components/FeedbackProvider";
import type { ModuleKey, ModulePref } from "@/lib/repo/settings";

const MODULE_META: Record<ModuleKey, { label: string; description: string; icon: LucideIcon }> = {
  subjects: { label: "知识体系", description: "科目、章节与知识点管理", icon: BookOpen },
  mistakes: { label: "错题回炉", description: "错题登记与间隔重练", icon: Tag },
  "mock-exams": { label: "模考冲刺", description: "模考成绩记录与冲刺分析", icon: GraduationCap },
  assets: { label: "资料库", description: "文件、截图与学习资料收纳", icon: HardDrive },
  analytics: { label: "学习分析", description: "学习时长与趋势统计", icon: BarChart3 },
};

export function ModulesSection({ initial }: { initial: ModulePref[] }) {
  const { notify } = useFeedback();
  const [prefs, setPrefs] = useState(initial);

  // 本地状态即时生效，落库失败再回滚；导航（侧栏/底部栏）由 action 的 layout 回流同步更新
  function save(next: ModulePref[]) {
    const previous = prefs;
    setPrefs(next);
    startTransition(async () => {
      try {
        const result = await saveModulePrefsAction({ modulePrefs: next });
        if (!result.ok) {
          setPrefs(previous);
          notify(result.error || "保存失败", "error");
        }
      } catch {
        setPrefs(previous);
        notify("网络异常，设置未保存", "error");
      }
    });
  }

  function toggle(key: ModuleKey) {
    save(prefs.map((pref) => (pref.key === key ? { ...pref, enabled: !pref.enabled } : pref)));
  }

  function move(key: ModuleKey, delta: -1 | 1) {
    const index = prefs.findIndex((pref) => pref.key === key);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= prefs.length) return;
    const next = [...prefs];
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
  }

  return (
    <div className="card settingsModules">
      <p className="settingsModulesIntro">
        关闭不需要的功能板块后，它会从侧栏、底部导航和命令面板中隐藏；上下箭头调整显示顺序。总览、今日执行与学习日历为核心板块，始终可见。
      </p>
      <div className="settingsModulesList">
        {prefs.map((pref, index) => {
          const meta = MODULE_META[pref.key];
          const Icon = meta.icon;
          return (
            <div className={pref.enabled ? "settingsModuleRow" : "settingsModuleRow off"} key={pref.key}>
              <Icon size={17} />
              <div>
                <strong>{meta.label}</strong>
                <small>{meta.description}</small>
              </div>
              <div className="settingsModuleTools">
                <button
                  aria-label={`上移${meta.label}`}
                  disabled={index === 0}
                  onClick={() => move(pref.key, -1)}
                  type="button"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  aria-label={`下移${meta.label}`}
                  disabled={index === prefs.length - 1}
                  onClick={() => move(pref.key, 1)}
                  type="button"
                >
                  <ArrowDown size={14} />
                </button>
                <label className="settingsModuleSwitch">
                  <input
                    aria-label={`${pref.enabled ? "关闭" : "开启"}${meta.label}`}
                    checked={pref.enabled}
                    onChange={() => toggle(pref.key)}
                    type="checkbox"
                  />
                  <span />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
