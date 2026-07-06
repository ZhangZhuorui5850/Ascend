import { readFileSync } from "node:fs";
import path from "node:path";
import { getSourceRoot } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function PlanPage() {
  const planPath = path.join(getSourceRoot(), "agent沟通", "02_十周做题驱动备考计划.md");
  const plan = readFileSync(planPath, "utf8").slice(0, 12000);
  return (
    <div className="pageStack">
      <div className="pageHeader"><span className="eyebrow">Plan</span><h1>十周计划</h1><p>读取当前 `zgca/agent沟通/02_十周做题驱动备考计划.md`。</p></div>
      <article className="card markdownBlock">
        <pre>{plan}</pre>
      </article>
    </div>
  );
}
