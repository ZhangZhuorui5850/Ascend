"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, Menu, Search, Settings, Users } from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import type { DeviceAccount } from "@/lib/auth";
import { todayKey } from "@/lib/dates";

const routeTitles: Array<[RegExp, string, string]> = [
  [/^\/$/, "主页", "学习概览"],
  [/^\/day\//, "今日工作台", "计划、执行与复盘"],
  [/^\/calendar/, "日历", "学习节奏"],
  [/^\/subjects\//, "知识详情", "科目与知识点"],
  [/^\/subjects/, "科目", "知识体系"],
  [/^\/assets/, "资料库", "文件与关联"],
  [/^\/mistakes/, "错题本", "回炉与毕业"],
  [/^\/mock-exams/, "模考", "成绩与冲刺"],
  [/^\/practice\/algorithms/, "算法训练", "独立作答与延迟复测"],
  [/^\/extensions/, "扩展中心", "能力、权限与连接"],
  [/^\/analytics/, "统计", "趋势与弱点"],
  [/^\/settings/, "设置", "偏好与目标"],
  [/^\/admin\/users\//, "用户详情", "Admin"],
  [/^\/admin\/users/, "用户管理", "Admin"],
  [/^\/admin\/audit/, "操作日志", "Admin"],
  [/^\/admin/, "管理概览", "Admin"],
];

export function TopBar({
  account,
  accounts,
  onCommand,
  onMenu,
  role,
}: {
  account: DeviceAccount;
  accounts: DeviceAccount[];
  onCommand: () => void;
  onMenu: () => void;
  role: "admin" | "user";
}) {
  const pathname = usePathname();
  const route = routeTitles.find(([pattern]) => pattern.test(pathname));
  const title = route?.[1] || "登峰";
  const context = route?.[2] || "学习工作台";
  const today = todayKey();
  const dayLabel = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", weekday: "short" }).format(new Date(`${today}T12:00:00`));
  return (
    <header className="topbar">
      <div className="topbarTitle">
        <button aria-label="切换侧栏" className="topbarMenu" onClick={onMenu} type="button"><Menu size={18} /></button>
        <div><small>{context}</small><strong>{title}</strong></div>
      </div>
      <div className="topbarActions">
        {role === "user" ? <Link className="topbarDate" href={`/day/${today}`}><CalendarRange size={15} /><span>{dayLabel}</span></Link> : null}
        <button className="commandTrigger" onClick={onCommand} type="button"><Search size={15} /><span>搜索或快速操作</span><kbd>⌘ K</kbd></button>
        <ThemeSwitcher />
        <Link aria-label={role === "admin" ? "用户管理" : "设置"} className="topbarIconButton" href={role === "admin" ? "/admin/users" : "/settings"} title={role === "admin" ? "用户管理" : "设置"}>
          {role === "admin" ? <Users size={17} /> : <Settings size={17} />}
        </Link>
        <AccountMenu accounts={accounts} current={account} />
      </div>
    </header>
  );
}
