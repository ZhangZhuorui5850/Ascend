import { notFound } from "next/navigation";
import { AlgorithmTrainingBoardV2 } from "@/components/AlgorithmTrainingBoardV2";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getJudgeRuntimeAvailability } from "@/lib/judge-runtime";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getAlgorithmDashboard } from "@/lib/repo/algorithms";
import { listAlgorithmDevices } from "@/lib/repo/algorithm-devices";
import { getAlgorithmTrainingRelations } from "@/lib/repo/algorithm-training";
import { requirePluginEnabled } from "@/lib/repo/plugins";

export const dynamic = "force-dynamic";

export default async function AlgorithmTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string | string[] }>;
}) {
  const access = await requirePageWorkspace("/practice/algorithms");
  const db = getDb();
  try {
    requirePluginEnabled(db, access, "algorithms");
  } catch {
    notFound();
  }
  const today = todayKey();
  const dashboard = getAlgorithmDashboard(db, access, today);
  const relations = getAlgorithmTrainingRelations(db, access);
  const devices = listAlgorithmDevices(db, access);
  const judgeAvailability = getJudgeRuntimeAvailability(db, access);
  const query = await searchParams;
  const initialProblemId = parsePositiveId(query.problem);

  return (
    <div className="pageStack algorithmPage">
      <header className="pageHeader algorithmPageHeader">
        <div>
          <span className="eyebrow">ALGORITHM PRACTICE · 算法训练</span>
          <h1>按计划练题，按节奏复习</h1>
          <p>题目、CPP、课程阶段和训练进度集中在一个工作区。</p>
        </div>
      </header>
      <AlgorithmTrainingBoardV2
        dashboard={dashboard}
        devices={devices}
        initialProblemId={initialProblemId}
        judgeAvailability={judgeAvailability}
        relations={relations}
        today={today}
      />
    </div>
  );
}

function parsePositiveId(value: string | string[] | undefined): number | null {
  if (typeof value !== "string" || !/^\d{1,12}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
