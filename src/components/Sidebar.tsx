"use client";

import { Dialog } from "@base-ui/react/dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Code2,
  type LucideIcon,
  GraduationCap,
  HardDrive,
  Home,
  ListChecks,
  LogOut,
  PlusCircle,
  Settings,
  ShieldCheck,
  ScrollText,
  Tag,
  Users,
  ChevronLeft,
  MoreHorizontal,
  Puzzle,
  RotateCcw,
  X,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { AccountMenu } from "@/components/AccountMenu";
import { BrandLogo } from "@/components/BrandLogo";
import type { DeviceAccount } from "@/lib/auth";
import { clearOfflineLearningData } from "@/lib/offline-review";
import type { PluginId } from "@/lib/plugins/registry";
import type { ModulePref } from "@/lib/repo/settings";

async function logoutWithOfflineCleanup() {
  // 离线数据清理失败不应阻断登出（IndexedDB 在隐私模式下可能不可用）
  await clearOfflineLearningData().catch((error) => console.warn("离线数据清理失败", error));
  await logout();
}

export type NavItem = {
  href: string;
  match: string;
  exact: boolean;
  label: string;
  group: string;
  icon: LucideIcon;
  moduleKey?: ModulePref["key"];
  pluginId?: PluginId;
  mobileOverflow?: boolean;
  activeAliases?: string[];
  parentActiveOnly?: boolean;
};

export function getNavigation(role: "admin" | "user", enabledPluginIds: PluginId[] = []): NavItem[] {
  if (role === "admin") {
    return [
      { href: "/admin", match: "/admin", exact: true, label: "管理概览", group: "管理", icon: ShieldCheck },
      { href: "/admin/users", match: "/admin/users", exact: false, label: "用户管理", group: "管理", icon: Users },
      { href: "/admin/audit", match: "/admin/audit", exact: false, label: "操作日志", group: "系统", icon: ScrollText },
    ];
  }
  const links: NavItem[] = [
    { href: "/", match: "/", exact: true, label: "今天", group: "主要", icon: Home, activeAliases: ["/day"] },
    { href: "/tasks", match: "/tasks", exact: false, label: "计划", group: "主要", icon: ListChecks, activeAliases: ["/calendar"] },
    { href: "/subjects", match: "/subjects", exact: false, label: "学习", group: "主要", icon: BookOpen },
    { href: "/review", match: "/review", exact: false, label: "复习", group: "主要", icon: RotateCcw, activeAliases: ["/mistakes"] },
    { href: "/assets", match: "/assets", exact: false, label: "资料", group: "主要", icon: HardDrive, mobileOverflow: true },
    { href: "/calendar", match: "/calendar", exact: false, label: "日历", group: "更多", icon: CalendarDays, parentActiveOnly: true, mobileOverflow: true },
    { href: "/mistakes", match: "/mistakes", exact: false, label: "错题本", group: "更多", icon: Tag, moduleKey: "mistakes" as const, parentActiveOnly: true, mobileOverflow: true },
    { href: "/mock-exams", match: "/mock-exams", exact: false, label: "模考", group: "更多", icon: GraduationCap, moduleKey: "mock-exams" as const, mobileOverflow: true },
    { href: "/analytics", match: "/analytics", exact: false, label: "分析", group: "更多", icon: BarChart3, moduleKey: "analytics" as const, mobileOverflow: true },
  ];
  if (enabledPluginIds.includes("algorithms")) {
    links.push({
      href: "/practice/algorithms",
      match: "/practice/algorithms",
      exact: false,
      label: "算法训练",
      group: "更多",
      icon: Code2,
      pluginId: "algorithms",
      mobileOverflow: true,
    });
  }
  links.push({
    href: "/extensions",
    match: "/extensions",
    exact: false,
    label: "扩展中心",
    group: "更多",
    icon: Puzzle,
    mobileOverflow: true,
  });
  return links;
}

/** 核心 IA 固定；旧模块偏好只控制「更多」中的可选入口是否可见。 */
export function applyModulePrefs(links: NavItem[], modulePrefs?: ModulePref[]): NavItem[] {
  if (!modulePrefs?.length) return links;
  const enabled = new Set(modulePrefs.filter((pref) => pref.enabled).map((pref) => pref.key));
  return links.filter((item) => !item.moduleKey || enabled.has(item.moduleKey));
}

function isLinkActive(pathname: string, item: NavItem): boolean {
  if (item.parentActiveOnly) return false;
  if (item.activeAliases?.some((match) => pathname === match || pathname.startsWith(`${match}/`))) return true;
  if (item.exact) return pathname === item.match;
  return pathname === item.href || pathname === item.match || pathname.startsWith(`${item.match}/`);
}

export function Sidebar({
  account,
  accounts,
  collapsed,
  displayName,
  enabledPluginIds,
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
  enabledPluginIds?: PluginId[];
  mobileOpen?: boolean;
  modulePrefs?: ModulePref[];
  onNavigate?: () => void;
  onToggle: () => void;
  role: "admin" | "user";
}) {
  const pathname = usePathname();
  const links = applyModulePrefs(
    getNavigation(role, role === "user" ? enabledPluginIds : undefined),
    role === "user" ? modulePrefs : undefined,
  );
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
              <Link className={isLinkActive(pathname, item) ? "active" : ""} href={item.href} onClick={onNavigate} prefetch={true} transitionTypes={["nav-switch"]}>
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
          <Link aria-label="设置" className={pathname === "/settings" ? "active" : ""} href="/settings" onClick={onNavigate} prefetch={true} title="设置" transitionTypes={["nav-switch"]}>
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
  enabledPluginIds,
  modulePrefs,
  onCaptureClick,
  role,
}: {
  enabledPluginIds?: PluginId[];
  modulePrefs?: ModulePref[];
  onCaptureClick?: () => void;
  role: "admin" | "user";
}) {
  const pathname = usePathname();
  const links = applyModulePrefs(
    getNavigation(role, role === "user" ? enabledPluginIds : undefined),
    role === "user" ? modulePrefs : undefined,
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileLinks = role === "admin"
    ? links
    : links.filter((item) => item.group === "主要" && !item.mobileOverflow);
  const moreLinks = role === "admin"
    ? []
    : links.filter((item) => item.group !== "主要" || item.mobileOverflow);

  return (
    <Dialog.Root onOpenChange={setMoreOpen} open={moreOpen}>
      <nav className="mobileNav" aria-label="移动端主导航" data-testid="mobile-nav">
      {mobileLinks.map((item) => {
        const Icon = item.icon;
        return (
          <Link className={isLinkActive(pathname, item) ? "active" : ""} href={item.href} key={item.href} onClick={() => setMoreOpen(false)} prefetch={true} transitionTypes={["nav-switch"]}>
            <Icon size={18} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      {role === "user" ? (
        <button className="mobileCapture" onClick={onCaptureClick} type="button">
          <PlusCircle size={20} />
          <span>记录</span>
        </button>
      ) : null}
      {role === "user" ? (
        <button aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)} type="button">
          <MoreHorizontal size={20} />
          <span>更多</span>
        </button>
      ) : null}
      <Dialog.Portal>
        <Dialog.Backdrop className="mobileMoreBackdrop" />
        <Dialog.Viewport className="mobileMoreViewport">
          <Dialog.Popup aria-label="更多功能" className="mobileMoreSheet" finalFocus initialFocus>
            <div className="mobileMoreHandle" />
            <Dialog.Title>更多功能</Dialog.Title>
            <Dialog.Close aria-label="关闭更多菜单" className="mobileMoreClose">
              <X size={17} />
            </Dialog.Close>
            <div className="mobileMoreGrid">
              {moreLinks.map((item) => {
                const Icon = item.icon;
                return <Link href={item.href} key={item.href} onClick={() => setMoreOpen(false)} transitionTypes={["nav-switch"]}><Icon size={18} /><span>{item.label}</span></Link>;
              })}
              <Link href="/settings" onClick={() => setMoreOpen(false)} transitionTypes={["nav-switch"]}><Settings size={18} /><span>设置</span></Link>
              <form action={logoutWithOfflineCleanup}><button type="submit"><LogOut size={18} /><span>退出</span></button></form>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
      </nav>
    </Dialog.Root>
  );
}
