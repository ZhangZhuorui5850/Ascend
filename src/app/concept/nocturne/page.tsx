import type { Metadata } from "next";
import { NocturneExperience } from "./NocturneExperience";

export const metadata: Metadata = { title: "Nocturne · Ascend Concept" };

export default function NocturnePage() {
  return <NocturneExperience />;
}
