import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function MistakesPage() {
  const mistakes = getDb().prepare("SELECT * FROM mistakes ORDER BY created_at DESC").all() as Array<{
    id: number;
    day: string;
    title: string;
    cause: string;
    next_review: string;
  }>;
  return (
    <div className="pageStack">
      <div className="pageHeader"><span className="eyebrow">Mistakes</span><h1>错题本</h1><p>错题自动进入间隔复习，首轮为 D+1。</p></div>
      <div className="card list">
        {mistakes.map((mistake) => (
          <div className="listRow" key={mistake.id}>
            <span>{mistake.day}</span>
            <strong>{mistake.title}</strong>
            <small>{mistake.cause} · 下次 {mistake.next_review}</small>
          </div>
        ))}
        {!mistakes.length ? <p className="empty">暂无错题。</p> : null}
      </div>
    </div>
  );
}
