"use client";

import { ChangeEvent, ClipboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Camera, CheckCircle2, FileText, FolderOpen, ImageIcon, Inbox, Loader2, Paperclip, Plus, Send, X } from "lucide-react";
import { createPointAction } from "@/app/actions/knowledge";
import { todayKey } from "@/lib/dates";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";
import type { CaptureSubject } from "@/lib/repo/knowledge";

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

export function CapturePanel({ subjects, onClose }: { subjects: CaptureSubject[]; onClose?: () => void }) {
  const router = useRouter();
  const [day, setDay] = useState(todayKey());
  const [subjectCode, setSubjectCode] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [selectedPointIds, setSelectedPointIds] = useState<string[]>([]);
  const [newPointTitle, setNewPointTitle] = useState("");
  const [creatingPoint, setCreatingPoint] = useState(false);
  const [folderPath, setFolderPath] = useState("未归档");
  const [folderTouched, setFolderTouched] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachmentsRef = useRef<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
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

  // 全局粘贴：焦点不在输入框时 Ctrl+V 图片/文件 → 自动加入队列并唤起收纳抽屉
  useEffect(() => {
    function onWindowPaste(event: Event) {
      const paste = event as unknown as { clipboardData: DataTransfer | null; target: EventTarget | null; preventDefault(): void };
      const target = paste.target as Element | null;
      if (
        target &&
        typeof target.closest === "function" &&
        (target.closest("input, textarea, select, [contenteditable=true]") || target.closest(".capturePanel"))
      ) {
        return;
      }
      const files = paste.clipboardData?.files;
      if (files && files.length) {
        paste.preventDefault();
        addFiles(files);
        window.dispatchEvent(new CustomEvent("zgca:open-capture"));
      }
    }
    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, []);

  const selectedSubject = subjects.find((subject) => subject.code === subjectCode);
  const chapters = selectedSubject?.chapters || [];
  const selectedChapter = chapters.find((chapter) => chapter.id === chapterId);
  const selectedPointSet = new Set(selectedPointIds);

  function defaultFolderFor(subject?: string, chapterTitle?: string) {
    return [subject, chapterTitle].filter(Boolean).join("/") || "未归档";
  }

  function selectSubject(code: string) {
    setSubjectCode(code);
    setChapterId("");
    setSelectedPointIds([]);
    if (!folderTouched) setFolderPath(defaultFolderFor(code));
  }

  function selectChapter(id: string) {
    setChapterId(id);
    setSelectedPointIds([]);
    const chapter = chapters.find((item) => item.id === id);
    if (!folderTouched) setFolderPath(defaultFolderFor(subjectCode, chapter?.title));
  }

  function togglePoint(id: string) {
    setSelectedPointIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function createPointInline() {
    const title = newPointTitle.trim();
    if (!title || !chapterId || !subjectCode || creatingPoint) return;
    setCreatingPoint(true);
    const result = await createPointAction({ chapterId, title, subjectCode });
    setCreatingPoint(false);
    if (result.ok) {
      setNewPointTitle("");
      router.refresh();
    } else {
      setMessage(result.error || "新建知识点失败");
    }
  }

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    if (!incoming.length) return;

    const next: Attachment[] = incoming.map((file) => {
      const oversized = file.size > MAX_UPLOAD_BYTES;
      return {
        id: crypto.randomUUID(),
        file,
        name: file.name || `截图-${Date.now()}.png`,
        size: file.size,
        type: file.type,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        status: oversized ? ("error" as const) : ("queued" as const),
        error: oversized ? "超过 20MB 上限" : undefined,
      };
    });

    setAttachments((current) => [...current, ...next]);
    const oversizedCount = next.filter((item) => item.status === "error").length;
    setMessage(
      oversizedCount
        ? `已加入 ${next.length - oversizedCount} 个文件，${oversizedCount} 个超过 20MB 无法入库`
        : `已加入 ${next.length} 个文件，点击发送入库`,
    );
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    const files = event.clipboardData.files;
    if (files.length) {
      event.preventDefault();
      addFiles(files);
    }
  }

  // 整页拖放：文件拖到页面任意位置都进收纳队列，松手后自动打开收纳面板。
  // 用捕获阶段监听，避免资料库内部「拖动文件进文件夹」的 drop 处理器吞掉 OS 文件；
  // 反过来，内部拖拽不带 Files 类型，这里不会响应。
  useEffect(() => {
    function hasFiles(event: globalThis.DragEvent) {
      const types = event.dataTransfer?.types;
      return !!types && Array.from(types).includes("Files");
    }
    function onDragEnter(event: globalThis.DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragging(true);
    }
    function onDragOver(event: globalThis.DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }
    function onDragLeave(event: globalThis.DragEvent) {
      if (!hasFiles(event)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDragging(false);
    }
    function onDrop(event: globalThis.DragEvent) {
      dragDepthRef.current = 0;
      setIsDragging(false);
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const files = event.dataTransfer?.files;
      if (files && files.length) {
        addFiles(files);
        window.dispatchEvent(new CustomEvent("zgca:open-capture"));
      }
    }
    window.addEventListener("dragenter", onDragEnter, true);
    window.addEventListener("dragover", onDragOver, true);
    window.addEventListener("dragleave", onDragLeave, true);
    window.addEventListener("drop", onDrop, true);
    return () => {
      window.removeEventListener("dragenter", onDragEnter, true);
      window.removeEventListener("dragover", onDragOver, true);
      window.removeEventListener("dragleave", onDragLeave, true);
      window.removeEventListener("drop", onDrop, true);
    };
  }, []);

  // 加号菜单：点外面或按 Esc 收起
  useEffect(() => {
    if (!addMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      if (!target?.closest(".captureAddWrap")) setAddMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setAddMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [addMenuOpen]);

  function pickFrom(input: HTMLInputElement | null) {
    setAddMenuOpen(false);
    input?.click();
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  }

  async function uploadAttachment(attachment: Attachment): Promise<{ id: number }> {
    const formData = new FormData();
    formData.append("file", attachment.file, attachment.name);
    formData.append("day", day);
    formData.append("folderPath", folderPath);
    formData.append("subjectCode", subjectCode);
    formData.append("chapterId", chapterId);
    formData.append("knowledgePointIds", selectedPointIds.join(","));
    formData.append("note", note);

    const response = await fetch("/api/assets", { method: "POST", body: formData });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "上传失败");
    }
    return (await response.json()) as { id: number };
  }

  async function uploadQueuedAttachment(attachment: Attachment) {
    if (attachment.status === "uploaded" || attachment.status === "uploading") return;
    if (attachment.size > MAX_UPLOAD_BYTES) return;
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
    } catch (error) {
      setAttachments((current) =>
        current.map((item) =>
          item.id === attachment.id
            ? { ...item, status: "error", error: error instanceof Error ? error.message : "上传失败" }
            : item,
        ),
      );
    }
  }

  async function sendCapture() {
    const pending = attachmentsRef.current.filter(
      (attachment) => attachment.status === "queued" || attachment.status === "error",
    );
    if (!pending.length) {
      setMessage("先拖入、粘贴或选择文件");
      return;
    }
    await Promise.all(pending.map((attachment) => uploadQueuedAttachment(attachment)));
    const failed = attachmentsRef.current.filter((attachment) => attachment.status === "error").length;
    setMessage(failed ? `有 ${failed} 个文件上传失败，可以重试` : "文件已按当前归属入库");
    if (!failed) {
      setNote("");
      router.refresh();
      // 入库成功后短暂展示对勾，然后清场，方便连续收纳下一批
      setTimeout(() => {
        setAttachments((current) => {
          current
            .filter((item) => item.status === "uploaded")
            .forEach((item) => {
              if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            });
          return current.filter((item) => item.status !== "uploaded");
        });
      }, 1500);
    }
  }

  const queuedCount = attachments.filter((a) => a.status === "queued" || a.status === "error").length;

  return (
    <>
      {isDragging ? (
        <div aria-hidden className="pageDropOverlay">
          <div className="pageDropHint">
            <Inbox size={22} />
            <strong>松开鼠标，放入收纳</strong>
            <span>文件会进入收纳面板的待入库队列</span>
          </div>
        </div>
      ) : null}
    <aside
      className={`capturePanel ${isDragging ? "captureDragging" : ""}`}
      data-testid="capture-panel"
      onPaste={handlePaste}
    >
      <div className="panelHeader">
        <h2>收纳面板</h2>
        <button className="captureClose" onClick={onClose} type="button" aria-label="关闭收纳面板">
          <X size={16} />
        </button>
      </div>

      <div className={`dropZone ${isDragging ? "isDragging" : ""}`}>
        <button className="dropZoneInner" onClick={() => fileInputRef.current?.click()} type="button">
          <Paperclip size={18} />
          <span>拖拽文件到页面任意位置、粘贴截图，或点击选择</span>
        </button>
        <div className="captureAddWrap">
          {addMenuOpen ? (
            <div className="captureAddMenu" role="menu">
              <button className="cameraOnly" onClick={() => pickFrom(cameraInputRef.current)} role="menuitem" type="button">
                <Camera size={15} />
                打开相机
              </button>
              <button onClick={() => pickFrom(galleryInputRef.current)} role="menuitem" type="button">
                <ImageIcon size={15} />
                打开相册
              </button>
              <button onClick={() => pickFrom(fileInputRef.current)} role="menuitem" type="button">
                <FolderOpen size={15} />
                上传文件
              </button>
            </div>
          ) : null}
          <button
            aria-expanded={addMenuOpen}
            aria-label="添加文件"
            className={addMenuOpen ? "captureAdd open" : "captureAdd"}
            onClick={() => setAddMenuOpen((open) => !open)}
            type="button"
          >
            <Plus size={17} />
          </button>
        </div>

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
                  <span>{formatSize(attachment.size)}</span>
                </div>
                <div className={`attachmentStatus status-${attachment.status}`}>
                  {attachment.status === "queued" ? "待入库" : null}
                  {attachment.status === "uploading" ? <Loader2 size={15} className="spin" /> : null}
                  {attachment.status === "uploaded" ? <CheckCircle2 size={15} /> : null}
                  {attachment.status === "error" ? <AlertCircle size={15} /> : null}
                </div>
                {attachment.status === "error" ? (
                  <button className="attachmentLink" onClick={() => void uploadQueuedAttachment(attachment)} type="button">
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
      </div>

      <label className="field">
        日期
        <input value={day} onChange={(event) => setDay(event.target.value)} type="date" />
      </label>
      <div className="fieldRow">
        <label className="field">
          科目
          <select value={subjectCode} onChange={(event) => selectSubject(event.target.value)}>
            <option value="">未分类</option>
            {subjects.map((subject) => (
              <option key={subject.code} value={subject.code}>
                {subject.code} · {subject.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          章节
          <select value={chapterId} onChange={(event) => selectChapter(event.target.value)} disabled={!subjectCode}>
            <option value="">未选择</option>
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedChapter ? (
        <div className="field">
          知识点
          <div className="tagPicker">
            {selectedChapter.points.map((point) => (
              <button
                className={selectedPointSet.has(point.id) ? "active" : ""}
                key={point.id}
                onClick={() => togglePoint(point.id)}
                type="button"
              >
                {point.title}
              </button>
            ))}
            {!selectedChapter.points.length ? <span className="emptyChip">本章还没有知识点</span> : null}
          </div>
          <div className="inlineCreate">
            <input
              value={newPointTitle}
              onChange={(event) => setNewPointTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void createPointInline();
                }
              }}
              placeholder="新建知识点后可选中"
            />
            <button disabled={creatingPoint || !newPointTitle.trim()} onClick={() => void createPointInline()} type="button">
              <Plus size={13} />
            </button>
          </div>
        </div>
      ) : null}

      <label className="field">
        文件夹
        <input
          value={folderPath}
          onChange={(event) => {
            setFolderPath(event.target.value);
            setFolderTouched(true);
          }}
          placeholder="M1/特征值"
        />
      </label>
      <label className="field">
        备注
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="可选：这批文件是什么" />
      </label>

      <button className="primaryButton sendCapture" disabled={!queuedCount} onClick={() => void sendCapture()} type="button">
        <Send size={15} />
        {queuedCount ? `入库 ${queuedCount} 个文件` : "入库"}
      </button>
      <p className="hint">{message || "文件会按日期落到当天，并按上面的归属挂到科目、知识点和文件夹。"}</p>

      <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileInput} />
      <input ref={galleryInputRef} type="file" accept="image/*" multiple hidden onChange={handleFileInput} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFileInput} />
    </aside>
    </>
  );
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
