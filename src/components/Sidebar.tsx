import Link from "next/link";
import { CalendarDays, ClipboardList, Database, FileText, Home, LayoutGrid, Map, Tag, Target } from "lucide-react";
import { todayKey } from "@/lib/dates";

const links = [
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
          return (
            <Link key={item.href} href={item.href}>
              <Icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
