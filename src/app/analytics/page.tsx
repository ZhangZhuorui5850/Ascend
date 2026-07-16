import Link from "next/link";
import { RichText } from "@/components/RichText";
import { CreateTrainingTaskButton } from "@/components/CreateTrainingTaskButton";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getSubjectOverviews } from "@/lib/repo/knowledge";
import { getMockExamDashboard } from "@/lib/repo/mock-exams";
import {
  getLearningAnalytics,
  WEAK_POINT_HIGH_SCORE,
  WEAK_POINT_URGENT_SCORE,
} from "@/lib/repo/stats";

export const dynamic = "force-dynamic";

const SCORE_LABELS = ["记不清", "模糊", "基本会", "熟练"] as const;

export default async function AnalyticsPage() {
  const access = await requirePageWorkspace("/analytics");

  const db = getDb();
  const today = todayKey();
  const analytics = getLearningAnalytics(db, access, today);
  const subjects = getSubjectOverviews(db, access, today);
  const mockExams = getMockExamDashboard(db, access);

  const reviewTotal = analytics.scoreDist.reduce((total, count) => total + count, 0);
  const backlogTotal = analytics.backlog.dueReviews + analytics.backlog.dueMistakes;
  const subjectRows = analytics.subjectMinutes.slice(0, 8);
  const maxSubjectMinutes = Math.max(...subjectRows.map((row) => row.minutes), 1);

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <span className="eyebrow">LEARNING SIGNALS · 学习信号</span>
        <h1>学习分析</h1>
        <p>从时间投入、复习质量和模考表现中识别下一步行动。</p>
      </div>

      <section className="metricGrid analyticsMetricGrid" aria-label="近七天概览">
        <div className="metricCard primaryMetric">
          <small>过去 7 天</small>
          <strong>{analytics.week.studyMinutes}</strong>
          <span>分钟专注学习</span>
          <WeekDelta current={analytics.week.studyMinutes} prev={analytics.prevWeek.studyMinutes} unit="分钟" />
          <div aria-label="每日专注分钟" className="weekBars" role="img">
            {analytics.dailyMinutes.map((item, index) => {
              const max = Math.max(...analytics.dailyMinutes.map((x) => x.minutes), 1);
              const height = item.minutes ? Math.max(8, Math.round((item.minutes / max) * 100)) : 4;
              return (
                <div className={index === 6 ? "weekBar today" : "weekBar"} key={item.day} title={`${item.day} · ${item.minutes} 分钟`}>
                  <i style={{ height: `${height}%` }} />
                  <span>{weekdayLabel(item.day)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="metricCard consistencyMetric">
          <small>学习节奏</small>
          <strong>{analytics.week.activeDays}<em>/7</em></strong>
          <span>活跃天数</span>
          <WeekDelta current={analytics.week.activeDays} prev={analytics.prevWeek.activeDays} unit="天" />
        </div>
        <div className="metricCard"><strong>{analytics.week.reflectionDays}</strong><span>复盘天数</span></div>
        <div className="metricCard">
          <strong>{analytics.week.reviews}</strong>
          <span>复习次数</span>
          {reviewTotal > 0 ? (
            <div
              aria-label={analytics.scoreDist.map((count, score) => `${SCORE_LABELS[score]} ${count}`).join(" / ")}
              className="scoreDist"
              role="img"
            >
              {analytics.scoreDist.map((count, score) =>
                count > 0 ? (
                  <div
                    className={`scoreSeg seg${score}`}
                    key={score}
                    style={{ flex: count }}
                    title={`${SCORE_LABELS[score]} ${count}`}
                  />
                ) : null,
              )}
            </div>
          ) : null}
          <WeekDelta current={analytics.week.reviews} prev={analytics.prevWeek.reviews} unit="次" />
        </div>
        <div className={analytics.week.mistakes ? "metricCard danger" : "metricCard"}>
          <strong>{analytics.week.mistakes}</strong><span>新增错题</span>
        </div>
        <div className={backlogTotal ? "metricCard danger" : "metricCard"}>
          <strong>{backlogTotal}</strong>
          <span>待复习积压</span>
          {backlogTotal ? (
            <em className="delta flat">知识点 {analytics.backlog.dueReviews} · 错题 {analytics.backlog.dueMistakes}</em>
          ) : (
            <em className="delta flat">今日无到期</em>
          )}
        </div>
      </section>

      <section className="card analyticsMockSummary" aria-label="模考趋势">
        <div className="sectionTitle"><div><span className="sectionKicker">MOCK EXAMS</span><h2>模考趋势</h2></div><Link className="sectionLink" href="/mock-exams">记录与分析</Link></div>
        <div>
          <p><strong>{mockExams.exams.length}</strong><span>模考次数</span></p>
          <p><strong>{mockExams.averagePercent}%</strong><span>平均得分率</span></p>
          <p><strong>{mockExams.bestPercent}%</strong><span>最佳得分率</span></p>
          <p><strong>{mockExams.weakAreas[0]?.label || "—"}</strong><span>优先补强</span></p>
        </div>
      </section>

      <section className="card" aria-label="按科目时间分布">
        <div className="sectionTitle">
          <h2>时间花在了哪里</h2>
          <span className="sectionHint">{analytics.week.start} ~ {analytics.week.end}</span>
        </div>
        <div className="subjectMinutesList">
          {subjectRows.map((row) => (
            <div className="subjectMinutesRow" key={row.code ?? "uncategorized"}>
              <span className="rowBadge">{row.code ?? "—"}</span>
              <strong>{row.name}</strong>
              <div className="progressTrack">
                <span style={{ width: `${Math.round((row.minutes / maxSubjectMinutes) * 100)}%` }} />
              </div>
              <small>{row.minutes} 分钟</small>
            </div>
          ))}
          {!subjectRows.length ? (
            <p className="empty">这一周还没有学习记录。记一段带科目的学习，就能看到时间的去向。</p>
          ) : null}
        </div>
      </section>

      <section className="card" aria-label="弱点优先级">
        <div className="sectionTitle">
          <h2>现在最该回炉什么</h2>
          <span className="sectionHint">{analytics.week.start} ~ {analytics.week.end}</span>
        </div>
        <div className="weakPointList">
          {analytics.weakPoints.map((point) => (
            <div className="weakPointRow weakPointActionRow" key={point.id}>
              <Link href={`/subjects/${point.subjectCode}?focus=${encodeURIComponent(point.id)}`}>
              <div>
                <span className="tierBadge">{point.tierName}</span>
                <strong><RichText text={point.title} /></strong>
                <small>{point.subjectCode} · {point.reasons.join(" / ")}</small>
              </div>
              <div className="priorityScore">
                {point.priorityScore >= WEAK_POINT_URGENT_SCORE ? (
                  <b className="rowBadge mistake">急</b>
                ) : point.priorityScore >= WEAK_POINT_HIGH_SCORE ? (
                  <b className="flag due">高</b>
                ) : (
                  <b className="rowBadge">中</b>
                )}
                <span>优先级</span>
              </div>
              </Link>
              <CreateTrainingTaskButton
                compact
                day={today}
                notes={`分析来源：${point.reasons.join(" / ")}。进入 ${point.title} 知识点完成针对训练。`}
                subjectCode={point.subjectCode}
                title={`专项回炉：${point.title}`}
              />
            </div>
          ))}
          {!analytics.weakPoints.length ? (
            <p className="empty">没有明显弱点。可以推进新章节，或做一次综合模拟。</p>
          ) : null}
        </div>
      </section>

      <section className="card" aria-label="科目进度">
        <div className="sectionTitle"><h2>科目进度</h2></div>
        <div className="subjectProgressList">
          {subjects.map((subject) => {
            const progress = subject.pointCount ? Math.round((subject.masteredCount / subject.pointCount) * 100) : 0;
            return (
              <Link className="subjectProgressRow" href={`/subjects/${subject.code}`} key={subject.code}>
                <b>{subject.code}</b>
                <strong>{subject.name}</strong>
                <div className="progressTrack"><span style={{ width: `${progress}%` }} /></div>
                <small>{subject.masteredCount}/{subject.pointCount}</small>
                {subject.dueCount ? <em className="flag due">{subject.dueCount} 待复习</em> : <em />}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** 周环比标注：上周为零显示「上周无记录」，否则显示 ▲/▼ 差值。 */
function WeekDelta({ current, prev, unit }: { current: number; prev: number; unit: string }) {
  if (!prev) return <em className="delta flat">上周无记录</em>;
  const diff = current - prev;
  if (diff > 0) return <em className="delta up">▲ {diff} {unit}</em>;
  if (diff < 0) return <em className="delta down">▼ {Math.abs(diff)} {unit}</em>;
  return <em className="delta flat">与上周持平</em>;
}

function weekdayLabel(day: string): string {
  const value = new Date(`${day}T00:00:00+08:00`);
  return new Intl.DateTimeFormat("zh-CN", { weekday: "narrow", timeZone: "Asia/Shanghai" }).format(value);
}
