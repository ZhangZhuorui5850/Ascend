import { TasksTrail } from "@/components/redesign/TasksTrail";
import { tasksWorkspace } from "@/components/redesign/mock-data";
import styles from "@/styles/redesign/tasks.module.css";

export default function RedesignTasksPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.kicker}>TASKS · 待办</span>
        <h1>今天 · 待办清单</h1>
      </header>
      <TasksTrail initialTasks={tasksWorkspace} />
    </div>
  );
}
