# CLAUDE.md: GuardConstruct codebase guide

Architecture reference for people and agents working in this repo. First written from a full read of commit `6d38a3a`, then updated as each roadmap phase landed (see `docs/PRD.md` §9). Describes what the code does now.

## What this is

A Next.js app that takes a construction contract (photo, PDF, .docx, .txt or pasted text), sends the text to Claude with a fixed system prompt, and renders a markdown "Contract Action Plan" for small UK subcontractors. Accounts, history and billing live in Supabase + Stripe. £19/mo Pro via Stripe.

The repo is called `cashflowguard-mvp`; the product and `package.json` name are `guardconstruct`.

## Stack

| Layer | What | Notes |
|---|---|---|
| Framework | Next.js **14.2.25**, App Router | `src/middleware.ts` refreshes the Supabase session |
| UI | React 18, Tailwind 3.4 | No component library. `prose` classes on legal pages do nothing (no typography plugin) |
| Language | TypeScript 5, `strict: true` | Alias `@/*` → `src/*` |
| Runtime | **Node 22** (`engines`) | Node 20 is EOL; supabase-js and vitest require 22 |
| AI | `@anthropic-ai/sdk` ^0.129 | Model from `ANTHROPIC_MODEL`, default `claude-sonnet-4-5`. Non-streaming |
| Auth + DB | Supabase (`@supabase/supabase-js`, `@supabase/ssr`) | Cookie sessions; Postgres with RLS |
| Payments | `stripe` ^17 (API `2025-02-24.acacia`) | Checkout, Customer Portal, webhook |
| File parsing | `pdf-parse`, `mammoth` | `serverComponentsExternalPackages` |
| Tests | vitest (unit), `scripts/test-db.sh` (SQL/RLS on local Postgres) | |

## Commands

```
npm run dev
npm run typecheck
npm test            # vitest, tests/*.test.ts
npm run test:db     # migrations + supabase/tests/*_test.sql on a throwaway Postgres
npm run build
npm run lint
npm run check            # all of the above
npm run eval:extraction  # real API, needs ANTHROPIC_API_KEY
```

Run all four before pushing. `test:db` needs local Postgres 15+ binaries (not Supabase). Under root it uses `su postgres`.

## Environment variables

See `.env.example` for the full list with comments. Key ones:

| Var | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server Supabase clients, middleware, CSP. Baked in at build |
| `SUPABASE_SERVICE_ROLE_KEY` | `getSupabaseAdmin()` only. Bypasses RLS |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Review + photo OCR |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Billing |
| `IP_HASH_SALT` | Hashing IPs for the free-tier ledger |
| `RESEND_API_KEY`, `EMAIL_FROM` | Reminder emails (`lib/email.ts`) |
| `CRON_SECRET` | Bearer token Vercel Cron sends to `/api/cron/reminders` |
| `REMINDERS_PRO_ONLY`, `ANTHROPIC_EXTRACTION_MODEL` | Deadline extraction + reminders |
| `STRIPE_TEAM_PRICE_ID`, `MAX_TEAM_SEATS`, `MAX_OWNED_TEAMS`, `INVITE_TTL_DAYS` | Teams |
| `FREE_REVIEW_LIMIT`, `FREE_REVIEWS_PER_IP_PER_DAY`, `FREE_REVIEWS_GLOBAL_PER_DAY`, `REVIEWS_PER_USER_PER_HOUR` | `src/lib/config.ts` |
| `NEXT_PUBLIC_APP_URL` | Redirect URLs (preferred over the request `Origin`) |

## File map

```
src/
  middleware.ts               Supabase session refresh (skips static, webhook, cron)
  app/
    page.tsx                  Server wrapper: passes config (free limit) into HomeClient
    HomeClient.tsx            The app: marketing, flows, history, banners
    AuthModal.tsx             Signup/login (password or magic link) + TermsGate
    DeadlinesPanel.tsx        Extracted deadlines under a review + the all-deadlines view (+ assignee select)
    TeamPanel.tsx             Create team / members + seats / invites / buy seats
    ProfileMenu.tsx           Avatar dropdown (+ reminder email toggle)
    ReviewResults.tsx         Renders lib/reviewMarkdown blocks + copy buttons on suggested wording
    auth/callback/route.ts    Magic link / email confirmation landing (PKCE code or token_hash)
    privacy/, terms/          Legal pages
    api/
      me/route.ts             GET current user, workspace, Pro, free allowance, terms status
      me/terms/route.ts       POST accept current Terms version
      me/delete/route.ts      POST delete own account (confirm: "DELETE")
      review/route.ts         POST run a check (auth, terms, free-tier claim, Claude, save)
      extract/route.ts        POST one file → text (auth required)
      reviews/route.ts        GET history list (RLS read)
      reviews/[id]/route.ts   GET one (RLS read) / DELETE (author or workspace owner)
      reviews/import/route.ts POST one-time import of pre-accounts localStorage history
      checkout/route.ts       POST Stripe Checkout for the active workspace (owner only)
      checkout/verify/route.ts GET sync subscription on return from Checkout
      portal/route.ts         POST Stripe Customer Portal (owner only)
      stripe/webhook/route.ts POST Stripe → Postgres subscription sync
      jobs/route.ts           POST start tracking a reviewed contract as a job
      obligations/[id]/route.ts PATCH confirm/dismiss, event date, manual date → reschedule
      deadlines/route.ts      GET confirmed deadlines + jobs for the workspace
      me/preferences/route.ts PATCH reminder email opt-out
      cron/reminders/route.ts GET daily sender (CRON_SECRET); also purges used/expired invites
      workspaces/route.ts     POST create team workspace
      workspaces/active/route.ts POST switch active workspace (gc_ws cookie)
      workspaces/[id]/members[/userId] GET members+seats+invites / DELETE remove or leave
      workspaces/[id]/invites[/inviteId] POST invite / DELETE revoke
      invites/accept/route.ts POST accept invite token
  lib/
    config.ts                 Env-driven settings, TERMS_VERSION, PROMPT_VERSION, appOrigin()
    session.ts                requireUser(), loadWorkspaceContext(), jsonError()
    supabase/server.ts        Per-request user client, service-role admin client
    supabase/browser.ts       Browser client (null if unconfigured)
    entitlements.ts           isProInWorkspace(), subscriptionIsActive()
    stripeSync.ts             snapshotSubscription(), shouldReplaceSubscription(), syncSubscription()
    stripe.ts, anthropic.ts   Client singletons
    reviewPrompt.ts           THE review system prompt
    canonicalEmail.ts         Alias-collapsing for the free-tier ledger
    ipHash.ts                 Salted IP hash
    reviewImport.ts           Validation for device-history import
    rateLimit.ts              In-memory per-instance limiter (speed bumps only)
    clientTypes.ts            Shapes returned to the browser
    obligations.ts            Extraction prompt, wire schema, sanitizeObligations() (server)
    obligationKinds.ts        Kind labels (client-safe, no zod)
    extractObligations.ts     The structured-output Claude call
    deadlines.ts              Date maths: working days, event offsets, monthly, reminder slots, ukToday
    bankHolidays.ts           gov.uk feed + rule-based UK bank holidays per nation
    obligationDue.ts          computeDue(), describeTiming()
    reminderScheduler.ts      rescheduleObligation(), remindersAllowed()
    reminderEmail.ts          Digest email (HTML-escaped)
    email.ts                  Resend HTTP call
    membership.ts             roleIn(), UUID_RE
    invites.ts                Invite token generation/hashing, accept error messages
supabase/
  migrations/0001_accounts_history.sql
  migrations/0002_deadline_reminders.sql
  migrations/0003_team_seats.sql
  migrations/0004_ocr_cap_and_minimisation.sql
  migrations/0005_team_transfer.sql
  tests/auth_shim.sql         Fake auth schema + roles for local Postgres
  tests/0001_rls_test.sql, tests/0002_reminders_test.sql, tests/0003_teams_test.sql, tests/0004_ocr_test.sql, tests/0005_account_deletion_test.sql, tests/0006_team_transfer_test.sql
vercel.json                   Daily cron for /api/cron/reminders
scripts/test-db.sh
tests/*.test.ts
```

## Data model and access rules

Tables (`supabase/migrations/0001_accounts_history.sql`):
- `profiles` (1:1 `auth.users`): email, name, `terms_version`, `terms_accepted_at`
- `workspaces`: every user gets a **personal** workspace on signup (trigger `handle_new_user`). `comp_pro` = complimentary Pro
- `workspace_members`: `(workspace_id, user_id, role owner|member)`
- `subscriptions`: one row per workspace, mirrored from Stripe
- `reviews`: per workspace; result markdown + context. **Never the contract text** (the preview column was dropped in 0004)
- `free_allowance` (canonical email → used), `free_review_events` (hashed IP log, purged after 2 days)
- `jobs` (workspace, name, jurisdiction), `reviews.job_id`, `reviews.extraction_status`
- `obligations` (per review; trigger shape enforced by a CHECK; `status` suggested/confirmed/dismissed; `due_date` + `due_basis`)
- `reminders` (obligation × user × send date × lead/due; status pending/sending/sent/skipped/failed)
- `profiles.reminder_emails` (opt-out)
- `workspace_invites` (email, **sha256 of the token only**, expiry, accepted_at); `obligations.assignee_id`; FK `workspace_members.user_id → profiles.id` (lets the API embed member profiles)
- Trigger: personal workspaces can never gain a second member
- Functions: `is_workspace_member(ws)`, `is_workspace_owner(ws)`, `shares_workspace_with(user)` (for RLS), `claim_free_review(...)`, `refund_free_review(event)`, `claim_due_reminders(today, limit)`, `accept_workspace_invite(hash, user, email, max)`

**The rule:** the browser/user JWT can only `SELECT`, and only rows RLS allows (own profile, workspaces you belong to and their members, subscriptions and reviews). Every write goes through an API route with the service-role client *after* that route has checked the session and membership. Don't add user-facing write grants or policies; add an API route.

Reads that the user is entitled to go through `createSupabaseServerClient()` (RLS as defence in depth). `getSupabaseAdmin()` is for writes and for reads that need data the user can't see directly (e.g. the free-tier ledger).

## Auth

- Supabase Auth, cookie sessions via `@supabase/ssr`. Middleware refreshes tokens; route handlers call `requireUser()`, which calls `auth.getUser()` (verified with Supabase, not just decoded) and requires `email_confirmed_at`.
- Signup sends `terms_version` in user metadata; the trigger records acceptance. Users whose `terms_version` ≠ `TERMS_VERSION` see the Terms gate and `/api/review` returns `403 terms_required`. **Bump `TERMS_VERSION` when the Terms/Privacy change materially.**
- `/auth/callback` handles `?code=` (PKCE, same browser only) and `?token_hash=&type=` (any device, needs the email template change in README).
- On load, the client deletes legacy `gc_user*` localStorage keys (old password hashes).

## Payments

- **Checkout** (`/api/checkout`): owner of the active workspace only. Creates the Stripe customer once per workspace (stored in `subscriptions`), then a subscription Checkout with `client_reference_id` and `subscription_data.metadata.workspace_id`.
- **Webhook** (`/api/stripe/webhook`): verifies signature, then re-fetches the subscription and upserts it (`syncSubscription`). Event order doesn't matter. `shouldReplaceSubscription` stops a cancelled duplicate from overwriting a live subscription.
- **Verify** (`/api/checkout/verify`): runs the same sync on return from Checkout, only for a workspace the caller belongs to, so Pro shows immediately.
- **Portal** (`/api/portal`): customer id from our DB for the signed-in owner's workspace. Never from the request body.
- **Pro** = `comp_pro` OR (subscription `active`/`trialing` AND user's seat rank < `seat_count`). `past_due` is not Pro.
- Price text (£19) is hardcoded in the UI; the charge is whatever `STRIPE_PRICE_ID` is.

## Free tier

Photo uploads: `claimPhotoPage()` (`lib/ocrAllowance.ts`) lets non-Pro users have photos read only while a free check remains, capped per UK day per person and service-wide via `claim_ocr_page()`; refunded if the AI call fails. PDF/Word/text parsing costs nothing and isn't capped.


`/api/review` calls `claim_free_review(canonical_email, ip_hash, limits…)` **before** calling Claude. It serialises on an advisory lock and checks, in order: per-person lifetime limit, per-IP 24h limit, service-wide daily cap. Returns `ok | user_limit | ip_limit | global_limit`. On AI failure or empty output the route calls `refund_free_review`. `canonicalEmail()` lowercases, strips `+tags`, and for Gmail drops dots.

## Deadline reminders

Flow: `/api/review` runs `extractObligations()` **in parallel** with the review (only for users allowed reminders), because the full contract text only exists in memory for that request. Results are saved as `obligations` with `status = 'suggested'` and `reviews.extraction_status` records ok/failed/not_run. Extraction failing never fails the review.

- **Extraction is untrusted.** The SDK's `messages.parse()` throws on any schema mismatch, so the output format is a permissive wire schema (strings, not enums) and `sanitizeObligations()` validates each item on its own, dropping bad ones. Never "repair" a missing period or date.
- **Nothing is scheduled until the user confirms.** Confirming requires a job (`POST /api/jobs` links the review and its obligations). Event-triggered deadlines have no due date until the user enters the event date.
- **Date rules** (`deadlines.ts`): `calendar`/`working` as the contract says; `unspecified` → the earlier of the two. Working days skip weekends + the job's nation's bank holidays (`bankHolidays.ts`: gov.uk feed cached a day, rule-based fallback and future years). `manual` dates always win.
- **Reminders**: `rescheduleObligation()` recomputes the due date and replaces pending `reminders` rows (lead = 2 working days before, and on the day; a lead date already past becomes today). Call it after *any* change to an obligation.
- **Sender**: `/api/cron/reminders` (Vercel Cron, daily 06:00 UTC, `CRON_SECRET`). Rolls monthly deadlines forward, then `claim_due_reminders()` atomically skips invalid rows (unconfirmed, past, opted out) and claims due ones (`FOR UPDATE SKIP LOCKED`; stale `sending` retried after 30 min, max 3, never after the due date). Re-checks Pro, sends one digest per user, marks sent.
- Emails escape all contract-derived text (`reminderEmail.ts`). Keep it that way.
- Bump `EXTRACTION_VERSION` when the extraction prompt/schema changes (stored per obligation).

## Teams

- Every user has a **personal** workspace; they can own up to `MAX_OWNED_TEAMS` team workspaces and belong to others. The active one is the `gc_ws` httpOnly cookie; `loadWorkspaceContext()` honours it only if the user is a member, else falls back to personal. All workspace-scoped routes (reviews, checkout, portal, deadlines) use the active workspace.
- **Invites**: owner only, team workspaces only, capped at `MAX_TEAM_SEATS` including pending. Only the hash of the token is stored; the link is returned once. `accept_workspace_invite()` locks the invite and checks: single use, expiry, **signed-in email must equal the invited email**, not personal, capacity. The client keeps `?invite=` in sessionStorage until the user is signed in.
- **Seats**: `memberRanks()` orders owner first then join date; `isProInWorkspace()` gives Pro to ranks below `seat_count`. Team checkout uses `STRIPE_TEAM_PRICE_ID || STRIPE_PRICE_ID` with `adjustable_quantity` (min = current members). Seat changes happen in the Stripe portal and arrive via the webhook.
- **Leaving/removal**: owner can't leave. `reassignAfterMemberLeft()` clears their assignments and reschedules every deadline whose reminders were going to them. Their reviews stay with the team.
- **Reminder recipient**: `pickRecipient([assignee, job creator, owner], members)`.

## Uploads

`/api/extract` (auth required, 30 files/user/hour in-memory), one file per request:

| Input | Handling |
|---|---|
| `text/*`, `.txt/.md/.csv` | UTF-8 decode |
| `.docx` | `mammoth.extractRawText` |
| `.doc` | Rejected |
| `.pdf` | `pdf-parse` via `pdf-parse/lib/pdf-parse.js`. < 40 chars → treated as a scan: sent to Claude as a document block (`lib/transcribe.ts`), max 20 pages, pages claimed against the free photo cap |
| `image/*` (jpeg/png/gif/webp) | Claude vision transcription. < 20 chars → rejected |
| HEIC/HEIF | Rejected |

Files are processed in memory and never persisted. The client continues past a failed file and lists failures.

## The review prompt

`src/lib/reviewPrompt.ts`. `ReviewResults.tsx` depends on its output shape (`**Suggested wording:**` followed by `>` lines). If you change the prompt, bump `PROMPT_VERSION` (stored on each review) and check the copy buttons still work.

## Conventions

- British English in UI and prompt.
- Every AI output surface carries a "not legal advice / automated AI summary" label. Don't remove them.
- API routes: `export const dynamic = "force-dynamic"` and `runtime = "nodejs"` (removing `force-dynamic` has broken the Vercel build before).
- Keep the `pdf-parse/lib/pdf-parse.js` import path.
- Return generic error strings plus a machine `code` (`jsonError`); log details server-side, never contract text.
- Don't put anything security-relevant in the client: it can't grant Pro, pick a Stripe customer, or skip the free-tier ledger.

## Known gaps (still open)

1. ~~**Vercel request body limit**~~ Fixed: `lib/uploadPrep.ts` shrinks photos in the browser; non-image files over 4MB are refused client-side with a clear message.
2. **Timeouts**: review is non-streaming with `max_tokens: 8000` under `maxDuration: 60`. Long contracts could exceed it.
3. ~~**Scanned PDFs** rejected~~ Fixed: transcribed by Claude.
4. **In-memory rate limits** (per-user hourly, extract) reset on cold start. The free tier itself is durable.
5. ~~**Refresh loses a check in progress**~~ Fixed: `lib/draft.ts` keeps the draft in sessionStorage (cleared on logout and when the tab closes).
6. ~~**Markdown renderer** doesn't render lists~~ Fixed: `lib/reviewMarkdown.ts` parses headings, lists, bold, rules and suggested wording (no links/HTML, by design).
7. ~~**Account deletion** by email only~~ Fixed: account menu → Delete my account (`api/me/delete`). Blocked while the user has an active subscription or owns a team with other members; team deadlines are re-routed first; the free-tier ledger is kept.
8. **Supabase auth emails** need custom SMTP in production; the default sender is heavily rate-limited.
9. Git history shows many wholesale "Restore page" overwrites of the old `page.tsx`. Keep edits to `HomeClient.tsx` surgical.
10. **Extraction quality not yet measured.** `npm run eval:extraction` (evals/, `lib/evalScore.ts`) runs the fixtures against the real API; needs a key. Add real anonymised contracts to `evals/extractionFixtures.ts`.
11. **Pro reviews cost roughly twice as much in input tokens** (review + extraction both send the full contract).
12. **One cron run a day.** A deadline confirmed after 06:00 UTC gets its first email the next day. The in-app list is always current.
13. ~~**No ownership transfer or team deletion**~~ Fixed: `transfer_workspace()` + `api/workspaces/[id]/transfer`, `DELETE api/workspaces/[id]`; both refuse while a subscription is active.

## Note on this file's location

Claude Code auto-loads `CLAUDE.md` from the repo root (and `.claude/`), not from `docs/`. Move or symlink it to the root if you want it picked up automatically.
