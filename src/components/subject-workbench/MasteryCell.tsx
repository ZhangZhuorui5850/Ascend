"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { updatePointAction } from "@/app/actions/knowledge";
import type { PointRow } from "@/lib/repo/knowledge";
import type { Report } from "./shared";

/** 掌握度滑块：本地即时反馈 + 请求串行（在飞期间新值排队补发），失败回滚到最近确认值 */
export function MasteryCell({ point, subjectCode, report }: {
  point: PointRow;
  subjectCode: string;
  report: Report;
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
    } catch (error) {
      console.error("掌握度保存失败", error);
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
