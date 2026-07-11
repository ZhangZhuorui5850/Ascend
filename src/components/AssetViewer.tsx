"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";

const TEXT_EXTENSIONS = new Set([
  "txt", "json", "csv", "log", "py", "js", "ts", "tsx", "jsx", "c", "cpp", "h", "hpp",
  "java", "sql", "sh", "bat", "yml", "yaml", "xml", "toml", "ini", "tex", "r", "go", "rs",
]);
const TEXT_PREVIEW_LIMIT = 1024 * 1024;

export type ViewerFile = {
  id: number;
  original_name: string;
  mime_type: string;
  size: number;
};

export type PreviewKind = "image" | "pdf" | "markdown" | "text" | "none";

export function previewKind(file: { original_name: string; mime_type: string }): PreviewKind {
  const mime = (file.mime_type || "").toLowerCase();
  const ext = file.original_name.includes(".")
    ? file.original_name.split(".").pop()!.toLowerCase()
    : "";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime === "text/markdown" || ext === "md" || ext === "markdown") return "markdown";
  if (mime.startsWith("text/") || TEXT_EXTENSIONS.has(ext)) return "text";
  return "none";
}

export function AssetViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
  const kind = previewKind(file);
  const url = `/api/assets/${file.id}/file`;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div aria-label="文件预览" className="viewerBackdrop" onClick={onClose} role="dialog">
      <div className="assetViewer" onClick={(event) => event.stopPropagation()}>
        <header className="viewerHead">
          <h2 title={file.original_name}>{file.original_name}</h2>
          <div className="viewerHeadActions">
            <a className="secondaryButton" href={url} rel="noopener" target="_blank">
              <ExternalLink size={14} />
              新窗口打开
            </a>
            <button aria-label="关闭预览" className="viewerClose" onClick={onClose} type="button">
              <X size={17} />
            </button>
          </div>
        </header>
        <div className={`viewerBody viewer-${kind}`}>
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={file.original_name} src={url} />
          ) : null}
          {kind === "pdf" ? <iframe src={url} title={file.original_name} /> : null}
          {kind === "markdown" || kind === "text" ? <TextPreview kind={kind} size={file.size} url={url} /> : null}
          {kind === "none" ? (
            <p className="empty">这个文件类型暂不支持预览，可以在新窗口打开。</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TextPreview({ url, kind, size }: { url: string; kind: "markdown" | "text"; size: number }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (size > TEXT_PREVIEW_LIMIT) return;
    let cancelled = false;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("读取文件失败");
        return response.text();
      })
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "读取文件失败");
      });
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  if (size > TEXT_PREVIEW_LIMIT) {
    return <p className="empty">文件超过 1 MB，为了流畅起见请在新窗口打开。</p>;
  }
  if (error) return <p className="formError">{error}</p>;
  if (content === null) {
    return (
      <p className="viewerLoading">
        <Loader2 className="spin" size={16} /> 正在读取…
      </p>
    );
  }
  return kind === "markdown" ? (
    <div className="mdView">{renderMarkdown(content)}</div>
  ) : (
    <pre className="textView">{content}</pre>
  );
}

/* ---------- 轻量 Markdown 渲染（输出 React 元素，不经过 innerHTML，无 XSS 面） ---------- */

function renderMarkdown(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre className="mdCode" key={key++}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = renderInline(heading[2], `h${key}`);
      const Tag = (`h${Math.min(level + 1, 6)}`) as "h2";
      blocks.push(<Tag key={key++}>{text}</Tag>);
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key++} />);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={key++}>{renderMarkdown(quote.join("\n"))}</blockquote>);
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[index])) {
        const itemText = lines[index].replace(/^\s*([-*+]|\d+\.)\s+/, "");
        items.push(<li key={`li-${index}`}>{renderInline(itemText, `li${index}`)}</li>);
        index += 1;
      }
      blocks.push(ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6}\s|```|>\s?|\s*([-*+]|\d+\.)\s+|(-{3,}|\*{3,})\s*$)/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={key++}>{renderInline(paragraph.join(" "), `p${key}`)}</p>);
  }

  return blocks;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // 顺序：行内代码 > 图片（降级为链接）> 链接 > 加粗 > 斜体
  const pattern = /(`[^`]+`)|(!?\[[^\]]*\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const link = token.match(/^(!?)\[([^\]]*)\]\(([^)\s]+)\)$/);
      if (link) {
        const [, , label, href] = link;
        const safe = /^(https?:|mailto:|#)/i.test(href);
        nodes.push(
          safe ? (
            <a href={href} key={key} rel="noopener noreferrer" target="_blank">
              {label || href}
            </a>
          ) : (
            <span key={key}>{label || href}</span>
          ),
        );
      } else {
        nodes.push(token);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
