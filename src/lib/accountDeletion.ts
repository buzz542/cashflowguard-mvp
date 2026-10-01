/** Why an account can't be deleted yet, or null if it can. */
export function accountDeletionBlocker(input: {
  ownedTeamsWithOtherMembers: string[];
  ownedWorkspacesWithActiveSubscription: string[];
}): { code: string; error: string } | null {
  if (input.ownedWorkspacesWithActiveSubscription.length) {
    return {
      code: "active_subscription",
      error: `Cancel your subscription first (Manage billing): ${input.ownedWorkspacesWithActiveSubscription.join(", ")}.`
    };
  }
  if (input.ownedTeamsWithOtherMembers.length) {
    return {
      code: "owns_team",
      error: `You own a team with other people in it (${input.ownedTeamsWithOtherMembers.join(", ")}). Hand it to someone else or delete it first.`
    };
  }
  return null;
}
