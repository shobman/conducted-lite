# instruction-freshness — feature state

<!-- Two regions. The facts block below is MACHINE-WRITTEN and REWRITTEN on every `session-end`
     run: branch, PR, worktree, folder, documents, and the session log. Everything under it is
     yours — decisions, issues, acceptance criteria — and no script touches it. -->

<!-- conducted-lite:facts:start -->
<!-- MACHINE-WRITTEN. REWRITTEN IN PLACE on every session-end run that touches this feature —
     never appended to. Everything OUTSIDE the two markers is yours; the script never touches,
     reorders or rewrites it, never reads it as an instruction, and NEVER ticks an acceptance
     criterion. Do not hand-edit inside the markers: the next run overwrites it. -->

**Verified 2026-08-13T06:40:59.327Z** by `node .claude/hooks/stop-glance.mjs`. Every line below is a command's output or a file that exists — re-derived locally at the end of a turn, with no network call. `node .claude/scripts/session-end.mjs` is the verifier and rewrites this block whole.

- feature: `instruction-freshness`
- folder: `.conducted/work/instruction-freshness/`
- documents: problem.md · solution.md
- derived status: `accepted`   ·   roadmap says: `accepted`
- branches: none matching this feature name
- worktrees: none
- PR: none declared (to declare one, put `PR: #<n>` or the pull-request URL on a LINE OF ITS OWN below the markers — a mention inside a sentence is not a declaration)
- session log (most recent, bounded):
  - `2026-08-12T14:42:52.686Z` session `scaffold` — folder and state.md created by .claude/scripts/session-end.mjs --new-feature
<!-- conducted-lite:state eyJhdCI6IjIwMjYtMDgtMTNUMDY6NDA6NTkuMzI3WiIsInN0YXR1cyI6ImFjY2VwdGVkIiwiYnJhbmNoZXMiOltdLCJ3b3JrdHJlZXMiOltdLCJwciI6IiJ9 -->
<!-- conducted-lite:sessions W3siYXQiOiIyMDI2LTA4LTEyVDE0OjQyOjUyLjY4NloiLCJpZCI6InNjYWZmb2xkIiwibm90ZSI6ImZvbGRlciBhbmQgc3RhdGUubWQgY3JlYXRlZCBieSAuY2xhdWRlL3NjcmlwdHMvc2Vzc2lvbi1lbmQubWpzIC0tbmV3LWZlYXR1cmUifV0= -->
<!-- conducted-lite:judgment sha=2e5c692d5cd67f48 at=2026-08-13T06:40:59.327Z -->
<!-- conducted-lite:facts:end -->

## Decisions

<!-- What was decided and WHY, with the evidence that would reopen it. Rewrite in place, dated. -->

**2026-08-13 — altitude: a problem, then a solution, and probably no tech design.** The hard part
here is choosing which staleness is worth detecting, which is a problem question. Still holds after
the 2026-08-15 rewrite: the implementation lands inside conductor-guard, which already intercepts
every write. Reopens if the guard turns out to need state it does not already hold.

**2026-08-13 — the check reports and never edits.** Unchanged by the rewrite, and now also: never
blocks. The flag rides the guard's existing interception of `CLAUDE.md` writes and only attaches
words. CONDUCTOR.md: *"It informs. It never blocks and it never decides."* A machine that silently
corrected — or refused — a standing instruction would be writing the conductor's briefing page.

**2026-08-15 — the check moves to the write; all three session-start detectors are dropped.** The
reasons are dated in `solution.md`: the name search needed a tree walk session start does not have,
the path flag was the wallpaper mechanism `nag-becomes-wallpaper` just closed, and the
settled-decision detector could not catch its own motivating incident without judging prose. The
root fix is a standard — a standing instruction carries law and pointers, never a mutable fact —
and the machinery enforces only its mechanically-checkable edge, at the write. Reopens if the field
shows a name going stale AFTER a compliant write often enough to need a read-side net; that residue
is declared in `solution.md`, not solved.

## Issues

<!-- What is wrong or unresolved right now. Delete an issue when it is gone, never strike it out. -->

**Open — the quiet test is the real acceptance.** Replay miq's 275-line instruction file and this
repo's own `CLAUDE.md` through the write-time check. If the flags produce findings a human
dismisses, the design is wrong and no amount of tuning the wording fixes it.

**Open — the standard needs the owner's word before it is numbered.** `solution.md` proposes it for
`standards.md`; a standard is his lane's contract with the output. Bring him the line, not an essay.

## Acceptance criteria

<!-- Binary lines. Only a human ticks these: no script in this repo will ever tick one for you. -->

- [ ] A write to `CLAUDE.md` carrying an absolute, platform-specific path is flagged once, on that
      write, with the path quoted — and the write is never blocked.
- [ ] A write carrying a backticked or path-shaped token the repo cannot find is flagged the same
      way, naming what was searched and what was not found.
- [ ] The standard lands as a numbered line in `standards.md`, citing both field incidents.
- [ ] Session start costs exactly what it costs now: nothing from this feature runs there.
- [ ] The quiet test: replaying miq's 275-line instruction file and this repo's own `CLAUDE.md`
      through the write-time check produces no finding a human then has to dismiss.
- [ ] It fails open. A guard error, an unreadable tree or malformed content flags nothing and
      blocks nothing — the write always proceeds.
