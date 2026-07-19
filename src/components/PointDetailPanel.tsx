"use client";

import { useEffect, useState } from "react";
import {
  BookOpenCheck,
  BrainCircuit,
  CalendarClock,
  FileText,
  History,
  Lightbulb,
  Star,
  Target,
  X,
} from "lucide-react";
import { getPointDetailAction, markPointLearnedAction, updatePointAction } from "@/app/actions/knowledge";
import type { PointDetail, PointNode } from "@/lib/repo/knowledge";
import type { Tier } from "@/lib/types";
import { assetFileUrl } from "@/lib/asset-url";
import { useFeedback } from "@/components/FeedbackProvider";
import { RichText } from "@/components/RichText";
import { useOptimisticValue } from "@/components/useOptimisticValue";
import { MasteryCell, TIER_OPTIONS } from "@/components/SubjectWorkbench";
import { PointRecallEditor } from "@/components/PointRecallEditor";

type PanelTab = "recall" | "sources" | "mistakes" | "history";

/**
 * 图谱知识点工作台：把单点学习动作放在首屏，关联证据按任务分区。
 * 明细继续复用列表视图 action，选中节点后一次懒加载。
 */
export function PointDetailPanel({ point, subjectCode, today, report, onClose }: {
  point: PointNode;
  subjectCode: string;
  today: string;
  report: (result: { ok: boolean; error?: string }) => void;
  onClose: () => void;
}) {
  const { notify } = useFeedback();
  const [detail, setDetail] = useState<PointDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("recall");
  const tierView = useOptimisticValue<Tier>(point.tier);
  const examView = useOptimisticValue<boolean>(Boolean(point.exam));
  const due = Boolean(point.next_review && point.next_review <= today);
  const tierLabel = TIER_OPTIONS.find((option) => option.value === tierView.value)?.label || "了解";

  useEffect(() => {
    let cancelled = false;
    getPointDetailAction(point.id).then((result) => {
      if (cancelled) return;
      if (result.ok && result.detail) setDetail(result.detail);
      else notify(result.error || "详情加载失败", "error");
      setLoading(false);
    }).catch((error) => {
      if (cancelled) return;
      console.error("知识点详情加载失败", error);
      notify("网络异常，详情加载失败", "error");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [point.id, notify]);

  async function changeTier(next: Tier) {
    tierView.apply(next);
    try {
      const result = await updatePointAction({ id: point.id, tier: next, subjectCode });
      if (!result.ok) tierView.rollback();
      report(result);
    } catch (error) {
      console.error("更新掌握层级失败", error);
      tierView.rollback();
      report({ ok: false, error: "网络异常，层级未保存" });
    }
  }

  async function toggleExam() {
    const next = !examView.value;
    examView.apply(next);
    try {
      const result = await updatePointAction({ id: point.id, exam: next, subjectCode });
      if (!result.ok) examView.rollback();
      report(result);
    } catch (error) {
      console.error("更新真题标记失败", error);
      examView.rollback();
      report({ ok: false, error: "网络异常，真题标记未保存" });
    }
  }

  async function learnedToday() {
    const result = await markPointLearnedAction({ id: point.id, day: today, subjectCode });
    report(result);
    if (result.ok) notify("已排入明日复习");
  }

  const tabs: Array<{ id: PanelTab; label: string; count?: number }> = [
    { id: "recall", label: "回忆卡" },
    { id: "sources", label: "资料", count: detail?.assets.length },
    { id: "mistakes", label: "错题", count: detail?.mistakes.length },
    { id: "history", label: "记录", count: detail?.reviews.length },
  ];

  return (
    <aside aria-label={`知识点工作台：${point.title}`} className="pointPanel">
      <header className="pointPanelHead">
        <div className="pointPanelIdentity">
          <span className="pointPanelEyebrow"><BrainCircuit size={13} />知识点工作台</span>
          {editingTitle ? (
            <input
              aria-label="知识点标题"
              autoFocus
              defaultValue={point.title}
              onBlur={(event) => {
                setEditingTitle(false);
                const title = event.target.value.trim();
                if (title && title !== point.title) {
                  void updatePointAction({ id: point.id, title, subjectCode }).then(report);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
              }}
            />
          ) : (
            <button
              aria-label={`编辑标题“${point.title}”`}
              className="pointPanelTitle"
              onClick={() => setEditingTitle(true)}
              type="button"
            >
              <RichText text={point.title} />
            </button>
          )}
          <div className="pointPanelStatusLine">
            <span data-tier={tierView.value}>{tierLabel}</span>
            <span>{due ? "今天待复习" : point.next_review ? `复习日 ${point.next_review}` : "等待首次学习"}</span>
            {examView.value ? <span className="exam"><Star fill="currentColor" size={11} />真题考点</span> : null}
          </div>
        </div>
        <button aria-label="关闭知识点工作台" className="pointPanelClose" onClick={onClose} type="button">
          <X size={17} />
        </button>
      </header>

      <section aria-label="学习状态" className="pointLearningState">
        <div className="pointLearningStateHead">
          <div>
            <span>当前掌握度</span>
            <strong>{point.mastery}<small>%</small></strong>
          </div>
          {!point.next_review ? (
            <button className="pointStartLearning" onClick={() => void learnedToday()} type="button">
              <BookOpenCheck size={15} />
              完成首次学习
            </button>
          ) : (
            <span className={due ? "pointSchedule due" : "pointSchedule"}>
              <CalendarClock size={14} />
              {due ? "复习已到期" : `${point.next_review.slice(5)} 复习`}
            </span>
          )}
        </div>
        <MasteryCell point={point} report={report} subjectCode={subjectCode} />
        <div aria-label="目标层级" className="pointPriorityGroup" role="group">
          {TIER_OPTIONS.map((option) => (
            <button
              aria-pressed={tierView.value === option.value}
              data-tier={option.value}
              key={option.value}
              onClick={() => void changeTier(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
          <button
            aria-pressed={examView.value}
            className={examView.value ? "pointExamToggle active" : "pointExamToggle"}
            onClick={() => void toggleExam()}
            type="button"
          >
            <Star fill={examView.value ? "currentColor" : "none"} size={12} />
            真题
          </button>
        </div>
      </section>

      <dl className="pointPanelMetrics">
        <div><dt>学习状态</dt><dd>{point.status}</dd></div>
        <div><dt>复习次数</dt><dd>{point.reviews}</dd></div>
        <div><dt>最近复习</dt><dd>{point.last_review || "待开始"}</dd></div>
      </dl>

      <div aria-label="知识点内容" className="pointPanelTabs" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "active" : undefined}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
            {typeof tab.count === "number" && tab.count > 0 ? <small>{tab.count}</small> : null}
          </button>
        ))}
      </div>

      <div className="pointPanelBody" role="tabpanel">
        {activeTab === "recall" ? (
          <>
            <div className="recallIntro">
              <Lightbulb size={16} />
              <p><strong>先写一个能检验理解的问题</strong><span>答案保留定义、推导步骤与易错边界，复习时先回忆再核对。</span></p>
            </div>
            <PointRecallEditor point={point} report={report} subjectCode={subjectCode} />
          </>
        ) : null}

        {activeTab !== "recall" && loading ? <PanelLoading /> : null}

        {activeTab === "sources" && detail ? (
          <section aria-label="关联资料" className="pointEvidenceList">
            <div className="pointPanelSectionTitle"><FileText size={15} /><div><h3>学习资料</h3><p>支撑理解与复习的原始材料</p></div></div>
            {detail.assets.map((asset) => (
              <a href={assetFileUrl(asset.id)} key={asset.id} rel="noopener" target="_blank">
                <span className="evidenceIcon"><FileText size={15} /></span>
                <span><strong>{asset.original_name}</strong><small>收录于 {asset.day}</small></span>
              </a>
            ))}
            {!detail.assets.length ? <PanelEmpty icon={<FileText size={20} />} title="等待关联资料" text="从资料库收纳文件时选择这个知识点，材料会集中显示在这里。" /> : null}
          </section>
        ) : null}

        {activeTab === "mistakes" && detail ? (
          <section aria-label="关联错题" className="pointEvidenceList">
            <div className="pointPanelSectionTitle"><Target size={15} /><div><h3>错题证据</h3><p>用真实失误校准理解边界</p></div></div>
            {detail.mistakes.map((mistake) => (
              <article className="pointMistakeCard" key={mistake.id}>
                <div><span className={mistake.graduated ? "rowBadge" : "rowBadge mistake"}>{mistake.graduated ? "已毕业" : "回炉中"}</span><small>{mistake.day}</small></div>
                <strong><RichText text={mistake.title} /></strong>
                {mistake.cause ? <p><RichText text={mistake.cause} /></p> : null}
                {mistake.next_review && !mistake.graduated ? <span className="mistakeNext">下次回炉 {mistake.next_review}</span> : null}
              </article>
            ))}
            {!detail.mistakes.length ? <PanelEmpty icon={<Target size={20} />} title="等待错题证据" text="记录错题并关联到这个知识点，回炉进度会汇总在这里。" /> : null}
          </section>
        ) : null}

        {activeTab === "history" && detail ? (
          <section aria-label="复习记录" className="pointHistory">
            <div className="pointPanelSectionTitle"><History size={15} /><div><h3>复习轨迹</h3><p>每次检索练习形成一条学习证据</p></div></div>
            {detail.reviews.map((review) => (
              <div className="historyEvent" key={review.id}>
                <span className="historyScore">{review.score}<small>/3</small></span>
                <div><strong>{review.day}</strong><p>{review.note || "完成一次主动回忆"}</p></div>
              </div>
            ))}
            {!detail.reviews.length ? <PanelEmpty icon={<History size={20} />} title="等待首次复习" text="完成首次学习后，系统会按记忆间隔安排复习。" /> : null}
          </section>
        ) : null}

        {activeTab !== "recall" && !loading && !detail ? <PanelEmpty icon={<BrainCircuit size={20} />} title="详情加载失败" text="重新选择这个知识点后再次加载。" /> : null}
      </div>
    </aside>
  );
}

function PanelLoading() {
  return <div aria-label="正在加载" className="pointPanelSkeleton"><span /><span /><span /></div>;
}

function PanelEmpty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="pointPanelEmptyState"><span>{icon}</span><strong>{title}</strong><p>{text}</p></div>;
}
