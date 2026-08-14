# nag-becomes-wallpaper — feature state

<!-- Two regions. The facts block below is MACHINE-WRITTEN and REWRITTEN on every `session-end`
     run: branch, PR, worktree, folder, documents, and the session log. Everything under it is
     yours — decisions, issues, acceptance criteria — and no script touches it. -->

<!-- conducted-lite:facts:start -->
<!-- MACHINE-WRITTEN. REWRITTEN IN PLACE on every session-end run that touches this feature —
     never appended to. Everything OUTSIDE the two markers is yours; the script never touches,
     reorders or rewrites it, never reads it as an instruction, and NEVER ticks an acceptance
     criterion. Do not hand-edit inside the markers: the next run overwrites it. -->

**Verified 2026-08-14T16:04:45.944Z** by `node .claude/hooks/stop-glance.mjs`. Every line below is a command's output or a file that exists — re-derived locally at the end of a turn, with no network call. `node .claude/scripts/session-end.mjs` is the verifier and rewrites this block whole.

- feature: `nag-becomes-wallpaper`
- folder: `.conducted/work/nag-becomes-wallpaper/`
- documents: tech-design.md
- derived status: `refined`   ·   roadmap says: `development`
- branches: none matching this feature name
- worktrees: none
- PR: none declared (to declare one, put `PR: #<n>` or the pull-request URL on a LINE OF ITS OWN below the markers — a mention inside a sentence is not a declaration)
- session log (most recent, bounded):
  - `2026-08-14T15:37:31.734Z` session `scaffold` — folder and state.md created by .claude/scripts/session-end.mjs --new-feature
<!-- conducted-lite:state eyJhdCI6IjIwMjYtMDgtMTRUMTY6MDQ6NDUuOTQ0WiIsInN0YXR1cyI6InJlZmluZWQiLCJicmFuY2hlcyI6W10sIndvcmt0cmVlcyI6W10sInByIjoiIn0= -->
<!-- conducted-lite:sessions W3siYXQiOiIyMDI2LTA4LTE0VDE1OjM3OjMxLjczNFoiLCJpZCI6InNjYWZmb2xkIiwibm90ZSI6ImZvbGRlciBhbmQgc3RhdGUubWQgY3JlYXRlZCBieSAuY2xhdWRlL3NjcmlwdHMvc2Vzc2lvbi1lbmQubWpzIC0tbmV3LWZlYXR1cmUifV0= -->
<!-- conducted-lite:judgment sha=06a9bb2728b61763 at=2026-08-14T16:04:45.944Z -->
<!-- conducted-lite:facts:end -->

## Decisions

<!-- What was decided and WHY, with the evidence that would reopen it. Rewrite in place, dated. -->

**2026-08-14 — both guards, not one.** A `complete` guard alone fixes the observed incident and
leaves the general one; a ceiling alone keeps nagging where no decision is possible. Reopens if
either is measured redundant in the field.

**2026-08-14 — `derived` OR `declared` is complete, not both.** Requiring both keeps nagging a
feature the owner ruled complete until the tree agrees, which is exactly the state a merged-and-
deleted branch leaves. The cost of the forgiving direction is one missed nag on a finished feature.

**2026-08-14 — archived counts as finished, and it is read from the events not a second call.**
`placeFeatureRows` already reads `archive.md` to decide what not to regenerate and already reports
every feature it skipped for that reason, so the archive keeps exactly ONE reader and the refresh
gains no new call. The set degrades to EMPTY when the ledger could not be read — no roadmap, no
markers, failed read — which reads as "not known to be archived" and never as "known not to be", so
the nag speaks. Degrade to speaking, never to silence, matching the `declared` arm which reads its
UNKNOWN sentence under the same conditions.

**2026-08-14 — altitude: tech design only.** A machinery defect with a measured cause and a
one-function surface. No outside-in story to write.

## Issues

<!-- What is wrong or unresolved right now. Delete an issue when it is gone, never strike it out. -->

- The threshold is a number chosen without field data. One bulk event has been observed, at twelve.
  If a real turn ever sits just under the ceiling and still reads as wallpaper, the number is wrong
  rather than the design.

**DECLARED LIMIT — found by the builder against the conductor's own ruling, 2026-08-14.**

- MEDIUM. An **archived-but-live** feature is now silent to the nag permanently. `session-start.mjs:428`
  reports `archived-but-live` for a feature that is in `archive.md` AND still has a branch or worktree
  — the machinery already knows an archived feature can still be moving. Under the archived guard,
  someone can commit onto such a branch all session and the per-turn nag will never say its Decisions
  did not move. NOT FIXED, by the conductor's ruling: the fact is not lost, session-start states it
  once a session with its evidence; closing it means asking "archived AND not live", which adds a
  condition for a case nobody has hit. Reopens on one real incident of a live archived feature
  accumulating undocumented decisions.

**HYPOTHESIS, carried not resolved.** bookjob reported thirteen rows swept and twelve nags. The gap
is unexplained and nothing rests on it: the nag also requires `f.state` and a prior snapshot entry,
so a swept feature with no `state.md`, or one with no baseline from the previous turn, would sweep
without nagging. The builder could not verify the bookjob figures at all and correctly held them as
the conductor's citation rather than its own observation.

## Acceptance criteria

<!-- Binary lines. Only a human ticks these: no script in this repo will ever tick one for you. -->

- [ ] A feature whose declared status is `complete` is never nagged, even when its move signature changed that turn.
- [ ] A feature whose derived status is `complete` is never nagged, even when the roadmap still says otherwise. NOTE: unfalsifiable against the shipped modules — `featureFacts` cannot produce `complete` (`lite-derive.mjs:417`), so this arm is defensive and is exercised only through an injected derive shim.
- [ ] An ARCHIVED feature is never nagged — swept out of `roadmap.md` into `archive.md`, folder still present, facts block refreshed on that turn. This is the event bookjob actually hit, and it is distinct from a row moving to `## complete`.
- [ ] Below the threshold, each nagging feature is still named individually, in the existing wording, unchanged.
- [ ] At or above the threshold, one line is emitted carrying the count, and no feature is named.
- [ ] A feature in flight whose human region did NOT move still nags — the signal this exists for is intact.
- [ ] The nag still obeys the `say()` contract: it speaks when the fact changes and is silent across two consecutive turns with no change.
- [ ] Reproducing bookjob's turn — twelve complete features whose facts blocks the glance refreshed — emits no nag at all.
