import Link from "next/link";
import { ArrowRight, CalendarDays, Plus, RotateCcw } from "lucide-react";
import { CaptureTrigger } from "@/components/today/CaptureTrigger";
import { TodayTimeline } from "@/components/today/TodayTimeline";
import { getTodayReadModel } from "@/lib/application/today/read-model";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { utcToZonedDateTime } from "@/lib/planner/time";
import styles from "./Today.module.css";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const access = await requirePageWorkspace("/");
  const day = todayKey();
  const model = getTodayReadModel(getDb(), access, {
    day,
    now: new Date().toISOString(),
  });
  const action = model.nextAction;
  const visibleScheduled = model.scheduledItems.slice(0, 6);
  const visibleUnscheduled = model.unscheduledTasks.slice(0, 3);
  const hiddenTimelineCount = Math.max(
    0,
    model.scheduledItems.length + model.unscheduledTasks.length
      - visibleScheduled.length - visibleUnscheduled.length,
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>TODAY</p>
          <h1>今天</h1>
        </div>
        <time dateTime={day}>{formatDay(day)}</time>
      </header>

      <section aria-labelledby="today-now" className={styles.now}>
        <p className={styles.sectionLabel}>NOW</p>
        {action ? (
          <>
            <div className={styles.nowHeading}>
              <span className={styles.actionKind}>{actionKind(action.kind)}</span>
              <h2 id="today-now">{action.title}</h2>
            </div>
            <p className={styles.nowMeta}>{actionMeta(action, model.timeZone, day)}</p>
            <div aria-label="推荐原因" className={styles.reasons}>
              <span>因为</span>
              <ul>
                {action.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
            <Link className={styles.primaryAction} href={action.href}>
              开始
              <ArrowRight aria-hidden size={18} />
            </Link>
          </>
        ) : (
          <>
            <div className={styles.nowHeading}>
              <span className={styles.actionKind}>第一步</span>
              <h2 id="today-now">先放一件 25 分钟内能完成的事</h2>
            </div>
            <p className={styles.nowMeta}>一句话写下结果，不必先整理分类。</p>
            <CaptureTrigger className={styles.primaryAction} intent="task">
              创建第一件事
              <ArrowRight aria-hidden size={18} />
            </CaptureTrigger>
          </>
        )}
      </section>

      <section aria-labelledby="today-timeline" className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionLabel}>TODAY</p>
            <h2 id="today-timeline">今天的执行列表</h2>
          </div>
          <Link className={styles.secondaryLink} href="/calendar">
            <CalendarDays aria-hidden size={16} />
            看日历
          </Link>
        </div>
        <TodayTimeline
          day={day}
          scheduledItems={visibleScheduled}
          unscheduledTasks={visibleUnscheduled}
        />
        {hiddenTimelineCount ? (
          <Link className={styles.moreLink} href="/tasks">还有 {hiddenTimelineCount} 项，在计划中查看</Link>
        ) : null}
      </section>

      <section aria-labelledby="today-review" className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionLabel}>REVIEW</p>
            <h2 id="today-review">今日复习</h2>
          </div>
          <Link className={styles.secondaryLink} href="/review">
            {model.review.dueKnowledgePoints + model.review.dueMistakes ? "进入复习" : "查看复习"}
            <ArrowRight aria-hidden size={16} />
          </Link>
        </div>
        <dl className={styles.reviewSummary}>
          <div><dt>到期知识点</dt><dd>{model.review.dueKnowledgePoints}</dd></div>
          <div><dt>错题复测</dt><dd>{model.review.dueMistakes}</dd></div>
          <div><dt>预计用时</dt><dd>{model.review.estimatedMinutes}<small> 分钟</small></dd></div>
        </dl>
      </section>

      <section aria-labelledby="today-capture" className={`${styles.section} ${styles.capture}`}>
        <div>
          <p className={styles.sectionLabel}>CAPTURE</p>
          <h2 id="today-capture">记录刚刚发生的事</h2>
          <p>任务、学习、错题、笔记或资料，都从同一个入口开始。</p>
        </div>
        <CaptureTrigger className={styles.captureButton}>
          <Plus aria-hidden size={18} />
          记录
        </CaptureTrigger>
      </section>

      <Link className={styles.archiveLink} href={`/day/${day}`}>
        <RotateCcw aria-hidden size={15} />
        补录与日终复盘
      </Link>
    </div>
  );
}

function actionKind(kind: "task" | "review" | "mistake_retest"): string {
  if (kind === "task") return "任务";
  if (kind === "mistake_retest") return "错题复测";
  return "知识复习";
}

function actionMeta(
  action: NonNullable<ReturnType<typeof getTodayReadModel>["nextAction"]>,
  timeZone: string,
  day: string,
): string {
  const parts = [`预计 ${action.estimatedMinutes} 分钟`];
  if (action.kind === "task" && action.scheduledStartAt) {
    parts.push(utcToZonedDateTime(action.scheduledStartAt, timeZone).time.slice(0, 5));
  } else if (action.kind === "task" && action.dueDay) {
    parts.push(action.dueDay === day ? "今天到期" : `${action.dueDay} 到期`);
  } else if (action.kind !== "task") {
    parts.push(action.dueDay === day ? "今天到期" : `已于 ${action.dueDay} 到期`);
  }
  return parts.join(" · ");
}

function formatDay(day: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00.000Z`));
}
