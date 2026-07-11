import { InviteActivationForm } from "@/components/admin/InviteActivationForm";
import { getDb } from "@/lib/db";
import { getInvitationState } from "@/lib/repo/admin";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = getInvitationState(getDb(), token);
  return (
    <main className="loginShell inviteShell">
      <section className="loginHero">
        <div><span className="brandMark">登</span><h2>欢迎加入登峰</h2><p>你的学习计划、资料、错题和统计会存放在完全独立的个人空间。</p></div>
      </section>
      {invitation.valid ? (
        <InviteActivationForm token={token} displayName={invitation.displayName || "新用户"} email={invitation.email || ""} />
      ) : (
        <section className="loginCard"><h1>链接不可用</h1><p>{invitation.reason}</p><p>请联系管理员重新创建邀请。</p></section>
      )}
    </main>
  );
}
