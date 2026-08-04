"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  BarChart3, BrainCircuit, CalendarDays, CheckSquare2, ChevronRight,
  Command, FileStack, FlaskConical, Gauge, Home, LogOut, Menu, Orbit,
  PanelLeftClose, PanelLeftOpen, Plus, Puzzle, Search, Settings, Sparkles, Tag,
  X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { logoutKinetic } from "@/app/actions/auth";
import { CapturePanel } from "@/components/CapturePanel";
import { clearOfflineLearningData, setActiveOfflineWorkspace } from "@/lib/offline-review";
import type { PluginId } from "@/lib/plugins/registry";
import type { CaptureSubject } from "@/lib/repo/knowledge";
import type { ModulePref } from "@/lib/repo/settings";
import styles from "./KineticShell.module.css";

type ShellSignal = {
  pending: number;
  streak: number;
  weeklyPercent: number;
};

type SearchResult = {
  key: string;
  kind: string;
  group: string;
  title: string;
  excerpt: string;
  meta: string;
  href: string;
};

type NavItem = {
  label: string;
  short: string;
  href: string;
  match: string;
  icon: LucideIcon;
  group: "momentum" | "knowledge" | "insight" | "system";
  moduleKey?: ModulePref["key"];
  pluginId?: PluginId;
};

function kineticNavigation(today: string): NavItem[] {
  return [
    { label: "动量总览", short: "总览", href: "/kinetic", match: "/kinetic", icon: Home, group: "momentum" },
    { label: "任务轨迹", short: "任务", href: "/kinetic/tasks", match: "/kinetic/tasks", icon: CheckSquare2, group: "momentum" },
    { label: "今日执行", short: "今日", href: `/kinetic/day/${today}`, match: "/kinetic/day", icon: Gauge, group: "momentum" },
    { label: "学习日历", short: "日历", href: "/kinetic/calendar", match: "/kinetic/calendar", icon: CalendarDays, group: "momentum" },
    { label: "知识星图", short: "知识", href: "/kinetic/subjects", match: "/kinetic/subjects", icon: Orbit, group: "knowledge", moduleKey: "subjects" },
    { label: "错题回声", short: "回炉", href: "/kinetic/mistakes", match: "/kinetic/mistakes", icon: Tag, group: "knowledge", moduleKey: "mistakes" },
    { label: "模考实验", short: "模考", href: "/kinetic/mock-exams", match: "/kinetic/mock-exams", icon: FlaskConical, group: "knowledge", moduleKey: "mock-exams" },
    { label: "资料星库", short: "资料", href: "/kinetic/assets", match: "/kinetic/assets", icon: FileStack, group: "insight", moduleKey: "assets" },
    { label: "学习信号", short: "分析", href: "/kinetic/analytics", match: "/kinetic/analytics", icon: BarChart3, group: "insight", moduleKey: "analytics" },
    { label: "算法运行场", short: "算法", href: "/kinetic/practice/algorithms", match: "/kinetic/practice/algorithms", icon: BrainCircuit, group: "insight", pluginId: "algorithms" },
    { label: "扩展轨道", short: "扩展", href: "/kinetic/extensions", match: "/kinetic/extensions", icon: Puzzle, group: "system" },
    { label: "系统设置", short: "设置", href: "/kinetic/settings", match: "/kinetic/settings", icon: Settings, group: "system" },
  ];
}

function prefixKineticRoute(href: string): string {
  if (!href.startsWith("/") || href.startsWith("/kinetic") || href.startsWith("/api")) return href;
  const supported = ["/day/", "/tasks", "/calendar", "/subjects", "/mistakes", "/mock-exams", "/assets", "/analytics", "/practice/algorithms", "/extensions", "/settings"];
  return supported.some((route) => href === route || href.startsWith(route)) ? `/kinetic${href}` : href;
}

function activeRoute(pathname: string, item: NavItem): boolean {
  return item.href === "/kinetic" ? pathname === "/kinetic" : pathname === item.match || pathname.startsWith(`${item.match}/`);
}

async function logoutWithCleanup() {
  await clearOfflineLearningData().catch(() => undefined);
  await logoutKinetic();
}

export function KineticShell({
  children,
  displayName,
  enabledPluginIds,
  hierarchy,
  modulePrefs,
  signal,
  today,
  workspaceKey,
}: {
  children: React.ReactNode;
  displayName: string;
  enabledPluginIds: PluginId[];
  hierarchy: CaptureSubject[];
  modulePrefs: ModulePref[];
  signal: ShellSignal;
  today: string;
  workspaceKey: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const hiddenModules = useMemo(() => new Set(modulePrefs.filter((item) => !item.enabled).map((item) => item.key)), [modulePrefs]);
  const navigation = useMemo(() => kineticNavigation(today).filter((item) => (
    (!item.moduleKey || !hiddenModules.has(item.moduleKey))
    && (!item.pluginId || enabledPluginIds.includes(item.pluginId))
  )), [enabledPluginIds, hiddenModules, today]);
  const current = navigation.find((item) => activeRoute(pathname, item)) ?? navigation[0];
  const CurrentIcon = current.icon;

  useEffect(() => {
    void setActiveOfflineWorkspace(workspaceKey).catch(() => undefined);
  }, [workspaceKey]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setCaptureOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    const openCapture = () => setCaptureOpen(true);
    window.addEventListener("zgca:open-capture", openCapture);
    return () => window.removeEventListener("zgca:open-capture", openCapture);
  }, []);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || !rootRef.current) return;
    rootRef.current.style.setProperty("--kinetic-x", `${event.clientX}px`);
    rootRef.current.style.setProperty("--kinetic-y", `${event.clientY}px`);
  };

  const navigate = (href: string) => {
    setCommandOpen(false);
    setMobileOpen(false);
    router.push(prefixKineticRoute(href));
  };

  return (
    <div ref={rootRef} className={styles.shell} data-rail-open={railOpen || mobileOpen} onPointerMove={handlePointerMove}>
      <a className={styles.skipLink} href="#kinetic-main">跳到主要内容</a>
      <div className={styles.ambient} aria-hidden="true"><i /><i /><i /><span /></div>

      <header className={styles.topbar}>
        <button aria-label="打开导航" className={styles.mobileMenu} onClick={() => setMobileOpen(true)} type="button"><Menu size={20} /></button>
        <Link className={styles.brand} href="/kinetic">
          <span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>
          <span><strong>ASCEND</strong><small>KINETIC FIELD</small></span>
        </Link>
        <div className={styles.routeTitle}><CurrentIcon size={15} /><span>{current.label}</span><i /><small>LIVE WORKSPACE</small></div>
        <div className={styles.topActions}>
          <button className={styles.commandTrigger} onClick={() => setCommandOpen(true)} type="button"><Search size={15} /><span>快速抵达</span><kbd>⌘ K</kbd></button>
          <button aria-label="打开收纳" className={styles.captureTrigger} onClick={() => setCaptureOpen(true)} type="button"><Plus size={17} /></button>
          <Link aria-label="账户与设置" className={styles.avatar} href="/kinetic/settings"><span>{displayName.trim().slice(0, 2).toUpperCase() || "ZR"}</span><i /></Link>
        </div>
      </header>

      <aside className={styles.rail} aria-label="Kinetic 主导航">
        <button className={styles.railToggle} onClick={() => setRailOpen((open) => !open)} type="button">
          {railOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}<span>{railOpen ? "收起轨道" : "展开轨道"}</span>
        </button>
        <nav>
          {navigation.map((item, index) => {
            const Icon = item.icon;
            const previous = navigation[index - 1];
            return (
              <div className={styles.navSlot} key={item.href}>
                {index === 0 || previous.group !== item.group ? <span className={styles.groupLabel}>{item.group}</span> : null}
                <Link aria-current={activeRoute(pathname, item) ? "page" : undefined} className={activeRoute(pathname, item) ? styles.navActive : ""} href={item.href} onClick={() => setMobileOpen(false)}>
                  <span className={styles.navIcon}><Icon size={18} />{activeRoute(pathname, item) ? <motion.i layoutId="kinetic-active-orbit" /> : null}</span>
                  <span className={styles.navLabel}>{item.label}</span>
                  <ChevronRight className={styles.navArrow} size={15} />
                </Link>
              </div>
            );
          })}
        </nav>
        <form action={logoutWithCleanup} className={styles.logout}><button type="submit"><LogOut size={17} /><span>退出当前轨道</span></button></form>
      </aside>

      <button aria-label="关闭导航" className={styles.mobileBackdrop} data-open={mobileOpen} onClick={() => setMobileOpen(false)} type="button" />

      <main className={styles.workspace} id="kinetic-main">{children}</main>

      <nav className={styles.mobileDock} aria-label="移动端轨道导航">
        {navigation.slice(0, 4).map((item) => {
          const Icon = item.icon;
          return <Link aria-current={activeRoute(pathname, item) ? "page" : undefined} href={item.href} key={item.href}><Icon size={19} /><span>{item.short}</span></Link>;
        })}
        <button onClick={() => setMobileOpen(true)} type="button"><Menu size={20} /><span>更多</span></button>
      </nav>

      <div className={styles.statusRail}>
        <span><i />系统在线</span><span>连续学习 {signal.streak} 天</span><span>待处理 {signal.pending}</span><span>本周动量 {signal.weeklyPercent}%</span>
        <span className={styles.statusFlow}>理解 → 提取 → 反馈 → 迁移 → 间隔复习</span>
      </div>

      <button aria-hidden={!captureOpen} aria-label="关闭收纳" className={styles.captureBackdrop} data-open={captureOpen} onClick={() => setCaptureOpen(false)} tabIndex={captureOpen ? 0 : -1} type="button" />
      <div className={styles.captureHost} data-open={captureOpen}><CapturePanel onClose={() => setCaptureOpen(false)} subjects={hierarchy} /></div>

      <AnimatePresence>
        {commandOpen ? <KineticCommand navigation={navigation} onClose={() => setCommandOpen(false)} onNavigate={navigate} /> : null}
      </AnimatePresence>
    </div>
  );
}

function KineticCommand({ navigation, onClose, onNavigate }: {
  navigation: NavItem[];
  onClose: () => void;
  onNavigate: (href: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { results?: SearchResult[] };
        setResults(response.ok ? payload.results ?? [] : []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setResults([]);
      } finally { setLoading(false); }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  const updateQuery = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      setLoading(false);
    }
  };

  const shownRoutes = query.trim()
    ? navigation.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()))
    : navigation.slice(0, 6);

  return (
    <motion.div className={styles.commandBackdrop} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.section aria-label="快速抵达" aria-modal="true" className={styles.commandPanel} initial={reduceMotion ? false : { opacity: 0, y: 26, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: .98 }} role="dialog">
        <header><Command size={18} /><input ref={inputRef} aria-label="搜索整个学习空间" onChange={(event) => updateQuery(event.target.value)} placeholder="搜索知识点、任务、错题、资料……" value={query} /><button aria-label="关闭" onClick={onClose} type="button"><X size={17} /></button></header>
        <div className={styles.commandBody}>
          <small>{query.trim() ? "SEARCHING THE FIELD" : "QUICK ORBITS"}</small>
          {shownRoutes.map((item) => { const Icon = item.icon; return <button key={item.href} onClick={() => onNavigate(item.href)} type="button"><span><Icon size={16} /></span><div><strong>{item.label}</strong><small>{item.group.toUpperCase()}</small></div><ChevronRight size={16} /></button>; })}
          {results.map((result) => <button key={result.key} onClick={() => onNavigate(result.href)} type="button"><span><Sparkles size={16} /></span><div><strong>{result.title}</strong><small>{result.group} · {result.meta || result.excerpt}</small></div><ChevronRight size={16} /></button>)}
          {loading ? <p className={styles.commandEmpty}>正在扫描知识场……</p> : null}
          {query.trim() && !loading && !shownRoutes.length && !results.length ? <p className={styles.commandEmpty}>没有找到匹配轨迹</p> : null}
        </div>
        <footer><span><kbd>↵</kbd> 打开</span><span><kbd>ESC</kbd> 关闭</span><span>真实 workspace 搜索</span></footer>
      </motion.section>
    </motion.div>
  );
}
