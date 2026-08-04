import { Activity, ArrowUpRight, BrainCircuit, Orbit, RadioTower, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import styles from "@/components/kinetic/KineticEntry.module.css";
import { getDb } from "@/lib/db";
import { optionalSession } from "@/lib/request-auth";
import { workspaceNeedsOnboarding } from "@/lib/repo/workspaces";

export const dynamic = "force-dynamic";

export default async function KineticLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const resolved = await searchParams;
  const nextPath = typeof resolved.next === "string" && resolved.next.startsWith("/kinetic")
    ? resolved.next
    : "/kinetic";
  const context = await optionalSession();
  if (context?.role === "admin") redirect("/admin");
  if (context?.mustChangePassword) redirect(`/kinetic/change-password?next=${encodeURIComponent(nextPath)}`);
  if (context?.workspaceId) {
    if (workspaceNeedsOnboarding(getDb(), { workspaceId: context.workspaceId })) redirect("/kinetic/onboarding");
    redirect(nextPath);
  }

  return (
    <main className={styles.entry}>
      <section className={styles.fieldStory}>
        <header><span className={styles.mark}><i /><i /><i /></span><strong>ASCEND</strong><small>KINETIC FIELD</small></header>
        <div className={styles.storyCopy}>
          <span><Activity size={14} /> RESEARCH MOMENTUM SYSTEM</span>
          <h1>把复杂研究，<br />变成持续<em>动量。</em></h1>
          <p>任务、数学、算法、实验、证据与复盘，不再散落在工具之间。</p>
        </div>
        <div aria-hidden="true" className={styles.entryOrbit}>
          <i /><i /><i /><span><BrainCircuit size={34} /></span>
          <b><Orbit size={14} /></b><b><RadioTower size={14} /></b><b><Sparkles size={14} /></b>
        </div>
        <footer><span><i /> PRIVATE WORKSPACE</span><span>理解 → 提取 → 反馈 → 迁移</span></footer>
      </section>
      <section className={styles.formStage}>
        <div className={styles.formSignal}><span>SECURE ENTRY / 01</span><ArrowUpRight size={18} /></div>
        <LoginForm nextPath={nextPath} />
        <p className={styles.entryHint}>你的数据保留在私有工作空间；登录状态可随时从控制中枢撤销。</p>
      </section>
    </main>
  );
}
