import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { DayJournal } from "@/components/DayJournal";
import { DayNotes } from "@/components/DayNotes";
import { DayTasks } from "@/components/DayTasks";
import { OpenCaptureButton } from "@/components/OpenCaptureButton";
import { QuickLog } from "@/components/QuickLog";
import { RichText } from "@/components/RichText";
import { ReviewQueue } from "@/components/ReviewQueue";
import { assetFileUrl } from "@/lib/asset-url";
import { assertDateKey, shiftDateKey, todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { PRE_CONFIDENCE_LABELS } from "@/lib/review-evidence";
import { getDay, getTomorrowPlan } from "@/lib/repo/days";
import { getCaptureHierarchy, getSubjects } from "@/lib/repo/knowledge";
import { listTasks } from "@/lib/repo/planner";
import { listRecentMistakeCauses } from "@/lib/repo/reviews";
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
  const today = todayKey();
  const isToday = date === today;
  const settings = getSettings(db, access);
  const subjects = getSubjects(db, access);
  const enabledSubjectCodes = settings.enabledSubjectCodes.length
    ? settings.enabledSubjectCodes
    : subjects.map((subject) => subject.code);
  const sprintSubjectCodes = [...new Set(settings.examCountdowns.flatMap((exam) => {
    const days = Math.round((Date.parse(`${exam.date}T00:00:00+08:00`) - Date.parse(`${date}T00:00:00+08:00`)) / 86400000);
    if (days < 0 || days > 14) return [];
    return exam.subjectCode ? [exam.subjectCode] : enabledSubjectCodes;
  }))];
  const day = getDay(db, access, date, {
    reviewLimit: settings.dailyReviewLimit,
    sprintSubjectCodes,
    includeReviewQueue: isToday,
  });
  const captureHierarchy = getCaptureHierarchy(db, access);
  const studyMinutes = day.sessions.reduce((total, session) => total + session.duration_minutes, 0);
  const doneTasks = day.tasks.filter((task) => task.done).length;
  const queueCount = day.dueReviews.length + day.dueMistakes.length;
  const yesterday = shiftDateKey(date, -1);
  const carryCount = isToday ? listTasks(db, access, yesterday).filter((task) => !task.done).length : 0;
  const yesterdayPlan = isToday ? getTomorrowPlan(db, access, yesterday) : "";

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
        <div className={queueCount ? "due" : ""}><strong>{isToday ? queueCount : day.reviews.length}</strong><span>{isToday ? "待处理" : "当日复习"}</span></div>
      </section>

      <details className="mobileDayNavigator">
        <summary>展开今日模块导航</summary>
        <nav>
          <a href="#day-tasks">任务 {doneTasks}/{day.tasks.length}</a>
          <a href="#day-reviews">{isToday ? `待处理 ${queueCount}` : `当日复习 ${day.reviews.length}`}</a>
          <a href="#day-notes">随手记 {day.notes.length}</a>
          <a href="#day-journal">复盘</a>
        </nav>
      </details>

      <div className="dayGrid">
        <div className="dayMainCol">
          <details className="dayModule" open><summary>今日任务 · {doneTasks}/{day.tasks.length}</summary><div id="day-tasks"><DayTasks
            carryCount={carryCount}
            carryFrom={yesterday}
            day={date}
            subjects={captureHierarchy}
            tasks={day.tasks}
            today={today}
            yesterdayPlan={yesterdayPlan}
          /></div></details>
          <details className="dayModule" open>
            <summary>{isToday ? `复习队列 · ${queueCount}` : `当日复习记录 · ${day.reviews.length}`}</summary>
            <div id="day-reviews">
              {isToday ? (
                <ReviewQueue
                  day={date}
                  offlineScope={access.workspaceId}
                  doneToday={day.reviews.length}
                  dueReviews={day.dueReviews}
                  dueReviewsTotal={day.dueReviewsTotal}
                  dueMistakes={day.dueMistakes}
                  dueMistakesTotal={day.dueMistakesTotal}
                  dailyLimit={settings.dailyReviewLimit}
                  sprintSubjectCodes={sprintSubjectCodes}
                />
              ) : (
                <section className="card">
                  <div className="sectionTitle">
                    <h2>历史记录</h2>
                    <span className="sectionHint">不使用当前排期回推过去队列</span>
                  </div>
                  <p className="empty">
                    当天实际完成了 {day.reviews.length} 次复习；明细见右侧“当日轨迹”。待处理队列只在今天展示。
                  </p>
                </section>
              )}
            </div>
          </details>
          <details className="dayModule" open><summary>随手记 · {day.notes.length}</summary><div id="day-notes"><DayNotes day={date} notes={day.notes} /></div></details>
          <details className="dayModule" open><summary>当日复盘</summary><div id="day-journal"><DayJournal key={date} date={date} entry={day.entry} /></div></details>
        </div>

        <div className="dayAside">
          <QuickLog day={date} recentCauses={listRecentMistakeCauses(db, access)} subjects={captureHierarchy} />

          <section className="card" aria-label="当日资料">
            <div className="sectionTitle">
              <h2>当日资料</h2>
              <span className="sectionLinkGroup">
                <OpenCaptureButton />
                <Link className="sectionLink" href="/assets">资料库</Link>
              </span>
            </div>
            <div className="assetList">
              {day.assets.map((asset) => (
                <a className="assetRow" href={assetFileUrl(asset.id)} key={asset.id} rel="noopener" target="_blank">
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
                  {item.output ? <small><RichText text={item.output} /></small> : null}
                </div>
              ))}
              {day.reviews.map((item) => (
                <div className="listRow" key={`r-${item.id}`}>
                  <span className="rowBadge review">{item.event_type === "mistake_reattempt" ? "回炉" : "复习"}</span>
                  <strong><RichText text={item.knowledge_title || item.note || "复习"} /></strong>
                  <small>
                    {item.attempt_mode === "unknown"
                      ? `历史评分 ${item.score}/3`
                      : `揭晓前${PRE_CONFIDENCE_LABELS[item.pre_confidence ?? 0]} · 结果 ${item.score}/3`}
                  </small>
                </div>
              ))}
              {day.mistakes.map((item) => (
                <div className="listRow" key={`m-${item.id}`}>
                  <span className="rowBadge mistake">错题</span>
                  <strong><RichText text={item.title} /></strong>
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
