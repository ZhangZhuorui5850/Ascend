"use client";

import type { PlannerTask } from "@/lib/planner/types";
import { PlannerTaskList } from "@/components/planner/PlannerTaskList";
import styles from "@/styles/planner/tasks.module.css";

export function PlannerTaskGroups({
  checked,
  groups,
  onCheck,
  onOpen,
  onNavigate,
  onRemove,
  onRestore,
  onToggle,
  selectedId,
  selectionMode,
  taskMeta,
  trash,
}: {
  checked: Set<string>;
  groups: Array<[string, PlannerTask[]]>;
  onCheck: (taskId: string, checked: boolean) => void;
  onOpen: (taskId: string, trigger: HTMLButtonElement) => void;
  onNavigate: (taskId: string, direction: -1 | 1) => void;
  onRemove: (task: PlannerTask) => void;
  onRestore: (task: PlannerTask) => void;
  onToggle: (task: PlannerTask) => void;
  selectedId: string | null;
  selectionMode: boolean;
  taskMeta: (task: PlannerTask) => string;
  trash: boolean;
}) {
  return (
    <div className={styles.groups}>
      {groups.map(([group, tasks]) => (
        <section key={group}>
          <h2 className={styles.groupHeader}>{group}<span>{tasks.length}</span></h2>
          <PlannerTaskList
            checked={checked}
            onCheck={onCheck}
            onOpen={onOpen}
            onNavigate={onNavigate}
            onRemove={onRemove}
            onRestore={onRestore}
            onToggle={onToggle}
            selectedId={selectedId}
            selectionMode={selectionMode}
            taskMeta={taskMeta}
            tasks={tasks}
            trash={trash}
          />
        </section>
      ))}
      {groups.length === 0 ? <p className={styles.empty}>这个视图当前为空。</p> : null}
    </div>
  );
}
