# pull-blocked-by-machine-facts — feature state

<!-- Two regions. The facts block below is MACHINE-WRITTEN and REWRITTEN on every `session-end`
     run: branch, PR, worktree, folder, documents, and the session log. Everything under it is
     yours — decisions, issues, acceptance criteria — and no script touches it. -->

<!-- conducted-lite:facts:start -->
<!-- MACHINE-WRITTEN. REWRITTEN IN PLACE on every session-end run that touches this feature —
     never appended to. Everything OUTSIDE the two markers is yours; the script never touches,
     reorders or rewrites it, never reads it as an instruction, and NEVER ticks an acceptance
     criterion. Do not hand-edit inside the markers: the next run overwrites it. -->

**Verified 2026-08-14T14:27:45.070Z** by `node .claude/hooks/stop-glance.mjs`. Every line below is a command's output or a file that exists — re-derived locally at the end of a turn, with no network call. `node .claude/scripts/session-end.mjs` is the verifier and rewrites this block whole.

- feature: `pull-blocked-by-machine-facts`
- folder: `.conducted/work/pull-blocked-by-machine-facts/`
- documents: tech-design.md
- derived status: `development`   ·   roadmap says: `development`
- branches:
  - `pull-blocked-by-machine-facts` @ `a7d48cfb` (local)
- worktrees:
  - `worktrees/pull-blocked-by-machine-facts` -> C:/code/repos/conducted-lite/worktrees/pull-blocked-by-machine-facts
- PR: none declared (to declare one, put `PR: #<n>` or the pull-request URL on a LINE OF ITS OWN below the markers — a mention inside a sentence is not a declaration)
- session log (most recent, bounded):
  - `2026-08-14T13:25:05.248Z` session `scaffold` — folder and state.md created by .claude/scripts/session-end.mjs --new-feature
<!-- conducted-lite:state eyJhdCI6IjIwMjYtMDgtMTRUMTQ6Mjc6NDUuMDcwWiIsInN0YXR1cyI6ImRldmVsb3BtZW50IiwiYnJhbmNoZXMiOlsicHVsbC1ibG9ja2VkLWJ5LW1hY2hpbmUtZmFjdHMiXSwid29ya3RyZWVzIjpbIndvcmt0cmVlcy9wdWxsLWJsb2NrZWQtYnktbWFjaGluZS1mYWN0cyJdLCJwciI6IiJ9 -->
<!-- conducted-lite:sessions W3siYXQiOiIyMDI2LTA4LTE0VDEzOjI1OjA1LjI0OFoiLCJpZCI6InNjYWZmb2xkIiwibm90ZSI6ImZvbGRlciBhbmQgc3RhdGUubWQgY3JlYXRlZCBieSAuY2xhdWRlL3NjcmlwdHMvc2Vzc2lvbi1lbmQubWpzIC0tbmV3LWZlYXR1cmUifV0= -->
<!-- conducted-lite:judgment sha=3b9fd3025142bc24 at=2026-08-14T14:27:45.070Z -->
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

**2026-08-14 — the wrote-list stays OUT of the say() signature.** Keying on it was measured
restating the same count on the very next turn: the turn after a write writes nothing, so the key
moves while the branch position does not. Signature is `count|upstream`; the file list is content on
the turn it is said. Found by the builder against my design, which had asserted the say() contract
would hold automatically. Reopens if a behind count is ever seen going unspoken.

**2026-08-14 — the behind line claims the BLOCK, never the file.** The first wording ended "so
discarding those changes loses nothing the next glance does not write again"; "those changes" reads
as the named files' whole working-tree diff, which the hook never observed, and the human region
lives in the same file. A reader following it to `git checkout -- <file>` loses their own
uncommitted judgment — likeliest on exactly the turns the sentence fires, since the facts block is
rewritten BECAUSE the judgment hash moved. Found by the fresh evaluator, graded HIGH, in scope
because it is criterion 2's own wording. Fixed in `a7d48cf`, closed by G9 which was proven red
first. Same law as `726ca15`: a generated row names what it found, it never asserts a wider absence.

**2026-08-14 — no second evaluation for the wording fix.** Non-negotiable 2 says batch a fresh
evaluator when a run of changes settles, not per tweak. The fix is one clause, closed by a
red-first test, and the conductor ran both corpora (9/9 behind, 191/191 guard). Reopens if anything
further changes on this branch before it merges.

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

**DECLARED LIMITS — found by the fresh evaluator 2026-08-14, out of scope for this feature.** A
review closes; it does not open. Each is recorded here at its true severity and none was fixed.

- MEDIUM. A diverged branch (`ahead 1, behind 1`) gets both lines, each true on its own, and the
  behind line's remedy `git pull --ff-only` cannot succeed on a diverged branch. Two true lines
  composing into a false remedy. Measured in the evaluator's fx5.
- MEDIUM. The naming clause is keyed to `count|upstream`, so on the lived path — fell behind N turns
  ago, glance said so once, every turn since rewrites the blocking file — the count does not move and
  the behind line stays silent, so the files are never named. The clause is correct when it fires;
  the feature's purpose is only partly served. This is the direct cost of the say() signature
  decision above, and the two cannot both be had without a second key.
- LOW. Detached HEAD reports the branch's behind count accurately and still says
  `git pull --ff-only`, which does not do what the reader is told from a detached HEAD.
- LOW, pre-existing and adjacent. A branch whose upstream is `gone` is silent in BOTH directions:
  `ahead` and `behind` are both empty and the no-upstream line does not fire because `b.upstream` is
  truthy. That is the "exists on one machine only" case the hook's own header calls the deceptive
  failure. This change touched that exact parse and left it as it found it.

## Acceptance criteria

<!-- Binary lines. Only a human ticks these: no script in this repo will ever tick one for you. -->

- [ ] With a branch behind its upstream, the glance says so, naming the branch, the count and `vs last fetch`.
- [ ] When the files blocking the pull are ones the glance itself wrote this turn, the message names them and says the block regenerates identically.
- [ ] With the branch level with its upstream, the glance says nothing about behind-ness.
- [ ] The behind-ness line obeys the existing `say()` contract: it speaks when the count changes and stays silent when it does not, across two consecutive turns with no change.
- [ ] No hook in this repo stashes, discards, checks out or pulls anything: `git status --short` is byte-identical before and after a glance run that reports a blocked pull.
- [ ] The existing `ahead` reporting is unchanged — its tests still pass and its wording is untouched.
