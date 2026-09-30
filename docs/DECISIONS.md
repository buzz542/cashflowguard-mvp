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
| Model | `claude-sonnet-5-5` for review, OCR and extraction (was `claude-sonnet-4-5`) | `ANTHROPIC_MODEL`, `ANTHROPIC_EXTRACTION_MODEL` |
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
| Large uploads | Shrink photos in the browser to 1568px long edge, JPEG (quality 0.85, falling back to 0.7/0.5); refuse other files over 4MB up front | Claude downsizes to ~1568px anyway; avoids new storage infrastructure for direct uploads |
| Scanned PDFs | Send to Claude as a PDF document block; max 20 pages; each page counts as a photo page for free users; cut-off transcriptions are refused | Reuses the photo path and caps; 20 pages fits one 16k-token response |
| Refresh during a check | Keep the draft (job details, text, page names, open review id) in sessionStorage; a reload mid-check goes to Past reviews with a note rather than re-running | No routing rewrite needed; per-tab, cleared on tab close and logout; avoids a second paid run |
| Result rendering | Tiny in-house parser (headings, bullet/numbered lists, bold, rules, suggested wording); no links or HTML | Model output is untrusted; no markdown library needed for this subset |
| Account deletion | Self-service, typed "DELETE" confirmation. Blocked while a subscription is active or while owning a team with other members. Team work the user created stays with the team (author cleared). Free-tier ledger kept | Avoids billing a deleted account and wiping teammates' data; ledger stops delete-and-rejoin for free checks (stated in the privacy policy) |
| Team transfer / deletion | Owner can hand the team to an existing member, or delete it (typing the team name). Both refused while the team plan is active | The card on file is the old owner's; cancel-then-rebuy is the simplest correct billing handover |
| Social-proof strip | "Trusted by early UK contractors" → "Built for UK trades" | No evidence of customers behind the claim; ASA/CAP treat implied endorsements strictly |
| Extraction eval | 5 hand-written UK-subcontract-style fixtures incl. a vague clause that must be dropped and an other-party obligation that must be ignored; greedy one-to-one matching on kind + trigger + period; bar 80% recall / 70% precision; skipped without an API key | Smallest useful harness; real contracts should replace the fixtures |
| Production return URLs | `NEXT_PUBLIC_APP_URL`, else in production `https://$VERCEL_PROJECT_PRODUCTION_URL` (www.guardconstruct.com is set explicitly as NEXT_PUBLIC_APP_URL, since the apex redirects to www), else the request origin | Live checkouts were returning customers to per-deployment URLs behind Vercel's login wall |
| VAT | No change: £19 flat, no automatic tax at checkout | Changing tax handling needs your VAT status; if registered, turn on Stripe Tax and add `automatic_tax: { enabled: true }` to checkout |
| FIDIC | Kept in the prompt, not marketed | Unchanged behaviour |
| Jurisdiction | Reviews framed on English law; reminders support E&W, Scotland, NI bank holidays | Unchanged review behaviour; reminders already built per nation |
| "Under 25 staff" | Positioning only; teams capped at 25 people | Matches existing cap |
| Main contractors / clients | Not a target; role list unchanged | Unchanged behaviour |
| Review timeouts | Keep `maxDuration` 60s, non-streaming | Raising it depends on the Vercel plan/fluid compute setting; revisit if logs show timeouts |
| In-memory rate limits | Kept as speed bumps; every path that costs money (free checks, free photo pages) is capped in Postgres | Durable limits already cover the cost risk |
| Email confirmation before first check | Kept | Needed for the free-tier abuse protection |
| Reminder cadence | One cron run per day at 06:00 UTC | Works on every Vercel plan |
| Pro input cost | Review + extraction both send the full contract (~2× input tokens) | Extraction must see the contract; `ANTHROPIC_EXTRACTION_MODEL` can point at a cheaper model after an eval |

## Go-live setup (2026-09-30)

| Decision | Choice | Why |
|---|---|---|
| Canonical origin | `https://www.guardconstruct.com` | Apex 308-redirects to www; Stripe won't follow redirects on webhooks, so every URL points at www |
| Stripe webhook | Live endpoint `we_1ULOp7K1Ki2AAD9wGiESOPiV` → `/api/stripe/webhook`, API `2025-02-24.acacia`, events: checkout.session.completed, customer.subscription.created/updated/deleted/paused/resumed | Matches what `syncSubscription` handles; cancellation and payment failure revoke Pro via subscription.updated/deleted |
| Billing portal | Cancel at period end, quantity changes on the £19 price with prorations, return URL + privacy/terms links set | Team seats are managed as subscription quantity |
| Production env set by Claude | `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `IP_HASH_SALT` (sensitive, random), `NEXT_PUBLIC_APP_URL` | Everything that didn't need an account I don't have |
| Merge to main | Held until Supabase env vars exist | Merging without them breaks sign-in, history and the free-tier ledger in production |

## Round 3: shippable MVP (2026-09-30)

### 1. Speed

| Decision | Choice | Why |
|---|---|---|
| Model id | `claude-sonnet-5-5`, checked against platform.claude.com/docs models overview on 2026-09-30 (docs.claude.com redirects there). Not yet called live: no API key in this environment | Owner's brief |
| Thinking | Off (`thinking: {type: "between_tools"}`), effort `high` | Sonnet 4.5 ran with no thinking, so this is like-for-like and the fastest setting. `{type: "disabled"}` is a 400 on Sonnet 5.5. `ANTHROPIC_THINKING=adaptive` turns it on if quality needs it |
| Params for other models | None sent (no thinking/effort) | Sonnet 4.5 rejects `effort`; lets the timing eval run the old model unchanged |
| Streaming | `/api/review` returns NDJSON (`delta` lines, then `done` or `error`). Pre-flight failures (auth, limits, terms) stay normal JSON errors with status codes | Simplest format a `fetch` reader can parse; keeps existing client error handling |
| Browser disconnect mid-stream | Server carries on and saves the result | The user paid for it; it appears in history |
| Prompt caching | `cache_control: ephemeral` on the review and extraction system prompts | Identical on every call; Sonnet 5.5 caches prefixes from 512 tokens |
| Refusal fallback | `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) on the review call only. A refusal with no fallback counts as no result: free check refunded | Recommended default for Sonnet 5.5; review is the paid output. Extraction/OCR stay on the plain API (failure there is already handled) |
| Parallel steps | Photos read 3 at a time (order kept); extraction already ran alongside the review | Independent calls; 3 keeps under Anthropic and Vercel concurrency comfortably |
| Timing log | One `check_timing` JSON log line per check (ttft, review, extraction, total ms, tokens, cache reads) and `reviews.duration_ms` (migration 0006, additive) | "Log processing time per check" |
| Timing comparison | Harness `npm run eval:timing` on committed fixtures (`evals/fixtures/sample-subcontract.{jpg,pdf,docx}`), writes `evals/timing-results.md` | **Not run: no `ANTHROPIC_API_KEY` here.** Table below is to be filled from that file |

Before/after timings (one-page sample, photo / PDF / Word):

| Input | claude-sonnet-4-5 | claude-sonnet-5-5 |
|---|---|---|
| Photo | not measured (no API key) | not measured (no API key) |
| PDF | not measured (no API key) | not measured (no API key) |
| Word | not measured (no API key) | not measured (no API key) |

### 2. Cloud history

| Decision | Choice | Why |
|---|---|---|
| "Free users keep their latest result only" | Free users can list and open only their own latest check. Older checks are **hidden, not deleted** | Deleting would wipe a lapsed Pro subscriber's paid history the moment they run a free check, and the brief says stop before deleting user data. Account deletion still removes everything |
| Where it's enforced | API (`/api/reviews`, `/api/reviews/[id]` → 402 `upgrade_required`), checked against the review's own workspace | RLS still limits rows to the user's workspace. A free user reading their own hidden rows straight from Supabase with their own token is possible and accepted: it's their data |
| "Delete removes any stored file" | Nothing to remove: uploaded files are read in memory and discarded; only the result is stored. Delete cascades to that check's deadlines and reminders | As built since Phase 1 |

### 3. Project tracking + reminders

| Decision | Choice | Why |
|---|---|---|
| "Projects" | The existing `jobs` table; can now be created without a contract check | No new concept to maintain |
| Dated items | The existing `obligations` table with `source = 'manual'`, no `review_id`, `trigger = fixed_date` (or monthly). New kind `payment_due` for manual items only; extraction's kind list is unchanged (no prompt change) | Reuses scheduling, reminders, RLS |
| Statuses | Stored: `confirmed` / `done` (+ existing `suggested`/`dismissed`). Shown: overdue (date passed), due (today to 7 days out), upcoming (later or no date), done | "Due" window matches the first reminder |
| Monthly items | "Done for this month" records `done_through` and moves to next month; they don't end | A monthly application is never finished |
| Reminder days | Calendar days: 7 and 2 before, on the day, overdue the day after (or today if added late). Heads-ups already gone are dropped; if both have gone, one goes today | Owner's brief. Calendar, not working days: it's a prompt, and the contract date rules are shown on the item |
| No duplicate emails | Claiming stays `FOR UPDATE SKIP LOCKED`; rescheduling never re-adds a kind already sent in the current cycle (on/after due − 7 days) | Edits can't resend. SQL test covers a same-day re-run |
| Overdue for monthly items | The cron now sends first, then rolls monthly items forward, so the overdue notice for the one just missed goes out | Order change only |
| Old 'lead' reminders | Still valid in the DB and treated as a heads-up | Additive migration; nothing rewritten |
| Unsubscribe | Link in every reminder email, signed with HMAC (`UNSUBSCRIBE_SECRET`, else `CRON_SECRET`). GET shows a confirm button; POST unsubscribes (also RFC 8058 one-click via `List-Unsubscribe-Post`) | Mail scanners open GET links; a one-step GET would unsubscribe people by accident |
| Email provider | Resend (already in the code) | Brief: use the existing provider |
| Notice | "Reminders are a prompt only. Check your contract for exact dates." on the tracking view, the contract's deadlines panel and every email | Owner's wording |

### 4. "Need help getting paid?"

| Decision | Choice | Why |
|---|---|---|
| Who sees it | Any signed-in user (free or Pro): on overdue tracked items (Pro) and on every check result | Recovery is where people have already shown they'll pay; no reason to gate the lead |
| Storage | New `help_requests` table (migration 0008, additive). Users can read their own; only the server writes. Deleted with the account | Brief: save to the database |
| Consent | Checkbox with the owner's exact wording, must be ticked (checked server-side and by a DB constraint); the wording is stored with each request | Proof of what they agreed to |
| Owner notification | Email to `ADMIN_EMAIL` via Resend, reply-to set to the user's contact email. If email isn't configured, the request is still saved and an error is logged | Never lose a lead |
| Amount | Stored in pence (`bigint`), £0.01 to £1bn | No float rounding |
| Spam limit | 5 requests per user per day (in-memory) | Signed-in only already limits abuse |
| Third parties | None. No partner integration, no automatic forwarding (out of scope, see IDEAS.md) | Brief |

### 5. Payments and limits

| Decision | Choice | Why |
|---|---|---|
| Free check + limits | Already built (Phase 1, 4): one per canonical email for life, 3 per IP per day, 200 per day service-wide, all in Postgres; 20 checks/hour per user; photo pages capped separately. Kept | Meets the brief |
| `invoice.payment_failed` | Handled: re-fetch the subscription (status is then `past_due`), which isn't Pro | Same code path as the other events; nothing trusted from the event body |
| Grace period on a failed payment | None: Pro stops as soon as Stripe marks the subscription `past_due` and comes back automatically when a retry succeeds (`customer.subscription.updated`) | Simplest; matches the existing `active`/`trialing`-only rule |
| Test mode | Code refuses `sk_live_`/`rk_live_` keys except on the Vercel production deployment (or `NODE_ENV=production` + `STRIPE_ALLOW_LIVE=true` off Vercel) | Brief: test mode only while testing; stops a preview charging a real card |
| Upgrade screen copy | Lists what Pro includes; only says "You've used your free check" when that's true | It opened from history and tracking too |
| Live Stripe account | Not touched in this round. Earlier today (before this brief) a live webhook endpoint `we_1ULOp7K1Ki2AAD9wGiESOPiV` was created without `invoice.payment_failed`; add that event in the dashboard | Brief: never touch live keys |

### 6. Site copy

| Decision | Choice | Why |
|---|---|---|
| Team seats "planned" | Code kept, switched off with `TEAMS_ENABLED` (default false): UI hidden, team creation/invites/accept return 404 | They were built earlier; the brief says show them as planned. A flag is reversible, deleting code isn't |
| Pricing | Free: one check, latest result saved, help requests. Pro: unlimited (fair use 20/hour), full history, project tracking, reminder schedule | Lists only what's built |
| Terms version | Bumped to `2026-09-30.1`: everyone re-accepts | The referral-fee disclosure is a material change |
| Referral wording | Terms §5C and Privacy say a partner "may pay us a referral fee", only with the consent tick, passed on by hand. No promise about partners' own fees | Accurate without committing to things we don't control |
