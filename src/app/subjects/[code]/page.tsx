import { requirePageSession } from "@/lib/page-auth";
import { getSubject } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function SubjectPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  await requirePageSession(`/subjects/${code}`);

  const data = getSubject(code) as {
    subject?: { code: string; name: string; description: string };
    points: Array<{ id: string; title: string; tier: string; tier_name: string; status: string; exam: number }>;
    assets: Array<{ id: number; original_name: string; day: string }>;
    sessions: Array<{ id: number; title: string; day: string; duration_minutes: number }>;
    mistakes: Array<{ id: number; title: string; day: string; cause: string }>;
  };
  if (!data.subject) return <div className="pageHeader"><h1>科目不存在</h1></div>;

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <span className="eyebrow">{data.subject.code}</span>
        <h1>{data.subject.name}</h1>
        <p>{data.subject.description}</p>
      </div>
      <section className="metricGrid compact">
        <div className="metricCard"><strong>{data.points.length}</strong><span>知识点</span></div>
        <div className="metricCard"><strong>{data.assets.length}</strong><span>资料</span></div>
        <div className="metricCard"><strong>{data.sessions.length}</strong><span>学习记录</span></div>
        <div className="metricCard"><strong>{data.mistakes.length}</strong><span>错题</span></div>
      </section>
      <section className="grid2">
        <div className="card">
          <div className="sectionTitle"><h2>知识点</h2></div>
          <div className="knowledgeList inset">
            {data.points.map((point) => (
              <div className={`kpRow tier-${point.tier}`} key={point.id}>
                <span className="tierBadge">{point.tier_name}</span>
                <strong>{point.title}</strong>
                {point.exam ? <b className="star">真题</b> : null}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="sectionTitle"><h2>沉淀资料</h2></div>
          <div className="list">
            {data.assets.map((asset) => <div className="listRow" key={asset.id}><span>{asset.day}</span><strong>{asset.original_name}</strong></div>)}
            {!data.assets.length ? <p className="empty">暂无绑定资料。</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
