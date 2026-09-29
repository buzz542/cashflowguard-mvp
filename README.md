# GuardConstruct

**Improve cash flow on every job.**

UK-first commercial risk review for small construction firms and freelancers (under 25 employees).
Upload or photograph a contract and get a plain-English action plan of the payment traps that most often delay or reduce payment under English law.

> This is commercial risk identification only. It is **not legal advice**.

Docs: [`docs/CLAUDE.md`](docs/CLAUDE.md) (architecture) · [`docs/PRD.md`](docs/PRD.md) (product as built)

## Stack

Next.js 14 (App Router) on Vercel · Supabase (Postgres + Auth) · Stripe Checkout, Customer Portal and webhooks · Anthropic Claude.

## Local development

Requires Node 22.

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Checks:

```bash
npm run typecheck
npm test            # unit tests (vitest)
npm run test:db     # applies supabase/migrations to a throwaway local Postgres and runs RLS tests
npm run build
```

`test:db` needs Postgres 15+ binaries installed locally (it does not need Supabase).

## Setting up a new environment

1. **Supabase**: create a project (pick a UK/EU region and note it in the privacy policy). Run each file in
   `supabase/migrations/` in order in the SQL editor. Under Authentication:
   - keep **Confirm email** on
   - set the Site URL to your domain and add `https://<domain>/auth/callback` to the redirect allow-list
   - configure custom SMTP for auth emails (Supabase's built-in sender is rate-limited and not for production)
   - so links work when opened on a different device from the one that asked for them, change the
     **Confirm signup** and **Magic link** email templates' link to
     `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`
2. **Stripe**: create the Pro price (`STRIPE_PRICE_ID`). Add a webhook endpoint at
   `https://<domain>/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.*`, and put its
   signing secret in `STRIPE_WEBHOOK_SECRET`. Turn on the Customer Portal (Settings → Billing → Customer portal).
3. **Resend** (deadline reminder emails): verify your sending domain (SPF/DKIM DNS records), create an API key,
   and set `RESEND_API_KEY` and `EMAIL_FROM`.
4. **Vercel**: set every variable in `.env.example`, including a long random `CRON_SECRET`. `vercel.json` schedules
   `/api/cron/reminders` daily at 06:00 UTC (7am in summer, 6am in winter UK time); Vercel sends `CRON_SECRET` with
   each call. `NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing them.

### Complimentary Pro

To give an account Pro without a subscription (founder, testers), run in the Supabase SQL editor:

```sql
update public.workspaces set comp_pro = true
where owner_id = (select id from auth.users where email = 'someone@example.com') and personal;
```

## Cost

README previously quoted "typically 5p–20p per review". Not re-measured; photo uploads add one Claude vision call per page.
