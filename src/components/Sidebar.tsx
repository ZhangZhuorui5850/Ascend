"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, Database, FileText, Home, LayoutGrid, Map, PlusCircle, Tag, Target } from "lucide-react";
import { todayKey } from "@/lib/dates";

export const links = [
  { href: "/", label: "总控台", icon: Home },
  { href: "/calendar", label: "日历", icon: CalendarDays },
  { href: `/day/${todayKey()}`, label: "今日", icon: ClipboardList },
  { href: "/views", label: "视图", icon: LayoutGrid },
  { href: "/knowledge", label: "知识地图", icon: Map },
  { href: "/subjects", label: "科目", icon: Target },
  { href: "/assets", label: "资料库", icon: Database },
  { href: "/mistakes", label: "错题", icon: Tag },
  { href: "/plan", label: "计划", icon: FileText },
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
        {links.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link className={isActive ? "active" : ""} key={item.href} href={item.href}>
              <Icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileNav({ onCaptureClick }: { onCaptureClick: () => void }) {
  const pathname = usePathname();
  const mobileLinks = [links[2], links[1], links[4], links[7]];

  return (
    <nav className="mobileNav" aria-label="移动端主导航">
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
