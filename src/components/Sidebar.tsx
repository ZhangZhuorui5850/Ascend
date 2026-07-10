"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { todayKey } from "@/lib/dates";

function navLinks(role: "admin" | "user") {
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

type NavItem = ReturnType<typeof navLinks>[number];

function isLinkActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.match;
  return pathname === item.href || pathname === item.match || pathname.startsWith(`${item.match}/`);
}

export function Sidebar({ displayName, role }: { displayName: string; role: "admin" | "user" }) {
  const pathname = usePathname();
  const links = navLinks(role);

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brandMark">Z</span>
        <div>
          <strong>ZGCA</strong>
          <small>{role === "admin" ? "管理控制台" : "学习工作台"}</small>
        </div>
      </div>
      <nav>
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <Link className={isLinkActive(pathname, item) ? "active" : ""} key={item.href} href={item.href}>
              <Icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebarFooter">
        <span title={displayName}>{displayName}</span>
        <div className="sidebarFooterActions">
          <Link aria-label="设置" className={pathname === "/settings" ? "active" : ""} href="/settings" title="设置">
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
  const links = navLinks(role);
  const mobileLinks = role === "admin" ? links : [links[0], links[1], links[3], links[4]];

  return (
    <nav className="mobileNav" aria-label="移动端主导航" data-testid="mobile-nav">
      {mobileLinks.map((item) => {
        const Icon = item.icon;
        return (
          <Link className={isLinkActive(pathname, item) ? "active" : ""} href={item.href} key={item.href}>
            <Icon size={18} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      {role === "user" ? (
        <button onClick={onCaptureClick} type="button">
          <PlusCircle size={20} />
          <span>收纳</span>
        </button>
      ) : null}
    </nav>
  );
}
