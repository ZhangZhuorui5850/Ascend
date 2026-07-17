"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reattemptMistakeAction } from "@/app/actions/day";
import type { MistakeListItem } from "@/lib/repo/reviews";
import { RichText } from "@/components/RichText";
import { usePresenceAnimation } from "@/components/usePresenceAnimation";

export function MistakeReattempt({ day, mistakes }: { day: string; mistakes: MistakeListItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [leavingIds, setLeavingIds] = useState<Set<number>>(() => new Set());
  const [exitedIds, setExitedIds] = useState<Set<number>>(() => new Set());
  const [snapshots, setSnapshots] = useState<Map<number, MistakeListItem>>(() => new Map());
  const canonicalIds = new Set(mistakes.map((mistake) => mistake.id));
  const visibleMistakes = [
    ...mistakes,
    ...[...snapshots.values()].filter((mistake) => !canonicalIds.has(mistake.id)),
  ].filter((mistake) => !exitedIds.has(mistake.id));

  async function handle(mistake: MistakeListItem, score: number) {
    setBusyId(mistake.id);
    setSnapshots((current) => new Map(current).set(mistake.id, mistake));
    setError("");
    const result = await reattemptMistakeAction({ id: mistake.id, day, score });
    if (!result.ok) {
      setSnapshots((current) => withoutId(current, mistake.id));
      setError(result.error || "操作失败");
      setBusyId(null);
      return;
    }
    setLeavingIds((current) => new Set(current).add(mistake.id));
  }

  function finishExit(id: number) {
    setLeavingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setExitedIds((current) => new Set(current).add(id));
    setSnapshots((current) => withoutId(current, id));
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="queueList">
      {error ? <p className="formError">{error}</p> : null}
      {visibleMistakes.map((mistake) => (
        <MistakePresenceCard key={mistake.id} leaving={leavingIds.has(mistake.id)} onExitComplete={() => finishExit(mistake.id)}>
          <div className="queueInfo">
            <small>
              {mistake.subject_code ? `${mistake.subject_code} · ` : ""}
              {mistake.knowledge_title || `${mistake.day} 记录`}
            </small>
            <strong><RichText text={mistake.title} /></strong>
            {mistake.cause ? <em><RichText text={mistake.cause} /></em> : null}
          </div>
          <div className="scoreButtons">
            <button disabled={busyId === mistake.id} onClick={() => void handle(mistake, 1)} type="button">
              仍错
            </button>
            <button disabled={busyId === mistake.id} onClick={() => void handle(mistake, 3)} type="button">
              已会
            </button>
          </div>
        </MistakePresenceCard>
      ))}
    </div>
  );
}

function withoutId(items: Map<number, MistakeListItem>, id: number): Map<number, MistakeListItem> {
  const next = new Map(items);
  next.delete(id);
  return next;
}

function MistakePresenceCard({ leaving, onExitComplete, children }: {
  leaving: boolean;
  onExitComplete: () => void;
  children: React.ReactNode;
}) {
  const [elementRef, onAnimationEnd] = usePresenceAnimation<HTMLElement>({
    entering: false,
    leaving,
    onEnterComplete: () => undefined,
    onExitComplete,
  });
  return <article className="queueCard mistake" data-leaving={leaving ? "" : undefined} onAnimationEnd={onAnimationEnd} ref={elementRef}>{children}</article>;
}
