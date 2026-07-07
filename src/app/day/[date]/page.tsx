import Link from "next/link";
import { DayWorkspace } from "@/components/DayWorkspace";
import { requirePageSession } from "@/lib/page-auth";
import { getDay } from "@/lib/repository";

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  await requirePageSession(`/day/${date}`);

  const day = getDay(date) as {
    entry: Record<string, string>;
    assets: Array<{ id: number; original_name: string; mime_type: string; size: number; note: string }>;
    sessions: Array<{ id: number; title: string; duration_minutes: number; output: string }>;
    reviews: Array<{ id: number; knowledge_title: string; score: number; note: string }>;
    mistakes: Array<{ id: number; title: string; cause: string; next_review: string }>;
  };
  const studyMinutes = day.sessions.reduce((total, session) => total + session.duration_minutes, 0);

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <span className="eyebrow">Daily Hub</span>
        <h1>{date}</h1>
        <p>当天所有资料、学习、复习、错题、日记和总结都在这里收口。</p>
      </div>
      <section className="metricGrid compact">
        <div className="metricCard"><strong>{day.assets.length}</strong><span>资料</span></div>
        <div className="metricCard"><strong>{studyMinutes}m</strong><span>学习</span></div>
        <div className="metricCard"><strong>{day.reviews.length}</strong><span>复习</span></div>
        <div className="metricCard"><strong>{day.mistakes.length}</strong><span>错题</span></div>
      </section>
      <section className="grid2">
        <DayWorkspace date={date} entry={day.entry} />
        <div className="card">
          <div className="sectionTitle"><span className="eyebrow">Assets</span><h2>资料流</h2></div>
          <div className="assetList">
            {day.assets.map((asset) => (
              <Link className="assetRow" href={`/api/assets/${asset.id}/file`} key={asset.id} target="_blank">
                <span>{asset.mime_type || "file"}</span>
                <strong>{asset.original_name}</strong>
                <small>{Math.round(asset.size / 1024)} KB</small>
              </Link>
            ))}
            {!day.assets.length ? <p className="empty">今天还没有资料。把截图或文档拖到右侧小窗口。</p> : null}
          </div>
        </div>
      </section>
      <section className="grid3">
        <TimelineCard title="学习记录" items={day.sessions.map((item) => `${item.title} · ${item.duration_minutes}m`)} />
        <TimelineCard title="复习记录" items={day.reviews.map((item) => `${item.knowledge_title || "复习"} · ${item.score}/3`)} />
        <TimelineCard title="错题" items={day.mistakes.map((item) => `${item.title} · ${item.next_review || "待复习"}`)} />
      </section>
    </div>
  );
}

function TimelineCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="card">
      <div className="sectionTitle"><h2>{title}</h2></div>
      <div className="list">
        {items.length ? items.map((item) => <div className="listRow" key={item}><strong>{item}</strong></div>) : <p className="empty">暂无记录。</p>}
      </div>
    </div>
  );
}
