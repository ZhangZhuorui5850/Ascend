"use client";

import { startTransition, useState } from "react";
import { BarChart3, BookOpen, GraduationCap, HardDrive, Tag, type LucideIcon } from "lucide-react";
import { saveModulePrefsAction } from "@/app/actions/settings";
import { useFeedback } from "@/components/FeedbackProvider";
import type { ModuleKey, ModulePref } from "@/lib/repo/settings";

const MODULE_META: Record<ModuleKey, { label: string; description: string; icon: LucideIcon }> = {
  subjects: { label: "知识体系", description: "科目、章节与知识点管理", icon: BookOpen },
  mistakes: { label: "错题本", description: "复习中的错题登记与间隔重练", icon: Tag },
  "mock-exams": { label: "模考冲刺", description: "模考成绩记录与冲刺分析", icon: GraduationCap },
  assets: { label: "资料", description: "文件、截图与学习资料", icon: HardDrive },
  analytics: { label: "学习分析", description: "学习时长与趋势统计", icon: BarChart3 },
};
const OPTIONAL_MORE_KEYS = new Set<ModuleKey>(["mistakes", "mock-exams", "analytics"]);

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
      } catch (error) {
        console.error("保存模块设置失败", error);
        setPrefs(previous);
        notify("网络异常，设置未保存", "error");
      }
    });
  }

  function toggle(key: ModuleKey) {
    save(prefs.map((pref) => (pref.key === key ? { ...pref, enabled: !pref.enabled } : pref)));
  }

  return (
    <div className="card settingsModules">
      <p className="settingsModulesIntro">
        今天、计划、学习、复习与资料是稳定主入口。这里的偏好只影响“更多”中的可选模块。
      </p>
      <div className="settingsModulesList">
        {prefs.filter((pref) => OPTIONAL_MORE_KEYS.has(pref.key)).map((pref) => {
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
