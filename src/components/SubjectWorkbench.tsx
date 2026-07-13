"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical, Loader2, Plus, Star, Trash2 } from "lucide-react";
import {
  createChapterAction,
  createPointAction,
  deleteChapterAction,
  deletePointAction,
  deleteSubjectAction,
  getPointDetailAction,
  moveChapterAction,
  renameChapterAction,
  renameSubjectAction,
  reorderPointsAction,
  updatePointAction,
} from "@/app/actions/knowledge";
import type { ChapterWithPoints, PointDetail, PointRow, SubjectRow, SubjectTrack } from "@/lib/repo/knowledge";
import type { Tier } from "@/lib/types";
import { useFeedback } from "@/components/FeedbackProvider";
import { assetFileUrl } from "@/lib/asset-url";
import { POINT_SORT_MODES, sortPointsForView, type PointSortMode } from "@/components/point-sort";
import { RichText } from "@/components/RichText";
import { useOptimisticValue } from "@/components/useOptimisticValue";

type SubjectWorkbenchProps = {
  subject: SubjectRow;
  chapters: ChapterWithPoints[];
  loosePoints: PointRow[];
  today: string;
};

const TIER_OPTIONS: Array<{ value: Tier; label: string }> = [
  { value: "r", label: "精通" },
  { value: "y", label: "掌握" },
  { value: "g", label: "了解" },
];

export function SubjectWorkbench({ subject, chapters, loosePoints, today }: SubjectWorkbenchProps) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [chapterTitle, setChapterTitle] = useState("");
  const [sortMode, setSortMode] = useState<PointSortMode>("manual");
  useEffect(() => {
    const saved = localStorage.getItem(`zgca-point-sort:${subject.code}`);
    window.setTimeout(() => {
      if (saved === "manual" || saved === "time" || saved === "importance") setSortMode(saved);
    }, 0);
  }, [subject.code]);
  function changeSortMode(mode: PointSortMode) {
    setSortMode(mode);
    localStorage.setItem(`zgca-point-sort:${subject.code}`, mode);
  }

  function report(result: { ok: boolean; error?: string }) {
    if (result.ok) router.refresh();
    else notify(result.error || "操作失败", "error");
  }

  async function addChapter() {
    const title = chapterTitle.trim();
    if (!title) return;
    const result = await createChapterAction({ subjectCode: subject.code, title });
    if (result.ok) setChapterTitle("");
    report(result);
  }

  async function removeSubject() {
    const pointCount = chapters.reduce((count, chapter) => count + chapter.points.length, 0) + loosePoints.length;
    const confirmed = await confirm({
      title: `删除 ${subject.code} · ${subject.name}？`,
      description: `将删除 ${chapters.length} 个章节、${pointCount} 个知识点。学习记录和资料会保留，但会解除关联。`,
      confirmLabel: "删除科目",
      danger: true,
    });
    if (!confirmed) return;
    const result = await deleteSubjectAction(subject.code);
    if (result.ok) {
      notify("科目已删除");
      router.push("/subjects");
      router.refresh();
    } else {
      notify(result.error || "删除失败", "error");
    }
  }

  return (
    <section className="card subjectWorkbench" aria-label="章节与知识点管理">
      <div className="sectionTitle splitTitle">
        <h2>章节与知识点</h2>
        <div aria-label="知识点排序方式" className="sortModeSwitch" role="group">
          {POINT_SORT_MODES.map((option) => (
            <button
              aria-pressed={sortMode === option.value}
              className={sortMode === option.value ? "active" : undefined}
              key={option.value}
              onClick={() => changeSortMode(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="subjectAdmin">
          <select
            aria-label="科目类型"
            onChange={(event) =>
              void renameSubjectAction({
                code: subject.code,
                name: subject.name,
                track: event.target.value as SubjectTrack,
              }).then(report)
            }
            value={subject.track}
          >
            <option value="written">笔试</option>
            <option value="machine">机试</option>
          </select>
          <input
            aria-label="科目名称"
            defaultValue={subject.name}
            key={`name-${subject.name}`}
            onBlur={(event) => {
              const name = event.target.value.trim();
              if (name && name !== subject.name) {
                void renameSubjectAction({ code: subject.code, name }).then(report);
              }
            }}
          />
          <button className="iconDanger" onClick={() => void removeSubject()} title="删除科目" type="button">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="chapterList">
        {chapters.map((chapter, index) => (
          <ChapterBlock
            chapter={chapter}
            first={index === 0}
            key={chapter.id}
            last={index === chapters.length - 1}
            report={report}
            sortMode={sortMode}
            subjectCode={subject.code}
            today={today}
          />
        ))}
        {loosePoints.length ? (
          <article className="chapterBlock">
            <div className="chapterHead">
              <strong className="chapterLoose">未分章知识点</strong>
            </div>
            <div className="pointList">
              {sortPointsForView(loosePoints, sortMode).map((point) => (
                <PointLine key={point.id} point={point} report={report} subjectCode={subject.code} today={today} />
              ))}
            </div>
          </article>
        ) : null}
        {!chapters.length && !loosePoints.length ? (
          <p className="empty">还没有章节。先添加一个章节，再往里挂知识点。</p>
        ) : null}
      </div>

      <div className="chapterCreate">
        <input
          value={chapterTitle}
          onChange={(event) => setChapterTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void addChapter();
          }}
          placeholder="新增章节，例如：特征值与二次型"
        />
        <button disabled={!chapterTitle.trim()} onClick={() => void addChapter()} type="button">
          <Plus size={15} />
          添加章节
        </button>
      </div>
    </section>
  );
}

function ChapterBlock({ chapter, subjectCode, first, last, today, report, sortMode }: {
  chapter: ChapterWithPoints;
  subjectCode: string;
  first: boolean;
  last: boolean;
  today: string;
  report: (result: { ok: boolean; error?: string }) => void;
  sortMode: PointSortMode;
}) {
  const { confirm, notify } = useFeedback();
  const [pointTitle, setPointTitle] = useState("");
  const [pointTier, setPointTier] = useState<Tier>("g");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const sortedPoints = sortPointsForView(chapter.points, sortMode);
  const draggable = sortMode === "manual";

  async function applyOrder(ids: string[]) {
    setReordering(true);
    try {
      report(await reorderPointsAction({ chapterId: chapter.id, subjectCode, orderedIds: ids }));
    } catch {
      report({ ok: false, error: "网络异常，排序未保存" });
    } finally {
      setReordering(false);
    }
  }

  async function dropOn(targetId: string) {
    const sourceId = dragId;
    setDragId(null);
    setOverId(null);
    if (reordering) return;
    if (!sourceId || sourceId === targetId) return;
    const ids = sortedPoints.map((point) => point.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    await applyOrder(ids);
  }

  async function movePoint(pointId: string, direction: -1 | 1) {
    if (reordering) return;
    const ids = sortedPoints.map((point) => point.id);
    const from = ids.indexOf(pointId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await applyOrder(ids);
  }

  async function addPoint() {
    const title = pointTitle.trim();
    if (!title) return;
    const result = await createPointAction({ chapterId: chapter.id, title, tier: pointTier, subjectCode });
    if (result.ok) setPointTitle("");
    report(result);
  }

  async function removeChapter() {
    const confirmed = await confirm({
      title: `删除章节“${chapter.title}”？`,
      description: `其中 ${chapter.points.length} 个知识点会一并删除，学习记录会保留。`,
      confirmLabel: "删除章节",
      danger: true,
    });
    if (!confirmed) return;
    const result = await deleteChapterAction({ id: chapter.id, subjectCode });
    report(result);
    if (result.ok) notify("章节已删除");
  }

  return (
    <article className="chapterBlock">
      <div className="chapterHead">
        <input
          aria-label="章节标题"
          defaultValue={chapter.title}
          key={chapter.title}
          onBlur={(event) => {
            const title = event.target.value.trim();
            if (title && title !== chapter.title) {
              void renameChapterAction({ id: chapter.id, title, subjectCode }).then(report);
            }
          }}
        />
        <span className="chapterCount">{chapter.points.length} 个知识点</span>
        <div className="chapterTools">
          <button
            aria-label="上移"
            disabled={first}
            onClick={() => void moveChapterAction({ id: chapter.id, direction: "up", subjectCode }).then(report)}
            type="button"
          >
            <ArrowUp size={14} />
          </button>
          <button
            aria-label="下移"
            disabled={last}
            onClick={() => void moveChapterAction({ id: chapter.id, direction: "down", subjectCode }).then(report)}
            type="button"
          >
            <ArrowDown size={14} />
          </button>
          <button aria-label="删除章节" className="iconDanger" onClick={() => void removeChapter()} type="button">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="pointList">
        {sortedPoints.map((point, index) => (
          <div
            className={overId === point.id && dragId && dragId !== point.id ? "pointDragWrap dragOver" : "pointDragWrap"}
            key={point.id}
            onDragEnd={
              draggable
                ? () => {
                    setDragId(null);
                    setOverId(null);
                  }
                : undefined
            }
            onDragOver={
              draggable
                ? (event) => {
                    if (!dragId) return;
                    event.preventDefault();
                    setOverId(point.id);
                  }
                : undefined
            }
            onDrop={
              draggable
                ? (event) => {
                    event.preventDefault();
                    void dropOn(point.id);
                  }
                : undefined
            }
          >
            {draggable ? (
              <>
                <button
                  aria-disabled={reordering || undefined}
                  aria-label={`拖拽或用方向键调整“${point.title}”的顺序`}
                  className="pointDragHandle"
                  draggable={!reordering}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    setDragId(point.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                      event.preventDefault();
                      void movePoint(point.id, event.key === "ArrowUp" ? -1 : 1);
                    }
                  }}
                  type="button"
                >
                  <GripVertical size={13} />
                </button>
                <span className="pointMoveButtons">
                  <button
                    aria-label={`上移“${point.title}”`}
                    disabled={reordering || index === 0}
                    onClick={() => void movePoint(point.id, -1)}
                    type="button"
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    aria-label={`下移“${point.title}”`}
                    disabled={reordering || index === sortedPoints.length - 1}
                    onClick={() => void movePoint(point.id, 1)}
                    type="button"
                  >
                    <ArrowDown size={11} />
                  </button>
                </span>
              </>
            ) : null}
            <PointLine point={point} report={report} subjectCode={subjectCode} today={today} />
          </div>
        ))}
        {!chapter.points.length ? <p className="empty inset">本章还没有知识点。</p> : null}
      </div>

      <div className="pointCreate">
        <input
          value={pointTitle}
          onChange={(event) => setPointTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void addPoint();
          }}
          placeholder="添加知识点"
        />
        <select onChange={(event) => setPointTier(event.target.value as Tier)} value={pointTier} aria-label="目标层级">
          {TIER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              目标：{option.label}
            </option>
          ))}
        </select>
        <button disabled={!pointTitle.trim()} onClick={() => void addPoint()} type="button" aria-label="添加知识点">
          <Plus size={14} />
        </button>
      </div>
    </article>
  );
}

function PointLine({ point, subjectCode, today, report }: {
  point: PointRow;
  subjectCode: string;
  today: string;
  report: (result: { ok: boolean; error?: string }) => void;
}) {
  const { confirm, notify } = useFeedback();
  const due = Boolean(point.next_review && point.next_review <= today);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<PointDetail | null>(null);
  const tierView = useOptimisticValue<Tier>(point.tier);
  const examView = useOptimisticValue<boolean>(Boolean(point.exam));
  const [editingTitle, setEditingTitle] = useState(false);

  async function changeTier(next: Tier) {
    tierView.apply(next);
    try {
      const result = await updatePointAction({ id: point.id, tier: next, subjectCode });
      if (!result.ok) tierView.rollback();
      report(result);
    } catch {
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
    } catch {
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
    <div className="pointItem">
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
      <MasteryCell point={point} report={report} subjectCode={subjectCode} />
      <small className={due ? "pointDue due" : "pointDue"}>
        {due ? "待复习" : point.next_review ? `下次 ${point.next_review.slice(5)}` : "未排期"}
      </small>
      <small className="pointCounts">
        {point.asset_count ? `${point.asset_count} 资料` : ""}
        {point.asset_count && point.mistake_count ? " · " : ""}
        {point.mistake_count ? `${point.mistake_count} 错题` : ""}
      </small>
      <button aria-label="删除知识点" className="iconDanger" onClick={() => void removePoint()} type="button">
        <Trash2 size={13} />
      </button>
    </div>
    {expanded ? (
      <div className="pointDetail">
        {loading ? (
          <p className="empty inset"><Loader2 className="spin" size={13} /> 加载中…</p>
        ) : detail ? (
          <>
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

function MasteryCell({ point, subjectCode, report }: {
  point: PointRow;
  subjectCode: string;
  report: (result: { ok: boolean; error?: string }) => void;
}) {
  const [value, setValue] = useState(point.mastery);
  const savingRef = useRef(false);
  const queuedRef = useRef<number | null>(null);
  const lastConfirmedRef = useRef(point.mastery);
  useEffect(() => {
    // setTimeout(0) 是本项目对 eslint set-state-in-effect 规则的既有惯例；
    // 回调内再检查一次 ref，避免请求在飞期间把旧的 point.mastery 闪回滑块。
    window.setTimeout(() => {
      if (!savingRef.current && queuedRef.current === null) {
        lastConfirmedRef.current = point.mastery;
        setValue(point.mastery);
      }
    }, 0);
  }, [point.mastery]);

  async function send(next: number) {
    savingRef.current = true;
    let result: { ok: boolean; error?: string };
    try {
      result = await updatePointAction({ id: point.id, mastery: next, subjectCode });
    } catch {
      result = { ok: false, error: "网络异常，掌握度未保存，请重新设置" };
    } finally {
      savingRef.current = false;
    }
    if (result.ok) {
      lastConfirmedRef.current = next;
    } else {
      // 服务端异常时补发大概率也失败，故连排队值一起丢弃；
      // 回滚到最近一次确认成功的值（闭包的 point.mastery 可能已过期）。
      queuedRef.current = null;
      setValue(lastConfirmedRef.current);
    }
    if (queuedRef.current !== null && queuedRef.current !== next) {
      const queued = queuedRef.current;
      queuedRef.current = null;
      void send(queued);
      return;
    }
    queuedRef.current = null;
    report(result);
  }

  function commit() {
    if (value === lastConfirmedRef.current) return;
    if (savingRef.current) {
      queuedRef.current = value;
      return;
    }
    void send(value);
  }

  return (
    <div className="masteryCell" title={`掌握度 ${value} · 已复习 ${point.reviews} 次 · 拖动可直接设置`}>
      <input
        aria-label={`设置“${point.title}”的掌握度`}
        className="masteryRange"
        max={100}
        min={0}
        onBlur={commit}
        onChange={(event) => setValue(Number(event.target.value))}
        onKeyUp={(event) => {
          if (event.key === "Enter" || event.key.startsWith("Arrow")) commit();
        }}
        onPointerUp={commit}
        step={5}
        style={{ "--mastery-pct": value } as CSSProperties}
        type="range"
        value={value}
      />
      <small>{value}</small>
    </div>
  );
}
