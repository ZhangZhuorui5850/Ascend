import { SettingsForm } from "@/components/SettingsForm";
import { getDb } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";
import { getSettings } from "@/lib/repo/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePageSession("/settings");

  const settings = getSettings(getDb());

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h1>设置</h1>
        <p>考试倒计时会显示在主页；每日复习上限控制今日队列一次安排多少个知识点。</p>
      </div>
      <SettingsForm initial={settings} />
    </div>
  );
}
