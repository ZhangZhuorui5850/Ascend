import { AccountSection } from "@/components/AccountSection";
import { AppearanceSection } from "@/components/AppearanceSection";
import { DeviceSessions } from "@/components/DeviceSessions";
import { SettingsForm } from "@/components/SettingsForm";
import { listUserSessions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getUserProfile } from "@/lib/repo/profile";
import { getSettings } from "@/lib/repo/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const access = await requirePageWorkspace("/settings");

  const db = getDb();
  const settings = getSettings(db, access);
  const sessions = listUserSessions(access.userId, db);
  const profile = getUserProfile(db, access.userId)!;

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h1>设置</h1>
        <p>账户资料、学习偏好与外观主题，都在这里调整。</p>
      </div>

      <nav aria-label="设置分类" className="settingsTabs">
        <a href="#account">账户</a>
        <a href="#study">学习</a>
        <a href="#appearance">外观</a>
      </nav>

      <section aria-label="账户设置" className="settingsGroup" id="account">
        <h2 className="settingsGroupTitle">账户</h2>
        <AccountSection
          email={profile.email}
          profile={{
            userId: profile.userId,
            displayName: profile.displayName,
            avatarKind: profile.avatarKind,
            avatarChar: profile.avatarChar,
            avatarColor: profile.avatarColor,
            avatarVersion: profile.updatedAt,
          }}
        />
        <DeviceSessions sessions={sessions} />
      </section>

      <section aria-label="学习设置" className="settingsGroup" id="study">
        <h2 className="settingsGroupTitle">学习</h2>
        <SettingsForm initial={settings} />
      </section>

      <section aria-label="外观设置" className="settingsGroup" id="appearance">
        <h2 className="settingsGroupTitle">外观</h2>
        <AppearanceSection />
      </section>
    </div>
  );
}
