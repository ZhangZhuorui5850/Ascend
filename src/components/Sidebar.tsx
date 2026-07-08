"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, BarChart3, CalendarDays, ClipboardList, Database, FileText, Home, LayoutGrid, Map, PlusCircle, Tag, Target } from "lucide-react";
import { todayKey } from "@/lib/dates";

export const links = [
  { href: "/", label: "总控台", icon: Home },
  { href: `/day/${todayKey()}`, label: "今日", icon: ClipboardList },
  { href: "/calendar", label: "日历", icon: CalendarDays },
  { href: "/plan", label: "计划", icon: FileText },
  { href: "/knowledge", label: "知识库", icon: Map },
  { href: "/mistakes", label: "错题", icon: Tag },
  { href: "/subjects", label: "科目", icon: Target },
  { href: "/assets", label: "资料库", icon: Database },
  { href: "/analytics", label: "分析", icon: BarChart3 },
  { href: "/views", label: "视图", icon: LayoutGrid },
  { href: "/conflicts", label: "冲突", icon: AlertTriangle },
];

const navGroups = [
  { title: "工作台", items: links.slice(0, 4) },
  { title: "知识", items: links.slice(4, 8) },
  { title: "复盘", items: links.slice(8) },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brandMark">Z</span>
        <div>
          <strong>ZGCA</strong>
          <small>学习工作台</small>
        </div>
      </div>
      <nav>
        {navGroups.map((group) => (
          <div className="navGroup" key={group.title}>
            <span>{group.title}</span>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link className={isActive ? "active" : ""} key={item.href} href={item.href}>
                  <Icon size={17} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function MobileNav({ onCaptureClick }: { onCaptureClick: () => void }) {
  const pathname = usePathname();
  const mobileLinks = [links[1], links[2], links[4], links[8]];

  return (
    <nav className="mobileNav" aria-label="移动端主导航" data-testid="mobile-nav">
      {mobileLinks.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
        return (
          <Link className={isActive ? "active" : ""} href={item.href} key={item.href}>
            <Icon size={18} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button onClick={onCaptureClick} type="button">
        <PlusCircle size={20} />
        <span>收纳</span>
      </button>
    </nav>
  );
}
