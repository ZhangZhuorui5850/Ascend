import type { Metadata } from "next";
import { PapercutExperience } from "./PapercutExperience";

export const metadata: Metadata = { title: "Papercut · Ascend Concept" };

export default function PapercutPage() {
  return <PapercutExperience />;
}
