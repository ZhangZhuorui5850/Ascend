export type Tier = "r" | "y" | "g";

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
  status: "未学" | "学习中" | "已掌握";
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
