import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Crosshair, Trophy } from "lucide-react";
import { MockExamForm } from "@/components/MockExamForm";
import { CreateTrainingTaskButton } from "@/components/CreateTrainingTaskButton";
import { EmptyState } from "@/components/EmptyState";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getCaptureHierarchy } from "@/lib/repo/knowledge";
import { getMockExamDashboard } from "@/lib/repo/mock-exams";

export const dynamic = "force-dynamic";

export default async function MockExamsPage() {
  const access = await requirePageWorkspace("/mock-exams");
  const db = getDb();
  const dashboard = getMockExamDashboard(db, access);
  const subjects = getCaptureHierarchy(db, access);
  const change = dashboard.changePercent;
  const comparison = dashboard.comparison;
  const today = todayKey();
  return (
    <div className="pageStack mockExamPage">
      <header className="pageHeader mockExamPageHeader">
        <div><span className="eyebrow">考试训练</span><h1>模考与冲刺</h1><p>先保存真实成绩；提供题组证据时，再形成“诊断—训练—复测”闭环。</p></div>
        {dashboard.exams.length ? <div className="mockExamHeaderSignal"><Activity size={16} /><span>已积累 <strong>{dashboard.exams.length}</strong> 次真实表现</span></div> : null}
      </header>

      <section className="mockExamMetrics" aria-label="模考指标">
        <MetricCard icon={<BarChart3 size={17} />} label={comparison?.comparable ? "同组平均得分率" : "最近得分率"} primary value={`${dashboard.averagePercent}%`} />
        <MetricCard icon={<Trophy size={17} />} label={comparison?.comparable ? "同组最佳得分率" : "可比样本"} value={comparison?.comparable ? `${dashboard.bestPercent}%` : `${comparison?.sampleCount ?? 0}`} />
        <MetricCard
          icon={change !== null && change >= 0 ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}
          label="最近变化"
          tone={change === null ? "neutral" : change >= 0 ? "up" : "down"}
          value={change === null ? "—" : `${change > 0 ? "+" : ""}${change}%`}
        />
        <MetricCard icon={<Crosshair size={17} />} label="完成模考" value={`${dashboard.exams.length}`} />
      </section>

      <div className="mockExamGrid">
        <MockExamForm subjects={subjects} today={today} />
        <aside className="card mockExamInsight" aria-label="优先补强">
          <div className="mockExamInsightHead"><span className="mockInsightIcon"><Crosshair size={17} /></span><div><span className="sectionKicker">NEXT FOCUS</span><h2>下一轮重点</h2></div></div>
          {dashboard.weakAreas.length ? (
            <>
              <div className="mockWeakLead">
                <span>{dashboard.weakAreas[0].attempts < 2 ? "单场观察信号" : "重复出现的首要短板"}</span>
                <strong>{dashboard.weakAreas[0].label}</strong>
                <p>题组得分率 {dashboard.weakAreas[0].percent}% · {dashboard.weakAreas[0].evidenceGroups} 个题组 / {dashboard.weakAreas[0].attempts} 场可比模考</p>
                {dashboard.weakAreas[0].questionTypes.length || dashboard.weakAreas[0].causeCategories.length ? (
                  <div className="mockWeakEvidenceTags">
                    {dashboard.weakAreas[0].questionTypes.map((value) => <span key={`type:${value}`}>{value}</span>)}
                    {dashboard.weakAreas[0].causeCategories.map((value) => <span key={`cause:${value}`}>{value}</span>)}
                  </div>
                ) : null}
              </div>
              <p className="mockDiagnosisHint">来源：{comparisonLabel(dashboard.weakAreas[0])}{comparison?.comparable ? "" : "；范围或难度未完整标注，仅使用最近一场，不合并趋势"}</p>
              {dashboard.weakAreas[0].attempts < 2 ? <p className="mockDiagnosisHint">仅 1 场可比模考，证据不足以形成稳定结论；可先小规模训练并用短复测确认。</p> : null}
              <div className="weakAreaList">
                {dashboard.weakAreas.map((area, index) => <div className={index === 0 ? "lead" : undefined} key={area.key}><span>{area.label}</span><div><i style={{ transform: `scaleX(${area.percent / 100})` }} /></div><b>{area.percent}%</b></div>)}
              </div>
              <div className="mockInsightAdvice"><strong>{dashboard.weakAreas[0].attempts < 2 ? "试探性训练" : "训练建议"}</strong><p>下一次模考前，可优先练习“{dashboard.weakAreas[0].label}”，完成后安排同类短复测并记录是否改善。</p><CreateTrainingTaskButton
                activityType="mock"
                completionCriteria={`完成“${dashboard.weakAreas[0].label}”同类训练并进行一次小测`}
                day={today}
                notes={`由模考题组证据生成；来源：${comparisonLabel(dashboard.weakAreas[0])}。完成同类题后安排一次短复测。`}
                knowledgePointId={dashboard.weakAreas[0].knowledgePointId}
                sourceId={dashboard.exams[0]?.id}
                sourceType="mock_exam"
                subjectCode={dashboard.weakAreas[0].subjectCode ?? undefined}
                title={`模考专项：${dashboard.weakAreas[0].label}`}
                verificationMethod="同类小测"
              /></div>
            </>
          ) : (
            <div className="mockInsightEmpty"><span>01</span><p><strong>添加首次题组证据</strong><small>至少记录一个真实题组得分后，这里才会排列薄弱知识点；主观感受不参与排序。</small></p></div>
          )}
        </aside>
      </div>

      <section className="card mockExamHistorySection">
        <div className="sectionTitle"><div><span className="sectionKicker">PERFORMANCE LOG</span><h2>模考复盘档案</h2></div><span className="sectionHint">最近结果位于最前</span></div>
        <div className="mockExamHistory">
          {dashboard.exams.map((exam) => {
            const groupEvidence = exam.breakdown.filter((item) => item.evidenceType === "group");
            const feelings = exam.breakdown.filter((item) => item.evidenceType === "self_assessment");
            return (
              <article className="mockExamHistoryCard" key={exam.id}>
                <div className="mockExamHistoryScore" style={{ "--history-score": exam.percent } as React.CSSProperties}><strong>{exam.percent}<small>%</small></strong><span>{exam.score}/{exam.max_score}</span></div>
                <div className="mockExamHistoryMain">
                  <header><div><time>{exam.day}</time><h3>{exam.name}</h3></div><span>{exam.subject_code || "综合模考"}{exam.scope_label ? ` · ${exam.scope_label}` : ""}{exam.difficulty ? ` · ${difficultyLabel(exam.difficulty)}` : ""} · {exam.duration_minutes} 分钟 <i className="mockDiagnosisStatus" data-status={exam.diagnosis_status}>{diagnosisStatusLabel(exam.diagnosis_status)}</i></span></header>
                  {groupEvidence.length ? (
                    <div className="mockHistoryEvidence">
                      <strong>题组证据</strong>
                      <div className="mockHistoryBreakdown">{groupEvidence.map((item, index) => <HistoryBreakdownItem item={item} key={`${item.label}:${index}`} />)}</div>
                    </div>
                  ) : null}
                  {feelings.length ? (
                    <div className="mockHistoryEvidence muted">
                      <strong>考后感受（不参与弱项排序）</strong>
                      <div className="mockHistoryBreakdown">{feelings.map((item, index) => <HistoryBreakdownItem item={item} key={`${item.label}:${index}`} />)}</div>
                    </div>
                  ) : null}
                  {exam.diagnosis_status === "legacy" ? <p className="mockLegacyDiagnosisNote">旧版记录未区分题组证据与主观评估，完整保留但不参与薄弱项排序。</p> : null}
                  {exam.notes ? <p className="mockHistoryNote">{exam.notes}</p> : null}
                </div>
              </article>
            );
          })}
          {!dashboard.exams.length ? <EmptyState seal="试" text="完成一次计时模考，记录成绩、能力诊断与下一轮训练动作。" /> : null}
        </div>
      </section>
    </div>
  );
}

function HistoryBreakdownItem({ item }: { item: import("@/lib/repo/mock-exams").MockExamBreakdown }) {
  const percent = Math.round(item.score / item.maxScore * 100);
  const metadata = [item.questionType, item.causeCategory, item.durationMinutes === null ? "" : `${item.durationMinutes} 分钟`, item.guessedCorrect === null ? "" : item.guessedCorrect ? "猜对" : "非猜对"].filter(Boolean);
  return <div><span>{item.label}</span><i><b style={{ transform: `scaleX(${percent / 100})` }} /></i><strong>{percent}%</strong>{metadata.length ? <small>{metadata.join(" · ")}</small> : null}</div>;
}

function diagnosisStatusLabel(status: import("@/lib/repo/mock-exams").MockExamDiagnosisStatus): string {
  if (status === "evidence_complete") return "完整题组证据";
  if (status === "evidence_partial") return "部分题组证据";
  if (status === "complete") return "历史主观完整";
  if (status === "partial") return "主观感受";
  if (status === "quick") return "快速记录";
  return "历史记录";
}

function MetricCard({ icon, label, value, primary = false, tone = "neutral" }: { icon: React.ReactNode; label: string; value: string; primary?: boolean; tone?: "neutral" | "up" | "down" }) {
  return <div className={primary ? "primary" : undefined} data-tone={tone}><span className="mockMetricIcon">{icon}</span><div><span>{label}</span><strong>{value}</strong></div></div>;
}

function difficultyLabel(value: string): string {
  if (value === "foundation") return "基础";
  if (value === "standard") return "标准";
  if (value === "challenge") return "挑战";
  return "难度未标注";
}

function comparisonLabel(input: {
  subjectCode: string | null;
  scopeLabel: string;
  difficulty: string;
}): string {
  return [
    input.subjectCode || "综合模考",
    input.scopeLabel || "范围未标注",
    difficultyLabel(input.difficulty),
  ].join(" · ");
}
