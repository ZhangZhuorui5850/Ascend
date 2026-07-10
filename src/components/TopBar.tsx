"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, Settings, Users } from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

const routeTitles: Array<[RegExp, string, string]> = [
  [/^\/$/, "主页", "学习概览"],
  [/^\/day\//, "今日工作台", "计划、执行与复盘"],
  [/^\/calendar/, "日历", "学习节奏"],
  [/^\/subjects\//, "知识详情", "科目与知识点"],
  [/^\/subjects/, "科目", "知识体系"],
  [/^\/assets/, "资料库", "文件与关联"],
  [/^\/mistakes/, "错题本", "回炉与毕业"],
  [/^\/analytics/, "统计", "趋势与弱点"],
  [/^\/settings/, "设置", "偏好与目标"],
  [/^\/admin\/users\//, "用户详情", "Admin"],
  [/^\/admin\/users/, "用户管理", "Admin"],
  [/^\/admin\/audit/, "操作日志", "Admin"],
  [/^\/admin/, "管理概览", "Admin"],
];

export function TopBar({
  displayName,
  onCommand,
  onMenu,
  role,
}: {
  displayName: string;
  onCommand: () => void;
  onMenu: () => void;
  role: "admin" | "user";
}) {
  const pathname = usePathname();
  const route = routeTitles.find(([pattern]) => pattern.test(pathname));
  const title = route?.[1] || "ZGCA";
  const context = route?.[2] || "学习工作台";
  return (
    <header className="topbar">
      <div className="topbarTitle">
        <button aria-label="切换侧栏" className="topbarMenu" onClick={onMenu} type="button"><Menu size={18} /></button>
        <div><small>{context}</small><strong>{title}</strong></div>
      </div>
      <div className="topbarActions">
        <button className="commandTrigger" onClick={onCommand} type="button"><Search size={15} /><span>搜索或快速操作</span><kbd>⌘ K</kbd></button>
        <ThemeSwitcher />
        <Link aria-label={role === "admin" ? "用户管理" : "设置"} className="topbarIconButton" href={role === "admin" ? "/admin/users" : "/settings"} title={role === "admin" ? "用户管理" : "设置"}>
          {role === "admin" ? <Users size={17} /> : <Settings size={17} />}
        </Link>
        <span aria-label={`当前用户 ${displayName}`} className="topbarAvatar" title={displayName}>{displayName.trim().slice(0, 1).toUpperCase()}</span>
      </div>
    </header>
  );
}
