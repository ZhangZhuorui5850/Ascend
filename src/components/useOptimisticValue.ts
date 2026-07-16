"use client";

import { useState } from "react";

export type OptimisticState<T> = { confirmed: T; override: { value: T } | null };

/**
 * 渲染期对账（纯函数）：服务端值追上覆盖值、或服务端值发生变化时，清除覆盖。
 * 返回 null 表示无需变更。双触发（追平 + 变化）避免 A→B→A 双连击后
 * confirmed 从未变化、边沿检查永不命中导致 override 滞留。
 */
export function reconcileOptimistic<T>(
  state: OptimisticState<T>,
  serverValue: T,
): OptimisticState<T> | null {
  if (state.override && Object.is(serverValue, state.override.value)) {
    return { confirmed: serverValue, override: null };
  }
  if (!Object.is(state.confirmed, serverValue)) {
    return { confirmed: serverValue, override: null };
  }
  return null; // 无需变更
}

/**
 * 乐观值：apply() 立即生效本地覆盖，Server Action 的 revalidatePath 响应送来
 * 新的服务端值时在渲染期自动清除覆盖；失败时调用 rollback() 立刻还原。
 * 渲染期 setState 对账是 React 支持的同组件模式（避免 effect 级联渲染），
 * 取自 DayTasks.TaskLine 的既有实现。覆盖值包在对象里以兼容 falsy 值。
 * 注意：本 hook 是 last-write-wins，调用方应对同一值的并发提交自行加
 * pending 守卫或串行化（如 TaskLine 的 pending）。
 */
export function useOptimisticValue<T>(serverValue: T): {
  value: T;
  apply: (next: T) => void;
  rollback: () => void;
} {
  const [state, setState] = useState<OptimisticState<T>>({
    confirmed: serverValue,
    override: null,
  });
  const next = reconcileOptimistic(state, serverValue);
  if (next) setState(next); // 渲染期 setState 守卫：仅在需要变更时触发，React 会立即重渲染
  return {
    value: state.override ? state.override.value : serverValue,
    apply: (nextValue: T) => setState((prev) => ({ confirmed: prev.confirmed, override: { value: nextValue } })),
    rollback: () => setState((prev) => ({ confirmed: prev.confirmed, override: null })),
  };
}
