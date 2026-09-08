# GuardConstruct

**UK-first AI contract review for small construction firms & freelancers (under 25 employees).**

Free first-pass commercial risk identification focused on the 10 most common payment traps under English law (Construction Act).

> This is **commercial risk identification only**. It is **not legal advice**.

## Live site

Once deployed on Vercel the site will be available at your Vercel URL (e.g. `https://guardconstruct.vercel.app`).

## How to finish setup (important)

1. In Vercel → your project → **Settings → Environment Variables**
2. Add:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** paste your Anthropic API key
3. Save and **Redeploy**

Without the key the AI review will not work.

## Tech

- Next.js 14
- Claude (Anthropic) via API
- Tailwind CSS
- Mobile-first (works great on iPad)

## The 10 payment traps checked

1. Pay-when-paid / pay-if-paid  
2. Extended or vague payment cycles  
3. Retention % and release triggers  
4. Weak notice obligations  
5. Broad set-off rights  
6. Unfair flow-down / back-to-back clauses  
7. Uncapped or excessive LADs  
8. Harsh conditions precedent  
9. Weak suspension rights on non-payment  
10. Vague valuation language  

## Cost

Each review typically costs 5p–20p using Claude Sonnet.

---

Built for people who work on site and cannot wait days or spend four figures on a solicitor for every subcontract.
