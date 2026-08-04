import type { Metadata } from "next";
import { KineticShell } from "@/components/kinetic/KineticShell";
import { MotionProvider } from "@/components/ui/MotionProvider";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { optionalSession } from "@/lib/request-auth";
import { listEnabledPluginIds } from "@/lib/repo/plugins";
import { getCaptureHierarchy } from "@/lib/repo/knowledge";
import { getSettings } from "@/lib/repo/settings";
import { getHomeSnapshot, getWeeklyCapacity } from "@/lib/repo/stats";
import { workspaceNeedsOnboarding } from "@/lib/repo/workspaces";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Kinetic Field · 登峰", template: "%s · Kinetic Field" },
  description: "Ascend 的 Kinetic Field 并行产品界面。",
};

export default async function KineticLayout({ children }: { children: React.ReactNode }) {
  const context = await optionalSession();
  if (
    !context
    || context.role !== "user"
    || !context.workspaceId
    || context.mustChangePassword
    || workspaceNeedsOnboarding(getDb(), { workspaceId: context.workspaceId })
  ) {
    return <MotionProvider>{children}</MotionProvider>;
  }

  const access = { workspaceId: context.workspaceId };
  const db = getDb();
  const today = todayKey();
  const settings = getSettings(db, access);
  const snapshot = getHomeSnapshot(db, access, today);
  const capacity = getWeeklyCapacity(db, access, { today, targetMinutes: settings.weeklyMinutes });

  return (
    <MotionProvider>
      <KineticShell
        displayName={context.displayName}
        enabledPluginIds={listEnabledPluginIds(db, access)}
        hierarchy={getCaptureHierarchy(db, access)}
        modulePrefs={settings.modulePrefs}
        signal={{
          pending: snapshot.dueReviews + snapshot.dueMistakes,
          streak: snapshot.streak,
          weeklyPercent: capacity.completionPercent,
        }}
        today={today}
        workspaceKey={access.workspaceId}
      >
        {children}
      </KineticShell>
    </MotionProvider>
  );
}
