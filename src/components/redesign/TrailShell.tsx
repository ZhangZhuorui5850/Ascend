"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  Flag,
  Flame,
  FolderOpen,
  Home,
  Mountain,
  Settings,
} from "lucide-react";
import styles from "@/styles/redesign/shell.module.css";

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ href: string; name: string; icon: typeof Home }>;
}> = [
  {
    label: "攀登",
    items: [
      { href: "/redesign", name: "大本营", icon: Home },
      { href: "/redesign/day", name: "今日", icon: Flag },
      { href: "/redesign/tasks", name: "待办", icon: CheckSquare },
      { href: "/calendar", name: "日历", icon: CalendarDays },
    ],
  },
  {
    label: "积累",
    items: [
      { href: "/subjects", name: "科目", icon: BookOpen },
      { href: "/mistakes", name: "错题", icon: Flame },
      { href: "/assets", name: "资料", icon: FolderOpen },
    ],
  },
  {
    label: "检视",
    items: [
      { href: "/analytics", name: "分析", icon: BarChart3 },
      { href: "/mock-exams", name: "模考", icon: Mountain },
      { href: "/settings", name: "设置", icon: Settings },
    ],
  },
];

export function TrailShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/redesign" ? pathname === href : pathname.startsWith(href);

  return (
    <div className={styles.shell}>
      <aside className={styles.rail}>
        <Link className={styles.brand} href="/redesign">
          <span aria-hidden className={styles.brandSeal}>登</span>
          <span className={styles.brandCopy}>
            <strong>登峰</strong>
            <small>ASCEND · 山径</small>
          </span>
        </Link>
        <nav aria-label="主导航" className={styles.nav}>
          {NAV_GROUPS.map((group) => (
            <div className={styles.navGroup} key={group.label}>
              <span className={styles.navGroupLabel}>{group.label}</span>
              {group.items.map((item) => (
                <Link
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={isActive(item.href) ? styles.navItemActive : styles.navItem}
                  href={item.href}
                  key={item.href}
                >
                  <item.icon aria-hidden size={16} strokeWidth={1.8} />
                  <span>{item.name}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <p className={styles.railFoot}>重设计预览 · 未接后端</p>
      </aside>

      <div className={styles.main}>
        <nav aria-label="主导航" className={styles.topNav}>
          {NAV_GROUPS.flatMap((group) => group.items).slice(0, 4).map((item) => (
            <Link
              aria-current={isActive(item.href) ? "page" : undefined}
              className={isActive(item.href) ? styles.topNavItemActive : styles.topNavItem}
              href={item.href}
              key={item.href}
            >
              <item.icon aria-hidden size={15} strokeWidth={1.8} />
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
