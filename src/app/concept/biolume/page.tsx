import type { Metadata } from "next";
import { BiolumeExperience } from "./BiolumeExperience";

export const metadata: Metadata = { title: "Biolume · Ascend Concept" };

export default function BiolumePage() {
  return <BiolumeExperience />;
}
