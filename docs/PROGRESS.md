# Progress

## Round 3: shippable MVP (2026-09-30)

Scope from the owner's brief. Each item: implement, test, `npm run check` green, check against PRD.md, commit, tick.

- [x] 1. Speed: Claude Sonnet 5.5 (`claude-sonnet-5-5`) via `ANTHROPIC_MODEL`, per-check timing log, streaming results, parallel steps, prompt caching, progress state. Same checks, same "not legal advice" notice. Done, except the live old-vs-new timings (need an API key: `npm run eval:timing`).
- [x] 2. Cloud history (Pro): saved per user, list + open, free users keep latest result only, delete removes result (and any stored file), strict per-user access.
- [x] 3. Project tracking + notice reminders (Pro): projects with dated items (application, payment due, notice deadline, retention release), pre-filled from the check, statuses upcoming/due/overdue/done, emails at 7 days, 2 days, on the day and overdue, one daily idempotent cron, unsubscribe link, "Reminders are a prompt only" notice.
- [x] 4. "Need help getting paid?": button on overdue items and results, form with consent, saved to DB, emailed to ADMIN_EMAIL, never shared automatically.
- [ ] 5. Payments and limits: one free check per account (server-side, account + IP limits), Stripe Checkout £19/month, portal, webhooks grant and revoke (incl. invoice.payment_failed). Test mode only.
- [ ] 6. Site copy: Roadmap and Pricing match what's built (team seats "planned"), Privacy and Terms cover storage, deletion and referral disclosure.
- [ ] 7. Security pass.
- [ ] 8. End-to-end test.

## Round 2 (earlier today)

| # | Item | Source | Status |
|---|---|---|---|
| 1 | Add linting and a single `npm run check` | Instructions | Done |
| 2 | Large photos fail on Vercel's ~4.5MB body limit | PRD §7 | Done |
| 3 | Scanned PDFs rejected instead of read | PRD §7, §8 | Done |
| 4 | Refresh/back loses the check in progress | PRD §7 | Done |
| 5 | Result renderer doesn't show lists as lists | CLAUDE.md gaps | Done |
| 6 | No self-service account deletion | CLAUDE.md gaps, privacy policy | Done |
| 7 | No team ownership transfer or team deletion | PRD §7 | Done |
| 8 | Unverified "Trusted by early UK contractors" claim | PRD §8 | Done |
| 9 | Extraction quality unmeasured: build the eval harness | PRD §7 | Done (running it needs an API key) |
| 10 | Record all open-question defaults | PRD §8 | Done |
