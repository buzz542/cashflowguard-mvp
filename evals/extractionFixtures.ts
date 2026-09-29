import type { Expected } from "../src/lib/evalScore";

/**
 * Hand-written excerpts in the style of UK subcontracts (not copied from any
 * published form). Expand with real, anonymised contracts before trusting the numbers.
 */
export const FIXTURES: Array<{ name: string; role: string; text: string; expected: Expected[] }> = [
  {
    name: "JCT-style payment + variation",
    role: "Subcontractor",
    text: `4.2 Interim Applications. The Sub-Contractor shall submit an application for interim payment on the 25th day of each month.
4.3 The Contractor shall issue a payment notice not later than 5 days after each due date.
5.1 Variations. The Sub-Contractor shall notify the Contractor in writing within 7 days of receipt of any instruction which it considers to be a variation, failing which it shall not be entitled to any adjustment of the Sub-Contract Sum.`,
    expected: [
      { kinds: ["payment_application"], trigger: "monthly", day_of_month: 25 },
      { kinds: ["variation_notice"], trigger: "event", offset_days: 7, direction: "after" }
    ]
  },
  {
    name: "Delay notice with a vague early warning",
    role: "Subcontractor",
    text: `2.3 If the Sub-Contractor becomes aware that the progress of the Sub-Contract Works is or is likely to be delayed, it shall give written notice to the Contractor within 14 days of becoming so aware, stating the cause and expected effect.
2.4 The Sub-Contractor shall give an early warning promptly of any matter which could increase the price.`,
    expected: [{ kinds: ["eot_notice"], trigger: "event", offset_days: 14, direction: "after" }]
  },
  {
    name: "Retention release and final account",
    role: "Subcontractor",
    text: `6.1 Retention shall be deducted at 5%. The first moiety of retention shall be released to the Sub-Contractor within 14 days after practical completion of the Main Contract Works.
6.4 The Sub-Contractor shall submit its final account, with all supporting documents, within 60 days of practical completion of the Sub-Contract Works.`,
    expected: [
      { kinds: ["retention_release"], trigger: "event", offset_days: 14, direction: "after" },
      { kinds: ["final_account"], trigger: "event", offset_days: 60, direction: "after" }
    ]
  },
  {
    name: "Fixed-date submission",
    role: "Subcontractor",
    text: `3.1 The Sub-Contractor shall submit its detailed programme to the Contractor by 15 January 2027 for acceptance.
3.2 Completion of the Sub-Contract Works shall be 31 March 2027.`,
    expected: [{ kinds: ["other"], trigger: "fixed_date", fixed_date: "2027-01-15" }]
  },
  {
    name: "Working-day claim notice, weeks converted",
    role: "Subcontractor",
    text: `8.2 Any claim for loss and expense shall be notified by the Sub-Contractor within 2 weeks of the event giving rise to it. The Sub-Contractor shall provide full particulars within 10 working days after such notification.`,
    expected: [
      { kinds: ["other", "eot_notice"], trigger: "event", offset_days: 14, direction: "after" },
      { kinds: ["other", "eot_notice"], trigger: "event", offset_days: 10, direction: "after" }
    ]
  }
];
