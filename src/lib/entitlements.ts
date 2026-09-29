/** Stripe statuses that count as a paid, working subscription. */
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function subscriptionIsActive(status: string | null | undefined): boolean {
  return !!status && ACTIVE_STATUSES.has(status);
}

export type ProInputs = {
  compPro: boolean;
  subscriptionStatus: string | null | undefined;
  seatCount: number;
  /** 0-based position of this user in the workspace, owner first, then by join date. */
  memberRank: number;
};

/**
 * A user is Pro in a workspace if the workspace is comped, or it has an active
 * subscription and the user falls within the paid seat count.
 */
export function isProInWorkspace(p: ProInputs): boolean {
  if (p.compPro) return true;
  if (!subscriptionIsActive(p.subscriptionStatus)) return false;
  return p.memberRank >= 0 && p.memberRank < Math.max(1, p.seatCount);
}
