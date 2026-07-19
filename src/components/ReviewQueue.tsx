"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Undo2 } from "lucide-react";
import {
  reattemptMistakeAction,
  scoreReview,
  spreadBacklogAction,
  undoReattemptAction,
  undoReviewAction,
} from "@/app/actions/day";
import { RichText } from "@/components/RichText";
import { usePresenceAnimation } from "@/components/usePresenceAnimation";
import type { MistakeUndo, ReviewUndo } from "@/lib/repo/reviews";
import type { DueMistake, DueReview } from "@/lib/repo/days";
import { cacheReviewSnapshot, flushOfflineReviews, getOfflineReviewCount, queueOfflineReview } from "@/lib/offline-review";

const SCORE_LABELS = ["忘了", "模糊", "基本会", "熟练"];
const SCORE_STAMPS = ["忘", "疑", "会", "熟"];

type LastUndo =
  | { kind: "review"; label: string; title: string; payload: ReviewUndo }
  | { kind: "mistake"; label: string; title: string; payload: MistakeUndo };

export function ReviewQueue({ day, offlineScope, dueReviews, dueReviewsTotal, dueMistakes, dueMistakesTotal = 0, dailyLimit = 12, examSprint = false, readOnly = false, doneToday = 0 }: {
  day: string;
  offlineScope: string;
  dueReviews: DueReview[];
  dueReviewsTotal?: number;
  dueMistakes: DueMistake[];
  dueMistakesTotal?: number;
  dailyLimit?: number;
  examSprint?: boolean;
  readOnly?: boolean;
  doneToday?: number;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [stamps, setStamps] = useState<Record<string, string>>({});
  const [lastUndo, setLastUndo] = useState<LastUndo | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [undoBusy, setUndoBusy] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pendingOffline, setPendingOffline] = useState(0);
  const [leavingKeys, setLeavingKeys] = useState<Set<string>>(() => new Set());
  const [exitedKeys, setExitedKeys] = useState<Set<string>>(() => new Set());
  const [reviewSnapshots, setReviewSnapshots] = useState<Map<string, DueReview>>(() => new Map());
  const [mistakeSnapshots, setMistakeSnapshots] = useState<Map<string, DueMistake>>(() => new Map());
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const backlogTotal = (dueReviewsTotal || dueReviews.length) + dueMistakesTotal;
  const reviewIds = new Set(dueReviews.map((point) => point.id));
  const mistakeIds = new Set(dueMistakes.map((mistake) => mistake.id));
  const visibleReviews = [
    ...dueReviews,
    ...[...reviewSnapshots.values()].filter((point) => !reviewIds.has(point.id)),
  ].filter((point) => !exitedKeys.has(`review-${point.id}`));
  const visibleMistakes = [
    ...dueMistakes,
    ...[...mistakeSnapshots.values()].filter((mistake) => !mistakeIds.has(mistake.id)),
  ].filter((mistake) => !exitedKeys.has(`mistake-${mistake.id}`));
  const empty = !visibleReviews.length && !visibleMistakes.length;

  useEffect(() => {
    // 离线快照缓存与计数是后台增强能力，IndexedDB 不可用（如隐私模式）时静默降级
    void cacheReviewSnapshot(offlineScope, day, dueReviews).catch((error) => console.warn("离线复习快照缓存失败", error));
    void getOfflineReviewCount(offlineScope).then(setPendingOffline).catch((error) => console.warn("离线复习计数读取失败", error));
    async function handleOnline() {
      setOffline(false);
      try {
        const synced = await flushOfflineReviews(offlineScope);
        setPendingOffline(0);
        if (synced) router.refresh();
      } catch (error) {
        // 后台补传失败不打断复习流程，待下次 online 事件重试
        console.warn("离线复习记录补传失败", error);
        setPendingOffline(await getOfflineReviewCount(offlineScope));
      }
    }
    function handleOffline() { setOffline(true); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (navigator.onLine) void handleOnline();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [day, dueReviews, offlineScope, router]);

  useEffect(() => {
    const currentExitTimers = exitTimers.current;
    return () => currentExitTimers.forEach((timer) => clearTimeout(timer));
  }, []);

  function armUndo(next: LastUndo) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setLastUndo(next);
    undoTimer.current = setTimeout(() => setLastUndo(null), 8000);
  }

  function armExit(key: string) {
    const previous = exitTimers.current.get(key);
    if (previous) clearTimeout(previous);
    const reduced = document.documentElement.dataset.motion === "reduce"
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 0 : motionTokenMs("--motion-reward");
    exitTimers.current.set(key, setTimeout(() => {
      setLeavingKeys((current) => new Set(current).add(key));
      exitTimers.current.delete(key);
    }, duration));
  }

  function finishExit(key: string) {
    setLeavingKeys((current) => withoutKey(current, key));
    setExitedKeys((current) => new Set(current).add(key));
    setReviewSnapshots((current) => withoutMapKey(current, key));
    setMistakeSnapshots((current) => withoutMapKey(current, key));
    setBusyKey("");
    router.refresh();
  }

  async function handleReview(point: DueReview, score: number) {
    const key = `review-${point.id}`;
    if (busyKey || stamps[key]) return;
    setBusyKey(key);
    setError("");
    const operationId = crypto.randomUUID();
    if (!navigator.onLine) {
      try {
        await queueOfflineReview({ operationId, workspaceKey: offlineScope, day, knowledgePointId: point.id, score, createdAt: new Date().toISOString() });
      } catch (error) {
        console.error("离线复习记录写入失败", error);
        setError("本机离线存储当前不可用");
        setBusyKey("");
        return;
      }
      setOffline(true);
      setPendingOffline((current) => current + 1);
      setStamps((current) => ({ ...current, [key]: SCORE_STAMPS[score] }));
      setBusyKey("");
      return;
    }
    setReviewSnapshots((current) => new Map(current).set(key, point));
    const result = await scoreReview({ day, knowledgePointId: point.id, score, operationId });
    if (!result.ok) {
      setReviewSnapshots((current) => withoutMapKey(current, key));
      setError(result.error || "操作失败");
      setBusyKey("");
      return;
    }
    setStamps((current) => ({ ...current, [key]: SCORE_STAMPS[score] }));
    if (result.undo) armUndo({ kind: "review", label: SCORE_LABELS[score], title: point.title, payload: result.undo });
    armExit(key);
  }

  async function handleMistake(mistake: DueMistake, score: number) {
    const key = `mistake-${mistake.id}`;
    if (busyKey || stamps[key]) return;
    setBusyKey(key);
    setMistakeSnapshots((current) => new Map(current).set(key, mistake));
    setError("");
    const result = await reattemptMistakeAction({ id: mistake.id, day, score });
    if (!result.ok) {
      setMistakeSnapshots((current) => withoutMapKey(current, key));
      setError(result.error || "操作失败");
      setBusyKey("");
      return;
    }
    setStamps((current) => ({ ...current, [key]: score >= 2 ? "会" : "错" }));
    if (result.undo) {
      armUndo({ kind: "mistake", label: score >= 2 ? "已会" : "仍错", title: mistake.title, payload: result.undo });
    }
    armExit(key);
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
    setLeavingKeys(new Set());
    setExitedKeys(new Set());
    setReviewSnapshots(new Map());
    setMistakeSnapshots(new Map());
    router.refresh();
  }

  async function handleRecovery(horizonDays: 3 | 7) {
    if (recoveryBusy) return;
    setRecoveryBusy(true);
    setError("");
    const result = await spreadBacklogAction({ day, dailyLimit, horizonDays });
    setRecoveryBusy(false);
    if (!result.ok) {
      setError(result.error || "分摊失败");
      return;
    }
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
      const firstReview = visibleReviews[0];
      if (firstReview && revealed[firstReview.id]) {
        event.preventDefault();
        void handleReview(firstReview, num - 1);
        return;
      }
      const firstMistake = visibleMistakes[0];
      if (firstMistake && num <= 2) {
        event.preventDefault();
        void handleMistake(firstMistake, num === 1 ? 1 : 3);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, empty, busyKey, visibleReviews, visibleMistakes, day, revealed]);

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
      {offline || pendingOffline ? <p className="offlineReviewStatus">{offline ? "离线模式：评分会保存在本机" : "正在同步"} · 待同步 {pendingOffline} 条</p> : null}
      {!readOnly && examSprint ? <p className="examSprintHint">临考冲刺已开启：考试相关知识点会优先进入队列。</p> : null}
      {!readOnly && backlogTotal > dailyLimit ? (
        <div className="backlogRecovery">
          <span>当前积压 {backlogTotal} 项，超过每日上限 {dailyLimit} 项。</span>
          <span className="backlogActions">
            <button disabled={recoveryBusy} onClick={() => void handleRecovery(3)} type="button">分摊 3 天</button>
            <button disabled={recoveryBusy} onClick={() => void handleRecovery(7)} type="button">{recoveryBusy ? "分摊中…" : "分摊 7 天"}</button>
          </span>
        </div>
      ) : null}
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
        {visibleReviews.map((point, index) => (
          <QueuePresenceCard
            className={`queueCard${!readOnly && index === 0 ? " focused" : ""}${stamps[`review-${point.id}`] ? " stamped" : ""}`}
            leaving={leavingKeys.has(`review-${point.id}`)}
            onExitComplete={() => finishExit(`review-${point.id}`)}
            key={point.id}
          >
            {stamps[`review-${point.id}`] ? <span className="queueStamp">{stamps[`review-${point.id}`]}</span> : null}
            <div className="queueInfo">
              <small>{point.subject_code} · {point.tier_name} · 掌握度 {point.mastery}</small>
              <strong><RichText text={point.prompt || point.title} /></strong>
              {revealed[point.id] ? (
                <div className="queueAnswer">
                  <span>参考答案</span>
                  <RichText text={point.answer || "请复述关键定义、步骤和易错点，再按真实回忆程度评分。"} />
                </div>
              ) : null}
            </div>
            {!readOnly ? (
              revealed[point.id] ? (
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
              ) : (
                <button
                  className="primaryButton revealAnswer"
                  onClick={() => setRevealed((current) => ({ ...current, [point.id]: true }))}
                  type="button"
                >
                  显示答案
                </button>
              )
            ) : null}
          </QueuePresenceCard>
        ))}
        {visibleMistakes.map((mistake, index) => (
          <QueuePresenceCard
            className={`queueCard mistake${!readOnly && !visibleReviews.length && index === 0 ? " focused" : ""}${stamps[`mistake-${mistake.id}`] ? " stamped" : ""}`}
            leaving={leavingKeys.has(`mistake-${mistake.id}`)}
            onExitComplete={() => finishExit(`mistake-${mistake.id}`)}
            key={mistake.id}
          >
            {stamps[`mistake-${mistake.id}`] ? <span className="queueStamp">{stamps[`mistake-${mistake.id}`]}</span> : null}
            <div className="queueInfo">
              <small>错题回炉{mistake.knowledge_title ? ` · ${mistake.knowledge_title}` : ""}</small>
              <strong><RichText text={mistake.title} /></strong>
              {mistake.cause ? <em><RichText text={mistake.cause} /></em> : null}
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
          </QueuePresenceCard>
        ))}
      </div>
    </section>
  );
}

function QueuePresenceCard({ className, leaving, onExitComplete, children }: {
  className: string;
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
  return <article className={className} data-leaving={leaving ? "" : undefined} onAnimationEnd={onAnimationEnd} ref={elementRef}>{children}</article>;
}

function withoutKey(keys: Set<string>, key: string): Set<string> {
  const next = new Set(keys);
  next.delete(key);
  return next;
}

function withoutMapKey<T>(items: Map<string, T>, key: string): Map<string, T> {
  const next = new Map(items);
  next.delete(key);
  return next;
}

function motionTokenMs(token: string): number {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return 0;
  return value.endsWith("ms") ? amount : amount * 1000;
}
