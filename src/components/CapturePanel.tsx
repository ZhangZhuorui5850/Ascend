"use client";

import { ChangeEvent, ClipboardEvent, DragEvent, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, ImageIcon, Loader2, Paperclip, Send, X } from "lucide-react";

type AttachmentStatus = "queued" | "uploading" | "uploaded" | "error";

type Attachment = {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  assetId?: number;
  previewUrl?: string;
  status: AttachmentStatus;
  error?: string;
};

function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function fileKind(file: File) {
  if (file.type.startsWith("image/")) return "图片";
  if (file.type.includes("pdf")) return "PDF";
  if (file.name.endsWith(".md")) return "Markdown";
  if (file.name.endsWith(".doc") || file.name.endsWith(".docx")) return "Word";
  return file.type || "文件";
}

export function CapturePanel({ onClose }: { onClose?: () => void }) {
  const [day, setDay] = useState(today());
  const [tags, setTags] = useState("待整理");
  const [subjectCode, setSubjectCode] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const [message, setMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachmentsRef = useRef<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
    };
  }, []);

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    if (!incoming.length) return;

    const next = incoming.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name || `截图-${Date.now()}.png`,
      size: file.size,
      type: file.type,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      status: "queued" as const,
    }));

    setAttachments((current) => [...current, ...next]);
    setMessage(`已加入 ${next.length} 个文件，正在上传入库`);
    for (const attachment of next) {
      void uploadQueuedAttachment(attachment);
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = event.clipboardData.files;
    if (files.length) {
      event.preventDefault();
      addFiles(files);
    }
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  }

  async function uploadAttachment(attachment: Attachment): Promise<{ id: number }> {
    const formData = new FormData();
    formData.append("file", attachment.file, attachment.name);
    formData.append("day", day);
    formData.append("tags", tags);
    formData.append("subjectCode", subjectCode);

    const response = await fetch("/api/assets", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "上传失败");
    }

    return (await response.json()) as { id: number };
  }

  async function uploadQueuedAttachment(attachment: Attachment) {
    setAttachments((current) =>
      current.map((item) => (item.id === attachment.id ? { ...item, status: "uploading", error: undefined } : item)),
    );

    try {
      const asset = await uploadAttachment(attachment);
      setAttachments((current) =>
        current.map((item) =>
          item.id === attachment.id ? { ...item, status: "uploaded", assetId: Number(asset.id) } : item,
        ),
      );
      setMessage("文件已上传到当天资料流");
    } catch (error) {
      setAttachments((current) =>
        current.map((item) =>
          item.id === attachment.id
            ? { ...item, status: "error", error: error instanceof Error ? error.message : "上传失败" }
            : item,
        ),
      );
      setMessage("有文件上传失败，可以重试");
    }
  }

  async function submitQuickNote() {
    if (!quickNote.trim()) return;
    await fetch("/api/study-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ day, title: quickNote, subjectCode, output: "快速记录", durationMinutes: 0 }),
    });
    setQuickNote("");
  }

  async function sendCapture() {
    if (!quickNote.trim() && attachments.length === 0) {
      setMessage("先输入记录，或拖入/粘贴文件");
      return;
    }

    if (quickNote.trim()) {
      await submitQuickNote();
    }

    setMessage("记录已写入；文件会在上传成功后自动进入资料流");
  }

  return (
    <aside
      className={`capturePanel ${isDragging ? "captureDragging" : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="panelHeader">
        <div>
          <span className="eyebrow">Quick Capture</span>
          <h2>收纳小窗口</h2>
        </div>
        <button className="captureClose" onClick={onClose} type="button" aria-label="关闭收纳小窗口">
          <X size={16} />
        </button>
      </div>

      <label className="field">
        日期
        <input value={day} onChange={(event) => setDay(event.target.value)} type="date" />
      </label>
      <label className="field">
        标签
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="线代, PCA, 待整理" />
      </label>
      <label className="field">
        科目
        <select value={subjectCode} onChange={(event) => setSubjectCode(event.target.value)}>
          <option value="">未分类</option>
          {["M1", "M2", "M3", "M4", "M5", "M6", "M7"].map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>

      <div className={`chatCaptureBox ${isDragging ? "isDragging" : ""}`}>
        <textarea
          value={quickNote}
          onChange={(event) => setQuickNote(event.target.value)}
          onPaste={handlePaste}
          placeholder="像 ChatGPT 一样：直接写记录，拖入文件，或 Ctrl+V 粘贴截图..."
        />

        {attachments.length ? (
          <div className="attachmentGrid">
            {attachments.map((attachment) => (
              <div className="attachmentCard" key={attachment.id}>
                <div className="attachmentPreview">
                  {attachment.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attachment.previewUrl} alt={attachment.name} />
                  ) : attachment.type.startsWith("image/") ? (
                    <ImageIcon size={20} />
                  ) : (
                    <FileText size={20} />
                  )}
                </div>
                <div className="attachmentMeta">
                  <strong>{attachment.name}</strong>
                  <span>{fileKind(attachment.file)} · {formatSize(attachment.size)}</span>
                </div>
                <div className={`attachmentStatus status-${attachment.status}`}>
                  {attachment.status === "queued" ? "待发" : null}
                  {attachment.status === "uploading" ? <Loader2 size={15} className="spin" /> : null}
                  {attachment.status === "uploaded" ? <CheckCircle2 size={15} /> : null}
                  {attachment.status === "error" ? <AlertCircle size={15} /> : null}
                </div>
                {attachment.status === "uploaded" && attachment.assetId ? (
                  <a className="attachmentLink" href={`/api/assets/${attachment.assetId}/file`} target="_blank">
                    下载
                  </a>
                ) : null}
                {attachment.status === "error" ? (
                  <button className="attachmentLink" onClick={() => uploadQueuedAttachment(attachment)} type="button">
                    重试
                  </button>
                ) : null}
                <button className="removeAttachment" onClick={() => removeAttachment(attachment.id)} type="button" aria-label="移除文件">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="composerActions">
          <button className="iconButton" onClick={() => fileInputRef.current?.click()} type="button" title="选择文件">
            <Paperclip size={17} />
          </button>
          <span className="composerHint">拖拽文件到这里，或在输入框内粘贴截图</span>
          <button className="sendButton" onClick={sendCapture} type="button" title="发送入库">
            <Send size={16} />
          </button>
        </div>

        <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileInput} />
      </div>

      {message ? <p className="hint">{message}</p> : <p className="hint">文件会即时上传，文字记录点击发送后写入当天。</p>}
    </aside>
  );
}
