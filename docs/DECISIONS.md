# Decisions

Product and technical choices made without asking, per the instruction to pick the simplest option that fits the existing code. Each can be revisited; most are a single setting.

## Carried over from earlier phases

| Decision | Choice | Where to change it |
|---|---|---|
| Free allowance | 1 check per person (canonical email), lifetime; 3 per IP per day; 200 per day service-wide | `FREE_REVIEW_LIMIT`, `FREE_REVIEWS_PER_IP_PER_DAY`, `FREE_REVIEWS_GLOBAL_PER_DAY` |
| Free photo reading | Only while a free check remains; 12 pages/day per person, 2000/day service-wide | `FREE_OCR_PAGES_PER_DAY`, `FREE_OCR_PAGES_GLOBAL_PER_DAY` |
| Pro "unlimited" | Unlimited with a 20/hour fair-use cap, disclosed in Terms | `REVIEWS_PER_USER_PER_HOUR` |
| `past_due` subscriptions | Not Pro (only `active`/`trialing`), as before | `lib/entitlements.ts` |
| Promo codes at checkout | Left on, as before | `api/checkout` |
| Auth provider | Supabase (email + password or magic link, email confirmation required) | n/a |
| Full contract text | Never stored; review result + job context only | n/a |
| History retention | Until the user deletes it or their account | n/a |
| Model | Unchanged `claude-sonnet-4-5` for review, OCR and extraction | `ANTHROPIC_MODEL`, `ANTHROPIC_EXTRACTION_MODEL` |
| Reminders | Pro-only, email only, 2 working days before + on the day | `REMINDERS_PRO_ONLY`, `LEAD_WORKING_DAYS` |
| "Days" not specified in contract | Use the earlier of calendar/working-day dates | `lib/deadlines.ts` |
| Team pricing | Per seat at the Pro price unless `STRIPE_TEAM_PRICE_ID` is set; max 25 people/team; 3 teams per owner | `STRIPE_TEAM_PRICE_ID`, `MAX_TEAM_SEATS`, `MAX_OWNED_TEAMS` |
| Seat allocation | Owner first, then by join date | `lib/entitlements.ts` |
| Removed member's reviews | Stay with the team | n/a |
| Invites | Bound to the invited email, single use, 7 days | `INVITE_TTL_DAYS` |
| Final verdict wording | "Suggested next step", never "sign"/"don't sign" | `lib/reviewPrompt.ts` |
| Node version | 22 (20 is end-of-life) | `package.json` engines |

## This pass

| Decision | Choice | Why |
|---|---|---|
| Linting | `next lint` with `next/core-web-vitals` (ESLint 8, matching Next 14) | Standard for this stack; no config existed |
