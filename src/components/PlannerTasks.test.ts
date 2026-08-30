import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(new URL("./PlannerTasks.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/actions/planner-tasks.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/tasks/page.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("./planner/PlannerTasksWorkspace.tsx", import.meta.url), "utf8");
const quickCapture = readFileSync(new URL("./planner/PlannerQuickCapture.tsx", import.meta.url), "utf8");
const taskRow = readFileSync(new URL("./planner/PlannerTaskRow.tsx", import.meta.url), "utf8");
const batchBar = readFileSync(new URL("./planner/PlannerBatchBar.tsx", import.meta.url), "utf8");
const taskSheet = readFileSync(new URL("./planner/PlannerTaskSheet.tsx", import.meta.url), "utf8");
const inspector = readFileSync(new URL("./planner/PlannerTaskInspector.tsx", import.meta.url), "utf8");
const taskStyles = readFileSync(new URL("../styles/planner/tasks.module.css", import.meta.url), "utf8");
const taskBasics = readFileSync(new URL("./planner/PlannerTaskBasics.tsx", import.meta.url), "utf8");
const taskSchedule = readFileSync(new URL("./planner/PlannerTaskSchedule.tsx", import.meta.url), "utf8");
const plannerFields = readFileSync(new URL("./planner/PlannerFormFields.tsx", import.meta.url), "utf8");
const recurrence = readFileSync(new URL("./planner/PlannerTaskRecurrence.tsx", import.meta.url), "utf8");
const reminders = readFileSync(new URL("./planner/PlannerTaskReminders.tsx", import.meta.url), "utf8");

describe("Planner Tasks Phase 2 surface", () => {
  it("uses optimistic add, completion, delete, and restore with rollback branches", () => {
    expect(workspace).toContain("useOptimistic");
    expect(workspace).toContain('type: "add"');
    expect(workspace).toContain('type: "patch"');
    expect(workspace).toContain('type: "remove"');
    expect(workspace).toContain("rollback");
  });

  it("routes every task mutation through authenticated Server Actions and application commands", () => {
    expect(actions).toContain('"use server"');
    expect(actions).toContain("requireWorkspace()");
    expect(actions).toContain("createTask(");
    expect(actions).toContain("updateTask(");
    expect(actions).toContain("deleteTask(");
    expect(actions).toContain("restoreTask(");
    expect(actions).not.toContain("createPlannerTask(");
    expect(actions).not.toContain("softDeletePlannerTask(");
    expect(actions).toContain('revalidatePath("/tasks")');
    expect(actions).toContain('revalidatePath("/day/[date]", "page")');
  });

  it("exposes the tasks route and navigation entry", () => {
    expect(page).toContain('requirePageWorkspace("/tasks")');
    expect(page).toContain("listTaskView(");
    expect(sidebar).toContain('href: "/tasks"');
  });

  it("uses the compatibility entry to compose the split Tasks workspace", () => {
    expect(component).toContain("PlannerTasksWorkspace");
    expect(component.split("\n").length).toBeLessThan(80);
    expect(workspace).toContain("PlannerSidebar");
    expect(workspace).toContain("PlannerQuickCapture");
    expect(workspace).toContain("PlannerTaskGroups");
    expect(workspace).toContain("PlannerTaskInspector");
  });

  it("uses Motion layout semantics for task insertion, completion, deletion, and selection", () => {
    expect(taskRow).toContain('from "motion/react"');
    expect(taskRow).toContain('layout={reduced ? false : "position"}');
    expect(taskRow).toContain("layoutId");
    expect(workspace).toContain("AnimatePresence");
    expect(workspace).toContain('mode="popLayout"');
    expect(workspace).toContain("LayoutGroup");
  });

  it("uses a right Drawer on tablet and a keyboard-aware bottom Sheet on mobile", () => {
    expect(taskSheet).toContain("PlannerDrawer");
    expect(taskSheet).toContain('surface={viewport === "mobile" ? "sheet" : "drawer"}');
    expect(taskSheet).toContain("triggerRef");
    expect(taskSheet).toContain("initialFocus={titleInputRef}");
    expect(taskStyles).toContain("@media (max-width: 1180px)");
    expect(taskStyles).toContain("@media (max-width: 760px)");
    expect(taskStyles).toContain("grid-template-columns: 232px minmax(0, 1fr) 380px");
    expect(workspace).toContain("handleDetailOpenChange");
    expect(workspace).toContain("queueMicrotask");
    expect(workspace).toContain("triggerRef.current.focus({ preventScroll: true })");
  });

  it("supports list keyboard navigation and completion without pointer input", () => {
    expect(taskRow).toContain('"ArrowDown"');
    expect(taskRow).toContain('"ArrowUp"');
    expect(taskRow).toContain('event.key === " "');
    expect(taskRow).toContain("data-planner-task-open");
    expect(quickCapture).toContain('aria-label="添加任务"');
  });

  it("keeps exactly one leading task control in each interaction mode", () => {
    expect(taskRow).toContain("selectionMode ? (");
    expect(taskRow).toContain("className={styles.selectionCheckbox}");
    expect(taskRow).toContain("className={styles.completeButton}");
    expect(taskRow).toContain(") : (\n        <button");
    expect(taskRow).toContain("if (selectionMode) onCheck(!checked);");
    expect(taskRow).toContain("else onToggle();");
    expect(workspace).toContain("setSelectionMode");
    expect(workspace).toContain("selectionMode={selectionMode}");
    expect(workspace).toContain("已选 {checked.size} 项");
  });

  it("keeps Quick Capture to a title and submit action until options are requested", () => {
    expect(quickCapture).toContain('PlannerCollapsible label="设置清单与日期"');
    expect(quickCapture).not.toContain('<select aria-label="任务清单"');
    expect(quickCapture).not.toContain('<input aria-label="到期日期"');
    expect(taskStyles).toMatch(/\.quickCapture input:first-child\s*\{[^}]*border-radius: var\(--radius-sm\);/s);
    expect(taskStyles).toMatch(/\.quickCapture input:first-child\s*\{[^}]*appearance: none;/s);
    expect(taskStyles).toMatch(/\.quickCapture input:first-child\s*\{[^}]*background: transparent;/s);
    expect(taskStyles).toMatch(/\.captureMore\s*\{[^}]*display: block;/s);
  });

  it("serializes Quick Capture without blocking subtask mutations", () => {
    const guard = workspace.indexOf("if (isQuickCapture && (captureSubmissionRef.current || capturePending)) return;");
    const clear = workspace.indexOf('setTitle("")', guard);
    expect(workspace).toContain("const [capturePending, startCaptureTransition] = useTransition()");
    expect(workspace).toContain("captureSubmissionRef.current = true");
    expect(workspace).toContain("if (isQuickCapture) startCaptureTransition(submit)");
    expect(workspace).toContain("else startTransition(submit)");
    expect(workspace).toContain("if (!capturePending) captureSubmissionRef.current = false");
    expect(guard).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(guard);
    expect(quickCapture).toContain("aria-busy={pending}");
    expect(quickCapture).toContain("data-capture-pending");
    expect(quickCapture).toContain("disabled={pending}");
  });

  it("uses Planner form primitives with a single-column inspector and Chinese task state", () => {
    expect(plannerFields).toContain("PlannerField");
    expect(plannerFields).toContain("PlannerSelect");
    expect(plannerFields).toContain("PlannerDateTimeField");
    expect(plannerFields).toContain("PlannerPropertyRow");
    expect(taskBasics).toContain("PlannerSelect");
    expect(taskBasics).toContain("className={styles.taskTitleField}");
    expect(taskBasics).toContain('data-planner-field-variant="underline"');
    expect(taskBasics.match(/data-planner-field-variant=/g)).toHaveLength(1);
    expect(taskBasics).toMatch(/<input(?=[^>]*name="title")(?=[^>]*data-planner-field-variant="underline")[^>]*>/);
    expect(taskSchedule).toContain("PlannerDateTimeField");
    expect(taskStyles).toContain("grid-template-columns: 1fr;");
    expect(taskBasics).toContain(">进行中<");
    expect(workspace).toContain('open: "进行中"');
    expect(workspace).toContain('waiting: "等待"');
    expect(workspace).toContain('completed: "已完成"');
    expect(workspace).toContain('canceled: "已取消"');
    expect(workspace).not.toContain('return `${task.status}');
    expect(taskStyles).toContain("var(--planner-field)");
    expect(taskStyles).toMatch(/\.taskTitleField input\[data-planner-field-variant="underline"\]\s*\{[^}]*border-top-color: transparent;[^}]*border-right-color: transparent;[^}]*border-bottom-color: var\(--planner-field-line\);[^}]*border-left-color: transparent;/s);
    expect(taskStyles).toMatch(/\.taskTitleField input\[data-planner-field-variant="underline"\]:hover\s*\{[^}]*border-top-color: transparent;[^}]*border-right-color: transparent;[^}]*border-bottom-color: var\(--line-strong\);[^}]*border-left-color: transparent;/s);
    expect(taskStyles).toMatch(/\.taskTitleField input\[data-planner-field-variant="underline"\]:focus-visible\s*\{[^}]*border-top-color: transparent;[^}]*border-right-color: transparent;[^}]*border-bottom-color: var\(--accent\);[^}]*border-left-color: transparent;/s);
  });

  it("shows Inspector save only for the current dirty task version and preserves failure retry", () => {
    expect(workspace).toContain("inspectorDirtyKey === selectedTaskKey");
    expect(workspace).toContain("onDirtyChange: () => setInspectorDirtyKey(selectedTaskKey)");
    expect(inspector).toContain("onChange={onDirtyChange}");
    expect(inspector).toContain("{dirty ? <button");
    expect(workspace).toContain('applyOptimistic({ type: "patch", id: selected.id, patch: result.entity })');
    expect(workspace).toContain('applyOptimistic({ type: "patch", id: selected.id, patch: selected })');
  });

  it("keeps the Inspector footer in normal flow without reserved overlap padding", () => {
    const footerRule = taskStyles.match(/\.inspectorFooter\s*\{([^}]*)\}/)?.[1] ?? "";
    const bodyRule = taskStyles.match(/\.inspectorBody\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(footerRule).not.toMatch(/position:\s*(sticky|fixed)/);
    expect(footerRule).not.toContain("bottom:");
    expect(footerRule).not.toContain("z-index:");
    expect(bodyRule).toContain("padding: 14px 16px;");
    expect(bodyRule).not.toContain("88px");
  });

  it("does not keep a nested sticky header over mobile Sheet form fields", () => {
    expect(taskStyles).toMatch(/:global\(\[data-planner-surface="sheet"\]\) \.inspectorHeader\s*\{\s*position: static;/);
  });

  it("consumes the reduced semantic contracts instead of leaving them as dead presets", () => {
    expect(taskRow).toContain("useMotionReduced");
    expect(taskRow).toContain("reduced ? motion.row.reduced : motion.row");
    expect(taskRow).toContain('layout={reduced ? false : "position"}');
    expect(batchBar).toContain("useMotionReduced() ? motion.feedback.reduced : motion.feedback");
  });

  it("keeps common fields open and low-frequency sections summarized", () => {
    expect(inspector).toContain("PlannerTaskBasics");
    expect(inspector).toContain("PlannerTaskSchedule");
    expect(inspector).toContain("PlannerCollapsible");
    expect(inspector).toContain("PlannerTaskLabels");
    expect(inspector).toContain("PlannerTaskReminders");
    expect(inspector).toContain("PlannerTaskRecurrence");
    expect(inspector).toContain("PlannerTaskSubtasks");
    expect(inspector).toContain("PlannerStatusIndicator");
  });

  it("uses the UI-owned shared field entry rather than Tasks CSS for Planner form controls", () => {
    expect(plannerFields).toContain('from "@/components/ui/PlannerFormFields"');
    expect(plannerFields).not.toContain("tasks.module.css");
    expect(taskBasics).toContain('from "@/components/ui/PlannerFormFields"');
    expect(taskSchedule).toContain('from "@/components/ui/PlannerFormFields"');
    expect(recurrence).toContain("PlannerDateTimeField");
  });

  it("renders reminders through shared Chinese enum labels", () => {
    expect(reminders).toContain("plannerReminderAnchorLabel(reminder.anchor)");
    expect(reminders).toContain("plannerReminderChannelLabel(reminder.channel)");
    expect(reminders).toContain("plannerReminderStatusLabel(reminder.status)");
    expect(reminders).not.toContain("{reminder.anchor} ·");
  });
});
