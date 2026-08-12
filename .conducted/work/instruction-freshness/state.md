# instruction-freshness — feature state

<!-- Two regions. The facts block below is MACHINE-WRITTEN and REWRITTEN on every `session-end`
     run: branch, PR, worktree, folder, documents, and the session log. Everything under it is
     yours — decisions, issues, acceptance criteria — and no script touches it. -->

<!-- conducted-lite:facts:start -->
<!-- MACHINE-WRITTEN. REWRITTEN IN PLACE on every session-end run that touches this feature —
     never appended to. Everything OUTSIDE the two markers is yours; the script never touches,
     reorders or rewrites it, never reads it as an instruction, and NEVER ticks an acceptance
     criterion. Do not hand-edit inside the markers: the next run overwrites it. -->

**Scaffolded 2026-08-12T14:42:52.686Z** by `node .claude/scripts/session-end.mjs --new-feature instruction-freshness`. NOTHING IS VERIFIED HERE YET:
the folder exists and that is the only fact in this block. The first session-end run that touches
this feature replaces every line of it with what git and the filesystem actually show.

- feature: `instruction-freshness`
- folder: `.conducted/work/instruction-freshness/`
- documents: (none yet — legal; see the altitude law in .conducted/CONDUCTOR.md)
- derived status: `new` — the folder exists and nothing else does yet
- branches: none matching this feature name
- worktrees: none
- PR: none declared (to declare one, put `PR: #<n>` or the pull-request URL on a LINE OF ITS OWN below the markers — a mention inside a sentence is not a declaration)
- session log (most recent, bounded):
  - `2026-08-12T14:42:52.686Z` session `scaffold` — folder and state.md created by .claude/scripts/session-end.mjs --new-feature
<!-- conducted-lite:state eyJhdCI6IjIwMjYtMDgtMTJUMTQ6NDI6NTIuNjg2WiIsInN0YXR1cyI6Im5ldyIsImJyYW5jaGVzIjpbXSwid29ya3RyZWVzIjpbXSwicHIiOiIifQ== -->
<!-- conducted-lite:sessions W3siYXQiOiIyMDI2LTA4LTEyVDE0OjQyOjUyLjY4NloiLCJpZCI6InNjYWZmb2xkIiwibm90ZSI6ImZvbGRlciBhbmQgc3RhdGUubWQgY3JlYXRlZCBieSAuY2xhdWRlL3NjcmlwdHMvc2Vzc2lvbi1lbmQubWpzIC0tbmV3LWZlYXR1cmUifV0= -->
<!-- conducted-lite:facts:end -->

## Decisions

<!-- What was decided and WHY, with the evidence that would reopen it. Rewrite in place, dated. -->

**2026-08-13 — altitude: a problem, then a solution, and probably no tech design.** The hard part
here is choosing which staleness is worth detecting, which is a problem question. The implementation
lands inside a script that already derives everything the check needs. Reopens if the solution turns
out to need state the session-start pass does not already hold.

**2026-08-13 — the check reports and never edits.** It names the contradiction and attaches its
evidence, exactly as the existing fact-check does for a `state.md` claiming a branch that is not
there. CONDUCTOR.md: *"It informs. It never blocks and it never decides."* A machine that silently
corrected a standing instruction would be writing the conductor's briefing page for it.

## Issues

<!-- What is wrong or unresolved right now. Delete an issue when it is gone, never strike it out. -->

**UNBLOCKED 2026-08-13.** Both deployments answered; `solution.md` is written and the detector set is
decided. Two incidents, and the classes they name are in `problem.md`.

**Open — the third detector is the weak one.** "A standing instruction describes a decision the repo
shows as settled" needs the ruling to be visible in a document, and MukFork's was visible only as a
tech design existing at all. It may reduce to the slug detector that already exists, in which case it
should be dropped rather than shipped thin. Decide it while building, with the fixture in hand.

**Open — the quiet test is the real acceptance.** Run against miq's 275-line instruction file. If the
three detectors produce findings a human dismisses, the design is wrong and no amount of tuning the
wording fixes it.

## Acceptance criteria

<!-- Binary lines. Only a human ticks these: no script in this repo will ever tick one for you. -->

- [ ] The MukFork incident is reproduced as a fixture — a standing instruction claiming an open
      question that the ledger shows as decided — and the check names it on the first turn.
- [ ] The check reports the contradiction with the evidence for both sides and changes nothing.
- [ ] It is silent on an instruction file that is merely old, merely long, or merely vague. A run
      against this repo's own files and miq's produces no finding that a human then has to dismiss.
- [ ] Session start still costs what it costs now: no new subprocess, no new tree walk.
- [ ] It fails open. A malformed or absent instruction file makes the check silent, never the
      session start noisy or broken.
