export type PlannerMutationResult = {
  ok: boolean;
  error?: string;
  transportFailure?: boolean;
};

export async function runPlannerMutation<T extends PlannerMutationResult>(
  mutation: () => Promise<T>,
  transportError: string,
): Promise<T> {
  try {
    return await mutation();
  } catch {
    return {
      ok: false,
      error: transportError,
      transportFailure: true,
    } as T;
  }
}
