"use client";

import { useEffect, useState } from "react";

/**
 * 显示与阅读偏好。与 AppearanceSection 同模式：localStorage 持久化，
 * 根元素属性/CSS 变量即时生效，layout.tsx 的启动脚本负责刷新后恢复。
 */

type Zoom = "0.9" | "1" | "1.1" | "1.25";
type LineHeight = "compact" | "normal" | "loose";
type UiFont = "sans" | "serif";

const root = () => document.documentElement;

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div aria-label={label} className="segmented" role="radiogroup">
      {options.map((option) => (
        <button
          aria-checked={value === option.value}
          className={value === option.value ? "isActive" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
          role="radio"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function DisplaySection() {
  const [grid, setGrid] = useState(100);
  const [zoom, setZoom] = useState<Zoom>("1");
  const [lh, setLh] = useState<LineHeight>("normal");
  const [font, setFont] = useState<UiFont>("sans");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    const g = parseInt(localStorage.getItem("zgca-grid") ?? "", 10);
    const z = localStorage.getItem("zgca-zoom");
    const l = localStorage.getItem("zgca-lh");
    window.setTimeout(() => {
      if (!Number.isNaN(g)) setGrid(Math.max(0, Math.min(100, g)));
      if (z === "0.9" || z === "1.1" || z === "1.25") setZoom(z);
      if (l === "compact" || l === "loose") setLh(l);
      if (localStorage.getItem("zgca-font") === "serif") setFont("serif");
      if (localStorage.getItem("zgca-motion") === "reduce") setReduceMotion(true);
      if (localStorage.getItem("zgca-contrast") === "high") setHighContrast(true);
    }, 0);
  }, []);

  function applyGrid(next: number) {
    setGrid(next);
    localStorage.setItem("zgca-grid", String(next));
    root().style.setProperty("--grid-alpha", String(next / 100));
  }

  function applyZoom(next: Zoom) {
    setZoom(next);
    localStorage.setItem("zgca-zoom", next);
    if (next === "1") root().style.removeProperty("--ui-zoom");
    else root().style.setProperty("--ui-zoom", next);
  }

  function applyLh(next: LineHeight) {
    setLh(next);
    localStorage.setItem("zgca-lh", next);
    if (next === "normal") delete root().dataset.lh;
    else root().dataset.lh = next;
  }

  function applyFont(next: UiFont) {
    setFont(next);
    localStorage.setItem("zgca-font", next);
    if (next === "serif") root().dataset.uiFont = "serif";
    else delete root().dataset.uiFont;
  }

  function applyMotion(next: boolean) {
    setReduceMotion(next);
    localStorage.setItem("zgca-motion", next ? "reduce" : "auto");
    if (next) root().dataset.motion = "reduce";
    else delete root().dataset.motion;
  }

  function applyContrast(next: boolean) {
    setHighContrast(next);
    localStorage.setItem("zgca-contrast", next ? "high" : "normal");
    if (next) root().dataset.contrast = "high";
    else delete root().dataset.contrast;
  }

  const onOff = [
    { value: "off", label: "关" },
    { value: "on", label: "开" },
  ] as Array<{ value: "off" | "on"; label: string }>;

  return (
    <section aria-label="显示与阅读" className="card">
      <div className="sectionTitle">
        <h2>显示与阅读</h2>
        <span className="sectionHint">只影响当前浏览器</span>
      </div>

      <div className="displayRow">
        <div className="displayRowCopy">
          <strong>纸张网格</strong>
          <small>背景横竖格线的浓度，拉到 0 完全隐藏</small>
        </div>
        <div className="displayControl">
          <input
            aria-label="纸张网格浓度"
            max={100}
            min={0}
            onChange={(event) => applyGrid(Number(event.target.value))}
            step={5}
            type="range"
            value={grid}
          />
          <span className="displayValue">{grid}%</span>
        </div>
      </div>

      <div className="displayRow">
        <div className="displayRowCopy">
          <strong>界面缩放</strong>
          <small>整体放大或缩小，适合高分屏 / 坐远看</small>
        </div>
        <Segmented
          label="界面缩放"
          onChange={applyZoom}
          options={[
            { value: "0.9", label: "90%" },
            { value: "1", label: "100%" },
            { value: "1.1", label: "110%" },
            { value: "1.25", label: "125%" },
          ]}
          value={zoom}
        />
      </div>

      <div className="displayRow">
        <div className="displayRowCopy">
          <strong>行距</strong>
          <small>正文行与行之间的松紧</small>
        </div>
        <Segmented
          label="行距"
          onChange={applyLh}
          options={[
            { value: "compact", label: "紧凑" },
            { value: "normal", label: "标准" },
            { value: "loose", label: "宽松" },
          ]}
          value={lh}
        />
      </div>

      <div className="displayRow">
        <div className="displayRowCopy">
          <strong>正文字体</strong>
          <small>衬线（宋体）更有手帐味，无衬线更利落</small>
        </div>
        <Segmented
          label="正文字体"
          onChange={applyFont}
          options={[
            { value: "sans", label: "无衬线" },
            { value: "serif", label: "衬线" },
          ]}
          value={font}
        />
      </div>

      <div className="displayRow">
        <div className="displayRowCopy">
          <strong>减弱动效</strong>
          <small>关闭过渡与动画，页面切换更干脆</small>
        </div>
        <Segmented
          label="减弱动效"
          onChange={(v) => applyMotion(v === "on")}
          options={onOff}
          value={reduceMotion ? "on" : "off"}
        />
      </div>

      <div className="displayRow">
        <div className="displayRowCopy">
          <strong>高对比文字</strong>
          <small>次级文字与分隔线加深，弱光环境更易读</small>
        </div>
        <Segmented
          label="高对比文字"
          onChange={(v) => applyContrast(v === "on")}
          options={onOff}
          value={highContrast ? "on" : "off"}
        />
      </div>
    </section>
  );
}
