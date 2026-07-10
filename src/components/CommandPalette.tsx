"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Inbox, Search } from "lucide-react";
import { getNavigation } from "@/components/Sidebar";
import { todayKey } from "@/lib/dates";

export function CommandPalette({
  onCapture,
  open,
  role,
  setOpen,
}: {
  onCapture: () => void;
  open: boolean;
  role: "admin" | "user";
  setOpen: (open: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const items = useMemo(() => {
    const navigation = getNavigation(role).map((item) => ({ label: item.label, href: item.href, icon: item.icon, description: item.href }));
    if (role === "user") {
      navigation.unshift({ label: "打开今日工作台", href: `/day/${todayKey()}`, icon: ArrowRight, description: "计划、执行与复盘" });
    }
    return navigation;
  }, [role]);
  const commands = useMemo(() => role === "user"
    ? [{ label: "收纳资料", href: "", icon: Inbox, description: "上传文件、截图或笔记", capture: true }, ...items]
    : items.map((item) => ({ ...item, capture: false })), [items, role]);
  const filtered = commands.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    function handle(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!open);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      setActiveIndex(0);
      inputRef.current?.focus();
    }, 0);
  }, [open]);

  if (!open) return null;
  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function execute(index: number) {
    const item = filtered[index];
    if (!item) return;
    if ("capture" in item && item.capture) {
      setOpen(false);
      onCapture();
    } else {
      go(item.href);
    }
  }

  return (
    <div className="commandBackdrop" onMouseDown={() => setOpen(false)} role="presentation">
      <section aria-label="命令菜单" aria-modal="true" className="commandPalette" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <div className="commandSearch"><Search size={18} /><input aria-label="搜索功能" onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(filtered.length - 1, index + 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); } if (event.key === "Enter") { event.preventDefault(); execute(activeIndex); } }} placeholder="搜索页面或操作…" ref={inputRef} value={query} /><kbd>ESC</kbd></div>
        <div className="commandList">
          {filtered.map((item, index) => {
            const Icon = item.icon;
            return <button className={activeIndex === index ? "active" : ""} key={`${item.label}-${item.href}`} onClick={() => execute(index)} onMouseEnter={() => setActiveIndex(index)} type="button"><Icon size={17} /><span><strong>{item.label}</strong><small>{item.description}</small></span><ArrowRight size={15} /></button>;
          })}
          {!filtered.length ? <p className="commandEmpty">没有匹配的页面或操作</p> : null}
        </div>
        <footer><span>↑↓ 浏览</span><span>Enter 打开</span><span>Esc 关闭</span></footer>
      </section>
    </div>
  );
}
