import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Crosshair, Trophy } from "lucide-react";
import { MockExamForm } from "@/components/MockExamForm";
import { EmptyState } from "@/components/EmptyState";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getSubjects } from "@/lib/repo/knowledge";
import { getMockExamDashboard } from "@/lib/repo/mock-exams";

export const dynamic = "force-dynamic";

export default async function MockExamsPage() {
  const access = await requirePageWorkspace("/mock-exams");
  const db = getDb();
  const dashboard = getMockExamDashboard(db, access);
  const subjects = getSubjects(db, access);
  const change = dashboard.changePercent;
  return (
    <div className="pageStack mockExamPage">
      <header className="pageHeader mockExamPageHeader">
        <div><span className="eyebrow">考试训练</span><h1>模考与冲刺</h1><p>每次模考都形成一条“成绩—诊断—训练动作”的闭环记录。</p></div>
        {dashboard.exams.length ? <div className="mockExamHeaderSignal"><Activity size={16} /><span>已积累 <strong>{dashboard.exams.length}</strong> 次真实表现</span></div> : null}
      </header>

      <section className="mockExamMetrics" aria-label="模考指标">
        <MetricCard icon={<BarChart3 size={17} />} label="平均得分率" primary value={`${dashboard.averagePercent}%`} />
        <MetricCard icon={<Trophy size={17} />} label="最佳得分率" value={`${dashboard.bestPercent}%`} />
        <MetricCard
          icon={change !== null && change >= 0 ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}
          label="最近变化"
          tone={change === null ? "neutral" : change >= 0 ? "up" : "down"}
          value={change === null ? "—" : `${change > 0 ? "+" : ""}${change}%`}
        />
        <MetricCard icon={<Crosshair size={17} />} label="完成模考" value={`${dashboard.exams.length}`} />
      </section>

      <div className="mockExamGrid">
        <MockExamForm subjects={subjects} today={todayKey()} />
        <aside className="card mockExamInsight" aria-label="优先补强">
          <div className="mockExamInsightHead"><span className="mockInsightIcon"><Crosshair size={17} /></span><div><span className="sectionKicker">NEXT FOCUS</span><h2>下一轮重点</h2></div></div>
          {dashboard.weakAreas.length ? (
            <>
              <div className="mockWeakLead"><span>当前首要短板</span><strong>{dashboard.weakAreas[0].label}</strong><p>历史均值 {dashboard.weakAreas[0].percent}% · 来自 {dashboard.weakAreas[0].attempts} 次诊断</p></div>
              <div className="weakAreaList">
                {dashboard.weakAreas.map((area, index) => <div className={index === 0 ? "lead" : undefined} key={area.label}><span>{area.label}</span><div><i style={{ width: `${area.percent}%` }} /></div><b>{area.percent}%</b></div>)}
              </div>
              <div className="mockInsightAdvice"><strong>训练建议</strong><p>下一次模考前，将一半专项训练时间投入“{dashboard.weakAreas[0].label}”，并使用同类题验证变化。</p></div>
            </>
          ) : (
            <div className="mockInsightEmpty"><span>01</span><p><strong>完成首次诊断</strong><small>记录一次模考后，这里会按历史得分率排列能力短板。</small></p></div>
          )}
        </aside>
      </div>

      <section className="card mockExamHistorySection">
        <div className="sectionTitle"><div><span className="sectionKicker">PERFORMANCE LOG</span><h2>模考复盘档案</h2></div><span className="sectionHint">最近结果位于最前</span></div>
        <div className="mockExamHistory">
          {dashboard.exams.map((exam) => (
            <article className="mockExamHistoryCard" key={exam.id}>
              <div className="mockExamHistoryScore" style={{ "--history-score": exam.percent } as React.CSSProperties}><strong>{exam.percent}<small>%</small></strong><span>{exam.score}/{exam.max_score}</span></div>
              <div className="mockExamHistoryMain">
                <header><div><time>{exam.day}</time><h3>{exam.name}</h3></div><span>{exam.subject_code || "综合模考"} · {exam.duration_minutes} 分钟</span></header>
                {exam.breakdown.length ? <div className="mockHistoryBreakdown">{exam.breakdown.map((item) => { const percent = Math.round(item.score / item.maxScore * 100); return <div key={item.label}><span>{item.label}</span><i><b style={{ width: `${percent}%` }} /></i><strong>{percent}%</strong></div>; })}</div> : null}
                {exam.notes ? <p className="mockHistoryNote">{exam.notes}</p> : null}
              </div>
            </article>
          ))}
          {!dashboard.exams.length ? <EmptyState seal="试" text="完成一次计时模考，记录成绩、能力诊断与下一轮训练动作。" /> : null}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ icon, label, value, primary = false, tone = "neutral" }: { icon: React.ReactNode; label: string; value: string; primary?: boolean; tone?: "neutral" | "up" | "down" }) {
  return <div className={primary ? "primary" : undefined} data-tone={tone}><span className="mockMetricIcon">{icon}</span><div><span>{label}</span><strong>{value}</strong></div></div>;
}
