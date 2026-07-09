import Link from "next/link";
import { ArrowRight, CalendarDays, Flame, Settings } from "lucide-react";
import { HomeClock } from "@/components/HomeClock";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";
import { getSubjectOverviews, TRACK_NAMES } from "@/lib/repo/knowledge";
import { listTasks } from "@/lib/repo/planner";
import { getSettings } from "@/lib/repo/settings";
import { getHomeSnapshot } from "@/lib/repo/stats";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requirePageSession("/");

  const db = getDb();
  const today = todayKey();
  const snapshot = getHomeSnapshot(db, today);
  const settings = getSettings(db);
  const subjects = getSubjectOverviews(db, today);
  const tasks = listTasks(db, today).filter((task) => !task.done).slice(0, 5);
  const pendingCount = snapshot.dueReviews + snapshot.dueMistakes;

  return (
    <div className="pageStack">
      <section className="homeHero">
        <HomeClock />
        <div className="homeCountdowns">
          {settings.examCountdowns.map((exam) => {
            const days = daysUntil(today, exam.date);
            return (
              <div className={days !== null && days <= 14 ? "countdownCard urgent" : "countdownCard"} key={`${exam.name}-${exam.date}`}>
                <span>{exam.name}</span>
                {days === null ? (
                  <strong>—</strong>
                ) : days > 0 ? (
                  <strong>{days}<small>天</small></strong>
                ) : days === 0 ? (
                  <strong className="today">今天</strong>
                ) : (
                  <strong className="past">已结束</strong>
                )}
                <em>{exam.date}</em>
              </div>
            );
          })}
          <Link className="countdownCard add" href="/settings" aria-label="设置考试倒计时">
            <Settings size={16} />
            <span>{settings.examCountdowns.length ? "管理倒计时" : "设置考试倒计时"}</span>
          </Link>
        </div>
      </section>

      <section className="homeStats" aria-label="今日概览">
        <div className="homeStat streak">
          <Flame size={18} />
          <strong>{snapshot.streak}</strong>
          <span>连续学习天数</span>
        </div>
        <div className="homeStat">
          <strong>{snapshot.doneTasks}/{snapshot.doneTasks + snapshot.openTasks}</strong>
          <span>今日任务</span>
        </div>
        <div className={pendingCount ? "homeStat due" : "homeStat"}>
          <strong>{pendingCount}</strong>
          <span>待复习 / 回炉</span>
        </div>
        <div className="homeStat">
          <strong>{snapshot.today.studyMinutes}</strong>
          <span>今日学习分钟</span>
        </div>
        <div className="homeStat">
          <strong>{snapshot.today.assets}</strong>
          <span>今日入库资料</span>
        </div>
      </section>

      <section className="homeActions">
        <Link className="primaryButton big" href={`/day/${today}`}>
          进入今日工作台
          <ArrowRight size={17} />
        </Link>
        <Link className="secondaryButton" href="/calendar">
          <CalendarDays size={15} />
          查看日历
        </Link>
      </section>

      <div className="grid2">
        <section className="card" aria-label="今日未完成任务">
          <div className="sectionTitle">
            <h2>今日未完成</h2>
            <Link className="sectionLink" href={`/day/${today}`}>去处理</Link>
          </div>
          <div className="list">
            {tasks.map((task) => (
              <div className="listRow" key={task.id}>
                {task.subject_code ? <span className="rowBadge">{task.subject_code}</span> : null}
                <strong>{task.title}</strong>
              </div>
            ))}
            {!tasks.length && snapshot.openTasks === 0 ? (
              <p className="empty">
                {snapshot.doneTasks ? "今天的任务全部完成了。" : "今天还没安排任务，去工作台列出第一条。"}
              </p>
            ) : null}
            {snapshot.openTasks > tasks.length ? (
              <p className="hint">还有 {snapshot.openTasks - tasks.length} 条未显示。</p>
            ) : null}
          </div>
        </section>

        <section className="card" aria-label="科目进度">
          <div className="sectionTitle">
            <h2>科目进度</h2>
            <Link className="sectionLink" href="/subjects">全部科目</Link>
          </div>
          <div className="subjectProgressList">
            {subjects.slice(0, 7).map((subject) => {
              const progress = subject.pointCount ? Math.round((subject.masteredCount / subject.pointCount) * 100) : 0;
              return (
                <Link className="subjectProgressRow" href={`/subjects/${subject.code}`} key={subject.code}>
                  <b>{subject.code}</b>
                  <strong>{subject.name}</strong>
                  <div className="progressTrack"><span style={{ width: `${progress}%` }} /></div>
                  <small>{subject.masteredCount}/{subject.pointCount}</small>
                  {subject.dueCount ? <em className="flag due">{subject.dueCount} 待复习</em> : <em className="flag subtle">{TRACK_NAMES[subject.track]}</em>}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function daysUntil(today: string, target: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return null;
  const from = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(target.slice(0, 4)),
    Number(target.slice(5, 7)) - 1,
    Number(target.slice(8, 10)),
  );
  return Math.round((to - from) / 86400000);
}
