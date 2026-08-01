import { PlannerTasks } from "@/components/PlannerTasks";
import { dateKeyInTimeZone } from "@/lib/planner/time";
import type { PlannerTaskView } from "@/lib/repo/planner-tasks";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { listPlannerLabels, listPlannerTaskLabelIds } from "@/lib/repo/planner-labels";
import { listTaskLists } from "@/lib/repo/planner-lists";
import { listTaskView } from "@/lib/repo/planner-tasks";
import { listWorkspaceReminders } from "@/lib/repo/planner-reminders";

export const dynamic = "force-dynamic";

const VIEWS = new Set<PlannerTaskView>([
  "inbox",
  "today",
  "upcoming",
  "anytime",
  "overdue",
  "waiting",
  "completed",
  "trash",
  "all",
]);

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; list?: string }>;
}) {
  const access = await requirePageWorkspace("/tasks");
  const db = getDb();
  const query = await searchParams;
  const view = VIEWS.has(query.view as PlannerTaskView)
    ? query.view as PlannerTaskView
    : "inbox";
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?")
    .get(access.workspaceId) as { timezone: string };
  const today = dateKeyInTimeZone(new Date(), workspace.timezone);
  const lists = listTaskLists(db, access);
  const listId = query.list && lists.some((list) => list.id === query.list) ? query.list : undefined;
  const tasks = listTaskView(db, access, {
    view,
    today,
    listId,
    limit: 500,
  });

  return (
    <div className="pageStack plannerTasksPage">
      <header className="pageHeader">
        <span className="eyebrow">PLANNER · 任务</span>
        <h1>待办系统</h1>
        <p>从 Inbox 收集任务，分离到期与排期，在执行、完成和复盘之间保持清晰轨迹。</p>
      </header>
      <PlannerTasks
        initialReminders={listWorkspaceReminders(db, access)}
        initialTaskLabelIds={listPlannerTaskLabelIds(db, access)}
        initialTasks={tasks}
        labels={listPlannerLabels(db, access)}
        lists={lists}
        timeZone={workspace.timezone}
        view={view}
      />
    </div>
  );
}
