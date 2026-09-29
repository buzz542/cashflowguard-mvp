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
    ProfileMenu.tsx           Avatar dropdown
    ReviewResults.tsx         Markdown renderer + copy buttons on suggested wording
    auth/callback/route.ts    Magic link / email confirmation landing (PKCE code or token_hash)
    privacy/, terms/          Legal pages
    api/
      me/route.ts             GET current user, workspace, Pro, free allowance, terms status
      me/terms/route.ts       POST accept current Terms version
      review/route.ts         POST run a check (auth, terms, free-tier claim, Claude, save)
      extract/route.ts        POST one file → text (auth required)
      reviews/route.ts        GET history list (RLS read)
      reviews/[id]/route.ts   GET one (RLS read) / DELETE (author or workspace owner)
      reviews/import/route.ts POST one-time import of pre-accounts localStorage history
      checkout/route.ts       POST Stripe Checkout for the active workspace (owner only)
      checkout/verify/route.ts GET sync subscription on return from Checkout
      portal/route.ts         POST Stripe Customer Portal (owner only)
      stripe/webhook/route.ts POST Stripe → Postgres subscription sync
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
supabase/
  migrations/0001_accounts_history.sql
  tests/auth_shim.sql         Fake auth schema + roles for local Postgres
  tests/0001_rls_test.sql
scripts/test-db.sh
tests/*.test.ts
```

## Data model and access rules

Tables (`supabase/migrations/0001_accounts_history.sql`):
- `profiles` (1:1 `auth.users`): email, name, `terms_version`, `terms_accepted_at`
- `workspaces`: every user gets a **personal** workspace on signup (trigger `handle_new_user`). `comp_pro` = complimentary Pro
- `workspace_members`: `(workspace_id, user_id, role owner|member)`
- `subscriptions`: one row per workspace, mirrored from Stripe
- `reviews`: per workspace; result markdown + context + 120-char preview. **Never the full contract text**
- `free_allowance` (canonical email → used), `free_review_events` (hashed IP log, purged after 2 days)
- Functions: `is_workspace_member(ws)` (for RLS), `claim_free_review(...)`, `refund_free_review(event)`

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

`/api/review` calls `claim_free_review(canonical_email, ip_hash, limits…)` **before** calling Claude. It serialises on an advisory lock and checks, in order: per-person lifetime limit, per-IP 24h limit, service-wide daily cap. Returns `ok | user_limit | ip_limit | global_limit`. On AI failure or empty output the route calls `refund_free_review`. `canonicalEmail()` lowercases, strips `+tags`, and for Gmail drops dots.

## Uploads

`/api/extract` (auth required, 30 files/user/hour in-memory), one file per request:

| Input | Handling |
|---|---|
| `text/*`, `.txt/.md/.csv` | UTF-8 decode |
| `.docx` | `mammoth.extractRawText` |
| `.doc` | Rejected |
| `.pdf` | `pdf-parse` via `pdf-parse/lib/pdf-parse.js`. < 40 chars → rejected as a scan |
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

1. **Vercel request body limit (~4.5MB)**: large photos/PDFs fail before reaching `/api/extract`. The client reports a 413 clearly now, but the fix (client-side image downscaling or direct-to-storage upload) isn't built.
2. **Timeouts**: review is non-streaming with `max_tokens: 8000` under `maxDuration: 60`. Long contracts could exceed it.
3. **Scanned PDFs** rejected rather than OCR'd.
4. **In-memory rate limits** (per-user hourly, extract) reset on cold start. The free tier itself is durable.
5. **No routing for app steps**: refresh loses a check in progress.
6. **Markdown renderer** doesn't render lists/links/tables as such.
7. **Account deletion** is by email request (privacy policy). No self-service button.
8. **Supabase auth emails** need custom SMTP in production; the default sender is heavily rate-limited.
9. Git history shows many wholesale "Restore page" overwrites of the old `page.tsx`. Keep edits to `HomeClient.tsx` surgical.

## Note on this file's location

Claude Code auto-loads `CLAUDE.md` from the repo root (and `.claude/`), not from `docs/`. Move or symlink it to the root if you want it picked up automatically.
