"use client";

import { useEffect, useState } from "react";
import {
  moveChapterToPositionAction,
  movePointAction,
  reparentChapterAction,
} from "@/app/actions/knowledge";
import type { DragPayload } from "@/components/dnd";
import type { PointMoveTarget, Report, TreeControls } from "./shared";

/**
 * 章节树的共享操作状态：折叠记忆（localStorage）、全局唯一拖拽负载（body data-dragging）、
 * 树结构写操作（嵌套/移动章节、移动知识点）串行互斥（treeBusy）。
 */
export function useTreeControls({ subjectCode, report, focusChapter }: {
  subjectCode: string;
  report: Report;
  focusChapter: (id: string | null) => void;
}): TreeControls {
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [treeBusy, setTreeBusy] = useState(false);

  useEffect(() => {
    if (drag) document.body.setAttribute("data-dragging", drag.kind);
    else document.body.removeAttribute("data-dragging");
    return () => document.body.removeAttribute("data-dragging");
  }, [drag]);

  useEffect(() => {
    const savedCollapsed = localStorage.getItem(`zgca-chapter-collapsed:${subjectCode}`);
    window.setTimeout(() => {
      if (savedCollapsed) {
        try {
          setCollapsedMap(JSON.parse(savedCollapsed) as Record<string, boolean>);
        } catch (error) {
          console.warn("章节折叠记忆数据损坏，已忽略", error);
        }
      }
    }, 0);
  }, [subjectCode]);

  function toggleCollapsed(id: string, defaultCollapsed: boolean) {
    setCollapsedMap((current) => {
      const effective = current[id] ?? defaultCollapsed;
      const next = { ...current, [id]: !effective };
      localStorage.setItem(`zgca-chapter-collapsed:${subjectCode}`, JSON.stringify(next));
      return next;
    });
  }

  async function nestChapter(childId: string, parentId: string | null) {
    if (treeBusy || childId === parentId) return;
    setTreeBusy(true);
    try {
      report(await reparentChapterAction({ id: childId, parentId, subjectCode }));
    } catch (error) {
      console.error("章节嵌套移动失败", error);
      report({ ok: false, error: "网络异常，章节移动未保存" });
    } finally {
      setTreeBusy(false);
    }
  }

  async function moveChapterTo(id: string, parentId: string | null, index: number) {
    if (treeBusy || id === parentId) return;
    setTreeBusy(true);
    try {
      report(await moveChapterToPositionAction({ id, parentId, index, subjectCode }));
    } catch (error) {
      console.error("章节定位移动失败", error);
      report({ ok: false, error: "网络异常，章节移动未保存" });
    } finally {
      setTreeBusy(false);
    }
  }

  async function movePointTo(pointId: string, target: PointMoveTarget, index: number) {
    if (treeBusy) return;
    setTreeBusy(true);
    try {
      report(await movePointAction({
        pointId,
        targetChapterId: target.chapterId ?? null,
        targetParentPointId: target.parentPointId ?? null,
        index,
        subjectCode,
      }));
    } catch (error) {
      console.error("知识点移动失败", error);
      report({ ok: false, error: "网络异常，移动未保存" });
    } finally {
      setTreeBusy(false);
    }
  }

  return {
    collapsedMap,
    toggleCollapsed,
    drag,
    setDrag,
    nestChapter,
    moveChapterTo,
    movePointTo,
    treeBusy,
    focusChapter,
  };
}
