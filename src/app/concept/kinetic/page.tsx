import type { Metadata } from "next";
import { KineticExperience } from "./KineticExperience";

export const metadata: Metadata = {
  title: "Kinetic Field · Ascend Concept",
  description: "A motion-first learning operating system concept for Ascend.",
};

export default function KineticConceptPage() {
  return <KineticExperience />;
}
