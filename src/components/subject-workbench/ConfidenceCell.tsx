"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { updatePointAction } from "@/app/actions/knowledge";
import { confidenceLabel } from "@/lib/review-evidence";
import type { PointRow } from "@/lib/repo/knowledge";
import type { Report } from "./shared";

/** 主观信心滑块：与系统证据状态分离；未设置时只显示中性占位，不写库。 */
export function ConfidenceCell({ point, subjectCode, report }: {
  point: PointRow;
  subjectCode: string;
  report: Report;
}) {
  const [value, setValue] = useState(point.self_confidence ?? 50);
  const [isSet, setIsSet] = useState(point.self_confidence !== null);
  const savingRef = useRef(false);
  const queuedRef = useRef<number | null>(null);
  const lastConfirmedRef = useRef<number | null>(point.self_confidence);
  useEffect(() => {
    // setTimeout(0) 是本项目对 eslint set-state-in-effect 规则的既有惯例；
    // 回调内再检查一次 ref，避免请求在飞期间把旧值闪回滑块。
    window.setTimeout(() => {
      if (!savingRef.current && queuedRef.current === null) {
        lastConfirmedRef.current = point.self_confidence;
        setValue(point.self_confidence ?? 50);
        setIsSet(point.self_confidence !== null);
      }
    }, 0);
  }, [point.self_confidence]);

  async function send(next: number) {
    savingRef.current = true;
    let result: { ok: boolean; error?: string };
    try {
      result = await updatePointAction({ id: point.id, selfConfidence: next, subjectCode });
    } catch (error) {
      console.error("主观信心保存失败", error);
      result = { ok: false, error: "网络异常，主观信心未保存，请重新设置" };
    } finally {
      savingRef.current = false;
    }
    if (result.ok) {
      lastConfirmedRef.current = next;
    } else {
      // 服务端异常时补发大概率也失败，故连排队值一起丢弃；
      // 回滚到最近一次确认成功的值。
      queuedRef.current = null;
      setValue(lastConfirmedRef.current ?? 50);
      setIsSet(lastConfirmedRef.current !== null);
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
    <div className="masteryCell" title={`主观信心 ${isSet ? `${value} · ${confidenceLabel(value)}` : "未设置"}；系统证据状态不由此滑块改写`}>
      <span className="confidenceCellLabel">信心</span>
      <input
        aria-label={`设置“${point.title}”的主观信心`}
        className="masteryRange"
        max={100}
        min={0}
        onBlur={commit}
        onChange={(event) => {
          setValue(Number(event.target.value));
          setIsSet(true);
        }}
        onKeyUp={(event) => {
          if (event.key === "Enter" || event.key.startsWith("Arrow")) commit();
        }}
        onPointerUp={commit}
        step={5}
        style={{ "--mastery-pct": value } as CSSProperties}
        type="range"
        value={value}
      />
      <small>{isSet ? value : "—"}</small>
    </div>
  );
}
