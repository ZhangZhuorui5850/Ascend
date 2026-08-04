import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NextQueue } from "@/components/redesign/NextQueue";
import {
  homeNow,
  homeNextTasks,
  homePeaks,
  homeRidge,
  homeWeakPoints,
} from "@/components/redesign/mock-data";
import styles from "@/styles/redesign/home.module.css";

/**
 * 重设计首页「山径」：NOW → NEXT → RIDGE → PEAKS 的垂直单流。
 * 预览版：纯静态 mock + NextQueue 客户端交互，无后端依赖。
 */
export default function RedesignHomePage() {
  const pending = homeNow.dueReviews + homeNow.dueMistakes;
  const studiedPct = Math.min(100, Math.round((homeRidge.studiedMinutes / homeRidge.targetMinutes) * 100));
  const plannedPct = Math.min(
    100 - studiedPct,
    Math.round((homeRidge.plannedMinutes / homeRidge.targetMinutes) * 100),
  );
  const maxDay = Math.max(...homeRidge.days.map((day) => day.minutes), 1);

  return (
    <div className={styles.page}>
      {/* ① NOW：全页唯一墨面，回答「现在做什么」 */}
      <section aria-labelledby="trail-now-title" className={styles.now} data-state={homeNow.state}>
        <div className={styles.nowMain}>
          <span className={styles.nowKicker}>NOW · 到期复习</span>
          <h1 id="trail-now-title">
            还有 <b>{pending}</b> 个到期项，今日先清 <b>{homeNow.scheduledToday}</b> 个。
          </h1>
          <p className={styles.nowEvidence}>
            复习 <b>{homeNow.dueReviews}</b> · 错题 <b>{homeNow.dueMistakes}</b> · 今日剩余容量{" "}
            <b>{homeNow.remainingCapacity}</b>/{homeNow.dailyLimit}
          </p>
          <p className={styles.nowEcho}>昨晚你说：「{homeNow.yesterdayPlan}」</p>
          <div className={styles.nowActions}>
            <Link className={styles.nowCta} href="/redesign/day">
              开始复习<ArrowRight aria-hidden size={16} />
            </Link>
            <Link className={styles.nowLink} href="/redesign/tasks">先看今日任务 →</Link>
          </div>
        </div>
        <div className={styles.nowFigure}>
          <strong>{pending}</strong>
          <small>到期待清</small>
          <span className={styles.nowExam}>
            距 {homeNow.nearestExam.name} <b>{homeNow.nearestExam.days}</b> 天
          </span>
        </div>
      </section>

      {/* ② NEXT：可交互的三步队列（Motion 重排 + 完成印章） */}
      <NextQueue initialTasks={homeNextTasks} />

      {/* ③ RIDGE：本周山脊线（容量） */}
      <section aria-labelledby="trail-ridge-title" className={styles.ridge}>
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.kicker}>RIDGE · 本周山脊 {homeRidge.weekStart}–{homeRidge.weekEnd}</span>
            <h2 id="trail-ridge-title">容量用在哪了</h2>
          </div>
          <Link className={styles.sectionLink} href="/analytics">学习信号 →</Link>
        </div>
        <div className={styles.ridgeBody}>
          <div
            aria-label={`近 7 天专注分钟，最多 ${maxDay} 分钟`}
            className={styles.ridgeBars}
            role="img"
          >
            {homeRidge.days.map((day) => (
              <div className={styles.ridgeBar} key={day.day} title={`${day.day} · ${day.minutes} 分钟`}>
                <i style={{ transform: `scaleY(${day.minutes ? Math.max(0.06, day.minutes / maxDay) : 0.02})` }} />
                <span>{day.day.slice(1)}</span>
              </div>
            ))}
          </div>
          <div className={styles.ridgeCapacity}>
            <div
              aria-label={`本周目标 ${homeRidge.targetMinutes} 分钟，已学习 ${homeRidge.studiedMinutes}，已排 ${homeRidge.plannedMinutes}`}
              className={styles.capacityTrack}
              role="img"
            >
              <i className={styles.capacityStudied} style={{ transform: `scaleX(${studiedPct / 100})` }} />
              <i
                className={styles.capacityPlanned}
                style={{ left: `${studiedPct}%`, width: `${plannedPct}%` }}
              />
            </div>
            <p>
              已学习 <strong>{homeRidge.studiedMinutes}</strong> min · 已排未完成{" "}
              <strong>{homeRidge.plannedMinutes}</strong> min · 目标{" "}
              <strong>{homeRidge.targetMinutes}</strong> min
            </p>
          </div>
        </div>
      </section>

      {/* ④ PEAKS：科目山峰 + 弱点 */}
      <section aria-labelledby="trail-peaks-title" className={styles.peaks}>
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.kicker}>PEAKS · 需要关注</span>
            <h2 id="trail-peaks-title">科目山峰</h2>
          </div>
          <Link className={styles.sectionLink} href="/subjects">全部科目 →</Link>
        </div>
        <ul className={styles.peakList}>
          {homePeaks.map((peak) => {
            const pct = peak.total ? peak.mastered / peak.total : 0;
            return (
              <li key={peak.code}>
                <Link className={styles.peakRow} href={`/subjects/${peak.code}`}>
                  <b>{peak.code}</b>
                  <strong>{peak.name}</strong>
                  <span className={styles.peakTrack}><i style={{ transform: `scaleX(${pct})` }} /></span>
                  <small>{peak.mastered}/{peak.total}</small>
                  {peak.due || peak.mistakes ? (
                    <em className={styles.peakFlag}>{peak.due} 复习 · {peak.mistakes} 错题</em>
                  ) : (
                    <em className={styles.peakFlagCalm}>节奏正常</em>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className={styles.weakList}>
          <span className={styles.weakKicker}>弱点 TOP {homeWeakPoints.length}</span>
          {homeWeakPoints.map((point) => (
            <Link className={styles.weakRow} href={`/subjects/${point.subjectCode}`} key={point.id}>
              <strong>{point.title}</strong>
              <i>{point.tierName}</i>
              <small>{point.reason}</small>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
