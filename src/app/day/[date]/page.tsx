import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { DayJournal } from "@/components/DayJournal";
import { DayNotes } from "@/components/DayNotes";
import { DayTasks } from "@/components/DayTasks";
import { QuickLog } from "@/components/QuickLog";
import { ReviewQueue } from "@/components/ReviewQueue";
import { assertDateKey, shiftDateKey, todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getDay } from "@/lib/repo/days";
import { getSubjects } from "@/lib/repo/knowledge";
import { getSettings } from "@/lib/repo/settings";

export const dynamic = "force-dynamic";

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const access = await requirePageWorkspace(`/day/${date}`);
  try {
    assertDateKey(date);
  } catch {
    notFound();
  }

  const db = getDb();
  const settings = getSettings(db, access);
  const day = getDay(db, access, date, { reviewLimit: settings.dailyReviewLimit });
  const subjects = getSubjects(db, access);
  const today = todayKey();
  const isToday = date === today;
  const studyMinutes = day.sessions.reduce((total, session) => total + session.duration_minutes, 0);
  const doneTasks = day.tasks.filter((task) => task.done).length;
  const queueCount = day.dueReviews.length + day.dueMistakes.length;

  return (
    <div className="pageStack">
      <header className="dayHeader">
        <div className="dayHeaderTitle">
          <span className="eyebrow">{isToday ? "TODAY · 今日工作台" : "HISTORY · 当日工作台"}</span>
          <div className="dayNav">
            <Link aria-label="前一天" href={`/day/${shiftDateKey(date, -1)}`}><ChevronLeft size={18} /></Link>
            <h1>{formatDayTitle(date)}</h1>
            <Link aria-label="后一天" href={`/day/${shiftDateKey(date, 1)}`}><ChevronRight size={18} /></Link>
          </div>
        </div>
        <div className="dayHeaderActions">
          {!isToday ? <Link className="secondaryButton" href={`/day/${today}`}>回到今天</Link> : null}
          <Link className="secondaryButton" href="/calendar"><CalendarDays size={15} />日历</Link>
        </div>
      </header>

      <section className="dayStats dayStatusBar" aria-label="当日概览">
        <div><strong>{doneTasks}/{day.tasks.length}</strong><span>任务</span></div>
        <div><strong>{studyMinutes}</strong><span>分钟学习</span></div>
        <div><strong>{day.assets.length}</strong><span>份资料</span></div>
        <div><strong>{day.reviews.length}</strong><span>次复习</span></div>
        <div className={queueCount ? "due" : ""}><strong>{queueCount}</strong><span>待处理</span></div>
      </section>

      <div className="dayGrid">
        <div className="dayMainCol">
          <DayTasks day={date} today={today} tasks={day.tasks} subjects={subjects} />
          <ReviewQueue
            day={date}
            dueReviews={day.dueReviews}
            dueReviewsTotal={day.dueReviewsTotal}
            dueMistakes={day.dueMistakes}
          />
          <DayNotes day={date} notes={day.notes} />
          <DayJournal key={date} date={date} entry={day.entry} />
        </div>

        <div className="dayAside">
          <QuickLog day={date} subjects={subjects} />

          <section className="card" aria-label="当日资料">
            <div className="sectionTitle">
              <h2>当日资料</h2>
              <Link className="sectionLink" href="/assets">资料库</Link>
            </div>
            <div className="assetList">
              {day.assets.map((asset) => (
                <a className="assetRow" href={`/api/assets/${asset.id}/file`} key={asset.id} target="_blank">
                  <strong>{asset.original_name}</strong>
                  <small>{asset.folder_path || "根目录"} · {formatSize(asset.size)}</small>
                </a>
              ))}
              {!day.assets.length ? <p className="empty">还没有资料。打开收纳面板，拖入文件或粘贴截图。</p> : null}
            </div>
          </section>

          <section className="card" aria-label="当日轨迹">
            <div className="sectionTitle"><h2>当日轨迹</h2></div>
            <div className="list">
              {day.sessions.map((item) => (
                <div className="listRow" key={`s-${item.id}`}>
                  <span className="rowBadge">学习</span>
                  <strong>{item.title}</strong>
                  <small>{item.duration_minutes ? `${item.duration_minutes} 分钟` : ""}</small>
                </div>
              ))}
              {day.reviews.map((item) => (
                <div className="listRow" key={`r-${item.id}`}>
                  <span className="rowBadge review">复习</span>
                  <strong>{item.knowledge_title || item.note || "复习"}</strong>
                  <small>{item.score}/3</small>
                </div>
              ))}
              {day.mistakes.map((item) => (
                <div className="listRow" key={`m-${item.id}`}>
                  <span className="rowBadge mistake">错题</span>
                  <strong>{item.title}</strong>
                  <small>{item.graduated ? "已毕业" : item.next_review ? `下次 ${item.next_review}` : ""}</small>
                </div>
              ))}
              {!day.sessions.length && !day.reviews.length && !day.mistakes.length ? (
                <p className="empty">今天还没有学习轨迹。</p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function formatDayTitle(date: string): string {
  const value = new Date(`${date}T00:00:00+08:00`);
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "Asia/Shanghai" }).format(value);
  return `${date} ${weekday}`;
}

function formatSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}
