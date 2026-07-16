import Link from "next/link";
import { ArrowRight, BookOpenCheck, CalendarDays, CheckCircle2, Clock3, Flame, FolderUp, Target } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { HomeClock } from "@/components/HomeClock";
import { shiftDateKey, todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getTomorrowPlan } from "@/lib/repo/days";
import { getSubjectOverviews, TRACK_NAMES } from "@/lib/repo/knowledge";
import { listTasks } from "@/lib/repo/planner";
import { getSettings } from "@/lib/repo/settings";
import { getHomeSnapshot } from "@/lib/repo/stats";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const access = await requirePageWorkspace("/");

  const db = getDb();
  const today = todayKey();
  const snapshot = getHomeSnapshot(db, access, today);
  const settings = getSettings(db, access);
  const allSubjects = getSubjectOverviews(db, access, today);
  const subjects = settings.enabledSubjectCodes.length
    ? allSubjects.filter((subject) => settings.enabledSubjectCodes.includes(subject.code))
    : allSubjects;
  const tasks = listTasks(db, access, today).filter((task) => !task.done).slice(0, 5);
  const pendingCount = snapshot.dueReviews + snapshot.dueMistakes;
  const yesterdayPlan = getTomorrowPlan(db, access, shiftDateKey(today, -1));
  const firstTask = tasks[0];
  const heroTitle = pendingCount
    ? `先清掉 ${pendingCount} 个到期复习。`
    : firstTask
      ? `接着做：「${truncate(firstTask.title, 18)}」`
      : "今天，从最重要的一件事开始。";
  const heroSub = pendingCount
    ? `复习 ${snapshot.dueReviews} 个 · 错题 ${snapshot.dueMistakes} 道，已按优先级排好，处理完再进新任务。`
    : firstTask
      ? `清单上还有 ${snapshot.openTasks} 个任务等着今天完成。`
      : "工作台已经准备好，给今天一个清晰、可完成的起点。";
  const nextLabel = pendingCount ? "去处理" : snapshot.openTasks ? "进入今日工作台" : "规划今天的第一件事";
  const focusSubjects = [...subjects].sort(
    (a, b) => b.dueCount + b.openMistakes - (a.dueCount + a.openMistakes),
  );

  return (
    <div className="pageStack homePage">
      <section className="homeContext" aria-label="时间与目标">
        <HomeClock />
        {settings.learningGoal ? <span className="homeLearningGoal"><Target size={14} />{settings.learningGoal}</span> : null}
        <div className="homeCountdowns compact">
          {settings.examCountdowns.map((exam) => {
            const days = daysUntil(today, exam.date);
            return <div className={days !== null && days <= 14 ? "countdownChip urgent" : "countdownChip"} key={`${exam.name}-${exam.date}`}><Target size={14} /><span>{exam.name}</span><strong>{days === null ? "—" : days > 0 ? `${days} 天` : days === 0 ? "今天" : "已结束"}</strong></div>;
          })}
        </div>
        <span className="homeAssetMetric"><FolderUp size={15} />今日入库 {snapshot.today.assets}</span>
      </section>

      <section className="homeFocus">
        <div className="homeFocusMain">
          <span className="eyebrow">TODAY · {today}</span>
          <h1>{heroTitle}</h1>
          <p>{heroSub}</p>
          {yesterdayPlan ? (
            <p className="homePlanEcho">昨晚你说：「{yesterdayPlan}」</p>
          ) : null}
          <div className="homeFocusActions">
            <Link className="primaryButton big" href={`/day/${today}`}>{nextLabel}<ArrowRight size={17} /></Link>
            <Link className="secondaryButton" href="/calendar"><CalendarDays size={15} />查看节奏</Link>
          </div>
        </div>
        <div className="homePulse" aria-label="今日状态">
          <div className={pendingCount ? "pulseMetric attention" : "pulseMetric"}><BookOpenCheck size={18} /><span>待处理</span><strong>{pendingCount}</strong><small>复习与错题</small></div>
          <div className="pulseMetric"><CheckCircle2 size={18} /><span>任务</span><strong>{snapshot.doneTasks}<em>/{snapshot.doneTasks + snapshot.openTasks}</em></strong><small>今日完成</small></div>
          <div className="pulseMetric"><Clock3 size={18} /><span>专注</span><strong>{snapshot.today.studyMinutes}<em> min</em></strong><small>今日记录</small></div>
          <div className="pulseMetric"><Flame size={18} /><span>连续</span><strong>{snapshot.streak}<em> 天</em></strong><small>保持节奏</small></div>
        </div>
      </section>

      <div className="homeContentGrid">
        <section className="card homeTasksCard" aria-label="今日未完成任务">
          <div className="sectionTitle">
            <div><span className="sectionKicker">NEXT UP</span><h2>接下来要做</h2></div>
            <Link className="sectionLink" href={`/day/${today}`}>去处理</Link>
          </div>
          <div className="list">
            {tasks.map((task) => (
              <Link className="listRow" href={`/day/${today}`} key={task.id}>
                {task.subject_code ? <span className="rowBadge">{task.subject_code}</span> : null}
                <strong>{task.title}</strong><ArrowRight size={14} />
              </Link>
            ))}
            {!tasks.length && snapshot.openTasks === 0 ? (
              snapshot.doneTasks ? (
                <EmptyState seal="毕" text="今天的任务全部完成了，做得很好。" />
              ) : (
                <EmptyState
                  action={{ href: `/day/${today}`, label: "写下第一条" }}
                  seal="空"
                  text="今天还没安排任务，先写下一个 25 分钟内能完成的动作。"
                />
              )
            ) : null}
            {snapshot.openTasks > tasks.length ? (
              <p className="hint">还有 {snapshot.openTasks - tasks.length} 条未显示。</p>
            ) : null}
          </div>
        </section>

        <section className="card homeSubjectsCard" aria-label="科目风险和进度">
          <div className="sectionTitle">
            <div><span className="sectionKicker">FOCUS</span><h2>需要关注</h2></div>
            <Link className="sectionLink" href="/subjects">全部科目</Link>
          </div>
          <div className="subjectProgressList">
            {focusSubjects.slice(0, 5).map((subject) => {
              const progress = subject.pointCount ? Math.round((subject.masteredCount / subject.pointCount) * 100) : 0;
              return (
                <Link className="subjectProgressRow" href={`/subjects/${subject.code}`} key={subject.code}>
                  <b>{subject.code}</b>
                  <strong>{subject.name}</strong>
                  <div className="progressTrack"><span style={{ width: `${progress}%` }} /></div>
                  <small>{subject.masteredCount}/{subject.pointCount}</small>
                  {subject.dueCount || subject.openMistakes ? <em className="flag due">{subject.dueCount} 复习 · {subject.openMistakes} 错题</em> : <em className="flag subtle">{TRACK_NAMES[subject.track]}</em>}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
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
