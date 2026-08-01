"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reattemptMistakeAction } from "@/app/actions/day";
import {
  attemptDraftReady,
  attemptEvidence,
  emptyAttemptDraft,
  ReviewAttemptEvidence,
  type AttemptDraft,
} from "@/components/ReviewAttemptEvidence";
import type { MistakeListItem } from "@/lib/repo/reviews";
import { RichText } from "@/components/RichText";
import { usePresenceAnimation } from "@/components/usePresenceAnimation";

export function MistakeReattempt({ day, mistakes }: { day: string; mistakes: MistakeListItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [revealedIds, setRevealedIds] = useState<Set<number>>(() => new Set());
  const [attemptDrafts, setAttemptDrafts] = useState<Record<number, AttemptDraft>>({});
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
    const result = await reattemptMistakeAction({
      id: mistake.id,
      day,
      score,
      operationId: crypto.randomUUID(),
      ...attemptEvidence(attemptDrafts[mistake.id]),
    });
    if (!result.ok) {
      setSnapshots((current) => withoutId(current, mistake.id));
      setError(result.error || "操作失败");
      setBusyId(null);
      return;
    }
    setLeavingIds((current) => new Set(current).add(mistake.id));
  }

  function reveal(mistakeId: number) {
    const draft = attemptDrafts[mistakeId];
    if (!attemptDraftReady(draft)) {
      setError("请先选择作答方式、完成必要草稿并记录揭晓前信心");
      return;
    }
    setAttemptDrafts((current) => ({
      ...current,
      [mistakeId]: {
        ...draft,
        durationSeconds: Math.max(
          1,
          Math.round((Date.now() - (draft.startedAt || Date.now())) / 1000),
        ),
      },
    }));
    setRevealedIds((current) => new Set(current).add(mistakeId));
    setError("");
  }

  function finishExit(id: number) {
    setLeavingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setExitedIds((current) => new Set(current).add(id));
    setSnapshots((current) => withoutId(current, id));
    setRevealedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setAttemptDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="queueList">
      {error ? <p className="formError">{error}</p> : null}
      {visibleMistakes.map((mistake) => (
        <MistakePresenceCard id={`mistake-${mistake.id}`} key={mistake.id} leaving={leavingIds.has(mistake.id)} onExitComplete={() => finishExit(mistake.id)}>
          <div className="queueInfo">
            <small>
              {mistake.subject_code ? `${mistake.subject_code} · ` : ""}
              {mistake.knowledge_title || `${mistake.day} 记录`}
            </small>
            <strong><RichText text={mistake.title} /></strong>
            {revealedIds.has(mistake.id) && mistake.cause ? <em><RichText text={mistake.cause} /></em> : null}
          </div>
          {revealedIds.has(mistake.id) ? (
            <div className="reviewOutcome">
              <p className="attemptRecorded">已锁定无提示重做证据；现在记录核对结果。</p>
              <div className="scoreButtons">
                <button disabled={busyId === mistake.id} onClick={() => void handle(mistake, 1)} type="button">
                  仍错
                </button>
                <button disabled={busyId === mistake.id} onClick={() => void handle(mistake, 3)} type="button">
                  已会
                </button>
              </div>
            </div>
          ) : (
            <div className="reviewAttemptStage">
              <ReviewAttemptEvidence
                draft={attemptDrafts[mistake.id] || emptyAttemptDraft()}
                onChange={(next) => setAttemptDrafts((current) => ({ ...current, [mistake.id]: next }))}
              />
              <button
                className="primaryButton revealAnswer"
                disabled={!attemptDraftReady(attemptDrafts[mistake.id])}
                onClick={() => reveal(mistake.id)}
                type="button"
              >
                锁定重做并查看错因
              </button>
            </div>
          )}
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

function MistakePresenceCard({ id, leaving, onExitComplete, children }: {
  id: string;
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
  return <article className="queueCard mistake" data-leaving={leaving ? "" : undefined} id={id} onAnimationEnd={onAnimationEnd} ref={elementRef}>{children}</article>;
}
