import { KineticTasks } from "@/components/kinetic/KineticTasks";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { dateKeyInTimeZone } from "@/lib/planner/time";
import { ensurePlannerDefaults } from "@/lib/repo/planner-defaults";
import { listTaskLists } from "@/lib/repo/planner-lists";
import { listPlannerTasks, type PlannerTaskView } from "@/lib/repo/planner-tasks";

export const dynamic = "force-dynamic";

const VIEWS = new Set<PlannerTaskView>([
  "inbox", "today", "upcoming", "anytime", "overdue", "waiting", "completed", "trash", "all",
]);

export default async function KineticTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; list?: string }>;
}) {
  const access = await requirePageWorkspace("/kinetic/tasks");
  const db = getDb();
  ensurePlannerDefaults(db, access);
  const query = await searchParams;
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?")
    .get(access.workspaceId) as { timezone: string };
  const lists = listTaskLists(db, access);
  const initialView = VIEWS.has(query.view as PlannerTaskView)
    ? query.view as PlannerTaskView
    : "inbox";
  const initialListId = query.list && lists.some((list) => list.id === query.list)
    ? query.list
    : null;

  return (
    <KineticTasks
      initialListId={initialListId}
      initialTasks={listPlannerTasks(db, access, { includeDeleted: true })}
      initialView={initialView}
      lists={lists}
      timeZone={workspace.timezone}
      today={dateKeyInTimeZone(new Date(), workspace.timezone)}
    />
  );
}
