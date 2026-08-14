# pull-blocked-by-machine-facts — feature state

<!-- Two regions. The facts block below is MACHINE-WRITTEN and REWRITTEN on every `session-end`
     run: branch, PR, worktree, folder, documents, and the session log. Everything under it is
     yours — decisions, issues, acceptance criteria — and no script touches it. -->

<!-- conducted-lite:facts:start -->
<!-- MACHINE-WRITTEN. REWRITTEN IN PLACE on every session-end run that touches this feature —
     never appended to. Everything OUTSIDE the two markers is yours; the script never touches,
     reorders or rewrites it, never reads it as an instruction, and NEVER ticks an acceptance
     criterion. Do not hand-edit inside the markers: the next run overwrites it. -->

**Scaffolded 2026-08-14T13:25:05.248Z** by `node .claude/scripts/session-end.mjs --new-feature pull-blocked-by-machine-facts`. NOTHING IS VERIFIED HERE YET:
the folder exists and that is the only fact in this block. The first session-end run that touches
this feature replaces every line of it with what git and the filesystem actually show.

- feature: `pull-blocked-by-machine-facts`
- folder: `.conducted/work/pull-blocked-by-machine-facts/`
- documents: (none yet — legal; see the altitude law in .conducted/CONDUCTOR.md)
- derived status: `new` — the folder exists and nothing else does yet
- branches: none matching this feature name
- worktrees: none
- PR: none declared (to declare one, put `PR: #<n>` or the pull-request URL on a LINE OF ITS OWN below the markers — a mention inside a sentence is not a declaration)
- session log (most recent, bounded):
  - `2026-08-14T13:25:05.248Z` session `scaffold` — folder and state.md created by .claude/scripts/session-end.mjs --new-feature
<!-- conducted-lite:state eyJhdCI6IjIwMjYtMDgtMTRUMTM6MjU6MDUuMjQ4WiIsInN0YXR1cyI6Im5ldyIsImJyYW5jaGVzIjpbXSwid29ya3RyZWVzIjpbXSwicHIiOiIifQ== -->
<!-- conducted-lite:sessions W3siYXQiOiIyMDI2LTA4LTE0VDEzOjI1OjA1LjI0OFoiLCJpZCI6InNjYWZmb2xkIiwibm90ZSI6ImZvbGRlciBhbmQgc3RhdGUubWQgY3JlYXRlZCBieSAuY2xhdWRlL3NjcmlwdHMvc2Vzc2lvbi1lbmQubWpzIC0tbmV3LWZlYXR1cmUifV0= -->
<!-- conducted-lite:facts:end -->

## Decisions

<!-- What was decided and WHY, with the evidence that would reopen it. Rewrite in place, dated. -->

**2026-08-14 — the reported cause was rejected on measurement.** miq's field notes proposed
suppressing rewrites "whose only delta is its own timestamp". That guard already exists
(`stop-glance.mjs:514-522`, `9a5f397`) and miq was running it (`7c62cac`) before the notes were
written. The colliding rewrite they cite (`79ad2ce`) carried identical facts and a moved `judgment
sha` — a legitimate refresh after a human edit. Reopens if a collision is ever found whose facts,
human region and provenance are all unchanged.

**2026-08-14 — the glance reports, it does not unblock.** No stashing, discarding or pulling on
anyone's behalf: CONDUCTOR.md's "it informs, it never blocks and it never decides", and the file it
would be discarding is the human region this machinery exists to protect.

**2026-08-14 — altitude: tech design only, no problem.md or solution.md.** A machinery defect with a
measured root cause and a two-line surface. There is no outside-in story to write.

## Issues

<!-- What is wrong or unresolved right now. Delete an issue when it is gone, never strike it out. -->

- `state.md` is generated locally every turn AND tracked in git, so the same bytes have two authors.
  This change reports the collision; it does not remove the arrangement that causes it. If reporting
  proves not to be enough, the next question is whether the facts block should be tracked at all —
  which costs non-negotiable 4, so it is not this feature's call.
- `git pull --ff-only` prints `Updating <a>..<b>` to stdout and the abort to stderr, so the last line
  in a terminal can read as success. Nothing here can fix git's output; the glance speaking on the
  next turn is the compensating control.

## Acceptance criteria

<!-- Binary lines. Only a human ticks these: no script in this repo will ever tick one for you. -->

- [ ] With a branch behind its upstream, the glance says so, naming the branch, the count and `vs last fetch`.
- [ ] When the files blocking the pull are ones the glance itself wrote this turn, the message names them and says the block regenerates identically.
- [ ] With the branch level with its upstream, the glance says nothing about behind-ness.
- [ ] The behind-ness line obeys the existing `say()` contract: it speaks when the count changes and stays silent when it does not, across two consecutive turns with no change.
- [ ] No hook in this repo stashes, discards, checks out or pulls anything: `git status --short` is byte-identical before and after a glance run that reports a blocked pull.
- [ ] The existing `ahead` reporting is unchanged — its tests still pass and its wording is untouched.
