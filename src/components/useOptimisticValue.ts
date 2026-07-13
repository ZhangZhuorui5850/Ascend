"use client";

import { useState } from "react";

/**
 * 乐观值：apply() 立即生效本地覆盖，server action 成功后 router.refresh() 送来
 * 新的服务端值时在渲染期自动清除覆盖；失败时调用 rollback() 立刻还原。
 * 渲染期 setState 对账是 React 支持的同组件模式（避免 effect 级联渲染），
 * 取自 DayTasks.TaskLine 的既有实现。覆盖值包在对象里以兼容 falsy 值。
 */
export function useOptimisticValue<T>(serverValue: T): {
  value: T;
  apply: (next: T) => void;
  rollback: () => void;
} {
  const [override, setOverride] = useState<{ value: T } | null>(null);
  const [confirmed, setConfirmed] = useState(serverValue);
  if (!Object.is(confirmed, serverValue)) {
    setConfirmed(serverValue);
    setOverride(null);
  }
  return {
    value: override ? override.value : serverValue,
    apply: (next: T) => setOverride({ value: next }),
    rollback: () => setOverride(null),
  };
}
