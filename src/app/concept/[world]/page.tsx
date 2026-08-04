import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWorld, newWorlds } from "../worlds";
import { WorldExperience } from "./WorldExperience";

export function generateStaticParams() {
  return newWorlds.map((world) => ({ world: world.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ world: string }> }): Promise<Metadata> {
  const { world: slug } = await params;
  const world = getWorld(slug);
  return { title: world ? `${world.name} · Ascend Concept` : "Ascend Concept" };
}

export default async function NewWorldPage({ params }: { params: Promise<{ world: string }> }) {
  const { world: slug } = await params;
  const world = getWorld(slug);
  if (!world) notFound();
  return <WorldExperience world={world} />;
}
