import { describe, it, expect } from "vitest";
import { accountDeletionBlocker } from "@/lib/accountDeletion";

describe("accountDeletionBlocker", () => {
  it("allows deletion with nothing owned", () => {
    expect(accountDeletionBlocker({ ownedTeamsWithOtherMembers: [], ownedWorkspacesWithActiveSubscription: [] })).toBeNull();
  });
  it("blocks while a subscription is live (nobody billed for a deleted account)", () => {
    expect(accountDeletionBlocker({ ownedTeamsWithOtherMembers: [], ownedWorkspacesWithActiveSubscription: ["your personal plan"] })?.code).toBe("active_subscription");
  });
  it("blocks while owning a team with other people (their data would go too)", () => {
    expect(accountDeletionBlocker({ ownedTeamsWithOtherMembers: ["Olive Ltd"], ownedWorkspacesWithActiveSubscription: [] })?.code).toBe("owns_team");
  });
});
