import { CalendarView } from "@/components/CalendarView";
import { requirePageSession } from "@/lib/page-auth";
import { getCalendarSummaries } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  await requirePageSession("/calendar");

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <span className="eyebrow">Calendar</span>
        <h1>日历</h1>
        <p>月视图看状态密度，周/日视图看节奏。点击任意日期进入当天工作台。</p>
      </div>
      <CalendarView summaries={getCalendarSummaries()} />
    </div>
  );
}
