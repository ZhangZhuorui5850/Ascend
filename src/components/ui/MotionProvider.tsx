"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { createContext, useContext, useEffect, useState } from "react";

const MotionReducedContext = createContext(true);

export function useMotionReduced(): boolean {
  return useContext(MotionReducedContext);
}

export function getAppMotionPreference(root: Pick<HTMLElement, "dataset">): boolean {
  return root.dataset.motion === "reduce";
}

export function resolveReducedMotion(systemReduce: boolean, appReduce: boolean): boolean {
  return systemReduce || appReduce;
}

export function resolveMotionConfigPreference(reduced: boolean | null): "always" | "never" | "user" {
  if (reduced === null) return "user";
  return reduced ? "always" : "never";
}

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [reduced, setReduced] = useState<boolean | null>(null);
  const preference = resolveMotionConfigPreference(reduced);
  const contractReduced = reduced !== false;

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(resolveReducedMotion(media.matches, getAppMotionPreference(root)));
    const observer = new MutationObserver(update);

    update();
    media.addEventListener("change", update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-motion"] });
    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={preference}>
        <span aria-hidden data-motion-provider={preference} hidden />
        <MotionReducedContext value={contractReduced}>{children}</MotionReducedContext>
      </MotionConfig>
    </LazyMotion>
  );
}
