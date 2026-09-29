# GuardConstruct: Product Requirements (as-built reconstruction)

Reconstructed from the code at commit `6d38a3a` (29 Sep 2026). This describes what the product **does today**, not what it should do. Where the code, marketing copy and legal pages disagree, the conflict is listed under Open Questions rather than resolved by guessing.

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
2. Create account (email + password, min 8 chars). No email verification.
3. **About this job** form, all required:
   - Trade / work (free text)
   - Package size: Under £10k / £10k–£50k / £50k–£250k / £250k+
   - Duration: <1 month / 1–3 / 3–6 / 6+ months
   - Role: Subcontractor / Sub-subcontractor / Direct to client / Freelance / labour-only
4. **Add the document**: take photo(s), upload PDF/Word/text (multiple files), or paste text. Extracted text lands in an editable textarea.
5. **Run check** → loading screen "Building your action plan…".
6. **Your action plan** rendered with "Not legal advice" and "Automated AI summary" banners.
7. Review auto-saved to "Past contract reviews" on this device.
8. If the free check is used, next attempt shows "Upgrade to Pro" modal → Stripe Checkout.

## 4. Feature inventory

### 4.1 Live (implemented and reachable in the UI)

| Feature | Details | Where |
|---|---|---|
| Marketing page | Hero, "How it works" (3 steps), Features, Pricing, Roadmap, footer with Privacy/Terms/Report a problem | `page.tsx` |
| Account signup / login | Email + password, stored **in the browser only** | `page.tsx`, `lib/password.ts` |
| Job context capture | 4 fields above; used by the model to weight severity and estimate exposure, never echoed back | `page.tsx`, `api/review` |
| Photo upload + OCR | Camera capture on mobile, Claude vision transcription. JPEG/PNG/GIF/WebP. HEIC rejected | `api/extract` |
| PDF upload | Text-layer PDFs only. Scanned PDFs rejected with "photograph each page" | `api/extract` |
| Word upload | `.docx` only; `.doc` rejected | `api/extract` |
| Paste / text upload | `.txt`, `.md`, `.csv` or paste into textarea | `page.tsx`, `api/extract` |
| Multi-page | Up to 12 files per selection, can add more batches; text concatenated. Max 120k chars total | `page.tsx`, `api/review` |
| AI contract review | Claude (`claude-sonnet-4-5`) with a fixed system prompt covering Construction Act 1996, JCT, NEC3/4, FIDIC, bespoke forms | `api/review` |
| Risk watchlist | Pay-when-paid/pay-if-paid; payment cycles; retention (>5%, whole-project PC release); payment/pay-less notice traps; set-off; flow-down; LADs; variation/EOT notice conditions precedent; suspension rights; indemnity/insurance; "final and conclusive"; other conditions precedent | `api/review` prompt |
| Action plan output | 🚨 Deal with before signing / 👀 Be aware of / ✅ Keep track of → 🔴 RED and 🟠 AMBER detailed risks (clause ref, what it says, plain English, why it matters, potential exposure £, what to do, suggested wording) → Your key actions (3–7) → Overall call: SIGN / ASK FIRST / DON'T SIGN YET | `api/review` prompt, `ReviewResults.tsx` |
| Copy suggested wording | One-click copy button per suggested-wording block | `ReviewResults.tsx` |
| AI / legal disclaimers | Red "Not legal advice" box + amber "Automated AI summary" box on every result | `page.tsx`, `ReviewResults.tsx` |
| Past reviews (local) | Last 30 reviews per email, stored in this browser. List view + 5 most recent in profile menu | `ProfileMenu.tsx` |
| Profile menu | Avatar initial, name, email, Free/Pro badge, past scans, Manage billing (Pro only), Log out | `ProfileMenu.tsx` |
| Free tier | UI: 1 check per account. Server: 3 per IP per 24h for non-subscribers | `page.tsx`, `api/review` |
| Pro subscription | £19/month via Stripe Checkout, promo codes allowed | `api/checkout` |
| Post-checkout unlock | Verifies Checkout session, flips local account to Pro | `api/checkout/verify`, `page.tsx` |
| Manage billing / cancel | Stripe hosted Customer Portal login (emailed code) | `NEXT_PUBLIC_STRIPE_PORTAL_LOGIN_URL` |
| Privacy Policy, Terms of Use | Static pages, England & Wales, UK GDPR, dated 29 Sep 2026 | `privacy/`, `terms/` |
| Report a problem | `mailto:` link to founder | footer |
| Rate limiting | Per-IP, in-memory, best effort | `lib/rateLimit.ts` |
| Security headers / CSP | Set globally | `next.config.mjs` |

### 4.2 Roadmap only (advertised, no code)

The landing page Roadmap section lists these with "→" (vs "✓ Live"). There is no schema, endpoint, stub or feature flag for any of them.

| Item | What exists today | What's missing |
|---|---|---|
| **Cloud history across devices** | History in `localStorage` only, lost on a new device or when site data is cleared | Database, server-side accounts/sessions, review storage, data retention policy |
| **Team seats for small firms** | Single-user local accounts; Stripe checkout hardcoded `quantity: 1` | Org/team model, invites, seat billing, shared history |
| **Notice deadline reminders** | Model lists deadlines/notices under "✅ Keep track of" as free text | Structured extraction of dates/periods, job start date capture, storage, scheduler, email/SMS/push delivery |

All three depend on a backend with real auth, which doesn't exist yet.

### 4.3 Implied or claimed but not really there

| Claim | Reality |
|---|---|
| "Built around JCT / NEC style patterns" | True only at the prompt level. No form detection, clause library or JCT/NEC-specific logic. FIDIC is also in the prompt but not in marketing |
| "Unlimited checks" (Pro) | Capped at 8 reviews/hour/IP by the server |
| "Account" | Per-browser record. Same email on a new device is a new account with a new free check |
| Email verification | Existed, removed on purpose (`aac72c7`) |
| "Trusted by early UK contractors" | The section lists trade categories, not customers or logos. See Open Questions |

## 5. Pricing and entitlements (as built)

| | Free | Pro |
|---|---|---|
| Price | £0 | £19/month (hardcoded in UI; actual charge is whatever `STRIPE_PRICE_ID` is) |
| Checks | UI: 1 per local account. Server: 3/IP/24h | Server: 8/IP/hour |
| Upload/OCR | Unmetered by plan (20 files/IP/hour) | Same |
| History | Local, 30 most recent | Same |
| Billing mgmt | n/a | Stripe portal |

Server decides Pro by looking up the email (sent by the client) in Stripe for an `active` or `trialing` subscription on every review. There are no webhooks.

## 6. Non-functional (as built)

- **Platform**: Next.js 14 on Vercel, Node 20. Single route (`/`) plus `/privacy`, `/terms`.
- **Data storage**: none server-side. Uploaded files are processed in memory and dropped. Contract text and results are sent to Anthropic.
- **Third parties**: Anthropic (AI), Stripe (billing), Vercel (hosting).
- **Cost**: README says "typically 5p–20p per review". Not verified; photo OCR adds one Claude vision call per page on top.
- **Latency**: non-streaming, up to 8k output tokens, 60s function limit.
- **Accessibility / i18n**: `en-GB`, British English throughout. No specific a11y work beyond semantic buttons.

## 7. Known issues that affect the product (details in `docs/CLAUDE.md`)

- ~~Anyone can open any subscriber's Stripe billing portal by email.~~ Fixed in Phase 0 (hosted portal login link).
- Anyone can claim Pro on the review endpoint by sending a subscriber's email.
- ~~Founder email logs in with any password client-side.~~ Fixed in Phase 0.
- Cancelled Pro users still see "Pro" in the UI but get free-tier limits from the server.
- Photos/PDFs over ~4.5MB likely fail on Vercel despite the "max 12MB" message.
- Scanned PDFs are rejected instead of OCR'd.
- Refresh/back mid-flow loses progress.

## 8. Open questions

These are ambiguous in the code or contradict each other. Not assumed either way.

**Free tier and pricing**
1. What is the intended free allowance: 1 check per person ever (UI copy), 1 per account (Terms), or 3 per day per IP (server)?
2. Should document extraction (especially paid photo OCR) count against the free allowance or be gated at all?
3. Is "Unlimited" for Pro meant literally, or is a fair-use cap intended? If a cap, should the 8/hour limit be stated?
4. Is £19/month inclusive of VAT? Nothing in UI, Terms or checkout config says. Is there an annual plan or a trial? (Server accepts `trialing` status but checkout doesn't configure a trial.)
5. Are promo codes intentionally enabled at checkout (`allow_promotion_codes: true`)?

**Accounts and identity**
6. Is local-only auth a deliberate MVP choice or a stopgap? Every roadmap item needs server-side accounts. What's the planned auth provider, if any?
7. Should the founder account be Pro on the server too (currently it isn't unless it has a real Stripe sub)? Should the any-password login for that email stay?
8. Why was email verification removed (`aac72c7`: "no on-screen codes, no email verification")? Cost, deliverability, friction? Does it need to come back with server accounts?

**Scope of the review**
9. Is FIDIC in scope? It's in the prompt but not in marketing.
10. Is the product England & Wales only, or also Scotland (different law) and Northern Ireland? Copy says "UK" and "English law" interchangeably.
11. Is "under 25 staff" enforced or checked anywhere, or purely positioning? (Currently positioning only.)
12. Are main contractors or clients reviewing their own contracts an intended use? The role dropdown excludes them.
13. What should happen with scanned PDFs: add OCR, or keep telling users to photograph pages?

**Roadmap definitions**
14. Cloud history: how long should contract text and results be retained, and does the privacy policy need rewriting (it currently says files aren't stored)?
15. Team seats: per-seat pricing or a flat team plan? Is there a seat cap given the <25 staff target?
16. Notice reminders: which notices (payment applications, pay-less, variation/EOT, final account, retention release)? Delivery channel (email, SMS, calendar export)? Where does the job start date come from, since the context form only captures a duration band?

**Brand, domain and claims**
17. Canonical domain: `guardconstruct.com` (code fallback, Stripe redirects) or `cashflowguard-mvp.vercel.app` (README)? Is "CashflowGuard" a retired name?
18. "Trusted by early UK contractors": is there evidence of actual users from those trades? If not, this may be a problem under ASA/CAP rules on testimonials and endorsements.
19. README says the model is "Claude Sonnet 5"; code uses `claude-sonnet-4-5`. Which is intended?
20. "Past reviews" in the nav and "Past scans" in the profile menu refer to the same thing. Intentional?

**Legal/compliance**
21. Privacy policy says Anthropic processes documents "solely" to extract text and summarise. Has the Anthropic data-retention/training position been checked and should it be stated?
22. Terms cap liability at the greater of £50 or 3 months' fees. Has this been reviewed by anyone qualified, given the product itself says "not legal advice"?
