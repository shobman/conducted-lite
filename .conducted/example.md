# example.md — a WORKED EXAMPLE, not this project's state

**Nothing reads this file.** The machinery reads `roadmap.md`, `archive.md` and
`work/<feature>/state.md`, and nothing else. This is inert documentation — the shape of a filled-in
ledger and a filled-in feature state, so you can see what "good" looks like without a fake worktree
and a fake branch becoming findings on your real project.

**You do not need to copy it.** Create `work/<feature-name>/` and run
`node .claude/scripts/session-start.mjs`; the row appears. Run
`node .claude/scripts/session-end.mjs` and `state.md` is created for you, facts filled, human
sections left as prompts, with one finding telling you to fill them in. That first red is the
intended first-run path — and it is only a verdict, never a gate: **nothing in this repo blocks a
session.**

Everything below the line is the example. It describes a fictional project.

---

## `roadmap.md` — the ledger

```markdown
<!-- conducted-lite:ledger:start -->

## idea

- per-adviser branding on the PDF, if the pilot asks twice
- kill the CSV import once the API lands

## new

- [refund-window](work/refund-window/) — problem.md

## accepted

- [pricing-page](work/pricing-page/) — problem.md, solution.md

## refined

- [onboarding-email](work/onboarding-email/) — problem.md, solution.md, tech-design.md

## development

- [checkout-flow](work/checkout-flow/) — problem.md, solution.md, tech-design.md · branch `feat/checkout-flow` (local+origin) · worktree `worktrees/checkout-flow`

## complete

<!-- conducted-lite:ledger:end -->
```

Four things that ledger is teaching:

1. **The two `idea` lines have no folder and no link.** They are hand-written, and every
   regeneration preserves them byte for byte. That is the whole idea rung.
2. **Nothing in a row is a status field.** `pricing-page` sits under `accepted` because
   `work/pricing-page/solution.md` exists. Delete the file and the row moves. Add `tech-design.md`
   and it moves. There is nothing to update and nothing to drift.
3. **`checkout-flow` is under `development` because a branch exists**, not because anyone said so.
4. **`complete` is empty and only you can fill it.** When the checkout flow is genuinely done you
   move its row there by hand. The next session start sweeps it into `archive.md` and it never comes
   back into the roadmap. If its PR merges first, the fact-check will say *"this reads as complete;
   the roadmap says development"* — and do nothing about it.

## `work/checkout-flow/state.md` — one feature's state

```markdown
# checkout-flow — feature state

<!-- conducted-lite:facts:start -->

**Verified 2026-07-28T09:14:02.331Z** by `node .claude/scripts/session-end.mjs`.

- feature: `checkout-flow`
- folder: `.conducted/work/checkout-flow/`
- documents: problem.md · solution.md · tech-design.md
- derived status: `development`   ·   roadmap says: `development`
- branches:
  - `feat/checkout-flow` @ `7f3a91c8` (local+origin)
- worktrees:
  - `worktrees/checkout-flow` -> /c/code/repos/example/worktrees/checkout-flow
- PR: #41 — DECLARED by the line "PR: #41" in the human region below.
- session log (most recent, bounded):
  - `2026-07-28T09:14:02.331Z` session `a1b2c3` — branch `feat/checkout-flow` has a commit inside the 12h window
  - `2026-07-27T17:02:55.010Z` session `d4e5f6` — a commit inside the window touched `.conducted/work/checkout-flow/tech-design.md`
<!-- conducted-lite:state <base64> -->
<!-- conducted-lite:sessions <base64> -->
<!-- conducted-lite:judgment sha=0000000000000000 at=2026-07-28T09:14:02.331Z -->

<!-- conducted-lite:facts:end -->

## Decisions

Guest checkout stays. It fails the "one adviser in the loop" test on paper, but the pilot showed
three of five drop-offs happen at account creation. Reopen if the adviser complaint rate passes 1%.

PR: #41

## Issues

Stripe's test webhooks arrive out of order roughly one time in twenty. Not reproduced in
production yet — do not "fix" it until it is observed there.

## Acceptance criteria

- [x] a guest can pay without creating an account
- [ ] a failed card shows the reason, not a generic error
- [ ] the adviser sees the order within 60 seconds
```

Three things that state file is teaching, all of them enforced:

1. **Two regions, and the split is structural.** Everything between the markers is rewritten from
   what a command returned. Everything outside — decisions, issues, acceptance criteria — is spliced
   back byte for byte. The script never holds your text in a buffer it rewrites.
2. **The PR is the one fact you have to declare, and declaring it is a deliberate act.** Nothing in
   git knows about a pull request, so you put `PR: #41` — or the pull-request URL — **on a line of
   its own** anywhere below the markers, and the fact-check looks it up with one `gh` call. No `gh`,
   no network, no guess: it reports UNVERIFIED. The form is exact: the colon is required, the line
   holds nothing else (a leading `-` bullet is allowed), and the number is quoted back beside its
   source line in the facts block. `PR 41`, `pr41`, and *"adopted from PR #41 head"* inside a
   sentence declare **nothing** — that last one is a real incident, where one paragraph of honest
   prose put a pull request that did not exist into four features' facts blocks.
3. **One box is ticked and a machine did not tick it.** Nothing in this repo ticks an acceptance
   criterion or unticks one. The fact-check counts them, says "1 of 3", and stops.
