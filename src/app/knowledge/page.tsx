import Link from "next/link";
import { KnowledgeManager } from "@/components/KnowledgeManager";
import { requirePageSession } from "@/lib/page-auth";
import { getCaptureHierarchy, getKnowledgeLibrary } from "@/lib/repository";

export const dynamic = "force-dynamic";

type Query = { [key: string]: string | string[] | undefined };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function hrefFor(filters: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/knowledge?${query}` : "/knowledge";
}

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<Query> }) {
  await requirePageSession("/knowledge");

  const query = await searchParams;
  const library = getKnowledgeLibrary({
    subjectCode: first(query.subject),
    knowledgePointId: first(query.point),
    tag: first(query.tag),
  });
  const hierarchy = getCaptureHierarchy();
  const filters = library.activeFilters;
  const points = library.points as Array<{
    id: string;
    subject_code: string;
    subject_name: string;
    submodule: string;
    title: string;
    tier: "r" | "y" | "g";
    tier_name: string;
    exam: number;
    status: string;
    asset_count: number;
    mistake_count: number;
  }>;

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <span className="eyebrow">Knowledge Map</span>
        <h1>知识地图</h1>
        <p>只维护科目、章节和知识点结构。文件目录和上传移动统一到资料库处理。</p>
      </div>

      <section className="card librarySummary">
        <div>
          <span className="eyebrow">Current View</span>
          <h2>{filters.knowledgePointId || filters.tag || filters.subjectCode || "全部知识库"}</h2>
        </div>
        <div className="summaryMetrics">
          <span><b>{points.length}</b> 知识点</span>
          <span><b>{library.assets.length}</b> 文件</span>
        </div>
        <Link className="secondaryButton" href="/knowledge">清除筛选</Link>
      </section>

      <KnowledgeManager initialSubjects={hierarchy} />

      <section className="card">
        <div className="sectionTitle splitTitle">
          <div>
            <span className="eyebrow">Points</span>
            <h2>知识点</h2>
          </div>
        </div>
        <div className="knowledgeList compactKnowledge">
          {points.map((point) => (
            <Link
              className={`kpRow tier-${point.tier}`}
              href={hrefFor({ subject: point.subject_code, point: point.id, tag: filters.tag })}
              key={point.id}
            >
              <span className="kpCode">{point.subject_code}</span>
              <span className="tierBadge">{point.tier_name}</span>
              <strong>{point.title}</strong>
              <small>{point.submodule}</small>
              <em>{point.asset_count} 文件 · {point.mistake_count} 错题</em>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
