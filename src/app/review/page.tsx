import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { ReviewQueue } from "@/components/ReviewQueue";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getDay } from "@/lib/repo/days";
import { getSubjects } from "@/lib/repo/knowledge";
import { getSettings } from "@/lib/repo/settings";
import styles from "./Review.module.css";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ point?: string; mistake?: string }>;
}) {
  const access = await requirePageWorkspace("/review");
  const query = await searchParams;
  const db = getDb();
  const day = todayKey();
  const settings = getSettings(db, access);
  const enabledSubjectCodes = settings.enabledSubjectCodes.length
    ? settings.enabledSubjectCodes
    : getSubjects(db, access).map((subject) => subject.code);
  const sprintSubjectCodes = [...new Set(settings.examCountdowns.flatMap((exam) => {
    const days = dayDistance(day, exam.date);
    if (days < 0 || days > 14) return [];
    return exam.subjectCode ? [exam.subjectCode] : enabledSubjectCodes;
  }))];
  const current = getDay(db, access, day, {
    reviewLimit: settings.dailyReviewLimit,
    sprintSubjectCodes,
  });
  const reviews = promote(current.dueReviews, query.point, (item) => item.id);
  const mistakes = promote(current.dueMistakes, query.mistake, (item) => String(item.id));
  const total = current.dueReviewsTotal + current.dueMistakesTotal;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>REVIEW</p>
          <h1>复习</h1>
          <span>{total ? `今天有 ${total} 项到期内容` : "今天没有到期内容"}</span>
        </div>
        <Link href="/" transitionTypes={["nav-back"]}>
          <ArrowLeft aria-hidden size={16} />
          回到今天
        </Link>
      </header>
      {total ? (
        <ReviewQueue
          dailyLimit={settings.dailyReviewLimit}
          day={day}
          doneToday={current.reviews.length}
          dueMistakes={mistakes}
          dueMistakesTotal={current.dueMistakesTotal}
          dueReviews={reviews}
          dueReviewsTotal={current.dueReviewsTotal}
          offlineScope={access.workspaceId}
          sprintSubjectCodes={sprintSubjectCodes}
        />
      ) : (
        <section className={styles.cleared}>
          <CheckCircle2 aria-hidden size={28} />
          <div>
            <h2>今日复习已清零</h2>
            <p>可以回到 Today 继续当前任务。</p>
          </div>
        </section>
      )}
    </div>
  );
}

function promote<T>(items: T[], id: string | undefined, getId: (item: T) => string): T[] {
  if (!id) return items;
  return [...items].sort((left, right) => (
    Number(getId(right) === id) - Number(getId(left) === id)
  ));
}

function dayDistance(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
