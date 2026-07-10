import { redirect } from "next/navigation";
import { AuthError, requireAdmin } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect("/");
    throw error;
  }
  return children;
}
