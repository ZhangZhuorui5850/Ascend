"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DueReview = {
  id: string;
  title: string;
  subject_code: string;
  tier_name: string;
  mastery: number;
  next_review: string;
};

type DueMistake = {
  id: number;
  title: string;
  cause: string;
  knowledge_point_id?: string | null;
  next_review: string;
};

export function LearningActionPanel({ day, dueReviews, dueMistakes }: {
  day: string;
  dueReviews: DueReview[];
  dueMistakes: DueMistake[];
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState("");

  async function scoreReview(point: DueReview, score: number) {
    const key = `review-${point.id}-${score}`;
    setBusyKey(key);
    await fetch("/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ day, knowledgePointId: point.id, score, note: reviewNoteFor(score) }),
    });
    setBusyKey("");
    router.refresh();
  }

  async function reattemptMistake(mistake: DueMistake, score: number) {
    const key = `mistake-${mistake.id}-${score}`;
    setBusyKey(key);
    await fetch("/api/mistakes/reattempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: mistake.id, day, score }),
    });
    setBusyKey("");
    router.refresh();
  }

  if (!dueReviews.length && !dueMistakes.length) return null;

  return (
    <section className="learningActions">
      <div className="sectionTitle">
        <span className="eyebrow">Action Queue</span>
        <h2>今天先处理这些</h2>
      </div>
      {dueReviews.length ? (
        <div className="actionList">
          {dueReviews.map((point) => (
            <article className="actionCard" key={point.id}>
              <div>
                <span>{point.subject_code} · {point.tier_name} · mastery {point.mastery}</span>
                <strong>{point.title}</strong>
                <small>{reviewPromptFor(point.mastery)}</small>
              </div>
              <div className="scoreButtons" aria-label={`${point.title} 复习评分`}>
                {[0, 1, 2, 3].map((score) => (
                  <button disabled={busyKey === `review-${point.id}-${score}`} key={score} onClick={() => scoreReview(point, score)} type="button">
                    {score}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {dueMistakes.length ? (
        <div className="actionList">
          {dueMistakes.map((mistake) => (
            <article className="actionCard mistakeAction" key={mistake.id}>
              <div>
                <span>错题回炉 · {mistake.next_review}</span>
                <strong>{mistake.title}</strong>
                {mistake.cause ? <small>{mistake.cause}</small> : null}
                <small>仍错时先补“为什么又错”，已会时再给自己出一道变式。</small>
              </div>
              <div className="scoreButtons">
                <button disabled={busyKey === `mistake-${mistake.id}-1`} onClick={() => reattemptMistake(mistake, 1)} type="button">
                  仍错
                </button>
                <button disabled={busyKey === `mistake-${mistake.id}-3`} onClick={() => reattemptMistake(mistake, 3)} type="button">
                  已会
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function reviewPromptFor(mastery: number) {
  if (mastery < 40) return "先讲清定义和条件，再做题；低分会继续排到近期复习。";
  if (mastery < 70) return "先做一道最小变式，确认不是只记住答案。";
  return "用 2 分钟回忆关键步骤，确认能独立复现。";
}

function reviewNoteFor(score: number) {
  if (score <= 1) return "当天行动卡：低分，需补原因和变式";
  if (score === 2) return "当天行动卡：基本会，需再巩固";
  return "当天行动卡：已掌握";
}
