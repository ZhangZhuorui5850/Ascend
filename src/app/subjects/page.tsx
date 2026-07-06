import Link from "next/link";
import { getSubjects } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default function SubjectsPage() {
  const subjects = getSubjects() as Array<{ code: string; name: string; description: string }>;
  return (
    <div className="pageStack">
      <div className="pageHeader">
        <span className="eyebrow">Subjects</span>
        <h1>按科目看笔记</h1>
        <p>每个科目会聚合对应知识点、上传资料、学习记录和错题。</p>
      </div>
      <div className="subjectGrid big">
        {subjects.map((subject) => (
          <Link href={`/subjects/${subject.code}`} className="subjectTile" key={subject.code}>
            <b>{subject.code}</b>
            <span>{subject.name}</span>
            <small>{subject.description}</small>
          </Link>
        ))}
      </div>
    </div>
  );
}
