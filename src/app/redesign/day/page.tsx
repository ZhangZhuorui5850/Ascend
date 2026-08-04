import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { DayAgenda } from "@/components/redesign/DayAgenda";
import { dayAgenda, dayStats } from "@/components/redesign/mock-data";
import styles from "@/styles/redesign/day.module.css";

/**
 * 每日工作台 v2 预览：头部导航 + 状态条 + 议程单流。
 * mock 数据；切换时数据源为 getDay + PlannerTask 范围查询。
 */
export default function RedesignDayPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <span className={styles.kicker}>TODAY · 今日工作台</span>
          <div className={styles.dayNav}>
            <Link aria-label="前一天" href="/redesign/day"><ChevronLeft aria-hidden size={18} /></Link>
            <h1>8月1日 周六</h1>
            <Link aria-label="后一天" href="/redesign/day"><ChevronRight aria-hidden size={18} /></Link>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.ghostButton} href="/calendar">
            <CalendarDays aria-hidden size={15} />日历
          </Link>
        </div>
      </header>

      <section aria-label="当日概览" className={styles.statusBar}>
        <div><strong>{dayStats.doneTasks}/{dayStats.totalTasks}</strong><span>任务</span></div>
        <div><strong>{dayStats.studyMinutes}</strong><span>分钟学习</span></div>
        <div><strong>{dayStats.reviewsDone}</strong><span>次复习</span></div>
        <div data-tone="due"><strong>{dayStats.queueLeft}</strong><span>待处理</span></div>
      </section>

      <DayAgenda entries={dayAgenda} />

      <section aria-labelledby="day-quick-title" className={styles.quickPanel}>
        <h2 id="day-quick-title">随手记与复盘</h2>
        <div className={styles.quickGrid}>
          <button className={styles.quickAction} type="button">+ 记录学习时段</button>
          <button className={styles.quickAction} type="button">+ 登记错题</button>
          <button className={styles.quickAction} type="button">+ 写随手记</button>
          <button className={styles.quickAction} type="button">✎ 当日复盘</button>
        </div>
        <p className={styles.quickHint}>预览版为占位动作；切换时复用现有 QuickLog / DayNotes / DayJournal 组件与 action。</p>
      </section>
    </div>
  );
}
