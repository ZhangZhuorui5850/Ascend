"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  HardDrive,
  Home,
  LogOut,
  PlusCircle,
  Settings,
  ShieldCheck,
  ScrollText,
  Tag,
  Users,
  ChevronLeft,
  MoreHorizontal,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { AccountMenu } from "@/components/AccountMenu";
import { BrandLogo } from "@/components/BrandLogo";
import type { DeviceAccount } from "@/lib/auth";
import { todayKey } from "@/lib/dates";
import { clearOfflineLearningData } from "@/lib/offline-review";
import type { ModulePref } from "@/lib/repo/settings";

async function logoutWithOfflineCleanup() {
  await clearOfflineLearningData().catch(() => undefined);
  await logout();
}

export function getNavigation(role: "admin" | "user") {
  if (role === "admin") {
    return [
      { href: "/admin", match: "/admin", exact: true, label: "管理概览", group: "管理", icon: ShieldCheck },
      { href: "/admin/users", match: "/admin/users", exact: false, label: "用户管理", group: "管理", icon: Users },
      { href: "/admin/audit", match: "/admin/audit", exact: false, label: "操作日志", group: "系统", icon: ScrollText },
    ];
  }
  return [
    { href: "/", match: "/", exact: true, label: "总览", group: "计划", icon: Home },
    { href: `/day/${todayKey()}`, match: "/day", exact: false, label: "今日执行", group: "计划", icon: ClipboardList },
    { href: "/calendar", match: "/calendar", exact: false, label: "学习日历", group: "计划", icon: CalendarDays },
    { href: "/subjects", match: "/subjects", exact: false, label: "知识体系", group: "学习", icon: BookOpen, moduleKey: "subjects" as const },
    { href: "/mistakes", match: "/mistakes", exact: false, label: "错题回炉", group: "学习", icon: Tag, moduleKey: "mistakes" as const },
    { href: "/mock-exams", match: "/mock-exams", exact: false, label: "模考冲刺", group: "学习", icon: GraduationCap, moduleKey: "mock-exams" as const },
    { href: "/assets", match: "/assets", exact: false, label: "资料库", group: "洞察", icon: HardDrive, moduleKey: "assets" as const },
    { href: "/analytics", match: "/analytics", exact: false, label: "学习分析", group: "洞察", icon: BarChart3, moduleKey: "analytics" as const },
  ];
}

export type NavItem = ReturnType<typeof getNavigation>[number] & { moduleKey?: string };

/** 按用户板块偏好过滤并排序导航：核心项固定在前，可选板块按偏好顺序排列、关闭的隐藏 */
export function applyModulePrefs(links: NavItem[], modulePrefs?: ModulePref[]): NavItem[] {
  if (!modulePrefs?.length) return links;
  const core = links.filter((item) => !item.moduleKey);
  const optionalByKey = new Map(links.filter((item) => item.moduleKey).map((item) => [item.moduleKey!, item]));
  const optional = modulePrefs
    .filter((pref) => pref.enabled)
    .map((pref) => optionalByKey.get(pref.key))
    .filter((item): item is NavItem => Boolean(item));
  return [...core, ...optional];
}

function isLinkActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.match;
  return pathname === item.href || pathname === item.match || pathname.startsWith(`${item.match}/`);
}

export function Sidebar({
  account,
  accounts,
  collapsed,
  displayName,
  mobileOpen = false,
  modulePrefs,
  onNavigate,
  onToggle,
  role,
}: {
  account: DeviceAccount;
  accounts: DeviceAccount[];
  collapsed: boolean;
  displayName: string;
  mobileOpen?: boolean;
  modulePrefs?: ModulePref[];
  onNavigate?: () => void;
  onToggle: () => void;
  role: "admin" | "user";
}) {
  const pathname = usePathname();
  const links = applyModulePrefs(getNavigation(role), role === "user" ? modulePrefs : undefined);
  const className = ["sidebar", collapsed ? "isCollapsed" : "", mobileOpen ? "mobileOpen" : ""].filter(Boolean).join(" ");

  return (
    <aside className={className}>
      <div className="brand">
        <span className="brandLogo"><BrandLogo size={36} /></span>
        <div className="brandCopy">
          <strong>登峰</strong>
          <small>{role === "admin" ? "ASCEND · 管理控制台" : "ASCEND"}</small>
        </div>
        <button aria-label={collapsed ? "展开侧栏" : "收起侧栏"} className="sidebarToggle" onClick={onToggle} type="button">
          <ChevronLeft size={15} />
        </button>
      </div>
      <nav>
        {links.map((item, index) => {
          const Icon = item.icon;
          return (
            <div className="navItemWrap" key={item.href}>
              {index === 0 || links[index - 1].group !== item.group ? <span className="navGroupLabel">{item.group}</span> : null}
              <Link className={isLinkActive(pathname, item) ? "active" : ""} href={item.href} onClick={onNavigate} prefetch={true} transitionTypes={["nav-forward"]}>
                <Icon size={17} />
                <span className="navLabel">{item.label}</span>
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="sidebarFooter">
        <AccountMenu accounts={accounts} current={account} direction="up" label={displayName} />
        <div className="sidebarFooterActions">
          <Link aria-label="设置" className={pathname === "/settings" ? "active" : ""} href="/settings" onClick={onNavigate} prefetch={true} title="设置">
            <Settings size={15} />
          </Link>
          <form action={logoutWithOfflineCleanup}>
            <button type="submit" title="退出登录" aria-label="退出登录">
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

export function MobileNav({
  modulePrefs,
  onCaptureClick,
  role,
}: {
  modulePrefs?: ModulePref[];
  onCaptureClick?: () => void;
  role: "admin" | "user";
}) {
  const pathname = usePathname();
  const links = applyModulePrefs(getNavigation(role), role === "user" ? modulePrefs : undefined);
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileLinks = role === "admin" ? links : links.filter((item) => !item.moduleKey);
  const moreLinks = role === "admin" ? [] : links.filter((item) => item.moduleKey);

  return (
    <nav className="mobileNav" aria-label="移动端主导航" data-testid="mobile-nav">
      {mobileLinks.map((item) => {
        const Icon = item.icon;
        return (
          <Link className={isLinkActive(pathname, item) ? "active" : ""} href={item.href} key={item.href} prefetch={true} transitionTypes={["nav-forward"]}>
            <Icon size={18} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      {role === "user" ? (
        <button className="mobileCapture" onClick={onCaptureClick} type="button">
          <PlusCircle size={20} />
          <span>收纳</span>
        </button>
      ) : null}
      {role === "user" ? (
        <button aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)} type="button">
          <MoreHorizontal size={20} />
          <span>更多</span>
        </button>
      ) : null}
      {moreOpen ? (
        <>
          <button aria-label="关闭更多菜单" className="mobileMoreBackdrop" onClick={() => setMoreOpen(false)} type="button" />
          <div className="mobileMoreSheet">
            <div className="mobileMoreHandle" />
            <strong>更多功能</strong>
            <div className="mobileMoreGrid">
              {moreLinks.map((item) => {
                const Icon = item.icon;
                return <Link href={item.href} key={item.href} onClick={() => setMoreOpen(false)}><Icon size={18} /><span>{item.label}</span></Link>;
              })}
              <Link href="/settings" onClick={() => setMoreOpen(false)}><Settings size={18} /><span>设置</span></Link>
              <form action={logoutWithOfflineCleanup}><button type="submit"><LogOut size={18} /><span>退出</span></button></form>
            </div>
          </div>
        </>
      ) : null}
    </nav>
  );
}
