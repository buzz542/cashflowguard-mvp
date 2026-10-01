/** Client-safe (no zod): obligation kinds and their labels. */
export const OBLIGATION_KINDS = [
  "payment_application",
  "payment_notice",
  "pay_less_notice",
  "variation_notice",
  "eot_notice",
  "retention_release",
  "final_account",
  "other"
] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

/** Kinds a user can pick when adding their own dated item (extraction never produces payment_due). */
export const MANUAL_KINDS = [
  "payment_application",
  "payment_due",
  "pay_less_notice",
  "payment_notice",
  "variation_notice",
  "eot_notice",
  "retention_release",
  "final_account",
  "other"
] as const;
export type ManualKind = (typeof MANUAL_KINDS)[number];

export const KIND_LABELS: Record<ObligationKind | ManualKind, string> = {
  payment_application: "Payment application",
  payment_notice: "Payment notice",
  pay_less_notice: "Pay less notice",
  variation_notice: "Variation notice",
  eot_notice: "Extension of time / delay notice",
  retention_release: "Retention release",
  final_account: "Final account",
  payment_due: "Payment due",
  other: "Other notice"
};

export function kindLabel(k: string): string {
  return KIND_LABELS[k as ObligationKind | ManualKind] ?? "Notice";
}
