import { OnboardingWizard } from "@/components/OnboardingWizard";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getSubjects } from "@/lib/repo/knowledge";
import { getSettings } from "@/lib/repo/settings";
import styles from "./Onboarding.module.css";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const access = await requirePageWorkspace("/onboarding");
  const db = getDb();
  const settings = getSettings(db, access);
  const subjects = getSubjects(db, access);

  return (
    <main className={styles.page}>
      <OnboardingWizard initial={settings} subjects={subjects} />
    </main>
  );
}
