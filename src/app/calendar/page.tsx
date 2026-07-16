import { CalendarView } from "@/components/CalendarView";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { listCalendarTasks } from "@/lib/repo/planner";
import { getSettings } from "@/lib/repo/settings";
import { getCalendarSummaries } from "@/lib/repo/stats";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const access = await requirePageWorkspace("/calendar");
  const db = getDb();

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <span className="eyebrow">LEARNING RHYTHM · 学习节奏</span>
        <h1>学习日历</h1>
        <p>把目标拆到具体时间。拖动任务可以改期，周视图中拉伸任务可以调整时间预算。</p>
      </div>
      <CalendarView
        exams={getSettings(db, access).examCountdowns}
        summaries={getCalendarSummaries(db, access)}
        tasks={listCalendarTasks(db, access)}
      />
    </div>
  );
}
