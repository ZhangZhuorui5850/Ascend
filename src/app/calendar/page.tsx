import { CalendarView } from "@/components/CalendarView";
import { getDb } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";
import { getCalendarSummaries } from "@/lib/repo/stats";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  await requirePageSession("/calendar");

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h1>日历</h1>
        <p>看每天的学习密度，点任意日期进入当天工作台。</p>
      </div>
      <CalendarView summaries={getCalendarSummaries(getDb())} />
    </div>
  );
}
