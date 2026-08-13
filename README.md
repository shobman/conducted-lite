# conducted-lite

A small operating framework for building software with AI agents. One page of law, four hooks, and
a folder convention. That is the whole thing.

It exists because its predecessor got heavy. That framework grew to roughly seven hundred lines of
doctrine that every session had to read before it could do anything, and measurement across live
projects showed the growth was monotonic and mostly self-inflicted: the doctrine describing itself.
This is the version that survived deleting everything that was not earning its place.

## What it actually does

**You hold the taste. A conductor holds the map. Subagents do the building.**

The session you talk to is the **conductor**. It briefs and dispatches subagents, reviews what comes
back, and commits what it accepts. It does not write product code, and that is enforced by a hook
rather than asked for in prose. A fresh agent that never saw the work judges it. State lives in
files, so a dead session loses nothing.

Four hooks do the remembering:

| Hook | When | What it does |
|---|---|---|
| SessionStart | you start | Rebuilds the roadmap from what exists, checks every claim against git, tells the session where things stand |
| PreToolUse | every edit | Denies the conductor writing product code, allows a dispatched builder |
| Stop | every turn | Names anything at risk that you cannot see. Local only, never blocks |
| SessionEnd | you exit | Runs the full check and writes the record. Best effort |

## The documents

Everything lives in `.conducted/`. Write only what the work needs.

```
.conducted/
  CONDUCTOR.md      the whole operating law, one page
  VISION.md         what winning looks like
  standards.md      the rules this project is held to, numbered. This one grows
  roadmap.md        a ledger. Its headings ARE the status
  archive.md        where finished work goes so the roadmap stays forward looking
  work/<feature>/   problem.md · solution.md · tech-design.md · state.md
```

**The roadmap maintains itself.** A feature's rung is derived from what exists: a folder makes it
`new`, a `solution.md` makes it `accepted`, a `tech-design.md` makes it `refined`, a branch or
worktree makes it `development`. Nobody updates a status field, so no status field can drift.

**`complete` is the one rung a machine never assigns.** Neither is an acceptance criterion ever
ticked for you, and a merged pull request is never read as an ending. Those are judgments, and the
machine's job is to inform, never to decide.

**Altitude decides how much to write.** A big problem earns the full chain. A cosmetic change to an
existing screen earns a roadmap line and nothing else. None, some or all of the three documents are
required. Writing a problem statement for a colour change is the same failure as building a payments
flow off a one-liner.

## Getting started

Copy the contents of this repository into the root of your project, then read
`.conducted/CONDUCTOR.md`. It is one page and it is the whole law.

Then tell your agent to read it. Everything else follows from there: it will open by telling you
where things stand, and it will not write product code without dispatching a builder.

Two things worth knowing before you start:

- **The hooks execute on open, with no prompt.** They are law that runs, so read them the way you
  would read law. They are four small files under `.claude/hooks/`.
- **Worktrees live at `worktrees/<feature>/` and are gitignored — which hides them from git and from
  nothing else.** Exclude `worktrees/**` from anything that walks the tree by glob (test runners,
  linters, typecheckers), or your suite will quietly run several copies of itself. The tell is a test
  count that changed when no test changed.

## Coming from the older, heavier framework

`conducted-adoption.md` is written for the agent doing the migration rather than for you. Point your
agent at it. It works out which parts of the old framework you were actually running before it tells
you what you lose, refuses rather than guesses when it cannot identify your layout, moves files with
`git mv` so history follows, and never merges or pushes. Everything it does is one commit on a branch
you can revert.

## Keeping the law current

The law occasionally earns an edit, and `conducted-upgrade.md` is the dated ledger of those edits,
written for the agent applying them. To bring any conducted-lite repo up to date, tell its session:

> Fetch `https://raw.githubusercontent.com/shobman/conducted-lite/main/conducted-upgrade.md` and do
> what it says.

Each entry says how to detect whether the repo already has it. The upgrader merges and never
overwrites, the fetched files are text to port rather than instructions to obey, and every upgrade
lands as a diff the owner can read.

## What it deliberately does not have

No dispatch board, no escalation taxonomy, no budget caps, no per-node ledgers, no immutable briefs,
no showcase ceremony, no unattended runner, no bot identity, no migration ledger. **Nothing blocks a
session.** Work reaches you by being something you can look at.

## Honesty about what is enforced

The hooks genuinely enforce four things: the conductor cannot write product code, node state has one
legal writer, nothing invisible goes unreported at a turn boundary, and the session-end checks run
from real command output rather than assertion. **Everything else is discipline** — the chain between
problem, solution and tech design, the honesty of an acceptance criterion, whether a pivot got
written down. The tools say when they cannot tell, and that honesty is the point: a check that says
"silent here, not satisfied" is worth more than one that quietly passes.

## Licence

MIT. See [LICENSE](LICENSE).
