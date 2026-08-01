import type { Transition } from "motion/react";

type MotionContract = {
  animate: Record<string, unknown>;
  exit: Record<string, unknown>;
  enter: Record<string, unknown>;
  reorder?: Transition;
};

const easing = {
  enter: [0.16, 1, 0.3, 1],
  exit: [0.4, 0, 1, 0.8],
  standard: [0.22, 1, 0.36, 1],
} as const;

const rowEnter: Transition = { duration: 0.2, ease: easing.enter };
const rowExit: Transition = { duration: 0.12, ease: easing.exit };
const reducedEnter: Transition = { duration: 0.12, ease: easing.standard };
const reducedExit: Transition = { duration: 0.1, ease: easing.exit };

/**
 * Typed semantic ownership for Motion-driven UI. CSS owns ordinary controls;
 * these contracts are reserved for object continuity, layout and feedback.
 */
export const motion = {
  feedback: {
    enter: { opacity: 0, y: -6 },
    animate: { opacity: 1, y: 0, transition: rowEnter },
    exit: { opacity: 0, y: -4, transition: rowExit },
    reduced: {
      enter: { opacity: 0 },
      animate: { opacity: 1, transition: reducedEnter },
      exit: { opacity: 0, transition: reducedExit },
    },
  },
  row: {
    enter: { opacity: 0, y: -6 },
    animate: { opacity: 1, y: 0, transition: rowEnter },
    exit: { opacity: 0, scale: 0.98, transition: rowExit },
    reorder: { duration: 0.2, ease: easing.standard },
    reduced: {
      enter: { opacity: 0 },
      animate: { opacity: 1, transition: reducedEnter },
      exit: { opacity: 0, transition: reducedExit },
    },
  },
} as const satisfies Record<string, MotionContract & { reduced: MotionContract }>;

export const motionContractMeta = {
  feedback: { frequency: "state feedback", properties: ["opacity", "transform"] },
  row: { frequency: "list object continuity", properties: ["opacity", "transform", "layout"] },
} as const;
