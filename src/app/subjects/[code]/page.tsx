import Link from "next/link";
import { notFound } from "next/navigation";
import { SubjectWorkbench } from "@/components/SubjectWorkbench";
import { assetFileUrl } from "@/lib/asset-url";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getSubjectDetail } from "@/lib/repo/knowledge";

export const dynamic = "force-dynamic";

export default async function SubjectPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const access = await requirePageWorkspace(`/subjects/${code}`);

  const detail = getSubjectDetail(getDb(), access, decodeURIComponent(code));
  if (!detail) notFound();

  const today = todayKey();
  const allPoints = [...detail.chapters.flatMap((chapter) => chapter.points), ...detail.loosePoints];
  const mastered = allPoints.filter((point) => point.status === "已掌握").length;
  const due = allPoints.filter((point) => point.next_review && point.next_review <= today).length;
  const openMistakes = detail.mistakes.filter((mistake) => !mistake.graduated).length;

  return (
    <div className="pageStack">
      <div className="pageHeader subjectDetailHeader">
        <div>
          <span className="eyebrow"><Link href="/subjects">科目</Link> / {detail.subject.code}</span>
          <h1>{detail.subject.name}</h1>
          {detail.subject.description ? <p>{detail.subject.description}</p> : null}
        </div>
        <div className="subjectHeaderStats">
          <div><strong>{mastered}/{allPoints.length}</strong><span>已掌握</span></div>
          <div className={due ? "due" : ""}><strong>{due}</strong><span>待复习</span></div>
          <div className={openMistakes ? "due" : ""}><strong>{openMistakes}</strong><span>未毕业错题</span></div>
        </div>
      </div>

      <SubjectWorkbench
        subject={detail.subject}
        chapters={detail.chapters}
        loosePoints={detail.loosePoints}
        today={today}
      />

      <section className="grid2">
        <div className="card" aria-label="科目资料">
          <div className="sectionTitle">
            <h2>关联资料</h2>
            <Link className="sectionLink" href="/assets">资料库</Link>
          </div>
          <div className="assetList">
            {detail.assets.map((asset) => (
              <a className="assetRow" href={assetFileUrl(asset.id)} key={asset.id} rel="noopener" target="_blank">
                <strong>{asset.original_name}</strong>
                <small>
                  {asset.day}
                  {asset.knowledge_titles ? ` · ${asset.knowledge_titles}` : ""}
                </small>
              </a>
            ))}
            {!detail.assets.length ? <p className="empty">还没有关联资料。收纳文件时选中这个科目即可。</p> : null}
          </div>
        </div>
        <div className="card" aria-label="科目错题">
          <div className="sectionTitle">
            <h2>错题</h2>
            <Link className="sectionLink" href="/mistakes">错题本</Link>
          </div>
          <div className="list">
            {detail.mistakes.map((mistake) => (
              <div className="listRow" key={mistake.id}>
                <span className={mistake.graduated ? "rowBadge" : "rowBadge mistake"}>
                  {mistake.graduated ? "已毕业" : "回炉中"}
                </span>
                <strong>{mistake.title}</strong>
                <small>{mistake.knowledge_title || mistake.cause || mistake.day}</small>
              </div>
            ))}
            {!detail.mistakes.length ? <p className="empty">这个科目还没有错题。</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
