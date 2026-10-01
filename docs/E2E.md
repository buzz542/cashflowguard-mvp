# End-to-end test runbook

Run this on a Vercel **preview** deployment of `claude/guardconstruct-repo-docs-2rzuoq` (or locally with `npm run build && npm start`) with **test-mode** Stripe keys. Live Stripe keys are refused outside production (`lib/stripe.ts`), so a preview can't charge a real card.

It hasn't been run yet: this environment has no Supabase project, Stripe test keys, Resend key or Anthropic key. Everything below is also covered by unit and SQL tests (`npm run check`), but those use fakes.

## Setup (once)

1. **Supabase** (UK/EU region): run `supabase/migrations/0001` to `0008` in order in the SQL editor. Auth → URL configuration: Site URL = the preview URL (or `http://localhost:3000`), redirect URL `<site>/auth/callback`.
2. **Stripe test mode** (toggle "Test mode" in the dashboard):
   - Product "GuardConstruct Pro", recurring price £19/month GBP → `STRIPE_PRICE_ID`.
   - Developers → API keys → secret key `sk_test_…` → `STRIPE_SECRET_KEY`.
   - Webhook endpoint `<site>/api/stripe/webhook`, events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.payment_failed` → signing secret into `STRIPE_WEBHOOK_SECRET`. (Preview URLs sit behind Vercel's login: add a Protection Bypass for Automation, or test locally with `stripe listen --forward-to localhost:3000/api/stripe/webhook`.)
   - Settings → Billing → Customer portal: allow cancel and payment-method updates.
3. **Env vars** (Vercel → Preview, or `.env.local`): everything in `.env.example`, including `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM` (verified domain), `ADMIN_EMAIL`, `CRON_SECRET`, `IP_HASH_SALT`, `NEXT_PUBLIC_APP_URL` = the site.

## Steps and what proves each

| # | Do | Expect | Check |
|---|---|---|---|
| 1 | Sign up with a new email, confirm via the email link, accept Terms | Signed in, "Plan: Free · 1 free check left" | `select * from profiles where email = '…'` has `terms_version = '2026-09-30.1'` |
| 2 | Run a free check (paste text, or upload `evals/fixtures/sample-subcontract.pdf`) | Text streams in within seconds; "Not legal advice" box; "Need help getting paid?" card | Vercel logs: one `check_timing` line; `reviews.duration_ms` set |
| 3 | Start a second check | Upgrade screen (402 `upgrade_required`); nothing charged to the API | `free_allowance.used = 1` |
| 4 | Upgrade → Stripe Checkout, card `4242 4242 4242 4242`, any future date, any CVC | Back in the app as Pro | `subscriptions.status = 'active'`; Stripe → webhook deliveries all 200 |
| 5 | Sign out, sign in on another browser/device | Past reviews list shows the check | Opening it shows the full result |
| 6 | Deadlines → add project "Test job" → add date: Payment due, date = **today + 7 days** | Item shows "Due" | `obligations` row `source='manual'`; `reminders` rows for lead7 (today), lead2, due, overdue |
| 7 | Trigger the reminder job: `curl -H "Authorization: Bearer $CRON_SECRET" <site>/api/cron/reminders` | JSON `{"sent":1,…}`; email arrives with "Reminders are a prompt only…" and an unsubscribe link | Run it again: `{"claimed":0}` (no duplicate) |
| 8 | Add another date with date = **yesterday** | Shows "Overdue" in red with **Need help getting paid?** | Next cron run sends one "Overdue:" email |
| 9 | Click **Need help getting paid?**, fill it in, tick consent, Send | "We haven't passed them to anyone yet" | `help_requests` row with `consent = true`, `emailed_at` set; email to `ADMIN_EMAIL` with reply-to the user |
| 10 | Account menu → Manage billing → Cancel subscription (in test mode, then in the Stripe dashboard use "Cancel immediately" to skip the wait) | After the `customer.subscription.deleted` webhook, the app shows Free | `subscriptions.status = 'canceled'`; a new check hits the upgrade screen; the next cron run skips that user's reminders (`status = 'skipped'`) |
| 11 | Optional: Stripe test clock or card `4000 0000 0000 0341` to fail a renewal | `invoice.payment_failed` → status `past_due` → Free | webhook 200, `subscriptions.status = 'past_due'` |
| 12 | Unsubscribe link from step 7's email → Unsubscribe | "You're unsubscribed" | `profiles.reminder_emails = false` |

Timings: with `ANTHROPIC_API_KEY` set locally, `npm run eval:timing` writes `evals/timing-results.md` (old vs new model on photo, PDF and Word). Copy the table into `docs/DECISIONS.md` § 1.
