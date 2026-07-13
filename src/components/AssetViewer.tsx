"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ExternalLink, FileText, Loader2, X } from "lucide-react";
import { parseMarkdown, type Align, type BlockNode, type InlineNode } from "@/lib/markdown";
import { MathTex } from "@/components/RichText";
import { assetFileUrl } from "@/lib/asset-url";

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
  const url = assetFileUrl(file.id);

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
          {kind === "pdf" ? (
            <>
              <iframe src={url} title={file.original_name} />
              <div className="viewerPdfFallback">
                <FileText aria-hidden size={44} />
                <h3>在手机的 PDF 阅读器中打开</h3>
                <p>iPhone 与部分 Android WebView 的内嵌 PDF 支持不稳定，因此移动端不在弹窗里强制预览。</p>
                <a className="primaryButton" href={url} rel="noopener" target="_blank">
                  <ExternalLink size={15} />
                  打开 PDF
                </a>
              </div>
            </>
          ) : null}
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

/* ---------- Markdown 渲染：解析交给 @/lib/markdown，这里只负责 AST → React 元素 ---------- */

function renderMarkdown(source: string): ReactNode[] {
  return renderBlocks(parseMarkdown(source), "md");
}

function renderBlocks(blocks: BlockNode[], keyPrefix: string): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (block.kind) {
      case "heading": {
        // 文档 h1 降级为 h2，避免和预览窗标题抢层级
        const Tag = (`h${Math.min(block.level + 1, 6)}`) as "h2";
        return <Tag key={key}>{renderInlineNodes(block.inline, key)}</Tag>;
      }
      case "codeBlock":
        return (
          <pre className="mdCode" key={key}>
            <code>{block.text}</code>
          </pre>
        );
      case "mathBlock":
        return <MathTex display key={key} tex={block.tex} />;
      case "hr":
        return <hr key={key} />;
      case "blockquote":
        return <blockquote key={key}>{renderBlocks(block.children, key)}</blockquote>;
      case "list": {
        const items = block.items.map((item, itemIndex) => {
          const itemKey = `${key}-${itemIndex}`;
          return (
            <li className={item.checked !== null ? "mdTask" : undefined} key={itemKey}>
              {item.checked !== null ? <input checked={item.checked} disabled readOnly type="checkbox" /> : null}
              {renderInlineNodes(item.inline, itemKey)}
              {renderBlocks(item.children, itemKey)}
            </li>
          );
        });
        return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
      }
      case "table":
        return (
          <div className="mdTableWrap" key={key}>
            <table className="mdTable">
              <thead>
                <tr>
                  {block.header.map((cell, cellIndex) => (
                    <th key={cellIndex} style={alignStyle(block.align[cellIndex])}>
                      {renderInlineNodes(cell, `${key}-h${cellIndex}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} style={alignStyle(block.align[cellIndex])}>
                        {renderInlineNodes(cell, `${key}-${rowIndex}-${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "paragraph":
        return <p key={key}>{renderInlineNodes(block.inline, key)}</p>;
    }
  });
}

function alignStyle(align: Align): CSSProperties | undefined {
  return align ? { textAlign: align } : undefined;
}

function renderInlineNodes(nodes: InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.kind) {
      case "text":
        return node.text;
      case "code":
        return <code key={key}>{node.text}</code>;
      case "mathInline":
        return <MathTex display={false} key={key} tex={node.tex} />;
      case "strong":
        return <strong key={key}>{renderInlineNodes(node.children, key)}</strong>;
      case "em":
        return <em key={key}>{renderInlineNodes(node.children, key)}</em>;
      case "del":
        return <del key={key}>{renderInlineNodes(node.children, key)}</del>;
      case "link":
        return node.safe ? (
          <a href={node.href} key={key} rel="noopener noreferrer" target="_blank">
            {node.label}
          </a>
        ) : (
          <span key={key}>{node.label}</span>
        );
    }
  });
}
