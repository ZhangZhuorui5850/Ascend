import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";
import { CountUp } from "@/components/CountUp";
import { EmptyState } from "@/components/EmptyState";
import { shiftDateKey, todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getPluginTodayRecommendations } from "@/lib/plugins/runtime";
import { getTomorrowPlan } from "@/lib/repo/days";
import { getSubjectOverviews, TRACK_NAMES } from "@/lib/repo/knowledge";
import { getSettings } from "@/lib/repo/settings";
import { getHomeSnapshot, getLearningAnalytics, getWeeklyCapacity } from "@/lib/repo/stats";
import { listDayTaskItems } from "@/lib/repo/task-read-model";

export const dynamic = "force-dynamic";

type HomeState = "due" | "task" | "summit" | "active" | "blank";

export default async function HomePage() {
  const access = await requirePageWorkspace("/");

  const db = getDb();
  const today = todayKey();
  const snapshot = getHomeSnapshot(db, access, today);
  const pluginRecommendations = getPluginTodayRecommendations(db, access, today);
  const settings = getSettings(db, access);
  const analytics = getLearningAnalytics(db, access, today);
  const weeklyCapacity = getWeeklyCapacity(db, access, {
    today,
    targetMinutes: settings.weeklyMinutes,
  });
  const allSubjects = getSubjectOverviews(db, access, today);
  const subjects = settings.enabledSubjectCodes.length
    ? allSubjects.filter((subject) => settings.enabledSubjectCodes.includes(subject.code))
    : allSubjects;
  const enabledCodes = new Set(subjects.map((subject) => subject.code));

  // 已排时任务按时刻前置，未排时按优先级尾随——这是「今日时间线」的克制版
  const openTaskList = listDayTaskItems(db, access, today)
    .filter((task) => !task.done)
    .sort((a, b) => {
      if (a.scheduled_start && b.scheduled_start) {
        return a.scheduled_start.localeCompare(b.scheduled_start) || a.priority - b.priority;
      }
      if (a.scheduled_start) return -1;
      if (b.scheduled_start) return 1;
      return a.priority - b.priority || a.sort_order - b.sort_order;
    });
  const tasks = openTaskList.slice(0, 5);
  const firstTask = openTaskList[0];
  const remainingMinutes = openTaskList.reduce((sum, task) => sum + task.estimated_minutes, 0);

  const pendingCount = snapshot.dueReviews + snapshot.dueMistakes;
  const remainingReviewCapacity = Math.max(0, settings.dailyReviewLimit - snapshot.today.reviews);
  const scheduledReviewCount = Math.min(pendingCount, remainingReviewCapacity);
  const yesterdayPlan = getTomorrowPlan(db, access, shiftDateKey(today, -1));
  const hasLearningRecord = snapshot.today.studyMinutes > 0
    || snapshot.today.reviews > 0
    || snapshot.today.mistakes > 0
    || snapshot.today.mockExams > 0;

  const state: HomeState = pendingCount
    ? "due"
    : firstTask
      ? "task"
      : snapshot.doneTasks > 0
        ? "summit"
        : hasLearningRecord
          ? "active"
          : "blank";

  const disabledModules = new Set(settings.modulePrefs.filter((pref) => !pref.enabled).map((pref) => pref.key));
  // 板块被关闭时倒计时仍展示（它属于考试节点设置），但入口退化为设置页
  const examHref = disabledModules.has("mock-exams") ? "/settings#study" : "/mock-exams";

  const upcomingExams = settings.examCountdowns
    .map((exam) => ({ exam, days: daysUntil(today, exam.date) }))
    .filter((item): item is { exam: (typeof settings.examCountdowns)[number]; days: number } =>
      item.days !== null && item.days >= 0)
    .sort((a, b) => a.days - b.days);
  const nearestExam = upcomingExams[0];

  const focusSubjects = [...subjects]
    .sort((a, b) => b.dueCount + b.openMistakes - (a.dueCount + a.openMistakes))
    .slice(0, 4);
  const weakPoints = analytics.weakPoints
    .filter((point) => enabledCodes.has(point.subjectCode))
    .slice(0, 3);

  const weekDelta = analytics.prevWeek.studyMinutes
    ? Math.round(
        ((analytics.week.studyMinutes - analytics.prevWeek.studyMinutes) /
          analytics.prevWeek.studyMinutes) * 100,
      )
    : null;
  const maxDailyMinutes = Math.max(...analytics.dailyMinutes.map((item) => item.minutes), 1);
  const studiedCapacityWidth = Math.min(
    100,
    Math.round((weeklyCapacity.studiedMinutes / weeklyCapacity.targetMinutes) * 100),
  );
  const plannedCapacityWidth = Math.min(
    100 - studiedCapacityWidth,
    Math.round((weeklyCapacity.plannedMinutes / weeklyCapacity.targetMinutes) * 100),
  );
  const capacityState = weeklyCapacity.overloadMinutes
    ? "overload"
    : weeklyCapacity.unallocatedMinutes
      ? "open"
      : "covered";

  return (
    <div className="pageStack homePage" data-home-state={state}>
      <section aria-label="目标与里程碑" className="homeMasthead">
        <span className="homeMastheadKicker">BASE CAMP · 大本营</span>
        {settings.learningGoal ? (
          <Link className="homeGoal" href="/settings"><Target size={13} />{settings.learningGoal}</Link>
        ) : null}
        <div className="homeMastheadChips">
          {upcomingExams.slice(0, 2).map(({ exam, days }) => (
            <Link
              className={days <= 14 ? "countdownChip urgent" : "countdownChip"}
              href={examHref}
              key={`${exam.name}-${exam.date}`}
            >
              <span>{exam.subjectCode ? `${exam.subjectCode} · ` : ""}{exam.name}</span>
              <strong>{days === 0 ? "今天" : `${days} 天`}</strong>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="现在做什么" className="homeFocus" data-state={state}>
        <div className="homeFocusMain">
          {state === "due" ? (
            <>
              <span className="eyebrow">NOW · 到期复习</span>
              <h1>{scheduledReviewCount
                ? <>还有 <b>{pendingCount}</b> 个到期项，今日先安排 <b>{scheduledReviewCount}</b> 个。</>
                : <>还有 <b>{pendingCount}</b> 个到期项，今日容量已用完。</>}</h1>
              <p className="homeFocusMeta">
                复习 <b>{snapshot.dueReviews}</b> · 错题 <b>{snapshot.dueMistakes}</b> · 今日剩余容量 <b>{remainingReviewCapacity}</b>/{settings.dailyReviewLimit}
              </p>
              {yesterdayPlan ? <p className="homePlanEcho">昨晚你说：「{yesterdayPlan}」</p> : null}
              <div className="homeFocusActions">
                <Link className="primaryButton big" href={`/day/${today}#day-reviews`}>{scheduledReviewCount ? "开始复习" : "查看积压"}<ArrowRight size={17} /></Link>
                <Link className="homeFocusLink" href={`/day/${today}#day-tasks`}>先看今日任务 →</Link>
              </div>
            </>
          ) : null}
          {state === "task" && firstTask ? (
            <>
              <span className="eyebrow">NOW · 今日任务</span>
              <h1>接着做：「{truncate(firstTask.title, 14)}」</h1>
              <p className="homeFocusMeta">
                P{firstTask.priority}
                {firstTask.subject_code ? ` · ${firstTask.subject_code}` : ""}
                {` · 预计 ${firstTask.estimated_minutes} 分钟 · ${firstTask.scheduled_start ?? "未排时"}`}
              </p>
              <p className="homeFocusMeta">今天还剩 <b>{openTaskList.length}</b> 项 · 共约 <b>{remainingMinutes}</b> 分钟</p>
              <div className="homeFocusActions">
                <Link className="primaryButton big" href={`/day/${today}#day-tasks`}>开始这件事<ArrowRight size={17} /></Link>
                <Link className="homeFocusLink" href={`/day/${today}`}>查看全天安排 →</Link>
              </div>
            </>
          ) : null}
          {state === "summit" ? (
            <>
              <span className="eyebrow">SUMMIT · 今日已登顶</span>
              <h1>今日已登顶。</h1>
              <p className="homeFocusMeta">
                专注 <b>{snapshot.today.studyMinutes}</b> 分钟 · 复习 <b>{snapshot.today.reviews}</b> · 错题 <b>{snapshot.today.mistakes}</b> · 连续 <b>{snapshot.streak}</b> 天
              </p>
              <div className="homeFocusActions">
                <Link className="homeFocusLink" href={`/day/${today}#day-journal`}>规划明天 →</Link>
                <Link className="homeFocusLink" href="/subjects">预习知识树 →</Link>
              </div>
            </>
          ) : null}
          {state === "active" ? (
            <>
              <span className="eyebrow">IN PROGRESS · 今日已开始</span>
              <h1>今天已经有学习记录。</h1>
              <p className="homeFocusMeta">
                专注 <b>{snapshot.today.studyMinutes}</b> 分钟 · 复习 <b>{snapshot.today.reviews}</b> · 错题记录 <b>{snapshot.today.mistakes}</b> · 模考 <b>{snapshot.today.mockExams}</b>
              </p>
              <div className="homeFocusActions">
                <Link className="primaryButton big" href={`/day/${today}`}>继续今天<ArrowRight size={17} /></Link>
                <Link className="homeFocusLink" href="/analytics">查看学习信号 →</Link>
              </div>
            </>
          ) : null}
          {state === "blank" ? (
            <>
              <span className="eyebrow">START · 空白的一天</span>
              <h1>今天还是空白。</h1>
              <p className="homeFocusMeta">先放一件 25 分钟内能完成的事。</p>
              {yesterdayPlan ? <p className="homePlanEcho">昨晚你说：「{yesterdayPlan}」</p> : null}
              <div className="homeFocusActions">
                <Link className="primaryButton big" href={`/day/${today}#day-tasks`}>写下第一件事<ArrowRight size={17} /></Link>
              </div>
            </>
          ) : null}
        </div>
        {state === "due" ? (
          <div className="homeFocusFigure">
            <strong><CountUp value={pendingCount} /></strong>
            <small>到期待清</small>
            {nearestExam && nearestExam.days <= 14 ? (
              <Link className="homeFocusExam" href={examHref}>距 {nearestExam.exam.name} <b>{nearestExam.days}</b> 天</Link>
            ) : null}
          </div>
        ) : null}
        {state === "task" ? (
          <div className="homeFocusFigure">
            <strong>{openTaskList.length}</strong>
            <small>今日待办</small>
          </div>
        ) : null}
        {state === "blank" && nearestExam ? (
          <Link className="homeFocusFigure" href={examHref}>
            <strong>{nearestExam.days}</strong>
            <small>距 {nearestExam.exam.name}</small>
          </Link>
        ) : null}
        {state === "summit" ? <span aria-hidden className="homeSeal">顶</span> : null}
      </section>

      <section aria-label="今日账本" className="homeLedger">
        <Link className={pendingCount ? "homeLedgerItem due" : "homeLedgerItem zero"} href={`/day/${today}#day-reviews`}>
          <span>待处理</span>
          <strong>{pendingCount}</strong>
        </Link>
        <Link
          className={snapshot.doneTasks + snapshot.openTasks ? "homeLedgerItem" : "homeLedgerItem zero"}
          href={`/day/${today}#day-tasks`}
        >
          <span>任务</span>
          <strong>{snapshot.doneTasks}<em>/{snapshot.doneTasks + snapshot.openTasks}</em></strong>
        </Link>
        <Link
          className={snapshot.today.studyMinutes ? "homeLedgerItem" : "homeLedgerItem zero"}
          href="/analytics"
        >
          <span>专注</span>
          <strong>{snapshot.today.studyMinutes}<em> min</em></strong>
        </Link>
        <Link className={snapshot.streak ? "homeLedgerItem" : "homeLedgerItem zero"} href="/calendar">
          <span>连续</span>
          <strong>{snapshot.streak}<em> 天</em></strong>
        </Link>
        <Link className="homeLedgerItem homeLedgerBars" href="/analytics">
          <span>本周专注{weekDelta === null ? "" : ` ${weekDelta >= 0 ? "+" : ""}${weekDelta}%`}</span>
          <div aria-label="近 7 天每日专注分钟" className="weekBars" role="img">
            {analytics.dailyMinutes.map((item, index) => (
              <div
                className={index === 6 ? "weekBar today" : "weekBar"}
                key={item.day}
                title={`${item.day} · ${item.minutes} 分钟`}
              >
                <i style={{ height: `${item.minutes ? Math.max(8, Math.round((item.minutes / maxDailyMinutes) * 100)) : 4}%` }} />
              </div>
            ))}
          </div>
        </Link>
      </section>

      {pluginRecommendations.length ? (
        <section aria-label="扩展到期动作" className="homePluginSignals">
          {pluginRecommendations.map((recommendation) => (
            <Link href={recommendation.href} key={recommendation.key}>
              <span>{recommendation.label}</span>
              <div><strong>{recommendation.title}</strong><small>{recommendation.description}</small></div>
              <b>{recommendation.count}</b>
              <ArrowRight size={16} />
            </Link>
          ))}
        </section>
      ) : null}

      <section aria-label="本周学习容量" className="homeCapacity" data-state={capacityState}>
        <div className="homeCapacityHead">
          <div>
            <span className="sectionKicker">WEEK CAPACITY · {weeklyCapacity.start.slice(5)}–{weeklyCapacity.end.slice(5)}</span>
            <h2>本周容量</h2>
          </div>
          <Link className="sectionLink" href="/settings#study">调整目标</Link>
        </div>
        <div className="homeCapacityMetrics">
          <div><span>目标</span><strong>{weeklyCapacity.targetMinutes}<small> min</small></strong></div>
          <div><span>已学习</span><strong>{weeklyCapacity.studiedMinutes}<small> min</small></strong></div>
          <div><span>已排未完成</span><strong>{weeklyCapacity.plannedMinutes}<small> min</small></strong></div>
          <div className={weeklyCapacity.overloadMinutes ? "warning" : ""}>
            <span>{weeklyCapacity.overloadMinutes ? "超出目标" : "尚未分配"}</span>
            <strong>{weeklyCapacity.overloadMinutes || weeklyCapacity.unallocatedMinutes}<small> min</small></strong>
          </div>
        </div>
        <div
          aria-label={`本周目标 ${weeklyCapacity.targetMinutes} 分钟，已学习 ${weeklyCapacity.studiedMinutes} 分钟，已排未完成 ${weeklyCapacity.plannedMinutes} 分钟`}
          className="homeCapacityTrack"
          role="img"
        >
          <i className="studied" style={{ width: `${studiedCapacityWidth}%` }} />
          <i className="planned" style={{ left: `${studiedCapacityWidth}%`, width: `${plannedCapacityWidth}%` }} />
        </div>
        <p className="homeCapacityStatus">
          {weeklyCapacity.overloadMinutes
            ? <>已学习与未来计划合计超出周目标 <strong>{weeklyCapacity.overloadMinutes}</strong> 分钟；预计时间不是实际学习，可删减或改期。</>
            : weeklyCapacity.unallocatedMinutes
              ? <>距离周目标还差 <strong>{weeklyCapacity.remainingToTarget}</strong> 分钟，其中 <strong>{weeklyCapacity.unallocatedMinutes}</strong> 分钟尚未进入计划。</>
              : <>剩余目标已被当前计划覆盖；实际完成仍以学习记录为准。</>}
        </p>
        {weeklyCapacity.overdueOpenMinutes ? (
          <p className="homeCapacityOverdue">
            另有本周较早日期的未完成任务约 {weeklyCapacity.overdueOpenMinutes} 分钟，未计入未来容量。
          </p>
        ) : null}
        {weeklyCapacity.unallocatedMinutes ? (
          <details className="homeCapacityDraft">
            <summary>查看剩余容量草案</summary>
            <p>按今天至周日的当前负载均衡分配；这是只读草案，不会自动创建或移动任务。</p>
            <div>
              {weeklyCapacity.days.filter((day) => day.suggestedMinutes > 0).map((day) => (
                <Link href={`/day/${day.day}#day-tasks`} key={day.day}>
                  <span>{weekdayLabel(day.day)} · {day.day.slice(5)}</span>
                  <strong>建议预留 {day.suggestedMinutes} 分钟</strong>
                  <small>现有 {day.studiedMinutes + day.plannedMinutes} 分钟</small>
                </Link>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <div className="homeContentGrid">
        <section aria-label="今日未完成任务" className="card homeTasksCard">
          <div className="sectionTitle">
            <div><span className="sectionKicker">NEXT UP</span><h2>接下来要做</h2></div>
            <Link className="sectionLink" href={`/day/${today}#day-tasks`}>去处理</Link>
          </div>
          <div className="list">
            {tasks.map((task) => (
              <Link className="listRow" href={`/day/${today}#day-tasks`} key={task.id}>
                <small className="homeTaskTime">{task.scheduled_start ?? "待排"}</small>
                <span className={`homeTaskPriority priority${task.priority}`}>P{task.priority}</span>
                {task.subject_code ? <span className="rowBadge">{task.subject_code}</span> : null}
                <strong>{task.title}</strong>
                <small>{task.estimated_minutes}m</small>
                <ArrowRight size={14} />
              </Link>
            ))}
            {!tasks.length && snapshot.openTasks === 0 ? (
              snapshot.doneTasks ? (
                <EmptyState seal="毕" text="今天的任务全部完成了，做得很好。" />
              ) : (
                <EmptyState
                  action={{ href: `/day/${today}#day-tasks`, label: "写下第一条" }}
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

        <section aria-label="科目风险和进度" className="card homeSubjectsCard">
          <div className="sectionTitle">
            <div><span className="sectionKicker">FOCUS</span><h2>需要关注</h2></div>
            <Link className="sectionLink" href="/subjects">全部科目</Link>
          </div>
          <div className="subjectProgressList">
            {focusSubjects.map((subject) => {
              const progress = subject.pointCount ? Math.round((subject.masteredCount / subject.pointCount) * 100) : 0;
              return (
                <Link className="subjectProgressRow" href={`/subjects/${subject.code}`} key={subject.code}>
                  <b>{subject.code}</b>
                  <strong>{subject.name}</strong>
                  <div className="progressTrack"><span style={{ transform: `scaleX(${progress / 100})` }} /></div>
                  <small>{subject.masteredCount}/{subject.pointCount}</small>
                  {subject.dueCount || subject.openMistakes ? <em className="flag due">{subject.dueCount} 复习 · {subject.openMistakes} 错题</em> : <em className="flag subtle">{TRACK_NAMES[subject.track]}</em>}
                </Link>
              );
            })}
          </div>
          {weakPoints.length ? (
            <div className="homeWeakList">
              <span className="homeWeakKicker">弱点 TOP {weakPoints.length}</span>
              {weakPoints.map((point) => (
                <Link className="homeWeakRow" href={`/subjects/${point.subjectCode}`} key={point.id}>
                  <strong>{point.title}</strong>
                  <i>{point.tierName}{point.reasons[0] ? ` · ${point.reasons[0]}` : ""}</i>
                  <small>{point.recentFailures ? "近期回忆失败" : point.openMistakes ? "仍有开放错题" : "系统建议巩固"}</small>
                </Link>
              ))}
              {!disabledModules.has("mistakes") ? (
                <div className="homeWeakFoot">
                  <Link className="sectionLink" href="/mistakes">去回炉 →</Link>
                </div>
              ) : null}
            </div>
          ) : null}
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

function weekdayLabel(day: string): string {
  const labels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return labels[new Date(`${day}T00:00:00.000Z`).getUTCDay()];
}
