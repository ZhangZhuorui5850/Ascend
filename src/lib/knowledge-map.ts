import vm from "node:vm";
import type { KnowledgePoint, KnowledgeSeed, Subject, Tier } from "./types";

const TIER_NAME: Record<Tier, string> = {
  r: "精通",
  y: "掌握",
  g: "了解",
};

type RawPoint = [Tier, string, boolean];
type RawSubmodule = [string, RawPoint[]];
type RawModule = [string, string, string, RawSubmodule[]];

export function extractKnowledgeSeed(html: string): KnowledgeSeed {
  const match = html.match(/const DATA = (\[[\s\S]*?\]);\s*\n\s*const TIERNAME/);
  if (!match) {
    throw new Error("Could not find DATA block in knowledge map HTML");
  }

  const data = vm.runInNewContext(match[1], {}, { timeout: 1000 }) as RawModule[];
  const subjects: Subject[] = [];
  const points: KnowledgePoint[] = [];

  data.forEach(([code, name, description, submodules], moduleIndex) => {
    subjects.push({ code, name, description });

    submodules.forEach(([submodule, rawPoints], subIndex) => {
      rawPoints.forEach(([tier, title, exam], pointIndex) => {
        points.push({
          id: `${code}-${subIndex + 1}-${pointIndex + 1}`,
          subjectCode: code,
          subjectName: name,
          submodule,
          tier,
          tierName: TIER_NAME[tier],
          title,
          exam,
          status: "未学",
          mastery: 0,
        });
      });
    });

    if (subjects[moduleIndex].code !== code) {
      throw new Error(`Subject order mismatch for ${code}`);
    }
  });

  return { subjects, points };
}
