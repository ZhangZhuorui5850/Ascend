"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AnimationEvent, RefObject } from "react";

const PRESENCE_EVENT_GRACE_MS = 50;

export function usePresenceAnimation<T extends HTMLElement>({
  entering,
  leaving,
  onEnterComplete,
  onExitComplete,
}: {
  entering: boolean;
  leaving: boolean;
  onEnterComplete: () => void;
  onExitComplete: () => void;
}): [RefObject<T | null>, (event: AnimationEvent<T>) => void] {
  const elementRef = useRef<T>(null);

  useEffect(() => {
    if (!entering && !leaving) return;
    const duration = maxAnimationDurationMs(elementRef.current);
    const timeout = window.setTimeout(
      leaving ? onExitComplete : onEnterComplete,
      duration + PRESENCE_EVENT_GRACE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [entering, leaving, onEnterComplete, onExitComplete]);

  const onAnimationEnd = useCallback((event: AnimationEvent<T>) => {
      if (event.target !== event.currentTarget) return;
      if (leaving) onExitComplete();
      else if (entering) onEnterComplete();
  }, [entering, leaving, onEnterComplete, onExitComplete]);

  return [elementRef, onAnimationEnd];
}

function maxAnimationDurationMs(element: HTMLElement | null): number {
  if (!element) return 0;
  return window.getComputedStyle(element).animationDuration.split(",").reduce((max, duration) => {
    const value = Number.parseFloat(duration);
    const milliseconds = duration.trim().endsWith("ms") ? value : value * 1000;
    return Number.isFinite(milliseconds) ? Math.max(max, milliseconds) : max;
  }, 0);
}
