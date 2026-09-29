export type Me = {
  accountsEnabled: boolean;
  user: null | { id: string; email: string; name: string; emailConfirmed: boolean };
  termsAccepted?: boolean;
  termsVersion?: string;
  workspace?: { id: string; name: string; personal: boolean; role: "owner" | "member" };
  isPro?: boolean;
  subscription?: { status: string | null; currentPeriodEnd: string | null; seatCount: number } | null;
  canManageBilling?: boolean;
  free?: { limit: number; used: number; remaining: number };
};

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
