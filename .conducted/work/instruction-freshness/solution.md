# instruction-freshness — solution

User stories, outside-in. The users are the session writing a standing instruction at the moment it
writes, the conductor at the top of every later session, and the owner reading what both tell him.

## The main decision: the check moves to the write, not the read (2026-08-15)

The first draft of this page put three detectors at session start. It is replaced, and the reasons
are recorded because each is a failure class this project has already paid for once:

- The name-that-moved detector needed a content search across the tree, and the session-start pass
  holds no content index. The acceptance criterion "no new subprocess, no new tree walk" could not
  be met by the design that carried it, and neither document noticed the collision.
- The absolute-path detector would fire every session until the line was edited, including on a
  path that is correct and deliberate. That is the wallpaper mechanism `nag-becomes-wallpaper`
  shipped a fix for in the same week this page was first drafted.
- The settled-decision detector needed a ruling visible as prose, which is judging prose, and
  MukFork's own stale line — "the stack is not chosen" — carries no token any search can hold. The
  detector could not have caught the incident that motivated it.

The root cause is in problem.md's own words: *the person who changed the stack was not looking at
the instruction file.* Both incidents entered the file at a write — one wrong within minutes, one
made stale by a ruling recorded somewhere else. So the mechanical check belongs at the write, where
the one context that can fix or justify the line is the context being spoken to, and it speaks
once, not every session forever.

## The root fix is a standard; the machinery patrols only its edge

**A standing instruction carries law and pointers, never a mutable fact. The fact lives in the file
that owns it, and the instruction names that file.** Not a new idea here: CONDUCTOR.md already
applies it to itself — "`--help` is the reference, not this page", written after its own hand-kept
description drifted — and this repo's `CLAUDE.md` is the existence proof: three pointer sentences,
nothing that can go stale. MukFork's real defect was not one stale line; it was that five of
fourteen lines asserted mutable facts at all. Under the standard, the class the settled-decision
detector chased has nothing to live in.

The standard is a human rule and lands as a dated line in CONDUCTOR.md, citing both incidents.
The machinery below enforces only its mechanically-checkable edge.

## Stories

**As a session writing to `CLAUDE.md`, I want an absolute, platform-specific path in what I am
writing flagged on that write, so that** a command correct in one shell and wrong in the others
never enters the standing instruction — challenged once, at birth, by the context that holds the
reason it was typed. This is miq's runbook line, wrong within minutes of being written; session
start was always too late for it.

**As a session writing to `CLAUDE.md`, I want a backticked or path-shaped token the repo cannot
find flagged on that write, so that** a name that already moved does not enter the file with
authority. This is miq's confirmed kill — a retired service unit named with confidence — caught at
the door instead of hunted afterward. The bound is declared: backticked spans and path-shaped
strings only, because extracting anything else from prose is the judging this page bans.

**As a conductor adopting lite over an existing instruction file, I want one sweep at adoption
reporting what the write-time check would have flagged, so that** a legacy file gets one honest
audit and never becomes a per-session nag.

**As the owner, I want session start to say nothing new, so that** the one place the machine speaks
stays worth reading. Nothing from this feature runs there.

## What a finding looks like

Guard-shaped: attached to the write that carries it, said once, and the write proceeds.

> The content written to `CLAUDE.md` names `miq-core.service` in backticks; nothing in this repo
> mentions it. Written anyway — flagged, never blocked.

> The content written to `CLAUDE.md` carries an absolute path under `/c/Program Files/`. This repo
> runs commands under more than one shell. Written anyway — flagged, never blocked.

## What is deliberately out

- **Blocking.** conductor-guard already intercepts every write and `CLAUDE.md` is on its owned
  list; this rides that interception and only ever attaches words. A blocked write to the briefing
  page would be the machine deciding what instruction the conductor may keep. **And the check runs
  in isolation:** no failure in it may change the guard's own allow/deny answer in either
  direction — a crash that blocked a write would be the flag failing closed, and one that let a
  deniable write through would disable the security half of the guard, which is worse.
- **Session-start detectors.** All three from the first draft, for the dated reasons above.
- **Judging prose.** The token bound is backticks and path-shapes. A sentence is never a finding.
- **New state.** No cache, no ledger of claims, no allow-list — a flag that fires once at the write
  has nothing to remember.
- **The residue, named:** a name that moves AFTER it was written, in a file that ignores the
  standard, is detected by nothing here. Neither is a write the hook never sees — a hand edit in
  an editor, a merge, a pull or a checkout that changes `CLAUDE.md` through git itself — and an
  ignored flag never speaks twice: fire-once with no state means no second chance, which is the
  price of not being wallpaper. The standard is what covers all of it — a file carrying no mutable
  fact has nothing for a merge to rot — and the pointer-injection idea already on the roadmap
  shrinks the rest. Declared, not solved.

## Acceptance sits in `state.md`

Including the quiet test, which is unchanged in spirit: replay miq's 275-line instruction file and
this repo's own through the write-time check, and produce no finding a human then has to dismiss.
