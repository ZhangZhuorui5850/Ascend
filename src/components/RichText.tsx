"use client";

import { useEffect, useState } from "react";
import "katex/dist/katex.min.css";

/**
 * 纯文本 + 数学公式渲染：$...$ 行内、$$...$$ 块级（block 模式下）。
 * KaTeX 按需动态加载——内容不含 $ 时零开销；加载完成前先显示原文。
 * 服务于知识点标题、错题、随笔等"非 Markdown 但要公式"的文本字段；
 * Markdown 预览（AssetViewer）走 @/lib/markdown 的 AST，仅复用这里的 MathTex。
 */

export type MathSegment =
  | { kind: "text"; text: string }
  | { kind: "math"; tex: string; display: boolean };

// 顺序：\$ 转义 > $$...$$（可跨行）> $...$（首尾紧贴非空白，避免货币写法误判）
const MATH_PATTERN = /(\\\$)|(\$\$[^$]+?\$\$)|(\$(?!\s)(?:[^$\n]*?[^\s$])\$)/g;

export function splitMathSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  const pattern = new RegExp(MATH_PATTERN.source, "g");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) pushText(segments, text.slice(last, match.index));
    const token = match[0];
    if (token === "\\$") {
      pushText(segments, "$");
    } else if (token.startsWith("$$")) {
      segments.push({ kind: "math", tex: token.slice(2, -2).trim(), display: true });
    } else {
      segments.push({ kind: "math", tex: token.slice(1, -1).trim(), display: false });
    }
    last = match.index + token.length;
  }
  if (last < text.length) pushText(segments, text.slice(last));
  return segments;
}

function pushText(segments: MathSegment[], text: string) {
  if (!text) return;
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && lastSegment.kind === "text") {
    lastSegment.text += text;
  } else {
    segments.push({ kind: "text", text });
  }
}

/* ---------- KaTeX 懒加载 ---------- */

type Katex = typeof import("katex").default;
let katexPromise: Promise<Katex> | null = null;

function loadKatex(): Promise<Katex> {
  katexPromise ??= import("katex").then((mod) => mod.default);
  return katexPromise;
}

export function MathTex({ tex, display }: { tex: string; display: boolean }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadKatex().then((katex) => {
      if (cancelled) return;
      setHtml(katex.renderToString(tex, { displayMode: display, throwOnError: false }));
    });
    return () => {
      cancelled = true;
    };
  }, [tex, display]);

  // 加载完成前显示原文，避免布局跳动为空
  if (html === null) {
    return <span className="mathPending">{display ? `$$${tex}$$` : `$${tex}$`}</span>;
  }
  // KaTeX 对输入做了完整转义，renderToString 输出可安全注入
  return display ? (
    <span className="mathDisplay" dangerouslySetInnerHTML={{ __html: html }} role="math" />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} role="math" />
  );
}

/**
 * text 不含 $ 时直接原样输出（快速路径）。
 * block=true 用于多行文本（随笔等）：保留换行，且 $$...$$ 按块级公式展示。
 */
export function RichText({ text, block = false }: { text: string; block?: boolean }) {
  if (!text.includes("$")) {
    return block ? <span className="richTextBlock">{text}</span> : <>{text}</>;
  }
  const segments = splitMathSegments(text);
  return (
    <span className={block ? "richTextBlock" : undefined}>
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <MathTex display={segment.display && block} key={index} tex={segment.tex} />
        ),
      )}
    </span>
  );
}
