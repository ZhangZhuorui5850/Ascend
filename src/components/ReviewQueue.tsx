"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Undo2 } from "lucide-react";
import {
  reattemptMistakeAction,
  scoreReview,
  undoReattemptAction,
  undoReviewAction,
} from "@/app/actions/day";
import type { MistakeUndo, ReviewUndo } from "@/lib/repo/reviews";
import type { DueMistake, DueReview } from "@/lib/repo/days";

const SCORE_LABELS = ["忘了", "模糊", "基本会", "熟练"];
const SCORE_STAMPS = ["忘", "疑", "会", "熟"];

type LastUndo =
  | { kind: "review"; label: string; title: string; payload: ReviewUndo }
  | { kind: "mistake"; label: string; title: string; payload: MistakeUndo };

export function ReviewQueue({ day, dueReviews, dueReviewsTotal, dueMistakes, readOnly = false, doneToday = 0 }: {
  day: string;
  dueReviews: DueReview[];
  dueReviewsTotal?: number;
  dueMistakes: DueMistake[];
  readOnly?: boolean;
  doneToday?: number;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [stamps, setStamps] = useState<Record<string, string>>({});
  const [lastUndo, setLastUndo] = useState<LastUndo | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const empty = !dueReviews.length && !dueMistakes.length;

  function armUndo(next: LastUndo) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setLastUndo(next);
    undoTimer.current = setTimeout(() => setLastUndo(null), 8000);
  }

  async function handleReview(point: DueReview, score: number) {
    if (busyKey) return;
    setBusyKey(`review-${point.id}`);
    setError("");
    const result = await scoreReview({ day, knowledgePointId: point.id, score });
    if (!result.ok) {
      setError(result.error || "操作失败");
      setBusyKey("");
      return;
    }
    setStamps((current) => ({ ...current, [`review-${point.id}`]: SCORE_STAMPS[score] }));
    if (result.undo) armUndo({ kind: "review", label: SCORE_LABELS[score], title: point.title, payload: result.undo });
    setTimeout(() => {
      setBusyKey("");
      router.refresh();
    }, 360);
  }

  async function handleMistake(mistake: DueMistake, score: number) {
    if (busyKey) return;
    setBusyKey(`mistake-${mistake.id}`);
    setError("");
    const result = await reattemptMistakeAction({ id: mistake.id, day, score });
    if (!result.ok) {
      setError(result.error || "操作失败");
      setBusyKey("");
      return;
    }
    setStamps((current) => ({ ...current, [`mistake-${mistake.id}`]: score >= 2 ? "会" : "错" }));
    if (result.undo) {
      armUndo({ kind: "mistake", label: score >= 2 ? "已会" : "仍错", title: mistake.title, payload: result.undo });
    }
    setTimeout(() => {
      setBusyKey("");
      router.refresh();
    }, 360);
  }

  async function handleUndo() {
    if (!lastUndo || undoBusy) return;
    setUndoBusy(true);
    const result =
      lastUndo.kind === "review"
        ? await undoReviewAction({ day, undo: lastUndo.payload })
        : await undoReattemptAction({ day, undo: lastUndo.payload });
    setUndoBusy(false);
    if (!result.ok) {
      setError(result.error || "撤销失败");
      return;
    }
    setLastUndo(null);
    setStamps({});
    router.refresh();
  }

  // 键盘评分：1-4 给队首卡片打分（错题卡 1=仍错 2=已会）
  useEffect(() => {
    if (readOnly || empty) return;
    function onKey(event: KeyboardEvent) {
      if (busyKey) return;
      const target = event.target as Element | null;
      if (target && typeof target.closest === "function" && target.closest("input, textarea, select, [contenteditable=true]")) return;
      const num = Number(event.key);
      if (!Number.isInteger(num) || num < 1 || num > 4) return;
      const firstReview = dueReviews[0];
      if (firstReview) {
        event.preventDefault();
        void handleReview(firstReview, num - 1);
        return;
      }
      const firstMistake = dueMistakes[0];
      if (firstMistake && num <= 2) {
        event.preventDefault();
        void handleMistake(firstMistake, num === 1 ? 1 : 3);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, empty, busyKey, dueReviews, dueMistakes, day]);

  if (empty) {
    if (!readOnly && doneToday > 0) {
      return (
        <section className="card reviewQueue queueCleared" aria-label="今日复习完成">
          <span className="clearSeal">毕</span>
          <div>
            <h2>今日复习清零</h2>
            <p>共完成 {doneToday} 次评分。到期的都处理完了，安心推进新内容。</p>
          </div>
          <CheckCircle2 size={22} />
        </section>
      );
    }
    return null;
  }

  return (
    <section className="card reviewQueue" aria-label="今日待处理队列">
      <div className="sectionTitle">
        <h2>{readOnly ? "当日待处理（回看）" : "先处理这些"}</h2>
        <span className="sectionHint">
          {readOnly
            ? "历史日期仅供回看，回到今天再打分"
            : dueReviewsTotal && dueReviewsTotal > dueReviews.length
              ? `今日先安排 ${dueReviews.length} 个复习，还有 ${dueReviewsTotal - dueReviews.length} 个排在后面 · 键盘 1-4 可直接评分`
              : "复习到期的知识点和该回炉的错题 · 键盘 1-4 可给队首评分"}
        </span>
      </div>
      {error ? <p className="formError">{error}</p> : null}
      {lastUndo ? (
        <div className="undoBar">
          <span>
            已记「{lastUndo.label}」：{lastUndo.title}
          </span>
          <button disabled={undoBusy} onClick={() => void handleUndo()} type="button">
            <Undo2 size={13} />
            撤销
          </button>
        </div>
      ) : null}
      <div className="queueList">
        {dueReviews.map((point, index) => (
          <article
            className={`queueCard${!readOnly && index === 0 ? " focused" : ""}${stamps[`review-${point.id}`] ? " stamped" : ""}`}
            key={point.id}
          >
            {stamps[`review-${point.id}`] ? <span className="queueStamp">{stamps[`review-${point.id}`]}</span> : null}
            <div className="queueInfo">
              <small>{point.subject_code} · {point.tier_name} · 掌握度 {point.mastery}</small>
              <strong>{point.title}</strong>
            </div>
            {!readOnly ? (
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
            ) : null}
          </article>
        ))}
        {dueMistakes.map((mistake, index) => (
          <article
            className={`queueCard mistake${!readOnly && !dueReviews.length && index === 0 ? " focused" : ""}${stamps[`mistake-${mistake.id}`] ? " stamped" : ""}`}
            key={mistake.id}
          >
            {stamps[`mistake-${mistake.id}`] ? <span className="queueStamp">{stamps[`mistake-${mistake.id}`]}</span> : null}
            <div className="queueInfo">
              <small>错题回炉{mistake.knowledge_title ? ` · ${mistake.knowledge_title}` : ""}</small>
              <strong>{mistake.title}</strong>
              {mistake.cause ? <em>{mistake.cause}</em> : null}
            </div>
            {!readOnly ? (
              <div className="scoreButtons">
                <button disabled={busyKey === `mistake-${mistake.id}`} onClick={() => void handleMistake(mistake, 1)} type="button">
                  仍错
                </button>
                <button disabled={busyKey === `mistake-${mistake.id}`} onClick={() => void handleMistake(mistake, 3)} type="button">
                  已会
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
