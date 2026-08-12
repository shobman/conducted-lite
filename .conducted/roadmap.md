# Roadmap — forward-looking. The headings ARE the status.

<!-- The block below is the LEDGER. Two kinds of line live in it:
       generated rows  '- [name](work/name/) ...'  — written by the SessionStart fact-check from
                       what exists on disk and in git. Do not hand-edit one; the next run rewrites it.
       everything else — yours, preserved byte-for-byte under the heading you wrote it beneath.
                       An 'idea' is exactly this: a hand-written line and no folder.
     You change an item's status by making it true, not by editing this file. The ONE exception is
     '## complete': moving a row there is a human judgement, and it is the only rung a machine will
     never assign. The next SessionStart sweeps it into archive.md. -->

<!-- conducted-lite:ledger:start -->

## idea

- A test can assert the defect it guards — miq found nine, none caught by its author, one where reintroducing the original bug left 1,044 tests green. Evidence for non-negotiable 2, and maybe a standard.
- A control that has never failed is indistinguishable from a broken one — miq's secret scanner passed vacuously until it was shown failing three ways. Accept a check only after watching it fail.
- Green means two things — "checks passed" and "review complete" — and only the conductor knows which. miq's answer: open PRs as drafts, so "not a draft" means finished. Lite has no PR flow, so decide whether this reaches us at all.
- The glance should speak when the fact changes and stay silent when it does not. Reported by two independent deployments four days apart; the doctrine's own bar is two incidents.
- The ledger regenerates only at session start, so a feature created mid-session reads as an orphan worktree until someone re-runs it. Happened three times in one miq session and looked like a fault each time.
- Copying a build output is deploying, not building, and the guard denies it. Needs a ruling either way rather than a case-by-case workaround.
- The per-turn glance can contradict itself inside one sentence: it reported "no .conducted/work/guard-false-positives/ folder exists" while naming ` M .conducted/work/guard-false-positives/state.md` as the uncommitted file. It reads folder existence from the main checkout and dirt from the worktree. Observed 2026-08-13, twice.
- Capture the failing test's name by default. Two miq agents independently lost it to a grep pattern that omitted the failure marker, and neither intermittent failure was ever identified.

## new

## accepted

- [instruction-freshness](work/instruction-freshness/) — problem.md, solution.md

## refined

## development

- [guard-false-positives](work/guard-false-positives/) — tech-design.md · branch `guard-false-positives` (local+origin)

## complete
<!-- conducted-lite:ledger:end -->
