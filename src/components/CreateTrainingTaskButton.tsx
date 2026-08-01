"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell, Plus } from "lucide-react";
import { addTaskAction } from "@/app/actions/planner";
import { useFeedback } from "@/components/FeedbackProvider";

export function CreateTrainingTaskButton({
  day,
  title,
  subjectCode,
  notes,
  knowledgePointId,
  activityType = "practice",
  completionCriteria,
  sourceType,
  sourceId,
  verificationMethod,
  label = "加入训练",
  compact = false,
}: {
  day: string;
  title: string;
  subjectCode?: string | null;
  notes?: string;
  knowledgePointId?: string | null;
  activityType?: "study" | "practice" | "recall" | "review" | "mock" | "mixed";
  completionCriteria?: string;
  sourceType?: string;
  sourceId?: string | number;
  verificationMethod?: string;
  label?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [busy, setBusy] = useState(false);

  async function create() {
    if (busy) return;
    setBusy(true);
    const result = await addTaskAction({
      day,
      title,
      subjectCode: subjectCode || "",
      priority: 1,
      estimatedMinutes: 45,
      notes: notes || "由学习诊断生成，完成后回到原页面检查掌握变化。",
      knowledgePointId,
      activityType,
      completionCriteria: completionCriteria || "完成训练范围，并记录产出与验证结果。",
      sourceType,
      sourceId,
      verificationMethod,
    });
    setBusy(false);
    if (!result.ok) {
      notify(result.error || "训练任务创建失败", "error");
      return;
    }
    notify("训练任务已加入今日计划", "success");
    router.refresh();
  }

  return <button className={compact ? "trainingTaskButton compact" : "trainingTaskButton"} disabled={busy} onClick={() => void create()} type="button">
    {compact ? <Plus size={13} /> : <Dumbbell size={14} />}
    <span>{busy ? "加入中" : label}</span>
  </button>;
}
