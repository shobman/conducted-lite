# nag-becomes-wallpaper — feature state

<!-- Two regions. The facts block below is MACHINE-WRITTEN and REWRITTEN on every `session-end`
     run: branch, PR, worktree, folder, documents, and the session log. Everything under it is
     yours — decisions, issues, acceptance criteria — and no script touches it. -->

<!-- conducted-lite:facts:start -->
<!-- MACHINE-WRITTEN. REWRITTEN IN PLACE on every session-end run that touches this feature —
     never appended to. Everything OUTSIDE the two markers is yours; the script never touches,
     reorders or rewrites it, never reads it as an instruction, and NEVER ticks an acceptance
     criterion. Do not hand-edit inside the markers: the next run overwrites it. -->

**Scaffolded 2026-08-14T15:37:31.734Z** by `node .claude/scripts/session-end.mjs --new-feature nag-becomes-wallpaper`. NOTHING IS VERIFIED HERE YET:
the folder exists and that is the only fact in this block. The first session-end run that touches
this feature replaces every line of it with what git and the filesystem actually show.

- feature: `nag-becomes-wallpaper`
- folder: `.conducted/work/nag-becomes-wallpaper/`
- documents: (none yet — legal; see the altitude law in .conducted/CONDUCTOR.md)
- derived status: `new` — the folder exists and nothing else does yet
- branches: none matching this feature name
- worktrees: none
- PR: none declared (to declare one, put `PR: #<n>` or the pull-request URL on a LINE OF ITS OWN below the markers — a mention inside a sentence is not a declaration)
- session log (most recent, bounded):
  - `2026-08-14T15:37:31.734Z` session `scaffold` — folder and state.md created by .claude/scripts/session-end.mjs --new-feature
<!-- conducted-lite:state eyJhdCI6IjIwMjYtMDgtMTRUMTU6Mzc6MzEuNzM0WiIsInN0YXR1cyI6Im5ldyIsImJyYW5jaGVzIjpbXSwid29ya3RyZWVzIjpbXSwicHIiOiIifQ== -->
<!-- conducted-lite:sessions W3siYXQiOiIyMDI2LTA4LTE0VDE1OjM3OjMxLjczNFoiLCJpZCI6InNjYWZmb2xkIiwibm90ZSI6ImZvbGRlciBhbmQgc3RhdGUubWQgY3JlYXRlZCBieSAuY2xhdWRlL3NjcmlwdHMvc2Vzc2lvbi1lbmQubWpzIC0tbmV3LWZlYXR1cmUifV0= -->
<!-- conducted-lite:facts:end -->

## Decisions

<!-- What was decided and WHY, with the evidence that would reopen it. Rewrite in place, dated. -->

**2026-08-14 — both guards, not one.** A `complete` guard alone fixes the observed incident and
leaves the general one; a ceiling alone keeps nagging where no decision is possible. Reopens if
either is measured redundant in the field.

**2026-08-14 — `derived` OR `declared` is complete, not both.** Requiring both keeps nagging a
feature the owner ruled complete until the tree agrees, which is exactly the state a merged-and-
deleted branch leaves. The cost of the forgiving direction is one missed nag on a finished feature.

**2026-08-14 — altitude: tech design only.** A machinery defect with a measured cause and a
one-function surface. No outside-in story to write.

## Issues

<!-- What is wrong or unresolved right now. Delete an issue when it is gone, never strike it out. -->

- The threshold is a number chosen without field data. One bulk event has been observed, at twelve.
  If a real turn ever sits just under the ceiling and still reads as wallpaper, the number is wrong
  rather than the design.

## Acceptance criteria

<!-- Binary lines. Only a human ticks these: no script in this repo will ever tick one for you. -->

- [ ] A feature whose declared status is `complete` is never nagged, even when its move signature changed that turn.
- [ ] A feature whose derived status is `complete` is never nagged, even when the roadmap still says otherwise.
- [ ] Below the threshold, each nagging feature is still named individually, in the existing wording, unchanged.
- [ ] At or above the threshold, one line is emitted carrying the count, and no feature is named.
- [ ] A feature in flight whose human region did NOT move still nags — the signal this exists for is intact.
- [ ] The nag still obeys the `say()` contract: it speaks when the fact changes and is silent across two consecutive turns with no change.
- [ ] Reproducing bookjob's turn — twelve complete features whose facts blocks the glance refreshed — emits no nag at all.
