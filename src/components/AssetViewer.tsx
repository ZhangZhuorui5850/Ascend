"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Download, ExternalLink, FileText, Loader2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { previewKind } from "@/components/file-explorer/preview-kind";
import { assetFileUrl } from "@/lib/asset-url";
import { detectIOS } from "@/components/file-explorer/detect-ios";

const MarkdownContent = dynamic(
  () => import("@/components/MarkdownContent").then((mod) => mod.MarkdownContent),
  { loading: () => <p className="viewerLoading" role="status">正在渲染文档…</p> },
);

const TEXT_PREVIEW_LIMIT = 1024 * 1024;

const subscribeNoop = () => () => {};
const getServerIsIOS = () => false;

export type ViewerFile = {
  id: number;
  original_name: string;
  mime_type: string;
  size: number;
};

export function AssetViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
  const kind = previewKind(file);
  const url = assetFileUrl(file.id);
  // iOS（含 iPadOS 桌面模式）的内嵌 iframe PDF 只渲染第一页且无法翻页，
  // 无法真机逐版本验证，因此保守降级：iOS 上不渲染 iframe，主路径改为新标签页打开/下载。
  // SSR 快照恒为 false，客户端首次渲染即读 UA（UA 不会中途变化，订阅为空操作）。
  const isIOS = useSyncExternalStore(subscribeNoop, detectIOS, getServerIsIOS);

  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Viewport className="viewerBackdrop">
      <Dialog.Popup aria-label="文件预览" className="assetViewer" initialFocus={closeRef} finalFocus>
        <header className="viewerHead">
          <Dialog.Title title={file.original_name}>{file.original_name}</Dialog.Title>
          <div className="viewerHeadActions">
            <a className="secondaryButton" href={url} rel="noopener" target="_blank">
              <ExternalLink size={14} />
              新窗口打开
            </a>
            <button ref={closeRef} aria-label="关闭预览" className="viewerClose" onClick={onClose} type="button">
              <X size={17} />
            </button>
          </div>
        </header>
        <div className={`viewerBody viewer-${kind}`}>
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={file.original_name} src={url} />
          ) : null}
          {kind === "pdf" && isIOS ? (
            <div className="viewerPdfFallback iosForced">
              <FileText aria-hidden size={44} />
              <h3>请在新标签页打开这份 PDF</h3>
              <p>iOS Safari 的内嵌 PDF 只能显示第一页、无法翻页，因此这里不做内嵌预览，改为直接打开或下载。</p>
              <a className="primaryButton" href={url} rel="noopener" target="_blank">
                <ExternalLink size={15} />
                在新标签页打开
              </a>
              <a className="secondaryButton" download={file.original_name} href={url}>
                <Download size={15} />
                下载 PDF
              </a>
            </div>
          ) : null}
          {kind === "pdf" && !isIOS ? (
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
          {kind === "markdown" || kind === "text" ? <TextPreview key={`${url}:${file.size}`} kind={kind} size={file.size} url={url} /> : null}
          {kind === "none" ? (
            <p className="empty">这个文件类型暂不支持预览，可以在新窗口打开。</p>
          ) : null}
        </div>
      </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TextPreview({ url, kind, size }: { url: string; kind: "markdown" | "text"; size: number }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (size > TEXT_PREVIEW_LIMIT) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("读取文件失败");
        return response.text();
      })
      .then((text) => {
        if (!controller.signal.aborted) setContent(text);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("读取文本预览失败", url, err);
        setError(err instanceof Error ? err.message : "读取文件失败");
      });
    return () => {
      controller.abort();
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
  return kind === "markdown" ? <MarkdownContent source={content} /> : (
    <pre className="textView">{content}</pre>
  );
}
