import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { getLearningAnalytics, type LearningAnalytics } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await requirePageSession("/analytics");

  const analytics = getLearningAnalytics() as LearningAnalytics;

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <span className="eyebrow">Learning Analytics</span>
        <h1>学习分析</h1>
        <p>把最近一周的学习行为、复习动作、错题压力和知识点掌握度汇总成下一步优先级。</p>
      </div>

      <section className="metricGrid compact">
        <div className="metricCard">
          <strong>{analytics.week.studyMinutes}m</strong>
          <span>近 7 天学习</span>
        </div>
        <div className="metricCard">
          <strong>{analytics.week.activeDays}</strong>
          <span>活跃天数</span>
        </div>
        <div className="metricCard">
          <strong>{analytics.week.reflectionDays}</strong>
          <span>复盘天数</span>
        </div>
        <div className="metricCard danger">
          <strong>{analytics.week.mistakes}</strong>
          <span>新增错题</span>
        </div>
        <div className="metricCard">
          <strong>{analytics.week.reviews}</strong>
          <span>复习次数</span>
        </div>
        <div className="metricCard">
          <strong>{analytics.week.assets}</strong>
          <span>沉淀资料</span>
        </div>
      </section>

      <section className="grid2 analyticsGrid">
        <div className="card">
          <div className="sectionTitle">
            <span className="eyebrow">Weekly Review</span>
            <h2>{analytics.week.start} - {analytics.week.end}</h2>
          </div>
          <div className="analyticsNarrative">
            <p>
              这 7 天累计学习 <strong>{analytics.week.studyMinutes}</strong> 分钟，
              产生 <strong>{analytics.week.mistakes}</strong> 道错题，
              完成 <strong>{analytics.week.reviews}</strong> 次复习。
            </p>
            <p>
              复盘覆盖 {analytics.week.reflectionDays}/{analytics.week.activeDays || 1} 个活跃日。
              如果错题多于复习，今天优先处理右侧最高分弱点。
            </p>
          </div>
        </div>

        <div className="card">
          <div className="sectionTitle">
            <span className="eyebrow">Next Action</span>
            <h2>下一步建议</h2>
          </div>
          {analytics.weakPoints[0] ? (
            <div className="nextWeakPoint">
              <span>{analytics.weakPoints[0].subjectCode}</span>
              <strong>{analytics.weakPoints[0].title}</strong>
              <small>{analytics.weakPoints[0].reasons.join(" / ")}</small>
              <Link className="secondaryButton" href="/knowledge">回到知识地图</Link>
            </div>
          ) : (
            <p className="empty">暂无明显弱点。今天可以推进新知识点或做一次综合回顾。</p>
          )}
        </div>
      </section>

      <section className="card">
        <div className="sectionTitle">
          <span className="eyebrow">Weak Point Queue</span>
          <h2>弱点优先级</h2>
        </div>
        <div className="weakPointList">
          {analytics.weakPoints.map((point) => (
            <div className="weakPointRow" key={point.id}>
              <div>
                <span className="tierBadge">{point.tierName}</span>
                <strong>{point.title}</strong>
                <small>{point.subjectCode} · {point.reasons.join(" / ")}</small>
              </div>
              <div className="priorityScore">
                <b>{point.priorityScore}</b>
                <span>优先级</span>
              </div>
            </div>
          ))}
          {!analytics.weakPoints.length ? <p className="empty">没有待处理弱点。</p> : null}
        </div>
      </section>
    </div>
  );
}
