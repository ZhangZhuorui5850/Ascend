"use client";

import {
  type ChangeEvent,
  type ClipboardEvent,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  CheckSquare2,
  FileText,
  GraduationCap,
  Loader2,
  Paperclip,
  Send,
  StickyNote,
  X,
} from "lucide-react";
import { recordCaptureAction } from "@/app/actions/capture";
import { useFeedback } from "@/components/FeedbackProvider";
import { PlannerDrawer, type PlannerDrawerSurface } from "@/components/ui/PlannerDrawer";
import { parseCaptureText, type CaptureKind } from "@/lib/capture/parser";
import { todayKey } from "@/lib/dates";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";
import type { CaptureSubject } from "@/lib/repo/knowledge";
import styles from "./CapturePanel.module.css";

type TextCaptureKind = Exclude<CaptureKind, "asset">;
type AttachmentStatus = "queued" | "uploading" | "uploaded" | "error";

type Attachment = {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
  status: AttachmentStatus;
  error?: string;
};

const INTENTS: Array<{
  kind: CaptureKind;
  label: string;
  icon: typeof CheckSquare2;
}> = [
  { kind: "task", label: "任务", icon: CheckSquare2 },
  { kind: "study", label: "学习", icon: GraduationCap },
  { kind: "mistake", label: "错题", icon: Bug },
  { kind: "note", label: "笔记", icon: StickyNote },
  { kind: "asset", label: "资料", icon: Paperclip },
];

export function CapturePanel({
  intent,
  onOpenChange,
  open,
  subjects,
}: {
  intent?: CaptureKind;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  subjects: CaptureSubject[];
}) {
  const { notify } = useFeedback();
  const [surface, setSurface] = useState<PlannerDrawerSurface>("drawer");
  const [kind, setKind] = useState<CaptureKind>(intent ?? "task");
  const [kindTouched, setKindTouched] = useState(Boolean(intent));
  const [text, setText] = useState("");
  const [cause, setCause] = useState("");
  const [day, setDay] = useState(todayKey());
  const [subjectCode, setSubjectCode] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [knowledgePointId, setKnowledgePointId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [folderPath, setFolderPath] = useState("未归档");
  const [assetNote, setAssetNote] = useState("");
  const attachmentsRef = useRef<Attachment[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const mutationRef = useRef<{ fingerprint: string; id: string } | null>(null);

  const selectedSubject = subjects.find((subject) => subject.code === subjectCode);
  const chapters = selectedSubject?.chapters ?? [];
  const points = chapters.find((chapter) => chapter.id === chapterId)?.points ?? [];
  const suggestion = useMemo(() => parseCaptureText({ text, contextDay: day }), [day, text]);
  const parsed = useMemo(() => kind === "asset"
    ? null
    : parseCaptureText({ text, contextDay: day, selectedKind: kind }), [day, kind, text]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setSurface(query.matches ? "sheet" : "drawer");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDay(todayKey());
    if (intent) {
      setKind(intent);
      setKindTouched(true);
    }
  }, [intent, open]);

  useEffect(() => {
    if (kindTouched || !text.trim() || kind === "asset") return;
    setKind(suggestion.suggestedKind);
  }, [kind, kindTouched, suggestion.suggestedKind, text]);

  useEffect(() => () => {
    attachmentsRef.current.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const next = Array.from(files).map((file): Attachment => ({
      id: crypto.randomUUID(),
      file,
      name: file.name || `截图-${Date.now()}.png`,
      size: file.size,
      type: file.type,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      status: file.size > MAX_UPLOAD_BYTES ? "error" : "queued",
      error: file.size > MAX_UPLOAD_BYTES ? "超过 20MB 上限" : undefined,
    }));
    if (!next.length) return;
    setAttachments((current) => [...current, ...next]);
    setKind("asset");
    setKindTouched(true);
    setMessage(`已加入 ${next.length} 个文件`);
  }, []);

  useEffect(() => {
    function onPaste(event: globalThis.ClipboardEvent) {
      if (event.defaultPrevented) return;
      const target = event.target as Element | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      const files = event.clipboardData?.files;
      if (!files?.length) return;
      event.preventDefault();
      addFiles(files);
      onOpenChange(true);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles, onOpenChange]);

  useEffect(() => {
    function hasFiles(event: DragEvent) {
      return Boolean(event.dataTransfer?.types && Array.from(event.dataTransfer.types).includes("Files"));
    }
    function onDragEnter(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
    }
    function onDragOver(event: DragEvent) {
      if (!hasFiles(event)) return;
      if (event.defaultPrevented) {
        setIsDragging(false);
        return;
      }
      setIsDragging(true);
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }
    function onDragLeave(event: DragEvent) {
      if (!hasFiles(event)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (!dragDepthRef.current) setIsDragging(false);
    }
    function onDrop(event: DragEvent) {
      dragDepthRef.current = 0;
      setIsDragging(false);
      // 局部上传区优先处理文件；全局记录只接收尚未被消费的拖放。
      if (event.defaultPrevented || !hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer?.files.length) {
        addFiles(event.dataTransfer.files);
        onOpenChange(true);
      }
    }
    window.addEventListener("dragenter", onDragEnter, true);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave, true);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter, true);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave, true);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles, onOpenChange]);

  function chooseKind(next: CaptureKind) {
    setKind(next);
    setKindTouched(true);
    setMessage("");
  }

  function selectSubject(code: string) {
    setSubjectCode(code);
    setChapterId("");
    setKnowledgePointId("");
    if (kind === "asset") setFolderPath(code || "未归档");
  }

  function selectChapter(id: string) {
    setChapterId(id);
    setKnowledgePointId("");
    if (kind === "asset") {
      const chapter = chapters.find((item) => item.id === id);
      setFolderPath([subjectCode, chapter?.title].filter(Boolean).join("/") || "未归档");
    }
  }

  function submitTextCapture() {
    if (!parsed?.text || busy || kind === "asset") return;
    const fingerprint = JSON.stringify({ kind, text, day, subjectCode, knowledgePointId, cause });
    if (mutationRef.current?.fingerprint !== fingerprint) {
      mutationRef.current = { fingerprint, id: crypto.randomUUID() };
    }
    const clientMutationId = mutationRef.current.id;
    setBusy(true);
    setMessage("");
    startTransition(async () => {
      try {
        const response = await recordCaptureAction({
          clientMutationId,
          kind,
          text,
          contextDay: day,
          subjectCode: subjectCode || null,
          knowledgePointId: knowledgePointId || null,
          cause,
        });
        if (!response.ok || !response.capture) {
          setMessage(response.error || "记录失败，可以重试");
          return;
        }
        notify(`已记录${intentLabel(kind)}「${response.capture.title}」`);
        mutationRef.current = null;
        setText("");
        setCause("");
        setMessage("");
        setKindTouched(false);
        onOpenChange(false);
      } catch (error) {
        console.error("统一记录失败", error);
        setMessage("网络异常，内容未丢失，可以重试");
      } finally {
        setBusy(false);
      }
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    if (!event.clipboardData.files.length) return;
    event.preventDefault();
    addFiles(event.clipboardData.files);
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  }

  async function uploadAttachment(attachment: Attachment): Promise<boolean> {
    if (attachment.status === "uploaded") return true;
    if (attachment.status === "uploading" || attachment.size > MAX_UPLOAD_BYTES) return false;
    setAttachments((current) => current.map((item) => item.id === attachment.id
      ? { ...item, status: "uploading", error: undefined }
      : item));
    const formData = new FormData();
    formData.append("file", attachment.file, attachment.name);
    formData.append("day", day);
    formData.append("folderPath", folderPath);
    formData.append("subjectCode", subjectCode);
    formData.append("chapterId", chapterId);
    formData.append("knowledgePointIds", knowledgePointId);
    formData.append("note", assetNote);
    try {
      const response = await fetch("/api/assets", { method: "POST", body: formData });
      if (!response.ok) throw new Error(await response.text() || "上传失败");
      setAttachments((current) => current.map((item) => item.id === attachment.id
        ? { ...item, status: "uploaded" }
        : item));
      return true;
    } catch (error) {
      setAttachments((current) => current.map((item) => item.id === attachment.id
        ? { ...item, status: "error", error: error instanceof Error ? error.message : "上传失败" }
        : item));
      return false;
    }
  }

  async function uploadAssets() {
    const queued = attachmentsRef.current.filter((item) => item.status === "queued" || item.status === "error");
    if (!queued.length) return;
    setBusy(true);
    const outcomes = await Promise.all(queued.map(uploadAttachment));
    setBusy(false);
    const failed = outcomes.filter((saved) => !saved).length;
    if (failed) {
      setMessage(`${failed} 个文件上传失败，可以重试`);
      return;
    }
    notify(`已入库 ${queued.length} 个文件`);
    setAttachments((current) => {
      current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
    attachmentsRef.current = [];
    setAssetNote("");
    setMessage("");
    onOpenChange(false);
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  const queuedCount = attachments.filter((item) => item.status === "queued" || item.status === "error").length;

  return (
    <>
      {isDragging ? (
        <div aria-hidden className={styles.dropOverlay}>
          <Paperclip size={24} />
          <strong>松开即可记录资料</strong>
        </div>
      ) : null}
      <PlannerDrawer
        description="一句话开始；类型始终可见，也可以随时切换。"
        initialFocus={kind === "asset" ? undefined : inputRef}
        onOpenChange={onOpenChange}
        open={open}
        surface={surface}
        title="记录"
      >
        <div className={styles.capture} data-testid="capture-panel" onPaste={handlePaste}>
          <div aria-label="记录类型" className={styles.intentTabs} role="tablist">
            {INTENTS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  aria-selected={kind === item.kind}
                  key={item.kind}
                  onClick={() => chooseKind(item.kind)}
                  role="tab"
                  type="button"
                >
                  <Icon aria-hidden size={16} />
                  {item.label}
                </button>
              );
            })}
          </div>

          {kind === "asset" ? (
            <AssetCapture
              attachments={attachments}
              busy={busy}
              fileInputRef={fileInputRef}
              onFileInput={handleFileInput}
              onRemove={removeAttachment}
              onRetry={(attachment) => void uploadAttachment(attachment)}
            />
          ) : (
            <>
              <label className={styles.mainField}>
                <span>{placeholderLabel(kind)}</span>
                <textarea
                  aria-describedby="capture-preview"
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      submitTextCapture();
                    }
                  }}
                  placeholder={placeholder(kind)}
                  ref={inputRef}
                  rows={4}
                  value={text}
                />
              </label>
              <div className={styles.preview} id="capture-preview">
                {!kindTouched && text.trim() ? <span>建议：{intentLabel(suggestion.suggestedKind)}</span> : null}
                {parsed?.preview.map((item) => <span key={item}>{item}</span>)}
                {!parsed?.preview.length && text.trim() ? <span>保留完整原文</span> : null}
              </div>
              {parsed?.warnings.map((warning) => <p className={styles.warning} key={warning}>{warning}</p>)}
            </>
          )}

          <details className={styles.details}>
            <summary>补充归属与细节（可选）</summary>
            <div className={styles.detailFields}>
              <label>
                <span>日期</span>
                <input onChange={(event) => setDay(event.target.value)} type="date" value={day} />
              </label>
              <label>
                <span>科目</span>
                <select onChange={(event) => selectSubject(event.target.value)} value={subjectCode}>
                  <option value="">不关联</option>
                  {subjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.code} · {subject.name}</option>)}
                </select>
              </label>
              <label>
                <span>章节</span>
                <select disabled={!subjectCode} onChange={(event) => selectChapter(event.target.value)} value={chapterId}>
                  <option value="">不关联</option>
                  {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
                </select>
              </label>
              <label>
                <span>知识点</span>
                <select disabled={!chapterId} onChange={(event) => setKnowledgePointId(event.target.value)} value={knowledgePointId}>
                  <option value="">不关联</option>
                  {points.map((point) => <option key={point.id} value={point.id}>{point.title}</option>)}
                </select>
              </label>
              {kind === "mistake" ? (
                <label className={styles.wideField}>
                  <span>错因</span>
                  <input onChange={(event) => setCause(event.target.value)} placeholder="可稍后补充" value={cause} />
                </label>
              ) : null}
              {kind === "asset" ? (
                <>
                  <label className={styles.wideField}>
                    <span>文件夹</span>
                    <input onChange={(event) => setFolderPath(event.target.value)} value={folderPath} />
                  </label>
                  <label className={styles.wideField}>
                    <span>备注</span>
                    <input onChange={(event) => setAssetNote(event.target.value)} placeholder="这批资料是什么" value={assetNote} />
                  </label>
                </>
              ) : null}
            </div>
          </details>

          {message ? <p aria-live="polite" className={styles.message}>{message}</p> : null}
          <div className={styles.footer}>
            <span>{kind === "asset" ? "支持拖拽、粘贴和选择文件" : "Ctrl/⌘ + Enter 确认"}</span>
            <button
              disabled={busy || (kind === "asset" ? !queuedCount : !parsed?.text)}
              onClick={kind === "asset" ? () => void uploadAssets() : submitTextCapture}
              type="button"
            >
              {busy ? <Loader2 aria-hidden className={styles.spin} size={16} /> : <Send aria-hidden size={16} />}
              {kind === "asset" ? `入库${queuedCount ? ` ${queuedCount}` : ""}` : `记录${intentLabel(kind)}`}
            </button>
          </div>
        </div>
      </PlannerDrawer>
    </>
  );
}

function AssetCapture({
  attachments,
  busy,
  fileInputRef,
  onFileInput,
  onRemove,
  onRetry,
}: {
  attachments: Attachment[];
  busy: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (id: string) => void;
  onRetry: (attachment: Attachment) => void;
}) {
  return (
    <div className={styles.assetCapture}>
      <button className={styles.dropZone} disabled={busy} onClick={() => fileInputRef.current?.click()} type="button">
        <Paperclip aria-hidden size={20} />
        <strong>拖入、粘贴或选择文件</strong>
        <span>单个文件不超过 20MB</span>
      </button>
      <input hidden multiple onChange={onFileInput} ref={fileInputRef} type="file" />
      {attachments.length ? (
        <div className={styles.attachments}>
          {attachments.map((attachment) => (
            <div className={styles.attachment} key={attachment.id}>
              <span className={styles.fileIcon}>
                {attachment.status === "uploaded" ? <CheckCircle2 aria-hidden size={18} /> : <FileText aria-hidden size={18} />}
              </span>
              <span className={styles.fileMeta}>
                <strong>{attachment.name}</strong>
                <small>{formatSize(attachment.size)}{attachment.error ? ` · ${attachment.error}` : ""}</small>
              </span>
              {attachment.status === "uploading" ? <Loader2 aria-label="上传中" className={styles.spin} size={17} /> : null}
              {attachment.status === "error" ? (
                <button className={styles.retry} onClick={() => onRetry(attachment)} type="button"><AlertCircle size={16} />重试</button>
              ) : null}
              <button aria-label={`移除 ${attachment.name}`} className={styles.remove} onClick={() => onRemove(attachment.id)} type="button">
                <X aria-hidden size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function placeholderLabel(kind: TextCaptureKind): string {
  if (kind === "study") return "刚刚学了什么？";
  if (kind === "mistake") return "哪里做错了？";
  if (kind === "note") return "记下什么？";
  return "准备完成什么？";
}

function placeholder(kind: TextCaptureKind): string {
  if (kind === "study") return "例如：学习了进程调度 30 分钟";
  if (kind === "mistake") return "例如：二分查找边界条件写错";
  if (kind === "note") return "例如：状态转移前先写清不变量";
  return "例如：明天 20:00 红黑树练习 45 分钟";
}

function intentLabel(kind: CaptureKind): string {
  return INTENTS.find((item) => item.kind === kind)?.label ?? "内容";
}

function formatSize(size: number): string {
  if (size < 1_024) return `${size} B`;
  if (size < 1_024 * 1_024) return `${Math.round(size / 1_024)} KB`;
  return `${(size / 1_024 / 1_024).toFixed(1)} MB`;
}
