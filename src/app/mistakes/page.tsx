import Link from "next/link";
import { MistakeReattempt } from "@/components/MistakeReattempt";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";
import { getMistakeBook } from "@/lib/repo/reviews";

export const dynamic = "force-dynamic";

export default async function MistakesPage() {
  await requirePageSession("/mistakes");

  const today = todayKey();
  const book = getMistakeBook(getDb(), today);

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h1>错题本</h1>
        <p>错题会自动进入间隔复习：仍错继续排队，答对两级即毕业。</p>
      </div>

      <section className="card" aria-label="今日待回炉">
        <div className="sectionTitle">
          <h2>今日待回炉</h2>
          <span className="sectionHint">{book.due.length ? `${book.due.length} 道` : "全部清空了"}</span>
        </div>
        {book.due.length ? (
          <MistakeReattempt day={today} mistakes={book.due} />
        ) : (
          <p className="empty">没有到期错题。继续推进今天的计划吧。</p>
        )}
      </section>

      <section className="grid2">
        <div className="card" aria-label="回炉中的错题">
          <div className="sectionTitle"><h2>回炉中</h2><span className="sectionHint">{book.open.length} 道</span></div>
          <div className="list">
            {book.open.map((mistake) => (
              <div className="listRow" key={mistake.id}>
                <span className="rowBadge mistake">{mistake.next_review ? `下次 ${mistake.next_review}` : "待排期"}</span>
                <strong>{mistake.title}</strong>
                <small>
                  {mistake.subject_code ? `${mistake.subject_code} · ` : ""}
                  {mistake.knowledge_title || mistake.cause || mistake.day}
                </small>
              </div>
            ))}
            {!book.open.length ? <p className="empty">暂无排队中的错题。</p> : null}
          </div>
        </div>
        <div className="card" aria-label="已毕业的错题">
          <div className="sectionTitle"><h2>已毕业</h2><span className="sectionHint">{book.graduated.length} 道</span></div>
          <div className="list">
            {book.graduated.slice(0, 30).map((mistake) => (
              <div className="listRow graduated" key={mistake.id}>
                <span className="rowBadge">{mistake.day}</span>
                <strong>{mistake.title}</strong>
                <small>{mistake.knowledge_title || mistake.cause}</small>
              </div>
            ))}
            {!book.graduated.length ? <p className="empty">还没有毕业的错题。</p> : null}
          </div>
        </div>
      </section>

      <p className="hint">
        新错题在<Link href={`/day/${today}`}>今日工作台</Link>或收纳面板记录，会自动关联科目和知识点。
      </p>
    </div>
  );
}
