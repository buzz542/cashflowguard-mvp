export type Me = {
  accountsEnabled: boolean;
  user: null | { id: string; email: string; name: string; emailConfirmed: boolean };
  termsAccepted?: boolean;
  termsVersion?: string;
  workspace?: { id: string; name: string; personal: boolean; role: "owner" | "member" };
  workspaces?: Array<{ id: string; name: string; personal: boolean; role: "owner" | "member" }>;
  isPro?: boolean;
  subscription?: { status: string | null; currentPeriodEnd: string | null; seatCount: number } | null;
  canManageBilling?: boolean;
  free?: { limit: number; used: number; remaining: number };
  canTrackDeadlines?: boolean;
  reminderEmails?: boolean;
};

export type ObligationRow = {
  id: string;
  workspace_id: string;
  review_id: string;
  job_id: string | null;
  kind: string;
  title: string;
  clause_ref: string | null;
  source_quote: string;
  trigger: "fixed_date" | "monthly" | "event";
  fixed_date: string | null;
  day_of_month: number | null;
  event_description: string | null;
  offset_days: number | null;
  direction: "after" | "before" | null;
  day_basis: "calendar" | "working" | "unspecified";
  status: "suggested" | "confirmed" | "dismissed";
  event_date: string | null;
  due_date: string | null;
  due_basis: "fixed" | "monthly" | "calendar" | "working" | "manual" | null;
  assignee_id: string | null;
  created_at: string;
};

export type TeamMember = { userId: string; email: string; name: string; role: "owner" | "member"; joinedAt: string; hasSeat: boolean };
export type TeamInvite = { id: string; email: string; created_at: string; expires_at: string };
export type TeamInfo = {
  workspace: { id: string; name: string; personal: boolean; role: "owner" | "member" };
  members: TeamMember[];
  invites: TeamInvite[];
  seats: { paid: number; used: number; max: number; subscriptionActive: boolean; compPro: boolean };
};

export type JobRow = { id: string; name: string; jurisdiction: string; created_at?: string };

export type ReviewSummary = {
  id: string;
  created_at: string;
  trade: string | null;
  role: string | null;
  project_size: string | null;
  duration: string | null;
  author_id: string | null;
};

export type ApiError = { error?: string; code?: string };
