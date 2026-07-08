import { getSourceRoot } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";
import { readPlanDocument } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  await requirePageSession("/plan");

  const plan = readPlanDocument(getSourceRoot());
  return (
    <div className="pageStack">
      <div className="pageHeader">
        <span className="eyebrow">Plan</span>
        <h1>十周计划</h1>
        <p>读取当前计划源文件；缺文件时显示空状态，不触发页面级错误。</p>
      </div>
      {plan.exists ? (
        <article className="card markdownBlock">
          <pre>{plan.content}</pre>
        </article>
      ) : (
        <article className="card emptyState">
          <h2>计划文件未找到</h2>
          <p>当前查找路径：{plan.path}</p>
          <p>把计划 Markdown 放回该路径后刷新本页即可读取。</p>
        </article>
      )}
    </div>
  );
}
