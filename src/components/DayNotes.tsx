"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { addNoteAction, deleteNoteAction, updateNoteAction } from "@/app/actions/planner";
import type { DayNote } from "@/lib/repo/planner";
import { useFeedback } from "@/components/FeedbackProvider";

export function DayNotes({ day, notes }: { day: string; notes: DayNote[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function report(result: { ok: boolean; error?: string }) {
    setError(result.ok ? "" : result.error || "操作失败");
    if (result.ok) router.refresh();
  }

  async function add() {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    const result = await addNoteAction({ day, content });
    if (result.ok) setDraft("");
    report(result);
    setBusy(false);
  }

  return (
    <section className="card dayNotes" aria-label="当日随笔">
      <div className="sectionTitle">
        <h2>随笔</h2>
        <span className="sectionHint">一个想法一张卡片，写完就存</span>
      </div>
      {error ? <p className="formError">{error}</p> : null}

      <div className="noteGrid">
        {notes.map((note) => (
          <NoteCard day={day} key={note.id} note={note} report={report} />
        ))}
        <div className="noteCard composer">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void add();
              }
            }}
            placeholder="记一个想法、卡点或结论… Ctrl+Enter 保存"
            rows={3}
          />
          <button aria-label="保存随笔" className="noteAdd" disabled={busy || !draft.trim()} onClick={() => void add()} type="button">
            <Plus size={14} />
            记下
          </button>
        </div>
      </div>
    </section>
  );
}

function formatNoteTime(createdAt: string): string {
  const value = new Date(`${createdAt.replace(" ", "T")}Z`);
  if (Number.isNaN(value.getTime())) return "";
  return value.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
}

function NoteCard({ note, day, report }: {
  note: DayNote;
  day: string;
  report: (result: { ok: boolean; error?: string }) => void;
}) {
  const { confirm, notify } = useFeedback();
  return (
    <div className="noteCard">
      <textarea
        aria-label="随笔内容"
        defaultValue={note.content}
        key={`${note.id}-${note.content}`}
        onBlur={(event) => {
          const content = event.target.value.trim();
          if (content && content !== note.content) {
            void updateNoteAction({ id: note.id, day, content }).then(report);
          }
        }}
        rows={Math.min(8, Math.max(2, note.content.split("\n").length))}
      />
      <div className="noteMeta">
        <small>{formatNoteTime(note.created_at)}</small>
        <button
          aria-label="删除随笔"
          onClick={() => {
            void confirm({ title: "删除这条随笔？", description: "删除后无法恢复。", confirmLabel: "删除", danger: true }).then(async (accepted) => {
              if (!accepted) return;
              const result = await deleteNoteAction({ id: note.id, day });
              report(result);
              if (result.ok) notify("随笔已删除");
            });
          }}
          type="button"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
