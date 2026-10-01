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

/** Seats to buy: at least everyone already in the team (min 1), at most the cap. */
export function clampSeats(requested: unknown, memberCount: number, max: number): number {
  const min = Math.max(1, Math.min(memberCount, max));
  const n = typeof requested === "number" && Number.isInteger(requested) ? requested : min;
  return Math.min(max, Math.max(min, n));
}

/** Seat order: owner is 0, then everyone else by join date (earliest first). */
export function memberRanks(ownerId: string, members: Array<{ user_id: string; created_at: string }>): Map<string, number> {
  const ranks = new Map<string, number>([[ownerId, 0]]);
  const others = members
    .filter((m) => m.user_id !== ownerId)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.user_id.localeCompare(b.user_id)));
  others.forEach((m, i) => ranks.set(m.user_id, i + 1));
  return ranks;
}

/**
 * A user is Pro in a workspace if the workspace is comped, or it has an active
 * subscription and the user falls within the paid seat count.
 */
export function isProInWorkspace(p: ProInputs): boolean {
  if (p.compPro) return true;
  if (!subscriptionIsActive(p.subscriptionStatus)) return false;
  return p.memberRank >= 0 && p.memberRank < Math.max(1, p.seatCount);
}
