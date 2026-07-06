import { getKnowledgePoints } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default function KnowledgePage() {
  const points = getKnowledgePoints() as Array<{
    id: string;
    subject_code: string;
    subject_name: string;
    submodule: string;
    title: string;
    tier: "r" | "y" | "g";
    tier_name: string;
    exam: number;
    status: string;
  }>;

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <span className="eyebrow">Knowledge Map</span>
        <h1>知识地图</h1>
        <p>来自当前 `知识地图页面.html` 的 M1-M7 主索引。资料、错题和复习会逐步挂到这些点上。</p>
      </div>
      <div className="knowledgeList">
        {points.map((point) => (
          <div className={`kpRow tier-${point.tier}`} key={point.id}>
            <span className="kpCode">{point.subject_code}</span>
            <span className="tierBadge">{point.tier_name}</span>
            <strong>{point.title}</strong>
            <small>{point.submodule}</small>
            {point.exam ? <b className="star">真题</b> : null}
            <em>{point.status}</em>
          </div>
        ))}
      </div>
    </div>
  );
}
