# Progress

Work list built from `docs/PRD.md` (§7 known issues, §8 open questions) and the known gaps in `docs/CLAUDE.md`. There were no TODO/FIXME comments in the code. Each item is committed separately after `npm run check` (lint, typecheck, unit tests, SQL tests, build) passes.

| # | Item | Source | Status |
|---|---|---|---|
| 1 | Add linting and a single `npm run check` | Instructions | Done |
| 2 | Large photos fail on Vercel's ~4.5MB body limit | PRD §7 | Done |
| 3 | Scanned PDFs rejected instead of read | PRD §7, §8 | Done |
| 4 | Refresh/back loses the check in progress | PRD §7 | Done |
| 5 | Result renderer doesn't show lists as lists | CLAUDE.md gaps | |
| 6 | No self-service account deletion | CLAUDE.md gaps, privacy policy | |
| 7 | No team ownership transfer or team deletion | PRD §7 | |
| 8 | Unverified "Trusted by early UK contractors" claim | PRD §8 | |
| 9 | Extraction quality unmeasured: build the eval harness | PRD §7 | |
| 10 | Record all open-question defaults | PRD §8 | |
