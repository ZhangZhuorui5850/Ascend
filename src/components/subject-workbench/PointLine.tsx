"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus, Star, Trash2 } from "lucide-react";
import {
  deletePointAction,
  getPointDetailAction,
  updatePointAction,
} from "@/app/actions/knowledge";
import type { PointDetail, PointRow } from "@/lib/repo/knowledge";
import type { Tier } from "@/lib/types";
import { assetFileUrl } from "@/lib/asset-url";
import { CreateTrainingTaskButton } from "@/components/CreateTrainingTaskButton";
import { useFeedback } from "@/components/FeedbackProvider";
import { PointRecallEditor } from "@/components/PointRecallEditor";
import { RichText } from "@/components/RichText";
import { useOptimisticValue } from "@/components/useOptimisticValue";
import { ConfidenceCell } from "./ConfidenceCell";
import { TIER_OPTIONS, type Report } from "./shared";

/** 单条知识点行：层级/星标/主观信心快捷编辑 + 展开后的资料、错题、复习记录详情 */
export function PointLine({ point, subjectCode, today, report, onAddChild, focused = false }: {
  point: PointRow;
  subjectCode: string;
  today: string;
  report: Report;
  onAddChild?: () => void;
  focused?: boolean;
}) {
  const { confirm, notify } = useFeedback();
  const due = Boolean(point.next_review && point.next_review <= today);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<PointDetail | null>(null);
  const tierView = useOptimisticValue<Tier>(point.tier);
  const examView = useOptimisticValue<boolean>(Boolean(point.exam));
  const [editingTitle, setEditingTitle] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focused) return;
    let cancelled = false;
    let frame = 0;
    const reveal = () => {
      frame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const item = itemRef.current;
        if (!item) return;
        item.scrollIntoView({ block: "center", behavior: "auto" });
        item.focus({ preventScroll: true });
      });
    };
    const transition = (document as Document & {
      activeViewTransition?: { finished: Promise<unknown> };
    }).activeViewTransition;
    if (transition) void transition.finished.then(reveal, reveal);
    else reveal();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [focused]);

  async function changeTier(next: Tier) {
    tierView.apply(next);
    try {
      const result = await updatePointAction({ id: point.id, tier: next, subjectCode });
      if (!result.ok) tierView.rollback();
      report(result);
    } catch (error) {
      console.error("知识点层级保存失败", error);
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
      console.error("真题星标保存失败", error);
      examView.rollback();
      report({ ok: false, error: "网络异常，星标未保存" });
    }
  }

  async function removePoint() {
    const confirmed = await confirm({
      title: `删除知识点“${point.title}”？`,
      description: "复习和错题记录会保留，但会解除与这个知识点的关联。",
      confirmLabel: "删除知识点",
      danger: true,
    });
    if (!confirmed) return;
    const result = await deletePointAction({ id: point.id, subjectCode });
    report(result);
    if (result.ok) notify("知识点已删除");
  }

  async function toggleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!detail && !loading) {
      setLoading(true);
      const result = await getPointDetailAction(point.id);
      if (result.ok && result.detail) setDetail(result.detail);
      setLoading(false);
    }
  }

  return (
    <div
      className={focused ? "pointItem isFocusTarget" : "pointItem"}
      data-focus-target={focused ? "true" : undefined}
      ref={itemRef}
      tabIndex={focused ? -1 : undefined}
    >
    <div className="pointLine">
      <button
        aria-expanded={expanded}
        aria-label={expanded ? "收起详情" : "展开关联的资料和错题"}
        className="pointExpand"
        onClick={() => void toggleExpand()}
        type="button"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <select
        aria-label="层级"
        className="tierSelect"
        data-tier={tierView.value}
        onChange={(event) => void changeTier(event.target.value as Tier)}
        value={tierView.value}
      >
        {TIER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {editingTitle ? (
        <input
          aria-label="知识点标题"
          autoFocus
          className="pointTitle"
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
        // 非编辑态渲染公式（$...$），点击切回输入框编辑原文
        <button
          aria-label={`编辑知识点标题“${point.title}”`}
          className="pointTitle pointTitleView"
          onClick={() => setEditingTitle(true)}
          type="button"
        >
          <RichText text={point.title} />
        </button>
      )}
      <button
        aria-label={examView.value ? "取消真题标记" : "标记为真题"}
        className={examView.value ? "examStar active" : "examStar"}
        onClick={() => void toggleExam()}
        title={examView.value ? "真题考点" : "标记为真题考点"}
        type="button"
      >
        <Star fill={examView.value ? "currentColor" : "none"} size={13} />
      </button>
      <ConfidenceCell point={point} report={report} subjectCode={subjectCode} />
      <small className={due ? "pointDue due" : "pointDue"}>
        {due ? "待复习" : point.next_review ? `下次 ${point.next_review.slice(5)}` : "未排期"}
      </small>
      <small className="pointCounts">
        {point.asset_count ? `${point.asset_count} 资料` : ""}
        {point.asset_count && point.mistake_count ? " · " : ""}
        {point.mistake_count ? `${point.mistake_count} 错题` : ""}
      </small>
      <div className="pointActions">
        {onAddChild ? (
          <button
            aria-label={`为“${point.title}”添加子知识点`}
            className="pointAddChild"
            onClick={onAddChild}
            title="添加子知识点"
            type="button"
          >
            <Plus size={13} />
          </button>
        ) : null}
        <button aria-label="删除知识点" className="iconDanger" onClick={() => void removePoint()} type="button">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
    {expanded ? (
      <div className="pointDetail">
        {loading ? (
          <p className="empty inset"><Loader2 className="spin" size={13} /> 加载中…</p>
        ) : detail ? (
          <>
            <div className="pointTrainingAction">
              <div><span className="sectionKicker">NEXT ACTION</span><strong>针对训练</strong><small>创建 45 分钟 P1 训练，带回今日工作台执行。</small></div>
              <CreateTrainingTaskButton
                compact
                day={today}
                knowledgePointId={point.id}
                notes={`知识点专项训练：${point.title}。完成后进行一次无提示回忆并记录结果。`}
                sourceId={point.id}
                sourceType="knowledge_point"
                subjectCode={subjectCode}
                title={`知识点专项：${point.title}`}
                verificationMethod="无提示回忆"
              />
            </div>
            <PointRecallEditor point={point} report={report} subjectCode={subjectCode} />
            <div className="pointDetailCol">
              <h4>关联资料 {detail.assets.length ? `(${detail.assets.length})` : ""}</h4>
              {detail.assets.map((asset) => (
                <a href={assetFileUrl(asset.id)} key={asset.id} rel="noopener" target="_blank">
                  {asset.original_name}
                  <small>{asset.day}</small>
                </a>
              ))}
              {!detail.assets.length ? <p className="empty inset">暂无。收纳文件时选中这个知识点即可关联。</p> : null}
            </div>
            <div className="pointDetailCol">
              <h4>错题 {detail.mistakes.length ? `(${detail.mistakes.length})` : ""}</h4>
              {detail.mistakes.map((mistake) => (
                <div key={mistake.id}>
                  <span className={mistake.graduated ? "rowBadge" : "rowBadge mistake"}>
                    {mistake.graduated ? "已毕业" : "回炉中"}
                  </span>
                  <RichText text={mistake.title} />
                  <small>{mistake.cause ? <RichText text={mistake.cause} /> : mistake.day}</small>
                </div>
              ))}
              {!detail.mistakes.length ? <p className="empty inset">暂无错题。</p> : null}
            </div>
            <div className="pointDetailCol">
              <h4>复习记录 {detail.reviews.length ? `(${detail.reviews.length})` : ""}</h4>
              {detail.reviews.map((review) => (
                <div key={review.id}>
                  <span className="rowBadge review">{review.score}/3</span>
                  {review.day}
                  {review.note ? <small>{review.note}</small> : null}
                </div>
              ))}
              {!detail.reviews.length ? <p className="empty inset">还没复习过。</p> : null}
            </div>
          </>
        ) : (
          <p className="empty inset">加载失败，请重试。</p>
        )}
      </div>
    ) : null}
    </div>
  );
}
