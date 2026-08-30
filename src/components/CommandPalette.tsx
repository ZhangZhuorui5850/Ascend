"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Brain,
  Bug,
  CheckSquare2,
  Code2,
  FileText,
  Inbox,
  Loader2,
  Plus,
  Search,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { createDayTaskAction } from "@/app/actions/day-tasks";
import { applyModulePrefs, getNavigation } from "@/components/Sidebar";
import { useFeedback } from "@/components/FeedbackProvider";
import { todayKey } from "@/lib/dates";
import type { PluginId } from "@/lib/plugins/registry";
import type { ModulePref } from "@/lib/repo/settings";
import type { SearchTrainingAction, WorkspaceSearchResult } from "@/lib/repo/search";

type PaletteEntry = {
  key: string;
  group: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  capture?: boolean;
  training?: SearchTrainingAction | null;
};

const SEARCH_ICONS: Record<WorkspaceSearchResult["kind"], LucideIcon> = {
  knowledge_point: Brain,
  mistake: Bug,
  task: CheckSquare2,
  note: StickyNote,
  asset: FileText,
  algorithm_problem: Code2,
};

export function CommandPalette({
  enabledPluginIds,
  modulePrefs,
  onCapture,
  open,
  role,
  setOpen,
}: {
  enabledPluginIds?: PluginId[];
  modulePrefs?: ModulePref[];
  onCapture: () => void;
  open: boolean;
  role: "admin" | "user";
  setOpen: (open: boolean) => void;
}) {
  const router = useRouter();
  const { notify } = useFeedback();
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchState, setSearchState] = useState<{ query: string; results: WorkspaceSearchResult[] }>({
    query: "",
    results: [],
  });
  const [searchingQuery, setSearchingQuery] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<{ query: string; message: string }>({
    query: "",
    message: "",
  });
  const [trainingBusyKey, setTrainingBusyKey] = useState<string | null>(null);
  const items = useMemo(() => {
    const navigation = applyModulePrefs(
      getNavigation(role, role === "user" ? enabledPluginIds : undefined),
      role === "user" ? modulePrefs : undefined,
    )
      .map((item) => ({
        key: `navigation:${item.href}`,
        group: "页面与操作",
        label: item.label,
        href: item.href,
        icon: item.icon,
        description: item.href,
      }));
    return navigation;
  }, [enabledPluginIds, modulePrefs, role]);
  const commands = useMemo<PaletteEntry[]>(() => role === "user"
    ? [{
        key: "command:capture",
        group: "页面与操作",
        label: "记录",
        href: "",
        icon: Inbox,
        description: "任务、学习、错题、笔记或资料",
        capture: true,
      }, ...items]
    : items, [items, role]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const currentQuery = query.trim();
  const searchResults = searchState.query === currentQuery ? searchState.results : [];
  const searching = searchingQuery === currentQuery;
  const searchErrorMessage = searchError.query === currentQuery ? searchError.message : "";
  const filteredCommands = commands.filter((item) => (
    item.label.toLocaleLowerCase().includes(normalizedQuery)
    || item.description.toLocaleLowerCase().includes(normalizedQuery)
  ));
  const entityEntries = searchResults.map((result): PaletteEntry => ({
    key: result.key,
    group: result.group,
    label: result.title,
    href: result.href,
    icon: SEARCH_ICONS[result.kind],
    description: [result.meta, result.excerpt].filter(Boolean).join(" — "),
    training: result.training,
  }));
  const entries = [...filteredCommands, ...entityEntries];
  const groupedEntries = groupEntries(entries);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      setActiveIndex(0);
      inputRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (!open || role !== "user" || !term) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchingQuery(term);
      setSearchError({ query: term, message: "" });
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as {
          results?: WorkspaceSearchResult[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "搜索失败");
        setSearchState({ query: term, results: payload.results || [] });
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchState({ query: term, results: [] });
        setSearchError({
          query: term,
          message: error instanceof Error ? error.message : "搜索失败",
        });
      } finally {
        if (!controller.signal.aborted) setSearchingQuery(null);
      }
    }, 180);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, query, role]);

  const safeActiveIndex = Math.max(0, Math.min(activeIndex, Math.max(0, entries.length - 1)));

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function execute(index: number) {
    const item = entries[index];
    if (!item) return;
    if (item.capture) {
      setOpen(false);
      onCapture();
    } else {
      go(item.href);
    }
  }

  async function addTraining(entry: PaletteEntry) {
    if (!entry.training || trainingBusyKey) return;
    setTrainingBusyKey(entry.key);
    const training = entry.training;
    try {
      const result = await createDayTaskAction({
        clientMutationId: crypto.randomUUID(),
        day: todayKey(),
        title: training.title,
        subjectCode: training.subjectCode || "",
        knowledgePointId: training.knowledgePointId,
        activityType: "practice",
        priority: 1,
        estimatedMinutes: 45,
        completionCriteria: training.sourceType === "mistake"
          ? "独立重做并订正，再完成一道同类题"
          : "完成专项训练，并进行一次无提示回忆",
        plannedVerificationMethod: training.sourceType === "mistake" ? "独立重做与同类题验证" : "无提示回忆",
        sourceType: training.sourceType,
        sourceId: training.sourceId,
        notes: training.notes,
      });
      if (!result.ok) {
        notify(result.error || "训练任务创建失败", "error");
        return;
      }
      notify("训练任务已加入今日计划", "success");
      setOpen(false);
    } catch (error) {
      console.error("从全局搜索创建训练任务失败", error);
      notify("网络异常，训练任务未创建", "error");
    } finally {
      setTrainingBusyKey(null);
    }
  }

  return (
    <Dialog.Root
      onOpenChange={(next) => {
        if (!next) setOpen(false);
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="commandBackdrop" />
        <Dialog.Viewport className="commandViewport">
          <Dialog.Popup
            aria-label="命令菜单"
            className="commandPalette"
            finalFocus={returnFocusRef}
            initialFocus={inputRef}
          >
        <div className="commandSearch">
          <Search size={18} />
          <input
            aria-label="搜索功能"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(Math.max(0, entries.length - 1), index + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(0, index - 1));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                execute(safeActiveIndex);
              }
            }}
            placeholder={role === "user" ? "搜索页面、知识点、错题、任务、随笔或资料…" : "搜索页面或操作…"}
            ref={inputRef}
            value={query}
          />
          {searching ? <Loader2 aria-label="正在搜索" className="spin" size={16} /> : <kbd>ESC</kbd>}
        </div>
        <div className="commandList">
          {groupedEntries.map(([group, groupItems]) => (
            <div aria-label={group} className="commandGroup" key={group} role="group">
              <p className="commandGroupLabel">{group}</p>
              {groupItems.map(({ entry, index }) => {
                const Icon = entry.icon;
                return (
                  <div className="commandResultRow" key={entry.key}>
                    <button
                      className={safeActiveIndex === index ? "commandResultPrimary active" : "commandResultPrimary"}
                      onClick={() => execute(index)}
                      onMouseEnter={() => setActiveIndex(index)}
                      type="button"
                    >
                      <Icon size={17} />
                      <span><strong>{entry.label}</strong><small>{entry.description}</small></span>
                      <ArrowRight size={15} />
                    </button>
                    {entry.training ? (
                      <button
                        aria-label={`把“${entry.label}”加入今日训练`}
                        className="commandTrainingAction"
                        disabled={trainingBusyKey !== null}
                        onClick={() => void addTraining(entry)}
                        title="加入今日训练"
                        type="button"
                      >
                        {trainingBusyKey === entry.key ? <Loader2 className="spin" size={14} /> : <Plus size={14} />}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
          {searchErrorMessage ? <p className="commandEmpty" role="alert">{searchErrorMessage}</p> : null}
          {!entries.length && !searching && !searchErrorMessage ? (
            <p className="commandEmpty">没有匹配的页面、操作或学习记录</p>
          ) : null}
          <span aria-live="polite" className="srOnly">
            {searching ? "正在搜索" : normalizedQuery ? `找到 ${entityEntries.length} 条学习记录` : ""}
          </span>
        </div>
            <footer><span>↑↓ 浏览</span><span>Enter 打开</span><span>Esc 关闭</span></footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function groupEntries(entries: PaletteEntry[]): Array<[string, Array<{ entry: PaletteEntry; index: number }>]> {
  const groups = new Map<string, Array<{ entry: PaletteEntry; index: number }>>();
  entries.forEach((entry, index) => {
    const current = groups.get(entry.group) || [];
    current.push({ entry, index });
    groups.set(entry.group, current);
  });
  return [...groups.entries()];
}
