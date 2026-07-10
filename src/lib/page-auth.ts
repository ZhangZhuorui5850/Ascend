import { redirect } from "next/navigation";
import { assertWorkspaceAccess, AuthError, requireSession } from "./request-auth";

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

export async function requirePageWorkspace(nextPath: string) {
  return assertWorkspaceAccess(await requirePageSession(nextPath));
}
