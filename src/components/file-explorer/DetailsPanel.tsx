"use client";

import { useState } from "react";
import { CalendarDays, Check, FileText, Link2, NotebookPen, Tags } from "lucide-react";
import { updateAssetMetadataAction } from "@/app/actions/library";
import type { ExplorerFile } from "@/lib/repo/library";
import type { CaptureSubject } from "@/lib/repo/knowledge";
import { assetFileUrl } from "@/lib/asset-url";
import { previewKind } from "@/components/file-explorer/preview-kind";
import type { ActionResult } from "@/components/file-explorer/explorer-utils";
import { formatSize } from "@/components/file-explorer/explorer-utils";

/**
 * 文件详情内容（预览图、属性、整理编辑器、操作按钮）。
 * 宽屏渲染在右侧 .driveDetails 侧栏里；窄屏渲染在底部 sheet 里——同一份内容两种容器。
 */
export function FileDetails({ file, hierarchy, onPreview, onSaved }: {
  file: ExplorerFile;
  hierarchy: CaptureSubject[];
  onPreview: (file: ExplorerFile) => void;
  onSaved: (result: ActionResult) => void;
}) {
  return (
    <>
      {file.mime_type.startsWith("image/") ? (
        <button className="drivePreviewButton" onClick={() => onPreview(file)} type="button">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={file.original_name} className="drivePreview" src={assetFileUrl(file.id)} />
        </button>
      ) : (
        <FileText size={36} />
      )}
      <h2>{file.original_name}</h2>
      <dl>
        <div><dt>类型</dt><dd>{file.mime_type || "文件"}</dd></div>
        <div><dt>大小</dt><dd>{formatSize(file.size)}</dd></div>
        <div><dt>位置</dt><dd>{file.folder_path || "根目录"}</dd></div>
        <div><dt>入库日期</dt><dd>{file.day}</dd></div>
        {file.subject_code ? <div><dt>科目</dt><dd>{file.subject_code}</dd></div> : null}
        {file.knowledge_titles ? <div><dt>知识点</dt><dd>{file.knowledge_titles}</dd></div> : null}
      </dl>
      <AssetMetadataEditor file={file} hierarchy={hierarchy} key={file.id} onSaved={onSaved} />
      {previewKind(file) !== "none" ? (
        <button className="primaryButton" onClick={() => onPreview(file)} type="button">
          预览
        </button>
      ) : null}
      <a className="secondaryButton" href={assetFileUrl(file.id)} rel="noopener" target="_blank">
        打开原文件
      </a>
    </>
  );
}

function AssetMetadataEditor({ file, hierarchy, onSaved }: { file: ExplorerFile; hierarchy: CaptureSubject[]; onSaved: (result: ActionResult) => void }) {
  const initialPointId = file.knowledge_point_ids.split(",").filter(Boolean)[0] || "";
  const [day, setDay] = useState(file.day);
  const [category, setCategory] = useState(file.category || "knowledge");
  const [note, setNote] = useState(file.note || "");
  const [subjectCode, setSubjectCode] = useState(file.subject_code || "");
  const [chapterId, setChapterId] = useState(file.chapter_id || "");
  const [pointId, setPointId] = useState(initialPointId);
  const [baseline, setBaseline] = useState({
    day: file.day,
    category: file.category || "knowledge",
    note: file.note || "",
    subjectCode: file.subject_code || "",
    chapterId: file.chapter_id || "",
    pointId: initialPointId,
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const subject = hierarchy.find((item) => item.code === subjectCode);
  const chapter = subject?.chapters.find((item) => item.id === chapterId);
  const dirty = day !== baseline.day || category !== baseline.category || note !== baseline.note || subjectCode !== baseline.subjectCode || chapterId !== baseline.chapterId || pointId !== baseline.pointId;
  async function save() {
    if (busy || !dirty) return;
    setBusy(true);
    setSaved(false);
    const result = await updateAssetMetadataAction({
      assetId: file.id,
      day,
      category,
      note,
      subjectCode: subjectCode || undefined,
      chapterId: chapterId || undefined,
      knowledgePointIds: pointId ? [pointId] : [],
    });
    setBusy(false);
    if (result.ok) {
      setBaseline({ day, category, note, subjectCode, chapterId, pointId });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    }
    onSaved(result);
  }
  return (
    <div className="assetMetadataEditor">
      <header className="assetMetadataHead"><div><span className="sectionKicker">ORGANIZE</span><h3>整理这份资料</h3></div><span className={dirty ? "dirty" : undefined}>{saved ? <><Check size={12} />已保存</> : dirty ? "有修改待保存" : "信息已同步"}</span></header>
      <section className="assetMetaBasics">
        <label><span><CalendarDays size={13} />资料日期</span><input onChange={(event) => setDay(event.target.value)} type="date" value={day} /></label>
        <label><span><Tags size={13} />内容类型</span><select onChange={(event) => setCategory(event.target.value)} value={category}><option value="knowledge">知识资料</option><option value="mistake">错题资料</option><option value="note">学习笔记</option></select></label>
      </section>
      <section className="assetLinkSection">
        <div className="assetMetaSectionTitle"><Link2 size={14} /><div><strong>关联学习位置</strong><small>按科目、章节、知识点逐级定位</small></div></div>
        <div className="assetLinkPath">
          <label><span>1 · 科目</span><select onChange={(event) => { setSubjectCode(event.target.value); setChapterId(""); setPointId(""); }} value={subjectCode}><option value="">选择科目</option>{hierarchy.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select></label>
          <label><span>2 · 章节</span><select disabled={!subject} onChange={(event) => { setChapterId(event.target.value); setPointId(""); }} value={chapterId}><option value="">选择章节</option>{subject?.chapters.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <label><span>3 · 知识点</span><select disabled={!chapter} onChange={(event) => setPointId(event.target.value)} value={pointId}><option value="">选择知识点</option>{chapter?.points.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        </div>
      </section>
      <label className="assetNoteEditor"><span><NotebookPen size={13} />检索备注</span><textarea onChange={(event) => setNote(event.target.value)} placeholder="记录来源、用途或未来检索时会使用的关键词" rows={4} value={note} /></label>
      <button className="assetMetadataSave" disabled={busy || !dirty} onClick={() => void save()} type="button">{busy ? "保存中…" : "保存整理结果"}</button>
    </div>
  );
}
