# CashFlowGuard MVP

**UK-first commercial risk checker for small construction firms and freelancers (under 25 employees).**

Free first-pass review focused on the 10 most common payment traps under English law (Construction Act).

> This is **commercial risk identification only**. It is **not legal advice**.

## Live site

After enabling GitHub Pages (Settings → Pages → Deploy from branch `main`):

**https://buzz542.github.io/cashflowguard-mvp/**

## Current status (what is already built)

✅ Landing page + full mobile flow  
✅ Context form (trade, size, duration, role)  
✅ Contract text paste (best for iPad)  
✅ Risk register with plain-English explanations + copy-paste suggested amendments  
✅ Strong legal disclaimer on every screen  
✅ The exact system prompt for a real AI (see `/prompts/system-prompt.md`)  
✅ Keyword-based detection that already catches the most common traps  

## What is NOT fully built yet (the real AI)

The current version uses smart **keyword + pattern detection**.  
It does **not** yet call a large language model (Claude / GPT).

To turn it into a true AI system you still need:

1. An API key (Anthropic Claude recommended, or OpenAI)
2. A tiny backend that sends the contract text + context + the system prompt to the AI and returns the result
3. (Optional) PDF text extraction so users can upload files instead of pasting

The complete system prompt is already written and ready in:
`prompts/system-prompt.md`

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

## Next steps

1. Enable GitHub Pages (if not already done)
2. Test the current version with real contract text
3. When ready for real AI: add a simple Vercel / Netlify function + API key
4. Collect feedback from actual small contractors

---

Built for people who work on site and cannot wait days or spend four figures on a solicitor for every subcontract.
