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

export const KIND_LABELS: Record<ObligationKind, string> = {
  payment_application: "Payment application",
  payment_notice: "Payment notice",
  pay_less_notice: "Pay less notice",
  variation_notice: "Variation notice",
  eot_notice: "Extension of time / delay notice",
  retention_release: "Retention release",
  final_account: "Final account",
  other: "Other notice"
};

export function kindLabel(k: string): string {
  return KIND_LABELS[k as ObligationKind] ?? "Notice";
}
