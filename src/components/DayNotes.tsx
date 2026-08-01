"use client";

import { startTransition, useCallback, useOptimistic, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { addNoteAction, deleteNoteAction, updateNoteAction } from "@/app/actions/planner";
import type { DayNote } from "@/lib/repo/planner";
import { useFeedback } from "@/components/FeedbackProvider";
import { RichText } from "@/components/RichText";
import { usePresenceAnimation } from "@/components/usePresenceAnimation";

type OptimisticNote = DayNote & { clientKey?: string; pending?: boolean };
type ExitingNote = { actionDone: boolean; animationDone: boolean; clientKey: string; note: OptimisticNote };

export function DayNotes({ day, notes }: { day: string; notes: DayNote[] }) {
  const { confirm, notify } = useFeedback();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [enteringKeys, setEnteringKeys] = useState<Set<string>>(() => new Set());
  const [exitingNotes, setExitingNotes] = useState<ExitingNote[]>([]);
  const tempIdRef = useRef(-1);
  const [noteClientKeys, setNoteClientKeys] = useState(() => new Map<number, string>());
  const [optimisticNotes, addOptimisticNote] = useOptimistic(
    notes as OptimisticNote[],
    (state: OptimisticNote[], note: OptimisticNote) => [...state, note],
  );
  const exitingById = new Map(exitingNotes.map((entry) => [entry.note.id, entry]));
  const canonicalIds = new Set(optimisticNotes.map((note) => note.id));
  const displayNotes = [
    ...optimisticNotes.filter((note) => !exitingById.get(note.id)?.animationDone),
    ...exitingNotes.filter((entry) => !entry.animationDone && !canonicalIds.has(entry.note.id)).map((entry) => entry.note),
  ];

  function report(result: { ok: boolean; error?: string }) {
    setError(result.ok ? "" : result.error || "操作失败");
  }

  const finishEntering = useCallback((clientKey: string) => {
    setEnteringKeys((current) => withoutKey(current, clientKey));
  }, []);

  const finishExiting = useCallback((id: number) => {
    setExitingNotes((current) => current.flatMap((entry) => {
      if (entry.note.id !== id) return [entry];
      return entry.actionDone ? [] : [{ ...entry, animationDone: true }];
    }));
  }, []);

  function add() {
    const content = draft.trim();
    if (!content) return;
    const id = tempIdRef.current--;
    const clientKey = `note-draft-${Math.abs(id)}`;
    const optimisticNote: OptimisticNote = {
      id,
      day,
      content,
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      clientKey,
      pending: true,
    };
    setDraft("");
    setEnteringKeys((current) => new Set(current).add(clientKey));
    startTransition(async () => {
      addOptimisticNote(optimisticNote);
      try {
        const result = await addNoteAction({ day, content });
        if (result.note) setNoteClientKeys((current) => new Map(current).set(result.note!.id, clientKey));
        if (!result.ok) setDraft((current) => current || content);
        report(result);
      } catch (error) {
        console.error("保存随笔失败", error);
        setDraft((current) => current || content);
        report({ ok: false, error: "网络异常，操作未保存" });
      }
    });
  }

  function updateNote(id: number, content: string) {
    startTransition(async () => {
      try {
        report(await updateNoteAction({ id, day, content }));
      } catch (error) {
        console.error("更新随笔失败", error);
        report({ ok: false, error: "网络异常，操作未保存" });
      }
    });
  }

  function removeNote(note: OptimisticNote) {
    if (note.pending || exitingById.has(note.id)) return;
    void confirm({ title: "删除这条随笔？", description: "删除后无法恢复。", confirmLabel: "删除", danger: true }).then((accepted) => {
      if (!accepted) return;
      const clientKey = note.clientKey ?? noteClientKeys.get(note.id) ?? `note-${note.id}`;
      setExitingNotes((current) => [...current, { actionDone: false, animationDone: false, clientKey, note }]);
      startTransition(async () => {
        try {
          const result = await deleteNoteAction({ id: note.id, day });
          setExitingNotes((current) => current.flatMap((entry) => {
            if (entry.note.id !== note.id) return [entry];
            if (!result.ok || entry.animationDone) return [];
            return [{ ...entry, actionDone: true }];
          }));
          report(result);
          if (result.ok) notify("随笔已删除");
        } catch (error) {
          console.error("删除随笔失败", error);
          setExitingNotes((current) => current.filter((entry) => entry.note.id !== note.id));
          report({ ok: false, error: "网络异常，操作未保存" });
        }
      });
    });
  }

  return (
    <section className="card dayNotes" aria-label="当日随笔">
      <div className="sectionTitle">
        <h2>随笔</h2>
        <span className="sectionHint">一个想法一张卡片，写完就存</span>
      </div>
      {error ? <p className="formError">{error}</p> : null}

      <div className="noteGrid">
        {displayNotes.map((note) => {
          const exit = exitingById.get(note.id);
          const clientKey = note.clientKey ?? exit?.clientKey ?? noteClientKeys.get(note.id) ?? `note-${note.id}`;
          return (
            <NoteCard
              clientKey={clientKey}
              entering={enteringKeys.has(clientKey)}
              key={clientKey}
              leaving={Boolean(exit)}
              note={note}
              onEnterComplete={finishEntering}
              onExitComplete={finishExiting}
              onRemove={removeNote}
              onUpdate={updateNote}
            />
          );
        })}
        <div className="noteCard composer">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                add();
              }
            }}
            placeholder="记一个想法、卡点或结论… Ctrl+Enter 保存"
            rows={3}
          />
          <button aria-label="保存随笔" className="noteAdd" disabled={!draft.trim()} onClick={() => add()} type="button">
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

function NoteCard({ note, clientKey, entering, leaving, onUpdate, onRemove, onEnterComplete, onExitComplete }: {
  note: OptimisticNote;
  clientKey: string;
  entering: boolean;
  leaving: boolean;
  onUpdate: (id: number, content: string) => void;
  onRemove: (note: OptimisticNote) => void;
  onEnterComplete: (clientKey: string) => void;
  onExitComplete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [elementRef, onAnimationEnd] = usePresenceAnimation<HTMLDivElement>({
    entering,
    leaving,
    onEnterComplete: () => onEnterComplete(clientKey),
    onExitComplete: () => onExitComplete(note.id),
  });
  return (
    <div className="noteCard" data-entering={entering ? "" : undefined} data-leaving={leaving ? "" : undefined} id={note.id > 0 ? `note-${note.id}` : undefined} onAnimationEnd={onAnimationEnd} ref={elementRef}>
      {editing ? (
        <textarea
          aria-label="随笔内容"
          autoFocus
          defaultValue={note.content}
          onBlur={(event) => {
            setEditing(false);
            const content = event.target.value.trim();
            if (!note.pending && content && content !== note.content) onUpdate(note.id, content);
          }}
          rows={Math.min(8, Math.max(2, note.content.split("\n").length))}
        />
      ) : (
        // 展示态渲染公式（$...$ / $$...$$），点击进入编辑
        <button aria-label="编辑随笔" className="noteView" disabled={note.pending || leaving} onClick={() => setEditing(true)} type="button">
          <RichText block text={note.content} />
        </button>
      )}
      <div className="noteMeta">
        <small>{formatNoteTime(note.created_at)}</small>
        <button
          aria-label="删除随笔"
          disabled={note.pending || leaving}
          onClick={() => onRemove(note)}
          type="button"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function withoutKey(keys: Set<string>, key: string): Set<string> {
  const next = new Set(keys);
  next.delete(key);
  return next;
}
