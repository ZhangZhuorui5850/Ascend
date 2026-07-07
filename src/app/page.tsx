import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { getDashboard } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requirePageSession("/");

  const dashboard = getDashboard() as {
    today: string;
    pointStats: { total: number; mastered: number; openRed: number; examCount: number };
    todayStats: { assets: number; studyMinutes: number; reviews: number; mistakes: number };
    due: Array<{ id: string; title: string; subject_code: string; tier_name: string; next_review: string }>;
    subjects: Array<{ code: string; name: string; description: string }>;
  };

  return (
    <div className="pageStack">
      <section className="heroBand">
        <span className="eyebrow">Calendar-first Learning OS</span>
        <h1>今天先看日历，再进入当天工作台。</h1>
        <p>
          资料收纳、学习记录、错题、复习和总结都落到日期上；再按 M1-M7 和知识点重新聚合。
        </p>
        <div className="heroActions">
          <Link className="primaryButton" href={`/day/${dashboard.today}`}>进入今日</Link>
          <Link className="secondaryButton" href="/calendar">查看日历</Link>
        </div>
      </section>

      <section className="metricGrid">
        <div className="metricCard"><strong>{dashboard.pointStats.total}</strong><span>知识点</span></div>
        <div className="metricCard danger"><strong>{dashboard.pointStats.openRed}</strong><span>未掌握红点</span></div>
        <div className="metricCard"><strong>{dashboard.todayStats.assets}</strong><span>今日资料</span></div>
        <div className="metricCard"><strong>{dashboard.todayStats.studyMinutes}m</strong><span>今日学习</span></div>
        <div className="metricCard"><strong>{dashboard.todayStats.reviews}</strong><span>今日复习</span></div>
        <div className="metricCard"><strong>{dashboard.todayStats.mistakes}</strong><span>今日错题</span></div>
      </section>

      <section className="grid2">
        <div className="card">
          <div className="sectionTitle"><span className="eyebrow">Due</span><h2>到期复习</h2></div>
          <div className="list">
            {dashboard.due.length ? dashboard.due.map((item) => (
              <div className="listRow" key={item.id}>
                <span>{item.subject_code}</span>
                <strong>{item.title}</strong>
                <small>{item.next_review}</small>
              </div>
            )) : <p className="empty">暂无到期复习。先从右侧收纳窗口记录今天的学习。</p>}
          </div>
        </div>
        <div className="card">
          <div className="sectionTitle"><span className="eyebrow">Subjects</span><h2>M1-M7 科目</h2></div>
          <div className="subjectGrid">
            {dashboard.subjects.map((subject) => (
              <Link href={`/subjects/${subject.code}`} key={subject.code} className="subjectTile">
                <b>{subject.code}</b>
                <span>{subject.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
