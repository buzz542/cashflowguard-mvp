# CLAUDE.md: GuardConstruct codebase guide

Written from a full read of the repo at commit `6d38a3a` (29 Sep 2026). Everything below describes what the code does, not what the marketing copy says. Where the two disagree, that's called out.

## What this is

A single-page Next.js app that takes a construction contract (photo, PDF, .docx, .txt or pasted text), sends the text to Claude with a long system prompt, and renders a markdown "Contract Action Plan" aimed at small UK subcontractors. Stripe subscription (£19/mo) unlocks unlimited checks.

The repo is called `cashflowguard-mvp`; the product and `package.json` name are `guardconstruct`.

## Stack

| Layer | What | Notes |
|---|---|---|
| Framework | Next.js **14.2.25**, App Router | No `src/pages`, no middleware |
| UI | React 18, Tailwind 3.4 | No component library. `prose` classes on legal pages do nothing (no `@tailwindcss/typography`) |
| Language | TypeScript 5, `strict: true` | Path alias `@/*` → `src/*` |
| AI | `@anthropic-ai/sdk` **^0.27.0**, model `claude-sonnet-4-5` | Non-streaming `messages.create`. SDK is very old |
| Payments | `stripe` ^17 | Checkout (subscription mode) + Customer Portal. No webhooks |
| File parsing | `pdf-parse` ^1.1.1, `mammoth` ^1.8 | Marked as `serverComponentsExternalPackages` |
| Hosting | Vercel (per README + privacy policy), Node 20 pinned via `engines` | No `vercel.json` |
| Database | **None** | All user state lives in browser `localStorage` |
| Tests / lint / CI | **None** | No test runner, no ESLint config, no GitHub Actions |
| Lockfile | **None committed** | Installs are not reproducible |

## Commands

```
npm install
npm run dev     # next dev
npm run build   # next build
npm run start   # next start
```

There is no `lint` or `test` script.

## Environment variables

From `.env.example`:

| Var | Used by | Actually used? |
|---|---|---|
| `ANTHROPIC_API_KEY` | `/api/review`, `/api/extract` (image OCR) | Yes |
| `STRIPE_SECRET_KEY` | checkout, verify, portal, `lib/stripeSub.ts` | Yes |
| `STRIPE_PRICE_ID` | `/api/checkout` | Yes |
| `NEXT_PUBLIC_APP_URL` | Stripe redirect fallback (after `Origin` header) | Yes, fallback only |
| `AUTH_SECRET` | "used to sign session tokens" | **No. Nothing reads it.** There are no session tokens. |

README only documents `ANTHROPIC_API_KEY`, which is out of date.

## File map

```
src/
  app/
    layout.tsx              Root layout, metadata, lang="en-GB"
    page.tsx                THE app. ~770 lines, one client component: marketing page,
                            auth modal, subscribe modal, context form, upload, results, history
    ProfileMenu.tsx         User/SavedReview types, PRO_ACCOUNTS allowlist, localStorage
                            review helpers, avatar dropdown
    ReviewResults.tsx       Hand-rolled markdown renderer + "Copy" buttons on suggested wording
    privacy/page.tsx        Static privacy policy
    terms/page.tsx          Static terms of use
    globals.css             Tailwind directives + system font
    api/
      review/route.ts       POST: contract text → Claude → action plan markdown. Holds the
                            real SYSTEM_PROMPT inline
      extract/route.ts      POST multipart: one file → plain text (txt/docx/pdf/image-OCR)
      checkout/route.ts     POST: create Stripe Checkout session (subscription)
      checkout/verify/route.ts  GET: check a Checkout session is paid
      portal/route.ts       POST: create Stripe Billing Portal session for an email
  lib/
    stripeSub.ts            emailHasActivePro(email): live Stripe lookup
    rateLimit.ts            In-memory fixed-window limiter + clientIp()
    password.ts             SHA-256(email::password::gc-v1) via Web Crypto
prompts/system-prompt.md    Abridged copy of the prompt. NOT loaded by code (see gaps)
public/logo.svg             GC monogram
next.config.mjs             Security headers/CSP, serverActions body limit, external pkgs
```

## Request flow (happy path)

1. **Marketing view** (`view === "marketing"`) → "Check a document".
2. Not logged in → auth modal (signup). Logged in but `freeUsed && !isPro` → subscribe modal.
3. **Context step**: trade (free text), package size band, duration band, role. All required.
4. **Upload step**: each selected file (max 12 per selection) is POSTed **one at a time** to `/api/extract`; returned text is concatenated with `--- filename ---` separators into a textarea the user can also edit/paste into.
5. **Run check** → POST `/api/review` with `{ context, contractText, email }`.
6. Server rate-limits, looks up Pro status in Stripe by the supplied email, calls Claude, strips any leading "Project context used" block, returns `{ result, isPro }`.
7. Client marks `freeUsed = true` (if not Pro), saves the review to localStorage, renders `ReviewResults`.

The whole app is one URL (`/`). Steps are React state, so browser back/refresh drops you back to the marketing page.

## How auth works today

**There is no server-side auth.** Accounts exist only in the browser.

- Signup/login lives in `page.tsx` `handleAuth`.
- Password is hashed client-side: `SHA-256("<email>::<password>::gc-v1")` (`src/lib/password.ts`). Fast, unsalted beyond the email, deterministic. The file's own comment admits it's not real auth.
- Stored keys:
  - `gc_user` → currently logged-in `User` (`{ email, passwordHash, freeUsed, isPro, name }`)
  - `gc_user_<email>` → per-email "account" record
  - `gc_reviews_<email>` → up to 30 `SavedReview`s (full result markdown + first 120 chars of contract)
- "Account exists" / "No account found" checks only look at **this browser's** localStorage. Same email on another device = brand new account with a fresh free check.
- Legacy plaintext `password` fields are still accepted on login and migrated (`u.password === password`).
- Logout removes `gc_user` only. Per-email record and review history stay on the device.
- Email verification existed once (`api/send-code`) and was deliberately removed in `aac72c7`.

### Founder backdoor

`PRO_ACCOUNTS` in `ProfileMenu.tsx` hardcodes `tobyburrows1@icloud.com`. For that email:
- Login **succeeds with any password** (`if (!ok && !isProEmail(normalised))` at `page.tsx:216`), and succeeds even with no stored account on the device.
- Client always shows Pro.
- The email is shipped in the public JS bundle.

This only affects the client. The server does **not** know about `PRO_ACCOUNTS`; it only trusts Stripe. So on the server the founder account is treated as free tier unless that email has a live Stripe subscription.

## How payments work today

- **Upgrade**: `goPro()` / subscribe modal → POST `/api/checkout` with the user's email → Stripe Checkout (`mode: subscription`, `STRIPE_PRICE_ID`, promo codes allowed, `customer_email` prefilled) → redirect.
- **Return**: `/?checkout=success&session_id=cs_...`. `page.tsx` calls `GET /api/checkout/verify`, which returns `{ paid, customer_email }`. If paid, the client flips `isPro: true` on the local user record and strips the query string.
- **Server Pro check**: `/api/review` calls `emailHasActivePro(email)` which does `customers.list({ email })` then `subscriptions.list` per customer, looking for `active` or `trialing`. This runs on **every review** (2+ Stripe API calls of latency).
- **Manage billing**: Profile menu → Stripe's hosted customer-portal login link (`NEXT_PUBLIC_STRIPE_PORTAL_LOGIN_URL`). Stripe emails the customer a one-time code. Button is hidden if the env var is unset. (Before Phase 0 this was an unauthenticated `/api/portal` route.)
- **No webhooks.** Nothing listens for cancellation, failed payment, etc. The client `isPro` flag is only ever set to `true`, never back to `false`.
- Price (£19/month) is hardcoded in UI copy, not read from Stripe. If the Stripe price changes, the UI lies.

## How uploads work today

`/api/extract` (Node runtime, `maxDuration: 60`), one file per request, rate limit 20/hour/IP:

| Input | Handling |
|---|---|
| `text/*`, `.txt/.md/.csv` | UTF-8 decode, returned as-is |
| `.docx` | `mammoth.extractRawText` |
| `.doc` | Rejected with "save as .docx" message |
| `.pdf` | `pdf-parse` (imported via `pdf-parse/lib/pdf-parse.js` to dodge its test-file bug). If < 40 chars of text, rejected as "likely a scan, photograph each page" |
| `image/*` (jpeg/png/gif/webp) | Sent to Claude vision (`claude-sonnet-4-5`, 8k tokens) with a "transcribe exactly" prompt. < 20 chars → rejected |
| HEIC/HEIF | Rejected with iPhone settings tip |
| Anything else | Rejected |

- Route checks `file.size > 12MB`. Client caps 12 files per picker selection. Review route caps combined text at 120,000 chars.
- Files are processed in memory and not persisted anywhere (matches privacy policy).
- Camera input uses `capture="environment"` for mobile.

## The review prompt

The authoritative prompt is the `SYSTEM_PROMPT` string in `src/app/api/review/route.ts`. It:
- Frames the model as a cash-flow tool, explicitly not a solicitor.
- Names the Construction Act 1996, JCT (incl. subcontracts), NEC3/NEC4, FIDIC and bespoke forms.
- Has a 12-item watchlist: pay-when-paid, payment cycles, retention, payment/pay-less notices, set-off, flow-down, LADs, variation/EOT notice conditions precedent, suspension rights, indemnity/insurance, "final and conclusive" valuation, other conditions precedent.
- Forces a strict output shape: `## Contract Action Plan` (🚨 / 👀 / ✅ sections) → `## Detailed risks` (🔴 RED / 🟠 AMBER blocks with Clause, What it says, Plain English, Why it matters, Potential exposure, What you can do, Suggested wording) → `## Your key actions` → `## Overall call` (SIGN / ASK FIRST / DON'T SIGN YET).

`ReviewResults.tsx` depends on this shape: it detects `**Suggested wording:**` followed by `>` blockquote lines to render copy buttons. If the prompt format changes, copy buttons break silently.

There is no JCT/NEC-specific code: no clause libraries, no form detection, no structured output. It's all prompt.

## Security / hardening that exists

- Security headers + CSP in `next.config.mjs` (`X-Frame-Options: DENY`, nosniff, CSP with Stripe allowed). CSP still allows `'unsafe-inline'` and `'unsafe-eval'` for scripts.
- Per-IP rate limits (in-memory, per serverless instance, so best-effort only):
  - review: 8/hour; plus free tier 3/24h if not Pro
  - extract: 20/hour
  - checkout: 10/min, portal: 10/min, verify: 30/min
- Generic error messages to clients; details go to `console.error`.
- Input validation on email length/format and `cs_` session id prefix.

## Gaps, bugs and half-finished features

Ordered roughly by how much they'd hurt.

### Security

1. ~~**`/api/portal` hands out anyone's billing portal.**~~ **Fixed in Phase 0**: route deleted; "Manage billing" now opens Stripe's hosted portal login (`NEXT_PUBLIC_STRIPE_PORTAL_LOGIN_URL`), which verifies the customer by emailed code. Original note: It takes an email in the body with no auth and returns a Stripe Billing Portal URL for that customer. Anyone who knows a subscriber's email can open their portal and cancel their sub, change their card, or see invoices. This is the most serious issue in the repo.
2. **`/api/review` trusts the email in the body for Pro status.** Send a paying customer's email and you skip the free-tier limit. Costs you AI spend, not customer data, but it's the same root cause: no server-side identity.
3. ~~**Founder login accepts any password**~~ **Fixed in Phase 0**: `PRO_ACCOUNTS` removed. Original note: Client-only impact today, but it's the kind of thing that becomes real the moment someone adds server trust on top of it.
4. **`/api/extract` is completely ungated.** Image OCR is a paid Claude call; the only limit is 20/hour/IP, in-memory. It isn't counted against the free tier at all.
5. Rate limits reset on every cold start and aren't shared across instances, so they're closer to a speed bump than a limit.

### Entitlements / billing correctness

6. **Free tier is enforced three different, inconsistent ways.** UI says "one document check". Client enforces one per email per browser (reset by clearing storage or using a new email). Server enforces 3 per IP per 24h (per instance). Terms say "one free check per account as presented in the product".
7. **Client `isPro` never goes back to false.** A cancelled user still sees "Pro" and "Manage billing"; the server then applies the free limit and they get "Free limit reached for today. Upgrade to Pro", while the UI says they're Pro.
8. **Founder is not Pro on the server** unless their email has a real Stripe sub. Probably not what's intended.
9. **Duplicate Stripe customers.** Every checkout passes `customer_email` without reusing a customer, so repeat checkouts create new customers. `/api/portal` uses `customers.list({ limit: 1 })`, which may open the portal for a customer with no active subscription.
10. **Checkout return upgrades whoever is logged in locally**, not necessarily the `customer_email` Stripe returned. Only falls back to `customer_email` if nobody is logged in.
11. "Unlimited checks" for Pro is actually capped at 8 reviews/hour/IP.
12. No webhooks, so no dunning, no handling of `past_due`, no record of anything outside Stripe.

### Uploads / review reliability

13. **Vercel request body limit.** Vercel Functions cap request bodies at about 4.5MB. The route's 12MB check and `serverActions.bodySizeLimit: "12mb"` (which only applies to Server Actions, not route handlers) won't help. A 5 to 12MB phone photo or PDF will likely fail before reaching the route, and the client's `res.json()` on a non-JSON 413 surfaces as a generic error. Worth verifying against the live deploy.
14. **Timeouts.** Review is a non-streaming call with `max_tokens: 8000` under `maxDuration: 60`. A long contract with a long output can plausibly exceed 60s. Same for large image OCR.
15. **Scanned PDFs are rejected** rather than handled. Claude accepts PDFs directly, so this is a solvable gap.
16. **One failed file aborts the batch** in `processFiles` and discards any text extracted earlier in that same batch.
17. Free-tier server counter is incremented before the Claude call; if Claude fails, the user still burns a check.
18. Model string `claude-sonnet-4-5` is hardcoded in two places; README claims "Claude Sonnet 5". SDK `^0.27.0` is very old.

### Product / code hygiene

19. **Prompt drift**: `prompts/system-prompt.md` is an abridged copy that no code reads. The real prompt is inline in `review/route.ts`. Edit the route, not the markdown file.
20. **README is stale**: mentions "Home / My Reviews / About tabs" (don't exist), only one env var, and `cashflowguard-mvp.vercel.app` as the live site while code defaults to `guardconstruct.com`.
21. `AUTH_SECRET` in `.env.example` is dead.
22. `page.tsx` is a 770-line god component. `NavBar` and `FooterLinks` are defined inside it, so they remount every render.
23. No routing for app steps: refresh or back button loses the current review in progress (saved reviews survive).
24. Markdown renderer doesn't render lists as lists, italics, links, or tables. Bullets show as `- text` paragraphs.
25. Tailwind `prose` classes on privacy/terms are no-ops.
26. No lockfile, no tests, no lint, no CI. Git history shows many "Restore page" commits, which suggests `page.tsx` has been overwritten wholesale several times. Be careful with large edits to it.
27. `<img>` for the logo instead of `next/image` (fine, just noting).

## Roadmap items with zero code

The marketing page's Roadmap section lists these as upcoming. None have any implementation, schema, API or stub in the repo:
- Cloud history across devices (history is localStorage only)
- Team seats for small firms (no concept of org/team; Stripe `quantity: 1`)
- Notice deadline reminders (the model lists deadlines under "✅ Keep track of", but nothing is parsed, stored, scheduled or emailed)

All three need a real backend (DB + server-side auth) first, which also fixes security items 1 to 3.

## Conventions worth keeping

- British English everywhere in UI and prompt.
- Every AI output surface carries a "not legal advice / automated AI summary" label (results page red box + amber box inside `ReviewResults`). Don't remove these.
- API routes: `export const dynamic = "force-dynamic"` and `runtime = "nodejs"`. Removing `force-dynamic` previously broke the Vercel build (`DYNAMIC_SERVER_USAGE`).
- Keep the `pdf-parse/lib/pdf-parse.js` import path; the package root import breaks on Vercel.
- Return generic error strings to the client; log details server-side.

## Note on this file's location

Claude Code auto-loads `CLAUDE.md` from the repo root (and `.claude/`), not from `docs/`. If you want this picked up automatically, move or symlink it to the root.
