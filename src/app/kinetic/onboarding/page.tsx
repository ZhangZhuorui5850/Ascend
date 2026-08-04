import { ArrowDownRight, Compass, Gauge, Orbit, Sparkles } from "lucide-react";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import styles from "@/components/kinetic/KineticEntry.module.css";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getSubjects } from "@/lib/repo/knowledge";
import { getSettings } from "@/lib/repo/settings";

export const dynamic = "force-dynamic";

export default async function KineticOnboardingPage() {
  const access = await requirePageWorkspace("/kinetic/onboarding");
  const db = getDb();
  const settings = getSettings(db, access);
  const subjects = getSubjects(db, access);

  return (
    <div className={styles.onboardingField}>
      <header className={styles.onboardingHero}>
        <div>
          <span><Compass size={14} /> FIELD CALIBRATION · 场域校准</span>
          <h1>先定义方向，<br />系统才知道如何<em>助推。</em></h1>
          <p>四步建立目标、主线科目、时间预算与复习容量。所有值都能稍后在控制中枢调整。</p>
          <div><span><Orbit size={14} /> 目标坐标</span><span><Gauge size={14} /> 可持续节奏</span><span><Sparkles size={14} /> 证据反馈</span></div>
        </div>
        <ArrowDownRight size={36} />
      </header>
      <section className={styles.wizardSurface}>
        <OnboardingWizard destination="/kinetic" initial={settings} subjects={subjects} />
      </section>
    </div>
  );
}
