"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reattemptMistakeAction } from "@/app/actions/day";
import type { MistakeListItem } from "@/lib/repo/reviews";

export function MistakeReattempt({ day, mistakes }: { day: string; mistakes: MistakeListItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function handle(mistake: MistakeListItem, score: number) {
    setBusyId(mistake.id);
    setError("");
    const result = await reattemptMistakeAction({ id: mistake.id, day, score });
    if (!result.ok) setError(result.error || "操作失败");
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="queueList">
      {error ? <p className="formError">{error}</p> : null}
      {mistakes.map((mistake) => (
        <article className="queueCard mistake" key={mistake.id}>
          <div className="queueInfo">
            <small>
              {mistake.subject_code ? `${mistake.subject_code} · ` : ""}
              {mistake.knowledge_title || `${mistake.day} 记录`}
            </small>
            <strong>{mistake.title}</strong>
            {mistake.cause ? <em>{mistake.cause}</em> : null}
          </div>
          <div className="scoreButtons">
            <button disabled={busyId === mistake.id} onClick={() => void handle(mistake, 1)} type="button">
              仍错
            </button>
            <button disabled={busyId === mistake.id} onClick={() => void handle(mistake, 3)} type="button">
              已会
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
