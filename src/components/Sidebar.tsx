"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
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
import { UserAvatar } from "@/components/UserAvatar";
import type { DeviceAccount } from "@/lib/auth";
import { todayKey } from "@/lib/dates";

export function getNavigation(role: "admin" | "user") {
  if (role === "admin") {
    return [
      { href: "/admin", match: "/admin", exact: true, label: "管理概览", icon: ShieldCheck },
      { href: "/admin/users", match: "/admin/users", exact: false, label: "用户管理", icon: Users },
      { href: "/admin/audit", match: "/admin/audit", exact: false, label: "操作日志", icon: ScrollText },
    ];
  }
  return [
    { href: "/", match: "/", exact: true, label: "主页", icon: Home },
    { href: `/day/${todayKey()}`, match: "/day", exact: false, label: "今日", icon: ClipboardList },
    { href: "/calendar", match: "/calendar", exact: false, label: "日历", icon: CalendarDays },
    { href: "/subjects", match: "/subjects", exact: false, label: "科目", icon: BookOpen },
    { href: "/assets", match: "/assets", exact: false, label: "资料库", icon: HardDrive },
    { href: "/mistakes", match: "/mistakes", exact: false, label: "错题本", icon: Tag },
    { href: "/analytics", match: "/analytics", exact: false, label: "统计", icon: BarChart3 },
  ];
}

export type NavItem = ReturnType<typeof getNavigation>[number];

function isLinkActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.match;
  return pathname === item.href || pathname === item.match || pathname.startsWith(`${item.match}/`);
}

export function Sidebar({
  account,
  collapsed,
  displayName,
  onToggle,
  role,
}: {
  account: DeviceAccount;
  collapsed: boolean;
  displayName: string;
  onToggle: () => void;
  role: "admin" | "user";
}) {
  const pathname = usePathname();
  const links = getNavigation(role);

  return (
    <aside className={collapsed ? "sidebar isCollapsed" : "sidebar"}>
      <div className="brand">
        <span className="brandMark">{role === "admin" ? "管" : "登"}</span>
        <div className="brandCopy">
          <strong>登峰</strong>
          <small>{role === "admin" ? "ASCEND · 管理控制台" : "ASCEND · 学习工作台"}</small>
        </div>
        <button aria-label={collapsed ? "展开侧栏" : "收起侧栏"} className="sidebarToggle" onClick={onToggle} type="button">
          <ChevronLeft size={15} />
        </button>
      </div>
      <nav>
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <Link className={isLinkActive(pathname, item) ? "active" : ""} key={item.href} href={item.href} prefetch={true}>
              <Icon size={17} />
              <span className="navLabel">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="sidebarFooter">
        <UserAvatar avatar={account} size={28} />
        <span className="userName" title={displayName}>{displayName}</span>
        <div className="sidebarFooterActions">
          <Link aria-label="设置" className={pathname === "/settings" ? "active" : ""} href="/settings" prefetch={true} title="设置">
            <Settings size={15} />
          </Link>
          <form action={logout}>
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
  onCaptureClick,
  role,
}: {
  onCaptureClick?: () => void;
  role: "admin" | "user";
}) {
  const pathname = usePathname();
  const links = getNavigation(role);
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileLinks = role === "admin" ? links : [links[0], links[1], links[4]];
  const moreLinks = role === "admin" ? [] : [links[2], links[3], links[5], links[6]];

  return (
    <nav className="mobileNav" aria-label="移动端主导航" data-testid="mobile-nav">
      {mobileLinks.map((item) => {
        const Icon = item.icon;
        return (
          <Link className={isLinkActive(pathname, item) ? "active" : ""} href={item.href} key={item.href} prefetch={true}>
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
              <form action={logout}><button type="submit"><LogOut size={18} /><span>退出</span></button></form>
            </div>
          </div>
        </>
      ) : null}
    </nav>
  );
}
