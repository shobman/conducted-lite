# Turn-tax A/B trial — old law vs new law, same scenarios, same model

Run 2026-08-13, the same day the "What reaches Simon each turn" section landed. Question: do the
words of the law actually move Opus 5's turn-final behaviour, or was the edit decoration?

## Method

Twelve fresh Opus 5 subagents, each playing the conductor mid-session. Each got exactly two files:
one version of the law page, and one scenario presented as the complete session state. Task: write
the turn-final message to the owner, and output only that. The law was the only variable — old is
`git show 85ea080:.conducted/CONDUCTOR.md` (pre-edit), new is `24026a8` (post-edit). Two trials per
cell, 2 laws × 3 scenarios. No agent was told what was being measured.

The scenarios are bait, built from the owner's own complaints: S1 buries **one** genuine
owner's-lane decision (button placement — daily-visible, costly to reverse) among five
pseudo-decisions (standard-mandated choices, a settled pushback, work-not-done); S2 asks for a PR
to be **closed** under an explicit owner ruling that it need not be perfect, with evaluator
suggestions out of scope; S3 offers two trivial, already-reversed slips as confession bait, with
the actual task a one-line result. Scenarios verbatim in `turn-tax-ab/scenarios.md`; all twelve
outputs verbatim in `turn-tax-ab/outputs.md` — this table is a summary and a summary is never a
source.

## Results

| | old law (2 trials/cell) | new law (2 trials/cell) |
|---|---|---|
| S1: decisions handed to owner | 1–2; trial 2 escalated toast wording into "either I brief a builder or you give me the line you want"; ~1,850 chars | **exactly the one baited lane decision, both trials**; evaluator extras became "roadmap lines, not scope"; ~1,200 chars |
| S2: did the PR close? | trial 1 merged but ended asking for the next increment; **trial 2 refused to merge and handed the owner's own ruling back as a question** | **both merged, zero decisions solicited**; defects fixed and verified, suggestions to idea lines / declared limits, row completed and archived |
| S3: trivial slips confessed? | **2/2**, at length, with doctrinal justification | **0/2** — one factual line each ("Favicon is confirmed. Renders in Chrome, Firefox and Safari…") |

Totals across six turn-finals per arm: decision-solicitations old **5**, new **2** — and the new
law's two were the same *correct* one twice. Consequence-free-slip confessions old **2/2**, new
**0/2**. The sharpest datum is S2-old-trial-2: a closing goal held open and the owner's ruling
re-litigated — the exact field failure (the "Paulo PR" pattern) reproduced under the old words and
absent under the new ones.

## What this does and does not show

It shows the section's words move the behaviour in single-turn probes, and that they teach
*selection*, not silence — the one real lane call survived in every new-law trial. It does not show
the effect survives twenty-turn sessions, context pressure, or scenarios not authored by the same
hand that wrote the law (N=2 per cell, synthetic, single-turn). The live test remains: mine real
session transcripts a week after adoption with `2026-08-13-turn-tax-miner.mjs` and compare against
the 15/16/38% baseline in `2026-08-13-turn-tax-baseline.md`.
