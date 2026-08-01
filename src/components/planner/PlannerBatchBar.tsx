"use client";

import { Check, Trash2 } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import type { TaskList } from "@/lib/planner/types";
import { motion } from "@/lib/motion/contracts";
import { useMotionReduced } from "@/components/ui/MotionProvider";
import styles from "@/styles/planner/tasks.module.css";

export function PlannerBatchBar({
  count,
  lists,
  onComplete,
  onDelete,
  onMove,
}: {
  count: number;
  lists: TaskList[];
  onComplete: () => void;
  onDelete: () => void;
  onMove: (listId: string) => void;
}) {
  const contract = useMotionReduced() ? motion.feedback.reduced : motion.feedback;

  return (
    <AnimatePresence initial={false}>
      {count ? (
        <m.div
          animate={contract.animate}
          className={styles.batchBar}
          exit={contract.exit}
          initial={contract.enter}
        >
          <strong>已选 {count} 项</strong>
          <div className={styles.batchActions}>
            <button onClick={onComplete} type="button"><Check size={15} />完成</button>
            <select aria-label="批量移动到清单" onChange={(event) => event.target.value && onMove(event.target.value)} value="">
              <option value="">移动到…</option>
              {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
            </select>
            <button onClick={onDelete} type="button"><Trash2 size={15} />删除</button>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
