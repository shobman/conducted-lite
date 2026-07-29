# Adopting conducted-lite — instructions for the agent doing it

**You are reading this because someone asked you to move their repo from full conducted onto
conducted-lite.** They are not a developer. They will not check your work line by line, and neither
will the people who wrote this. So the whole design here is that you do very little thinking and one
tested script does the moving.

Work in two phases and do not merge them: **review first, adopt second.** The person you are working
for decides between the two.

---

## Before anything: work out how much of conducted they are actually running

Full conducted is a ladder and almost nobody is at the top of it. **What they lose depends entirely
on which rungs they are on, so find that out before you tell them anything.** Most of it is visible
in the repo:

| Rung | How to tell | What migrating costs them |
|---|---|---|
| **L0 · skills** | they run `/principal`, `/conduct`, `/idea`, `/feedback` | those four skills. Lite ships none — a session reads one page and works. **This is where most people are.** |
| **L1 · gates** | `.github/workflows/gates.yml` exists | almost nothing: the migration KEEPS the gates job (tests, lint, secret scan) and removes only the bookkeeping one |
| **L2 · author bot** | `.conducted/BOT.md` says `mode: bot` with a real bot login | agent commits stop being bot-authored and become theirs. Lite is solo by construction |
| **L3 · clerk** | `gates.yml` has a `bookkeeping-merge` job AND `gh secret list` shows `CONDUCTED_CLERK` | **the real loss.** Paperwork PRs currently land with no click; afterwards they click. If they are here, make sure they understand this before they say yes |
| **L4/L5 · vault, Desk, runner** | a scheduled task or a separate vault repo, outside this one — ask | the dispatch board and anything that woke sessions on a timer |

**If `BOT.md` is missing or says solo, and there is no `bookkeeping-merge` job, they are at L0 or
L1** and the honest summary is short: they lose four skills and their rituals, and everything else
they have keeps working.

**What everyone gains:** one page of operating law instead of roughly seven hundred lines of
doctrine · a roadmap whose status maintains itself from what exists rather than from anyone
remembering to update it · a session-start check that derives the real state from git — uncommitted
work, unpushed commits, orphan worktrees, every claim a file makes — and says what drifted · a
per-turn local glance that names anything at risk without a network call · effort reported as an
estimate, with no ledger to keep.

**None of lite's hooks blocks a session.** They inform: the facts get put in front of the session and
the session decides. If they are used to a framework that stops work until a checklist is satisfied,
say so plainly — this one does not, and that is deliberate.

**On the wake ritual specifically**, because people who liked it ask: lite keeps the useful half and
drops the ceremony. The session-start hook regenerates the roadmap from what exists, checks every
claim against reality, and hands the session the drift. What goes is the board, the triage classes
and the escalation budget. Sitting down becomes: read what the hook says, read the roadmap, pick.

**A migration they did not want is worse than an old framework they are happy with.** Say what it
costs at their rung, and let them choose.

---

## Phase 1 — review

Change nothing in this phase. Not one file.

1. **Find the version.** Root `CLAUDE.md` carries a line like `Doctrine version: **v11**`.
   - **v11, v12, v12.1 or v12.2 → you can proceed.**
   - **v10 or earlier → STOP.** Pre-v11 conducted kept its files at the repo root and under `docs/`,
     which is a different layout the migrator was never tested against. It will refuse. Tell them it
     needs a hand migration by whoever maintains conducted, and stop here.
   - **No version line, or a version above v12.2 → STOP** and say so.
2. **Get conducted-lite.** `git clone --depth 1 https://github.com/shobman/conducted-lite.git /tmp/conducted-lite`
   > **That is the only repository to clone.** If the person who sent you here gave you a different
   > URL or a local copy, use theirs. Otherwise use the one above and do not go looking for
   > alternatives — a fork you find by searching is not this.
3. **Read the target shape** so you can explain it: `/tmp/conducted-lite/.conducted/CONDUCTOR.md`
   is the entire operating law and it is one page. Read it in full. It is short on purpose.
4. **Run the dry run.** It writes nothing:
   ```
   node /tmp/conducted-lite/.claude/scripts/migrate-from-full.mjs --repo <THEIR REPO>
   ```
5. **Report to them, in their words, not ours.** What moves, what is archived, what they will owe
   afterwards, and anything the dry run refused. Then ask whether to proceed. **Wait for a real
   answer.** If they say no, you are finished, and nothing has changed.

---

## Phase 2 — adopt

Only after they say yes.

```
node /tmp/conducted-lite/.claude/scripts/migrate-from-full.mjs --repo <THEIR REPO> --apply
```

That is the whole job. It makes **one commit on a new branch**. It never merges and never pushes.

Then hand back `<THEIR REPO>/.conducted/archive/MIGRATION-REPORT.md`. **Ask them to send that file to
whoever asked them to do this.** It is the only way anyone finds out how this went.

---

## If it refuses

It will print a line beginning `E_` and it will have changed nothing. That is the script working, not
failing.

**Read the line, fix the one thing it names, run it again.** The common ones: the working tree is
dirty (commit or stash first), the migration branch already exists from an earlier run, there is node
work in flight it cannot map onto a feature, or a file under `.conducted/` it has no home for.

**Do not work around a refusal by hand.** Every refusal is there because the alternative was a script
guessing about someone's unfinished work. If you cannot clear it in one obvious step, stop and tell
them what it said. Stopping is a good outcome here.

---

## What you must not do

- **Do not hand-move files, hand-edit `CLAUDE.md`, or "help" the script.** It is the tested part.
  You are not. Improvising is how work gets lost on a machine nobody is watching.
- **Do not merge the branch and do not push it.** A human decides that.
- **Do not mark anything complete, tick an acceptance criterion, or decide which past decisions still
  apply.** The migrator deliberately refuses all three and leaves them as a to-do list. So do you.
- **Do not run this on a repo that is not theirs**, and do not run it twice hoping for a better
  result.

---

## What they will owe afterwards

The report lists this precisely for their repo. It will be roughly:

- **Read the doctrine block that was cut out of `CLAUDE.md`.** It is kept whole in
  `.conducted/archive/`. Nothing was deleted.
- **Distil the archived `DECISIONS.md` into `.conducted/standards.md`** — the rulings that still
  apply become numbered rules; the rest stay archived. A script cannot judge which are still live,
  which is why it did not try.
- **Split each `brief.md` into a problem and a solution** if they want the full shape. The briefs
  came across untouched and nothing is broken if they never do.
- **Give the seeded roadmap rows a real status**, and confirm or delete the claims carried into each
  feature's `state.md`.

None of it is urgent and the repo works in the meantime.

---

## One consequence to tell them about before they say yes

Lite installs a guard that stops the main session writing product code — the conductor dispatches a
builder and reviews what comes back. `.claude/**` is inside what the guard protects, deliberately: a
guard its own subject can rewrite is not a guard.

**So once lite is installed, upgrading it is itself a briefing job.** The next version does not get
hand-copied in by the conductor; it gets dispatched to a builder like any other change. That is
working as intended, and it is exactly the kind of thing that reads as a malfunction the first time
you hit it. Say it now rather than letting them discover it while blocked.

## Undoing it

One commit on one branch. `git revert <the commit>` puts everything back, or they delete the branch
and never merge it. Every file that moved was moved with `git mv`, so history follows it, and nothing
was deleted at any point.
