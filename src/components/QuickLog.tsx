"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { addMistake, addStudySession } from "@/app/actions/day";
import type { CaptureSubject } from "@/lib/repo/knowledge";

const MINUTE_PRESETS = [25, 50, 90];
const MISTAKE_CATEGORIES = ["概念混淆", "审题遗漏", "公式不熟", "计算失误", "方法选择", "时间管理"];

export function QuickLog({ day, subjects, recentCauses = [] }: {
  day: string;
  subjects: CaptureSubject[];
  recentCauses?: string[];
}) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"session" | "mistake">("session");
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(50);
  const [cause, setCause] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [knowledgePointId, setKnowledgePointId] = useState("");
  const [causeCategory, setCauseCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedSubject = subjects.find((subject) => subject.code === subjectCode);
  const selectedChapter = selectedSubject?.chapters.find((chapter) => chapter.id === chapterId);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError("");
    const result =
      mode === "session"
        ? await addStudySession({ day, title: trimmed, durationMinutes: minutes, subjectCode, knowledgePointId })
        : await addMistake({
            day,
            title: trimmed,
            cause: cause.trim(),
            causeCategory,
            subjectCode,
            knowledgePointId,
          });
    if (result.ok) {
      setTitle("");
      setCause("");
      setCauseCategory("");
      router.refresh();
      titleRef.current?.focus();
    } else {
      setError(result.error || "操作失败");
    }
    setBusy(false);
  }

  return (
    <section className="card quickLog" aria-label="快速记录">
      <div className="sectionTitle">
        <h2>快速记录</h2>
        <div className="segmented" role="tablist">
          <button className={mode === "session" ? "active" : ""} onClick={() => setMode("session")} role="tab" type="button">
            学习
          </button>
          <button className={mode === "mistake" ? "active" : ""} onClick={() => setMode("mistake")} role="tab" type="button">
            错题
          </button>
        </div>
      </div>
      <div className="quickLogForm">
        <input
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          placeholder={mode === "session" ? "做了什么：如 PCA 推导重写" : "错在哪：如 CNN 参数量漏 bias"}
        />
        {mode === "session" ? (
          <div className="inlineField minutePresets">
            分钟
            <div className="tagPicker" role="group" aria-label="常用时长">
              {MINUTE_PRESETS.map((preset) => (
                <button
                  className={minutes === preset ? "active" : ""}
                  key={preset}
                  onClick={() => setMinutes(preset)}
                  type="button"
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              aria-label="自定义分钟数"
              min="0"
              onChange={(event) => setMinutes(Math.max(0, Number(event.target.value) || 0))}
              type="number"
              value={minutes}
            />
          </div>
        ) : (
          <>
            <input
              value={cause}
              onChange={(event) => setCause(event.target.value)}
              placeholder="原因：概念混淆 / 审题漏条件 / 公式不熟…"
            />
            <select aria-label="错因分类" onChange={(event) => setCauseCategory(event.target.value)} value={causeCategory}>
              <option value="">错因分类（可选）</option>
              {MISTAKE_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            {recentCauses.length ? (
              <div className="tagPicker" role="group" aria-label="最近用过的原因">
                {recentCauses.map((item) => (
                  <button
                    className={cause === item ? "active" : ""}
                    key={item}
                    onClick={() => setCause(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
        <div className="quickLogRow">
          <select
            onChange={(event) => {
              setSubjectCode(event.target.value);
              setChapterId("");
              setKnowledgePointId("");
            }}
            value={subjectCode}
          >
            <option value="">科目（可选）</option>
            {subjects.map((subject) => (
              <option key={subject.code} value={subject.code}>
                {subject.code} · {subject.name}
              </option>
            ))}
          </select>
          <select
            aria-label="章节"
            disabled={!selectedSubject}
            onChange={(event) => {
              setChapterId(event.target.value);
              setKnowledgePointId("");
            }}
            value={chapterId}
          >
            <option value="">章节（可选）</option>
            {selectedSubject?.chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
            ))}
          </select>
          <select
            aria-label="知识点"
            disabled={!selectedChapter}
            onChange={(event) => setKnowledgePointId(event.target.value)}
            value={knowledgePointId}
          >
            <option value="">知识点（可选）</option>
            {selectedChapter?.points.map((point) => (
              <option key={point.id} value={point.id}>{point.title}</option>
            ))}
          </select>
          <button className="primaryButton" disabled={busy || !title.trim()} onClick={() => void submit()} type="button">
            {mode === "session" ? "记一笔" : "记错题"}
          </button>
        </div>
        {error ? <p className="formError">{error}</p> : null}
        {mode === "mistake" ? <p className="hint">错题会自动进入间隔复习，明天开始回炉。</p> : null}
      </div>
    </section>
  );
}
