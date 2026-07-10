import { redirect } from "next/navigation";
import type { AccessContext } from "./access-context";
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

export function workspaceRedirectTarget(context: AccessContext, nextPath: string): string | null {
  if (context.mustChangePassword) return "/change-password";
  if (context.role === "admin") return "/admin";
  if (!context.workspaceId) return `/login?next=${encodeURIComponent(nextPath)}`;
  return null;
}

export async function requirePageWorkspace(nextPath: string) {
  const context = await requirePageSession(nextPath);
  const target = workspaceRedirectTarget(context, nextPath);
  if (target) redirect(target);
  return assertWorkspaceAccess(context);
}
