import { Fingerprint, KeyRound, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import styles from "@/components/kinetic/KineticEntry.module.css";
import { requireAccessContext } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export default async function KineticChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const access = await requireAccessContext();
  if (!access.mustChangePassword) redirect(access.role === "admin" ? "/admin" : "/kinetic");
  const resolved = await searchParams;
  const nextPath = typeof resolved.next === "string" && resolved.next.startsWith("/kinetic")
    ? resolved.next
    : "/kinetic";

  return (
    <main className={`${styles.entry} ${styles.securityEntry}`}>
      <section className={styles.fieldStory}>
        <header><span className={styles.mark}><i /><i /><i /></span><strong>ASCEND</strong><small>IDENTITY GATE</small></header>
        <div className={styles.storyCopy}>
          <span><ShieldCheck size={14} /> REQUIRED SECURITY ROTATION</span>
          <h1>先固定身份，<br />再进入<em>研究场。</em></h1>
          <p>正式密码只用于验证身份，不向管理员展示，也不会写入操作日志。</p>
        </div>
        <div aria-hidden="true" className={styles.securityCore}><i /><i /><span><Fingerprint size={54} /></span></div>
        <footer><span><i /> ENCRYPTED SESSION</span><span>其他旧会话将失效</span></footer>
      </section>
      <section className={styles.formStage}>
        <div className={styles.formSignal}><span>IDENTITY ROTATION / 02</span><KeyRound size={18} /></div>
        <ChangePasswordForm nextPath={nextPath} />
      </section>
    </main>
  );
}
