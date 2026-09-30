# GuardConstruct: Product Requirements (as built)

Originally reconstructed from the code at commit `6d38a3a` (29 Sep 2026), then kept in step with the roadmap build (Phases 0 to 3, see §9). This describes what the product **does**, not what it should do. Where the code, marketing copy and legal pages disagree, or a product decision was never made, it's listed under Open Questions. Where a default had to be shipped to build a feature, that's marked **Default shipped** and is still your call.

## 1. One-liner

AI reviewer of UK construction contracts for subcontractors and freelancers with fewer than 25 staff. Upload or photograph a contract, get a plain-English action plan flagging payment and cash-flow traps (retention, pay-when-paid, notice deadlines, LADs, set-off) against JCT/NEC-style patterns under English law, with copy-paste wording to send back before signing. Free first check, then £19/month Pro.

Positioned as "commercial risk identification", explicitly **not legal advice**.

## 2. Target user

From the landing page, metadata and system prompt:
- UK subcontractors, sub-subcontractors, direct-to-client trades and freelance/labour-only workers
- Firms "under 25 staff"
- Trades named in copy: framing, groundworks, electrical, plumbing, joinery, M&E, fit-out, civils
- Usually the smaller party to the contract; the model is told to read "defensively for the user"
- Likely on a phone on site (camera capture, "phone-readable" output, "site-speak")

## 3. Core user journey (live)

1. Land on marketing page → "Check a document: free first pass".
2. Create account: email + password or emailed login link. Must tick "I agree to the Terms … not legal advice". Must confirm email before the first check.
3. If the account predates the current Terms version, a **Terms gate** ("Before you check a contract / Not legal advice") must be accepted before any check. Enforced server-side too.
4. **About this job** form, all required:
   - Trade / work (free text)
   - Package size: Under £10k / £10k–£50k / £50k–£250k / £250k+
   - Duration: <1 month / 1–3 / 3–6 / 6+ months
   - Role: Subcontractor / Sub-subcontractor / Direct to client / Freelance / labour-only
5. **Add the document**: take photo(s), upload PDF/Word/text (multiple files), or paste text. Extracted text lands in an editable textarea. A failed page no longer discards the pages that worked.
6. **Run check** → loading screen "Building your action plan…".
7. **Your action plan** rendered with "Not legal advice" and "Automated AI summary" banners.
8. Review saved to the account ("Past contract reviews"), visible on any device.
9. **Deadlines found in this contract** (Pro): the notice/payment deadlines the AI picked out, each with its clause quote and how the date is worked out. The user names the job and picks the site's nation (for bank holidays), then confirms the ones they want reminders for, enters event dates where a deadline runs from an event, or sets a date themselves.
10. Reminder emails arrive two working days before and on the day. All tracked deadlines are listed under **Deadlines**.
11. If the free allowance is used, next attempt shows "Upgrade to Pro" modal → Stripe Checkout.

## 4. Feature inventory

### 4.1 Live (implemented and reachable in the UI)

| Feature | Details | Where |
|---|---|---|
| Marketing page | Hero, "How it works", Features, Pricing, Roadmap, footer with Privacy/Terms/Report a problem. Free-tier line reads the real server limit | `page.tsx`, `HomeClient.tsx` |
| Accounts | Supabase Auth: email + password or magic link, email confirmation required, session cookies | `AuthModal.tsx`, `auth/callback`, `middleware.ts` |
| Terms acceptance | Checkbox at signup + Terms gate before first check; stored per user with version; server refuses checks without it | `AuthModal.tsx`, `api/me/terms`, `api/review` |
| Job context capture | 4 fields; used to weight severity and estimate exposure, never echoed back | `HomeClient.tsx`, `api/review` |
| Photo upload + OCR | Camera capture on mobile, Claude vision transcription. JPEG/PNG/GIF/WebP. HEIC rejected. Requires login; capped per day for non-Pro users | `api/extract`, `lib/ocrAllowance.ts` |
| PDF upload | Text-layer PDFs parsed directly. Scanned PDFs (no text) are read by Claude, up to 20 pages, counted against the free photo-page cap | `api/extract`, `lib/transcribe.ts` |
| Word upload | `.docx` only; `.doc` rejected | `api/extract` |
| Paste / text upload | `.txt`, `.md`, `.csv` or paste into textarea | `HomeClient.tsx`, `api/extract` |
| Multi-page | Up to 12 files per selection, more batches allowed; text concatenated. Max 120k chars total | `HomeClient.tsx`, `api/review` |
| AI contract review | Claude, fixed system prompt (Construction Act 1996, JCT, NEC3/4, FIDIC, bespoke). Model from `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`. Result streams in as it is written, with a progress state | `api/review`, `lib/reviewStream.ts`, `lib/reviewPrompt.ts` |
| Risk watchlist | Pay-when-paid/pay-if-paid; payment cycles; retention; payment/pay-less notice traps; set-off; flow-down; LADs; variation/EOT notice conditions precedent; suspension rights; indemnity/insurance; "final and conclusive"; other conditions precedent | `lib/reviewPrompt.ts` |
| Action plan output | 🚨 / 👀 / ✅ → 🔴 RED and 🟠 AMBER detailed risks → Your key actions → Suggested next step: Nothing major stood out / Raise these points before signing / Get professional advice before signing (never "sign" or "don't sign") | `lib/reviewPrompt.ts`, `ReviewResults.tsx` |
| Copy suggested wording | One-click copy per suggested-wording block | `ReviewResults.tsx` |
| AI / legal disclaimers | Red "Not legal advice" + amber "Automated AI summary" on every result, including history | `HomeClient.tsx`, `ReviewResults.tsx` |
| **Cloud review history** | Stored in Postgres per workspace. List (100 newest), open, delete. Stores result + job context only; **not** the contract (the 120-char preview was dropped in Phase 4) | `api/reviews*`, `supabase/migrations/0001` |
| Import device history | One-time import of reviews saved in the browser by the pre-accounts version (same email only), then removed from the device. Old password hashes are wiped from localStorage on load | `api/reviews/import`, `HomeClient.tsx` |
| Profile menu | Name, email, Free/Pro badge, free checks left, last 5 reviews, Manage billing (workspace owner with a Stripe customer), Log out | `ProfileMenu.tsx` |
| Free tier | Per person (canonical email: aliases share one), plus per-IP daily cap and a service-wide daily cap. Atomic in Postgres. Refunded if the AI call fails | `api/review`, `claim_free_review()` |
| Pro subscription | £19/month via Stripe Checkout, promo codes allowed, one Stripe customer per workspace | `api/checkout` |
| Subscription sync | Stripe webhook mirrors subscription status/seats/period into Postgres; return-from-checkout also syncs | `api/stripe/webhook`, `api/checkout/verify`, `lib/stripeSync.ts` |
| Manage billing / cancel | Stripe Customer Portal for the signed-in owner's workspace | `api/portal` |
| Complimentary Pro | `workspaces.comp_pro` flag, set by hand in SQL (founder, testers) | README |
| **Deadline extraction** | Second Claude call (structured output) alongside the review; up to 25 deadlines with kind, clause, quote, and trigger (fixed date / monthly / N days before or after an event). Anything without a clear period is dropped, never guessed. Pro-only by default | `lib/extractObligations.ts`, `lib/obligations.ts` |
| **Job tracking** | Name + nation (England & Wales / Scotland / NI) per tracked contract | `api/jobs`, `DeadlinesPanel.tsx` |
| **Confirm / dismiss / date** | Nothing is scheduled until the user confirms it. Event-based deadlines need the event date; any date can be overridden by hand | `api/obligations/[id]` |
| **Date rules** | Calendar or working days as the contract says; if it doesn't say, the earlier of the two. Working days skip weekends and that nation's bank holidays (gov.uk feed, rule-based fallback). Monthly deadlines roll forward | `lib/deadlines.ts`, `lib/bankHolidays.ts` |
| **Reminder emails** | Daily cron; one digest per person; 2 working days before + on the day; late confirmations get the heads-up immediately. Stops if Pro lapses, the deadline is dismissed, or the user opts out | `api/cron/reminders`, `claim_due_reminders()` |
| **Deadlines view** | All confirmed deadlines: needs a date / coming up / passed | `DeadlinesView` |
| **Reminder opt-out** | Toggle in the account menu | `api/me/preferences` |
| **Team workspaces** | Create a team (up to 3 owned), switch between Personal and teams. Reviews, jobs and deadlines in a team are shared with its members | `api/workspaces*`, `TeamPanel.tsx`, `ProfileMenu.tsx` |
| **Invites** | Owner invites by email; single-use link, 7 days, only for that address; hashed token; emailed if Resend is set up, otherwise the link is shown once to copy. Revoke; accept on login | `api/workspaces/[id]/invites*`, `api/invites/accept`, `accept_workspace_invite()` |
| **Per-seat Pro** | Owner buys N seats (≥ current members, ≤ 25) in Stripe Checkout; seats go owner first, then by join date; members without a seat use their own free check. Seat changes via the Stripe portal | `api/checkout`, `lib/entitlements.ts` |
| **Members** | List with seat status; owner removes, members leave. Leaving re-routes their deadlines and reminders | `api/workspaces/[id]/members*` |
| **Deadline assignees** | In a team, each confirmed deadline's reminders can go to a chosen teammate (else whoever started tracking, else the owner) | `api/obligations/[id]`, `pickRecipient()` |
| Privacy Policy, Terms of Use | Updated for accounts, stored history, Supabase, fair use, free-tier rules | `privacy/`, `terms/` |
| Report a problem | `mailto:` link to founder | footer |
| Rate limiting | Free tier in Postgres (durable). Per-user hourly speed bumps in memory | `lib/rateLimit.ts`, `claim_free_review()` |
| Security headers / CSP | Set globally; CSP allows the Supabase origin | `next.config.mjs` |

### 4.2 Roadmap only (advertised, no code)

| Item | What exists today | What's missing |
|---|---|---|
| ~~Cloud history across devices~~ | **Live since Phase 1** | n/a |
| ~~Team seats for small firms~~ | **Live since Phase 3** | n/a |
| ~~Notice deadline reminders~~ | **Live since Phase 2** | n/a |

### 4.3 Implied or claimed but not really there

| Claim | Reality |
|---|---|
| "Built around JCT / NEC style patterns" | True only at the prompt level. No form detection, clause library or JCT/NEC-specific logic. FIDIC is also in the prompt but not in marketing |
| "Unlimited checks" (Pro) | 20 reviews per user per hour (configurable). Now disclosed as fair use in the Terms |
| ~~"Trusted by early UK contractors"~~ | Relabelled "Built for UK trades": the strip lists trades, not customers |

## 5. Pricing and entitlements (as built)

| | Free | Pro |
|---|---|---|
| Price | £0 | £19/month (hardcoded in UI; actual charge is whatever `STRIPE_PRICE_ID` is) |
| Checks | `FREE_REVIEW_LIMIT` per person, lifetime (default **1**). Also max `FREE_REVIEWS_PER_IP_PER_DAY` (default 3) and service-wide `FREE_REVIEWS_GLOBAL_PER_DAY` (default 200) | Unlimited, fair use (`REVIEWS_PER_USER_PER_HOUR`, default 20) |
| Upload/OCR | Requires login. Photo pages (AI calls) only while a free check remains, max `FREE_OCR_PAGES_PER_DAY` (default 12) per day, service-wide `FREE_OCR_PAGES_GLOBAL_PER_DAY` (2000); PDF/Word/text unlimited | 30 files/user/hour |
| History | Account, any device | Same |
| Deadline reminders | Upsell panel only (`REMINDERS_PRO_ONLY=true`, default) | Yes |
| Teams | Can create and join teams; no Pro seat until the owner buys seats | Per seat: `STRIPE_TEAM_PRICE_ID` if set, else the Pro price × seats (i.e. £19/seat by default) |
| Billing mgmt | n/a | Stripe portal (workspace owner) |

The server decides Pro from Postgres (`subscriptions` kept in sync by the Stripe webhook, or `workspaces.comp_pro`), for the signed-in user's workspace. Nothing the browser sends can make someone Pro.

## 6. Non-functional (as built)

- **Platform**: Next.js 14 on Vercel, **Node 22** (Node 20 is end-of-life and current Supabase/vitest need 22). Routes: `/`, `/privacy`, `/terms`, `/auth/callback`.
- **Data storage**: Supabase Postgres (accounts, workspaces, subscriptions, review results, free-tier ledger). Uploaded files and full contract text are processed in memory and not stored. Contract text is sent to Anthropic.
- **Third parties**: Anthropic (AI), Stripe (billing), Supabase (auth + database), Resend (reminder email), Vercel (hosting + cron), gov.uk bank holidays feed.
- **Cost controls**: free checks capped per person, per IP and globally per day. At the README's 5p to 20p per review, the default global cap bounds free spend at roughly £10 to £40/day (not re-measured). **Pro reviews now make two Claude calls** (review + deadline extraction), each sending the full contract, so Pro input cost per check roughly doubles. `ANTHROPIC_EXTRACTION_MODEL` can point extraction at a cheaper model if quality holds.
- **Latency**: streamed to the browser; up to 8k output tokens, 60s function limit; SDK timeout 55s with one retry. Photos are read 3 at a time in parallel; deadline extraction runs alongside the review. Timing per check is logged and stored (`reviews.duration_ms`). Old vs new model timings: `npm run eval:timing` (needs an API key).
- **Tests**: unit tests (vitest), SQL/RLS tests against a local Postgres (`npm run test:db`), typecheck, build.
- **Accessibility / i18n**: `en-GB`, British English throughout. No specific a11y work beyond semantic buttons.

## 7. Known issues that affect the product (details in `docs/CLAUDE.md`)

- ~~Anyone can open any subscriber's Stripe billing portal by email.~~ Fixed (Phase 0, then authenticated portal in Phase 1).
- ~~Anyone can claim Pro on the review endpoint by sending a subscriber's email.~~ Fixed in Phase 1.
- ~~Founder email logs in with any password client-side.~~ Fixed in Phase 0.
- ~~Cancelled Pro users still see "Pro".~~ Fixed in Phase 1 (webhook + server-side entitlement).
- ~~Free tier resettable by clearing the browser or using a new email alias.~~ Fixed in Phase 1.
- ~~Photos/PDFs over ~4.5MB fail on Vercel.~~ Fixed: photos are shrunk in the browser to 1568px JPEG before upload (a 23MB photo uploads as ~1MB); other files over 4MB get a clear message before upload.
- ~~Scanned PDFs are rejected instead of OCR'd.~~ Fixed: read by Claude (up to 20 pages per file).
- ~~Refresh/back mid-flow loses the check in progress.~~ Fixed: the draft is kept per tab and restored; a reload mid-check goes to past reviews instead of re-running.
- Email confirmation is now required before the first free check: more friction between landing and first value.
- **Deadline extraction has not been measured yet.** The harness exists (`npm run eval:extraction`: 5 hand-written JCT/NEC-style excerpts, pass bar 80% recall / 70% precision) but needs `ANTHROPIC_API_KEY` to run, and real anonymised contracts to be meaningful.
- ~~Team owners can't transfer ownership or delete a team.~~ Fixed: "Make owner" and "Delete this team" in team settings (both need the team plan cancelled first).
- A removed member's reviews stay with the team (work product belongs to the firm). Confirm that's what customers expect.
- Reminders run once a day (06:00 UTC); a deadline confirmed after that run gets its first email the next morning.
- Deadlines that run from an event (instruction, completion) have no date, and so no reminder, until the user enters the event date.

## 8. Open questions

**Free tier and pricing**
1. What is the intended free allowance? **Default shipped:** 1 per person (canonical email), lifetime, plus 3/IP/day and 200/day service-wide. All env-configurable.
2. Should photo reading (an AI call per page) count against the free allowance? **Default shipped (Phase 4):** only while a free check remains, 12 pages/day per person, 2000/day service-wide. PDF/Word/text uncapped.
3. Is "Unlimited" for Pro meant literally? **Default shipped:** unlimited with a fair-use cap of 20/hour, disclosed in the Terms.
4. VAT, annual plan, trial. **Default shipped:** unchanged: £19/month, no VAT added (live price is tax-exclusive but checkout has no automatic tax), no annual plan, no trial. **Needs you** if you are VAT-registered (see DECISIONS.md).
5. Promo codes at checkout. **Default shipped:** left on.
6. Should `past_due` (card retry in progress) keep Pro? **Default shipped:** no, only `active`/`trialing` (same as before).

**Accounts and identity**
7. ~~Local-only auth~~: replaced by Supabase Auth in Phase 1.
8. Founder Pro. **Default shipped:** `comp_pro` flag set by SQL. The any-password login was removed in Phase 0.
9. ~~Email verification~~: back via Supabase confirmation (needs custom SMTP in production).

**Scope of the review**
10. FIDIC. **Default shipped:** stays in the prompt as a recognised form; not marketed.
11. Jurisdiction. **Default shipped:** reviews are framed on English law (unchanged prompt); deadline reminders handle bank holidays for all three UK nations.
12. "Under 25 staff". **Default shipped:** positioning only; team size capped at 25 people.
13. Main contractors / clients. **Default shipped:** not a target; role dropdown unchanged.
14. Scanned PDFs. **Default shipped:** read by Claude, max 20 pages per file, each page counted like a photo page.

**Roadmap definitions**
15. Cloud history retention. **Default shipped:** kept until the user deletes it or asks for account deletion; full contract text never stored. Is a fixed retention period (e.g. 24 months inactive) wanted?
16. Team pricing. **Default shipped:** per seat, same price as Pro unless `STRIPE_TEAM_PRICE_ID` is set; cap 25 people per team (`MAX_TEAM_SEATS`). Is a flat team price or a volume discount wanted?
17. Notice reminders. **Default shipped:** Pro-only (`REMINDERS_PRO_ONLY`), email only, notices = payment applications, payment/pay less notices, variation, EOT/delay/early warning/claim notices, retention release, final account, other time-limited notices. SMS or calendar export not built.
18. Reminder timing. **Default shipped:** 2 working days before + on the day. Is that the right lead time for a site team?
19. When the contract doesn't say calendar or working days. **Default shipped:** use whichever date is earlier, and say so in the UI and email. Alternative would be to follow the Construction Act's counting rules, which is closer to a legal interpretation.

**Brand, domain and claims**
20. Canonical domain. **Resolved:** `https://www.guardconstruct.com` (the apex 308-redirects to www). Set as `NEXT_PUBLIC_APP_URL` in Vercel production; Supabase Site URL and Stripe return/webhook URLs use www too.
21. "Trusted by early UK contractors". **Default shipped:** relabelled "Built for UK trades" (no unverified endorsement claim under ASA/CAP rules). Put a real claim back once you have customers who agree to it.
22. Model. **Resolved (owner, 2026-09-30):** Claude Sonnet 5.5 (`claude-sonnet-5-5`) via `ANTHROPIC_MODEL`. Thinking off by default to match how Sonnet 4.5 ran; `ANTHROPIC_THINKING=adaptive` turns it on.

**Legal/compliance**
23. Anthropic data retention statement. **Needs you:** check your Anthropic commercial terms/DPA and add one sentence to the privacy policy.
24. Liability cap. **Needs you:** a qualified review; unchanged.
25. Data controller identity. **Needs you:** legal name and address for the privacy policy.
26. Supabase region. **Needs you:** name it in the privacy policy once the project exists.

## 9. Build log

| Phase | What shipped |
|---|---|
| 0 | Removed unauthenticated `/api/portal` and the founder any-password login |
| 1 | Supabase accounts + email confirmation; Terms acceptance gate; workspace/subscription/review schema with RLS; Stripe webhook sync; authenticated checkout/portal; cloud history + device import; durable free-tier ledger with alias and IP protection; login required for uploads; legal pages updated; Node 22; tests |
| 2 | Deadline extraction (structured output), jobs, confirm/dismiss/date flow, UK bank-holiday-aware date maths, daily reminder digest via Resend + Vercel Cron, deadlines view, opt-out; Terms (new §5B, re-acceptance required) and Privacy updated |
| 3 | Team workspaces, email invites (hashed single-use tokens), per-seat Stripe checkout with adjustable quantity, seat allocation by join order, member removal with reminder re-routing, deadline assignees, workspace switcher; Terms §4A, Privacy updated; mobile account-menu overflow fixed |
| 4 | Photo-OCR cap for non-Pro users (durable, per person + service-wide, refunds on failure); stopped storing the contract preview (column dropped); review ends with a "Suggested next step" instead of a sign/don't-sign verdict |
| 5 | ESLint + `npm run check`; photos shrunk in the browser (Vercel body limit); scanned PDFs read by Claude; check survives refresh; lists rendered in results; self-service account deletion; team transfer/deletion; "Built for UK trades"; extraction eval harness; production-domain return URLs; all open questions defaulted in DECISIONS.md |
