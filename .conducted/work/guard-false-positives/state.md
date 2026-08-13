# guard-false-positives — feature state

<!-- Two regions. The facts block below is MACHINE-WRITTEN and REWRITTEN on every `session-end`
     run: branch, PR, worktree, folder, documents, and the session log. Everything under it is
     yours — decisions, issues, acceptance criteria — and no script touches it. -->

<!-- conducted-lite:facts:start -->
<!-- MACHINE-WRITTEN. REWRITTEN IN PLACE on every session-end run that touches this feature —
     never appended to. Everything OUTSIDE the two markers is yours; the script never touches,
     reorders or rewrites it, never reads it as an instruction, and NEVER ticks an acceptance
     criterion. Do not hand-edit inside the markers: the next run overwrites it. -->

**Verified 2026-08-13T06:40:59.327Z** by `node .claude/hooks/stop-glance.mjs`. Every line below is a command's output or a file that exists — re-derived locally at the end of a turn, with no network call. `node .claude/scripts/session-end.mjs` is the verifier and rewrites this block whole.

- feature: `guard-false-positives`
- folder: `.conducted/work/guard-false-positives/`
- documents: tech-design.md
- derived status: `development`   ·   roadmap says: `development`
- branches:
  - `guard-false-positives` @ `8dfa1019` (origin only)
- worktrees: none
- PR: #2 — DECLARED by the line "PR: #2" in the human region below. Nothing in git knows about a PR; `node .claude/scripts/session-start.mjs` checks it with one `gh pr list` call and reports UNVERIFIED when gh is not there.
- session log (most recent, bounded):
  - `2026-08-12T14:42:47.034Z` session `scaffold` — folder and state.md created by .claude/scripts/session-end.mjs --new-feature
<!-- conducted-lite:state eyJhdCI6IjIwMjYtMDgtMTNUMDY6NDA6NTkuMzI3WiIsInN0YXR1cyI6ImRldmVsb3BtZW50IiwiYnJhbmNoZXMiOlsiZ3VhcmQtZmFsc2UtcG9zaXRpdmVzIl0sIndvcmt0cmVlcyI6W10sInByIjoiMiJ9 -->
<!-- conducted-lite:sessions W3siYXQiOiIyMDI2LTA4LTEyVDE0OjQyOjQ3LjAzNFoiLCJpZCI6InNjYWZmb2xkIiwibm90ZSI6ImZvbGRlciBhbmQgc3RhdGUubWQgY3JlYXRlZCBieSAuY2xhdWRlL3NjcmlwdHMvc2Vzc2lvbi1lbmQubWpzIC0tbmV3LWZlYXR1cmUifV0= -->
<!-- conducted-lite:judgment sha=b94934b13861982f at=2026-08-13T06:40:59.327Z -->
<!-- conducted-lite:facts:end -->

PR: #2

## Decisions

<!-- What was decided and WHY, with the evidence that would reopen it. Rewrite in place, dated. -->

**2026-08-13 — the Bash scan resolves the write target from the position each shape puts it in,
never from a scan of the token stream.** Every defect in this feature — eight from the field, seven
from the first evaluator, the wrapper bypass, and the quoted-separator segment split — was one
failure repeated: a path a command *mentions* treated as a path it *writes*. Three symptom patches
had already been tried before this feature; the fourth class arrived anyway. Reopens only if
position-resolution proves unable to express a shape that matters more than the false positives cost.

**2026-08-13 — the guard's contract is drift, not determination.** It stops a conductor who has
drifted into building — every genuine field catch was drift — and does not stop one trying to get
past it; fail-open is the accepted design. Consequence: determination-shaped holes (git's write
verbs, interpreter vocabulary beyond the enumerated list, directory copies, junctions into
subdirectories) are DECLARED LIMITS in the guard's header, not work. Reopens on two real drift
incidents through any one of them — the doctrine's own bar.

**2026-08-13 — the acceptance criteria are the stopping rule.** Evaluator findings outside them
become declared limits or roadmap idea lines, never new scope on this feature. This closed the
feature at round three; an adversarial pass always returns findings, and a feature an evaluator can
extend never ships.

## Issues

<!-- What is wrong or unresolved right now. Delete an issue when it is gone, never strike it out. -->

None open in scope. Declared limits live in the guard's header — the file that enforces them.
Out-of-scope observations preserved in the corpus as non-counting groups: `observed` (a `Write`
whose `file_path` is a non-string; the ADS zero-byte case) and `unverified` (three miq commands
whose raw bytes were never supplied and which do not reproduce as quoted).

## Acceptance criteria

<!-- Binary lines. Only a human ticks these: no script in this repo will ever tick one for you. -->

- [ ] A test corpus exists, runs the real hook out-of-process, and asserts allow/deny AND the named
      path. Evidence: `.claude/tests/guard.test.mjs`, 191 counted cases, exit 0; field commands
      copied byte-for-byte from transcripts (`fixtures/PROVENANCE.md`).
- [ ] Every field false positive allows, for the right reason, without widening the allow-set.
      Evidence: `OWNED` byte-identical throughout; all eight field defects plus both evaluators'
      false-positive classes assert ALLOW in the corpus and were re-probed independently.
- [ ] No deny names a path the command does not write; an unresolvable target is denied naming
      nothing, in those words. Evidence: evaluator 2 hunted for the inverse specifically and found
      none; the triple-wrapper cap and interpreter indeterminacy both name nothing.
- [ ] Every deny shape the header promises still denies. Evidence: corpus group B, 100+ cases,
      including `git show HEAD:x > src/app.ts`, `> local.properties`, `Write legal/README.md`,
      `Write docs/**.html`, and the wrapper/redirect/in-place families.
- [ ] A fresh evaluator that never saw the build judged the behaviour. Evidence: two adversarial
      passes (~290 and ~340 payloads); every finding either fixed and cased, or declared in the
      header. Their one false all-clear (`bash -c` wrappers) is recorded in the corpus as the reason
      negative results get re-run.
