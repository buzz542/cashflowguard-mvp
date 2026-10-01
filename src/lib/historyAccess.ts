/**
 * Cloud history is a Pro feature. Everyone's checks are saved, but a non-Pro user can
 * list and open only their most recent one. Older ones are kept, not deleted, so a lapsed
 * Pro subscriber who resubscribes gets them back; deleting the account removes them all.
 */
export const PRO_HISTORY_LIMIT = 100;

export function historyLimit(isPro: boolean): number {
  return isPro ? PRO_HISTORY_LIMIT : 1;
}

/** Can this user open review `id`? `latestOwnId` is the newest review they wrote in the workspace. */
export function canOpenReview(isPro: boolean, id: string, latestOwnId: string | null): boolean {
  return isPro || id === latestOwnId;
}
