# work/ — one folder per feature, and the folder IS the status

`work/<feature-name>/` is everything about one piece of work. Create the folder and it appears on
the roadmap under `new` at the next session start. Nothing else is required — see the altitude law
in `CONDUCTOR.md`: none, some or all of the three documents, depending on how much thinking the work
warrants.

```
work/<feature-name>/
  problem.md      optional   what is happening, for whom, why it matters
  solution.md     optional   -> the row moves to 'accepted'
  tech-design.md  optional   -> the row moves to 'refined'
  state.md        written by session-end for any feature the session touched
```

`session-end` runs when the context ends and whenever you run it by hand. **The end-of-context run
is best-effort** — a closed terminal, a crash or a kill writes nothing — so a missing or stale
`state.md` is normal and is not a fault. Nothing depends on it: the session-start fact-check derives
the branch, the worktree, the uncommitted work and the unpushed commits from git, and says plainly
when the written record is absent or older than the evidence.

A branch or a worktree named after the feature moves the row to `development`. The conventions are
deliberately dumb so they are predictable:

- **branch** — any local or origin branch whose last `/`-segment is the feature name, so
  `feat/checkout-flow`, `checkout-flow` and `simon/checkout-flow` all match `checkout-flow`.
- **worktree** — any linked worktree whose directory name is the feature name. The convention is
  `worktrees/<feature>/` **inside the repo**, which `.gitignore` already covers:
  `git worktree add worktrees/checkout-flow -b feat/checkout-flow`. One placed beside the repo as
  `<repo>_<feature>` is still read (the `<repo>_` prefix is stripped) and still reconciles, and both
  session-start and session-end report it as out of convention with the command that moves it.

**The PR is the one fact nothing derives.** Git does not know about pull requests, so you declare
one by putting `PR: #41` — or the pull-request URL — **on a line of its own** in `state.md`, below
the facts markers. The colon is required and nothing else may share the line (a leading `-` bullet
is fine). A mention inside a sentence declares nothing: *"adopted from PR #41 head"* is prose, and
prose must never end up in a facts block whose promise is that every line is a command's output.
What is declared is quoted back beside the number, so a wrong one is obvious on sight.

**A fresh worktree has no `node_modules`.** Every builder dispatched into one pays its own install
before it can run a test — three builders, three installs. Budget for it in the brief, or point them
at a shared store.

`complete` is the one rung nothing derives. You move the row there yourself; the next session start
sweeps it into `archive.md`.

Feature names must match `[A-Za-z0-9][A-Za-z0-9._-]*` — a name has to survive being written into a
markdown link and read back out of one. A folder starting with `.` or `_` is ignored entirely.

If superpowers is used, its `plan.md` and spec land here too. Nothing waits on them.
