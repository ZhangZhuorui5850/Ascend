import { notFound } from "next/navigation";
import { AlgorithmTrainingBoard } from "@/components/AlgorithmTrainingBoard";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getJudgeRuntimeAvailability } from "@/lib/judge-runtime";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getAlgorithmDashboard } from "@/lib/repo/algorithms";
import { requirePluginEnabled } from "@/lib/repo/plugins";

export const dynamic = "force-dynamic";

export default async function AlgorithmTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string | string[]; task?: string | string[] }>;
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
  const judgeAvailability = getJudgeRuntimeAvailability(db, access);
  const query = await searchParams;
  const initialProblemId = parsePositiveId(query.problem);
  const initialTaskId = parsePositiveId(query.task);

  return (
    <div className="pageStack algorithmPage">
      <header className="pageHeader algorithmPageHeader">
        <div>
          <span className="eyebrow">ALGORITHM PRACTICE · 算法训练</span>
          <h1>独立作答，留下可复测的证据</h1>
          <p>连接正式题目，区分引导完成、独立完成、延迟稳定和未见变式迁移。</p>
        </div>
        <span className="algorithmJudgeState" data-ready={judgeAvailability.submissionAllowed}>
          <ShieldAlertIcon />{judgeAvailability.submissionAllowed
            ? "在线评测可用"
            : judgeAvailability.configured
              ? "在线评测待批准"
              : "Judge 尚未配置"}
        </span>
      </header>
      <AlgorithmTrainingBoard
        dashboard={dashboard}
        initialProblemId={initialProblemId}
        initialTaskId={initialTaskId}
        judgeAvailability={judgeAvailability}
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

function ShieldAlertIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}
