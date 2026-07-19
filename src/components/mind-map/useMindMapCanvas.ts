"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { clampZoom, linkPath, ZOOM_STEP } from "@/components/mindmap";

/**
 * 导图画布的几何与交互：量卡片位置重画贝塞尔连线（纯 DOM 写入）、
 * ResizeObserver 跟随字体/公式尺寸变化、Ctrl+滚轮缩放、空白处拖拽平移。
 */
export function useMindMapCanvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  /** 量出每张卡片相对画布的位置，重画父→子贝塞尔连线（纯 DOM 写入，不进 state） */
  const drawLinks = useCallback(() => {
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    if (!canvas || !svg) return;
    const canvasRect = canvas.getBoundingClientRect();
    const scale = canvas.offsetWidth ? canvasRect.width / canvas.offsetWidth : 1;
    svg.setAttribute("width", String(canvas.offsetWidth));
    svg.setAttribute("height", String(canvas.offsetHeight));
    svg.setAttribute("viewBox", `0 0 ${canvas.offsetWidth} ${canvas.offsetHeight}`);
    const cards = new Map<string, HTMLElement>();
    canvas.querySelectorAll<HTMLElement>("[data-map-node]").forEach((el) => {
      const key = el.dataset.mapNode;
      if (key) cards.set(key, el);
    });
    const paths: SVGPathElement[] = [];
    cards.forEach((el) => {
      const parentKey = el.dataset.mapParent;
      const parent = parentKey ? cards.get(parentKey) : null;
      if (!parent) return;
      const from = parent.getBoundingClientRect();
      const to = el.getBoundingClientRect();
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "mapLink");
      path.setAttribute(
        "d",
        linkPath(
          (from.right - canvasRect.left) / scale,
          (from.top + from.height / 2 - canvasRect.top) / scale,
          (to.left - canvasRect.left) / scale,
          (to.top + to.height / 2 - canvasRect.top) / scale,
        ),
      );
      paths.push(path);
    });
    svg.replaceChildren(...paths);
  }, []);

  // 每次渲染后重画连线（折叠、增删、改名都会改变布局）
  useLayoutEffect(drawLinks);

  useEffect(() => {
    const viewport = viewportRef.current;
    const treeEl = canvasRef.current;
    if (!viewport || !treeEl) return;
    // 字体/公式异步加载导致的尺寸变化
    const observer = new ResizeObserver(() => drawLinks());
    observer.observe(treeEl);
    // React 的 onWheel 挂在 root 上是 passive 的，preventDefault 无效，只能手动挂非 passive 监听
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((current) => clampZoom(current + (event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("wheel", onWheel);
    };
  }, [drawLinks]);

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport || event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".mapCard, button, input, select, a")) return;
    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.setAttribute("data-panning", "true");
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    const pan = panRef.current;
    if (!viewport || !pan || pan.pointerId !== event.pointerId) return;
    viewport.scrollLeft = pan.left - (event.clientX - pan.x);
    viewport.scrollTop = pan.top - (event.clientY - pan.y);
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    viewport?.removeAttribute("data-panning");
  }

  return { viewportRef, canvasRef, svgRef, zoom, setZoom, startPan, movePan, endPan };
}
