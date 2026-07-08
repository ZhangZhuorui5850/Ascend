import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PLAN_RELATIVE_PATH = path.join("agent沟通", "02_十周做题驱动备考计划.md");
const PLAN_MAX_LENGTH = 12000;

export type PlanDocument = {
  exists: boolean;
  path: string;
  content: string;
};

export function readPlanDocument(sourceRoot: string): PlanDocument {
  const planPath = path.join(sourceRoot, PLAN_RELATIVE_PATH);
  if (!existsSync(planPath)) {
    return { exists: false, path: planPath, content: "" };
  }

  return {
    exists: true,
    path: planPath,
    content: readFileSync(planPath, "utf8").slice(0, PLAN_MAX_LENGTH),
  };
}
