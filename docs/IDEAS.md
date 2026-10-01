# Ideas (not in the PRD, not built)

Things noticed along the way that are outside the PRD. Parked here rather than built.

- SMS or calendar (.ics) export for deadline reminders.
- Annual plan / free trial.
- Stripe Tax (if VAT-registered).
- CAPTCHA (e.g. Turnstile) and a disposable-email blocklist on signup, if free-tier abuse shows up in the ledger.
- Durable (Postgres/Redis) versions of the per-user hourly speed bumps.
- Direct-to-storage uploads for files over 4MB (Supabase Storage signed URLs).
- A proper eval set of real, anonymised subcontracts for both the review and extraction prompts.
- Solicitor / adjudication partner integrations, a partner portal, or automated referral routing for "Need help getting paid?" requests (out of scope for this MVP; requests are handled by hand).
- White-label or insurer / trade-credit / accountant versions.
- A small admin page listing `help_requests` (today: the Supabase table editor plus the emails).
