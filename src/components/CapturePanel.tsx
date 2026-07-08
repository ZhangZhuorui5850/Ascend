"use client";

import { ChangeEvent, ClipboardEvent, DragEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
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

type KnowledgeTagOption = {
  id: string;
  name: string;
};

type ChapterOption = {
  id: string;
  title: string;
  knowledgeTags: KnowledgeTagOption[];
};

type CaptureSubjectOption = {
  code: string;
  name: string;
  chapters: ChapterOption[];
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
  const [category, setCategory] = useState("knowledge");
  const [folderPath, setFolderPath] = useState("未归档");
  const [subjectCode, setSubjectCode] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [selectedKnowledgeTags, setSelectedKnowledgeTags] = useState<string[]>([]);
  const [newKnowledgeTag, setNewKnowledgeTag] = useState("");
  const [captureSubjects, setCaptureSubjects] = useState<CaptureSubjectOption[]>([]);
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

  useEffect(() => {
    let active = true;
    fetch("/api/knowledge/hierarchy")
      .then((response) => (response.ok ? response.json() : []))
      .then((subjects: CaptureSubjectOption[]) => {
        if (active) setCaptureSubjects(subjects);
      })
      .catch(() => {
        if (active) setCaptureSubjects([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedSubject = captureSubjects.find((subject) => subject.code === subjectCode);
  const chapterOptions = selectedSubject?.chapters || [];
  const selectedChapter = chapterOptions.find((chapter) => chapter.id === chapterId);
  const selectedKnowledgeTagSet = new Set(selectedKnowledgeTags);

  function defaultFolderFor(subject: string, chapterTitle?: string) {
    return [subject, chapterTitle].filter(Boolean).join("/") || "未归档";
  }

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
    setMessage(`已加入 ${next.length} 个文件，点击发送后入库`);
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
    formData.append("tags", "待整理");
    formData.append("category", category);
    formData.append("folderPath", folderPath);
    formData.append("subjectCode", subjectCode);
    formData.append("chapterId", chapterId);
    formData.append("knowledgeTagNames", selectedKnowledgeTags.join(","));

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
    if (attachment.status === "uploaded" || attachment.status === "uploading") return;
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
      setMessage("文件已上传到知识库");
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
    const endpoint = category === "mistake" ? "/api/mistakes" : "/api/study-sessions";
    const body =
      category === "mistake"
        ? { day, title: quickNote, cause: selectedKnowledgeTags.join(", ") || "收纳登记", subjectCode }
        : { day, title: quickNote, subjectCode, output: selectedKnowledgeTags.join(", "), durationMinutes: 0 };
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
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

    const pendingAttachments = attachmentsRef.current.filter((attachment) => attachment.status === "queued" || attachment.status === "error");
    await Promise.all(pendingAttachments.map((attachment) => uploadQueuedAttachment(attachment)));
    setMessage("记录已写入，文件已按当前分类入库");
  }

  function toggleKnowledgeTag(name: string) {
    setSelectedKnowledgeTags((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  }

  function addKnowledgeTagFromInput() {
    const values = newKnowledgeTag
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!values.length) return;
    setSelectedKnowledgeTags((current) => Array.from(new Set([...current, ...values])));
    setNewKnowledgeTag("");
  }

  function handleKnowledgeTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    addKnowledgeTagFromInput();
  }

  return (
    <aside
      className={`capturePanel ${isDragging ? "captureDragging" : ""}`}
      data-testid="capture-panel"
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
        科目
        <select
          value={subjectCode}
          onChange={(event) => {
            const nextSubjectCode = event.target.value;
            setSubjectCode(nextSubjectCode);
            setChapterId("");
            setSelectedKnowledgeTags([]);
            setFolderPath(defaultFolderFor(nextSubjectCode));
          }}
        >
          <option value="">未分类</option>
          {captureSubjects.map((subject) => (
            <option key={subject.code} value={subject.code}>
              {subject.code} · {subject.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        章节
        <select
          value={chapterId}
          onChange={(event) => {
            const nextChapterId = event.target.value;
            const nextChapter = chapterOptions.find((chapter) => chapter.id === nextChapterId);
            setChapterId(nextChapterId);
            setSelectedKnowledgeTags([]);
            setFolderPath(defaultFolderFor(subjectCode, nextChapter?.title));
          }}
          disabled={!subjectCode}
        >
          <option value="">未选择章节</option>
          {chapterOptions.map((chapter) => (
            <option key={chapter.id} value={chapter.id}>
              {chapter.title}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        知识点
        <div className="tagPicker">
          {selectedChapter?.knowledgeTags.map((tag) => (
            <button
              className={selectedKnowledgeTagSet.has(tag.name) ? "active" : ""}
              key={tag.id}
              onClick={() => toggleKnowledgeTag(tag.name)}
              type="button"
            >
              {tag.name}
            </button>
          ))}
          <input
            value={newKnowledgeTag}
            onBlur={addKnowledgeTagFromInput}
            onChange={(event) => setNewKnowledgeTag(event.target.value)}
            onKeyDown={handleKnowledgeTagKeyDown}
            placeholder={chapterId ? "输入后 Enter 新建" : "先选章节"}
            disabled={!chapterId}
          />
        </div>
        {selectedKnowledgeTags.length ? (
          <div className="selectedTags">
            {selectedKnowledgeTags.map((tag) => (
              <button key={tag} onClick={() => toggleKnowledgeTag(tag)} type="button">
                {tag}<X size={12} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <label className="field">
        文件夹
        <input value={folderPath} onChange={(event) => setFolderPath(event.target.value)} placeholder="资料/数学/错题" />
      </label>
      <div className="captureTypeRow" aria-label="入库类型">
        {[
          ["knowledge", "资料"],
          ["mistake", "错题"],
          ["note", "笔记"],
        ].map(([value, label]) => (
          <button className={category === value ? "active" : ""} key={value} onClick={() => setCategory(value)} type="button">
            {label}
          </button>
        ))}
      </div>

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
                  {attachment.status === "queued" ? "待入库" : null}
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

      {message ? <p className="hint">{message}</p> : <p className="hint">文件先排队，点击发送后按当前目录、标签和知识点入库。</p>}
    </aside>
  );
}
