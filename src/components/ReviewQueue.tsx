"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reattemptMistakeAction, scoreReview } from "@/app/actions/day";
import type { DueMistake, DueReview } from "@/lib/repo/days";

const SCORE_LABELS = ["忘了", "模糊", "基本会", "熟练"];

export function ReviewQueue({ day, dueReviews, dueReviewsTotal, dueMistakes }: {
  day: string;
  dueReviews: DueReview[];
  dueReviewsTotal?: number;
  dueMistakes: DueMistake[];
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");

  if (!dueReviews.length && !dueMistakes.length) return null;

  async function handleReview(point: DueReview, score: number) {
    setBusyKey(`review-${point.id}`);
    setError("");
    const result = await scoreReview({ day, knowledgePointId: point.id, score });
    if (!result.ok) setError(result.error || "操作失败");
    setBusyKey("");
    router.refresh();
  }

  async function handleMistake(mistake: DueMistake, score: number) {
    setBusyKey(`mistake-${mistake.id}`);
    setError("");
    const result = await reattemptMistakeAction({ id: mistake.id, day, score });
    if (!result.ok) setError(result.error || "操作失败");
    setBusyKey("");
    router.refresh();
  }

  return (
    <section className="card reviewQueue" aria-label="今日待处理队列">
      <div className="sectionTitle">
        <h2>先处理这些</h2>
        <span className="sectionHint">
          {dueReviewsTotal && dueReviewsTotal > dueReviews.length
            ? `今日先安排 ${dueReviews.length} 个复习，还有 ${dueReviewsTotal - dueReviews.length} 个排在后面`
            : "复习到期的知识点和该回炉的错题"}
        </span>
      </div>
      {error ? <p className="formError">{error}</p> : null}
      <div className="queueList">
        {dueReviews.map((point) => (
          <article className="queueCard" key={point.id}>
            <div className="queueInfo">
              <small>{point.subject_code} · {point.tier_name} · 掌握度 {point.mastery}</small>
              <strong>{point.title}</strong>
            </div>
            <div className="scoreButtons" aria-label={`${point.title} 复习评分`}>
              {[0, 1, 2, 3].map((score) => (
                <button
                  disabled={busyKey === `review-${point.id}`}
                  key={score}
                  onClick={() => void handleReview(point, score)}
                  title={SCORE_LABELS[score]}
                  type="button"
                >
                  {SCORE_LABELS[score]}
                </button>
              ))}
            </div>
          </article>
        ))}
        {dueMistakes.map((mistake) => (
          <article className="queueCard mistake" key={mistake.id}>
            <div className="queueInfo">
              <small>错题回炉{mistake.knowledge_title ? ` · ${mistake.knowledge_title}` : ""}</small>
              <strong>{mistake.title}</strong>
              {mistake.cause ? <em>{mistake.cause}</em> : null}
            </div>
            <div className="scoreButtons">
              <button disabled={busyKey === `mistake-${mistake.id}`} onClick={() => void handleMistake(mistake, 1)} type="button">
                仍错
              </button>
              <button disabled={busyKey === `mistake-${mistake.id}`} onClick={() => void handleMistake(mistake, 3)} type="button">
                已会
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
