import Link from "next/link";
import { Suspense } from "react";
import { AlgorithmTrainingBoardV2 } from "@/components/AlgorithmTrainingBoardV2";
import { EmptyState } from "@/components/EmptyState";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getJudgeRuntimeAvailability } from "@/lib/judge-runtime";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getAlgorithmDashboard } from "@/lib/repo/algorithms";
import { listAlgorithmDevices } from "@/lib/repo/algorithm-devices";
import { getAlgorithmTrainingRelations } from "@/lib/repo/algorithm-training";
import { requirePluginEnabled } from "@/lib/repo/plugins";

export const dynamic = "force-dynamic";

export default async function AlgorithmTrainingPage() {
  const access = await requirePageWorkspace("/practice/algorithms");
  const db = getDb();
  try {
    requirePluginEnabled(db, access, "algorithms");
  } catch {
    // 插件未启用时给出可操作的引导，而不是脱离应用壳的 404。
    return (
      <div className="pageStack algorithmPage">
        <header className="pageHeader algorithmPageHeader">
          <div>
            <span className="eyebrow">ALGORITHM PRACTICE · 算法训练</span>
            <h1>算法训练</h1>
          </div>
        </header>
        <EmptyState
          action={{ href: "/extensions", label: "前往扩展中心启用" }}
          seal="算法"
          text="算法训练插件还没有启用。启用后即可使用课程章节、题库、训练计划与 VS Code 同步。"
        />
        <p style={{ textAlign: "center", color: "var(--quiet)", fontSize: "13px" }}>
          不确定是否需要？可以<Link href="/extensions">先看看插件说明</Link>。
        </p>
      </div>
    );
  }
  const today = todayKey();
  const dashboard = getAlgorithmDashboard(db, access, today);
  const relations = getAlgorithmTrainingRelations(db, access);
  const devices = listAlgorithmDevices(db, access);
  const judgeAvailability = getJudgeRuntimeAvailability(db, access);

  return (
    <div className="pageStack algorithmPage">
      <header className="pageHeader algorithmPageHeader">
        <div>
          <span className="eyebrow">ALGORITHM PRACTICE · 算法训练</span>
          <h1>按计划练题，按节奏复习</h1>
          <p>课程章节、题目、CPP 和训练进度集中在一个工作区。</p>
        </div>
      </header>
      <Suspense fallback={<div aria-label="正在加载" className="pageStack pageSkeleton" role="status"><div className="skeletonLine wide" /><div className="skeletonHero" /><div className="skeletonGrid"><div /><div /><div /></div></div>}>
        <AlgorithmTrainingBoardV2
          dashboard={dashboard}
          devices={devices}
          judgeAvailability={judgeAvailability}
          relations={relations}
          today={today}
        />
      </Suspense>
    </div>
  );
}

