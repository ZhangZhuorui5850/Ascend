export type Tier = "r" | "y" | "g";

export type PointStatus = "未学" | "学习中" | "已掌握";

export type Subject = {
  code: string;
  name: string;
  description: string;
};

export type KnowledgePoint = {
  id: string;
  subjectCode: string;
  subjectName: string;
  submodule: string;
  tier: Tier;
  tierName: string;
  title: string;
  exam: boolean;
  status: PointStatus;
  mastery: number;
};

export type KnowledgeSeed = {
  subjects: Subject[];
  points: KnowledgePoint[];
};

export type CalendarSummary = {
  date: string;
  plan: string;
  assetCount: number;
  studyMinutes: number;
  reviewCount: number;
  mistakeCount: number;
  hasSummary: boolean;
};

export const TIER_NAMES: Record<Tier, string> = {
  r: "精通",
  y: "掌握",
  g: "了解",
};
