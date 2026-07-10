import Link from "next/link";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getSubjectOverviews } from "@/lib/repo/knowledge";
import { getLearningAnalytics } from "@/lib/repo/stats";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const access = await requirePageWorkspace("/analytics");

  const db = getDb();
  const today = todayKey();
  const analytics = getLearningAnalytics(db, access, today);
  const subjects = getSubjectOverviews(db, access, today);

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h1>统计</h1>
        <p>最近一周的学习行为，以及现在最值得回炉的知识点。</p>
      </div>

      <section className="metricGrid" aria-label="近七天概览">
        <div className="metricCard"><strong>{analytics.week.studyMinutes}</strong><span>分钟学习</span></div>
        <div className="metricCard"><strong>{analytics.week.activeDays}</strong><span>活跃天数</span></div>
        <div className="metricCard"><strong>{analytics.week.reflectionDays}</strong><span>复盘天数</span></div>
        <div className="metricCard"><strong>{analytics.week.reviews}</strong><span>复习次数</span></div>
        <div className={analytics.week.mistakes ? "metricCard danger" : "metricCard"}>
          <strong>{analytics.week.mistakes}</strong><span>新增错题</span>
        </div>
        <div className="metricCard"><strong>{analytics.week.assets}</strong><span>沉淀资料</span></div>
      </section>

      <section className="card" aria-label="弱点优先级">
        <div className="sectionTitle">
          <h2>现在最该回炉什么</h2>
          <span className="sectionHint">{analytics.week.start} ~ {analytics.week.end}</span>
        </div>
        <div className="weakPointList">
          {analytics.weakPoints.map((point) => (
            <Link className="weakPointRow" href={`/subjects/${point.subjectCode}`} key={point.id}>
              <div>
                <span className="tierBadge">{point.tierName}</span>
                <strong>{point.title}</strong>
                <small>{point.subjectCode} · {point.reasons.join(" / ")}</small>
              </div>
              <div className="priorityScore">
                <b>{point.priorityScore}</b>
                <span>优先级</span>
              </div>
            </Link>
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
