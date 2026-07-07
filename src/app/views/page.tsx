import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/page-auth";

export default async function ViewsIndexPage() {
  await requirePageSession("/views");

  redirect("/views/today-inbox");
}
