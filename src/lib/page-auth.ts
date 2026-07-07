import { redirect } from "next/navigation";
import { AuthError, requireSession } from "./request-auth";

export async function requirePageSession(nextPath: string) {
  try {
    return await requireSession();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    }
    throw error;
  }
}
