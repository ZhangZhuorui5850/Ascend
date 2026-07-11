import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { requireAccessContext } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const access = await requireAccessContext();
  if (!access.mustChangePassword) redirect(access.role === "admin" ? "/admin" : "/");
  return (
    <main className="loginShell">
      <section className="loginHero"><div><span className="brandMark">登</span><h2>保护你的账号</h2><p>正式密码不会写入日志，也不会向管理员展示。</p></div></section>
      <ChangePasswordForm />
    </main>
  );
}
