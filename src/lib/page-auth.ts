import { redirect } from "next/navigation";
import type { AccessContext } from "./access-context";
import { getDb } from "./db";
import { workspaceNeedsOnboarding } from "./repo/workspaces";
import { assertWorkspaceAccess, AuthError, requireSession } from "./request-auth";

export async function requirePageSession(nextPath: string) {
  try {
    return await requireSession();
  } catch (error) {
    if (error instanceof AuthError) {
      const loginPath = nextPath.startsWith("/kinetic") ? "/kinetic/login" : "/login";
      redirect(`${loginPath}?next=${encodeURIComponent(nextPath)}`);
    }
    throw error;
  }
}

export function workspaceRedirectTarget(
  context: AccessContext,
  nextPath: string,
  needsOnboarding = false,
): string | null {
  const kinetic = nextPath.startsWith("/kinetic");
  const loginPath = kinetic ? "/kinetic/login" : "/login";
  const passwordPath = kinetic ? "/kinetic/change-password" : "/change-password";
  const onboardingPath = kinetic ? "/kinetic/onboarding" : "/onboarding";
  if (context.mustChangePassword) {
    return kinetic ? `${passwordPath}?next=${encodeURIComponent(nextPath)}` : passwordPath;
  }
  if (context.role === "admin") return "/admin";
  if (!context.workspaceId) return `${loginPath}?next=${encodeURIComponent(nextPath)}`;
  if (needsOnboarding && nextPath !== onboardingPath) return onboardingPath;
  return null;
}

export async function requirePageWorkspace(nextPath: string) {
  const context = await requirePageSession(nextPath);
  const baseTarget = workspaceRedirectTarget(context, nextPath);
  if (baseTarget) redirect(baseTarget);

  const access = assertWorkspaceAccess(context);
  const onboardingTarget = workspaceRedirectTarget(
    context,
    nextPath,
    workspaceNeedsOnboarding(getDb(), access),
  );
  if (onboardingTarget) redirect(onboardingTarget);
  return access;
}
