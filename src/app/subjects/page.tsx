import Link from "next/link";
import { SubjectCreate } from "@/components/SubjectCreate";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";
import { getSubjectOverviews, TRACK_NAMES, type SubjectOverview, type SubjectTrack } from "@/lib/repo/knowledge";

export const dynamic = "force-dynamic";

export default async function SubjectsPage() {
  await requirePageSession("/subjects");

  const subjects = getSubjectOverviews(getDb(), todayKey());
  const groups: Array<{ track: SubjectTrack; items: SubjectOverview[] }> = (["written", "machine"] as const)
    .map((track) => ({ track, items: subjects.filter((subject) => subject.track === track) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h1>科目</h1>
        <p>每个科目按「章节 → 知识点」组织；笔试和机试用类型区分，机制完全一致。</p>
      </div>

      {groups.map((group) => (
        <section key={group.track} aria-label={TRACK_NAMES[group.track]}>
          <div className="trackHeader">
            <h2>{TRACK_NAMES[group.track]}</h2>
            <span className="sectionHint">{group.items.length} 个科目</span>
          </div>
          <div className="subjectCards">
            {group.items.map((subject) => {
              const progress = subject.pointCount ? Math.round((subject.masteredCount / subject.pointCount) * 100) : 0;
              return (
                <Link href={`/subjects/${subject.code}`} className="subjectCard" key={subject.code}>
                  <div className="subjectCardHead">
                    <b>{subject.code}</b>
                    <strong>{subject.name}</strong>
                  </div>
                  <div className="progressTrack" role="img" aria-label={`掌握 ${progress}%`}>
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <div className="subjectCardMeta">
                    <span>{subject.masteredCount}/{subject.pointCount} 已掌握</span>
                    <span>均值 {subject.avgMastery}</span>
                  </div>
                  <div className="subjectCardFlags">
                    {subject.dueCount ? <em className="flag due">{subject.dueCount} 待复习</em> : null}
                    {subject.openMistakes ? <em className="flag mistake">{subject.openMistakes} 错题</em> : null}
                    {subject.assetCount ? <em className="flag">{subject.assetCount} 资料</em> : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <SubjectCreate />
    </div>
  );
}
