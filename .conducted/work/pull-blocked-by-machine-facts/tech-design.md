# pull-blocked-by-machine-facts — tech design

Reported from miq's field notes of 2026-08-14 ("the per-turn glance rewrites state files, and that
silently blocks `git pull --ff-only`", observed twice). The notes named a cause and a remedy; both
were checked here and both are wrong. What follows is what was measured instead.

## What was measured, not assumed

Reproduced in a scratch clone of this repo on 2026-08-14. A `state.md` dirtied in the working tree,
then `git pull --ff-only origin main`:

```
EXIT=1
stdout:  Updating 9529abc..a4129de
stderr:  error: Your local changes to the following files would be overwritten by merge:
                 .conducted/work/guard-false-positives/state.md
         Please commit your changes or stash them before you merge.
         Aborting
HEAD after:  9529abc  (unmoved)
behind:      6 commits
```

Three facts fall out of that, and each one shapes the design:

1. **It exits 1.** The failure is detectable without parsing a word of output. Nothing needs to read
   English.
2. **`Updating <a>..<b>` goes to stdout while the abort goes to stderr.** Interleaved in a terminal
   the success-shaped line can land *last*. This is why it scrolls past: the final line a human sees
   reads like a completed pull. The notes called this "scrolls past easily"; it is sharper than that
   — it actively reads as success.
3. **HEAD does not move and nothing says so again.** The clone sits behind, and because the next
   glance rewrites the same file, the condition never self-clears.

## The notes' proposed remedy is already implemented, and did not prevent this

> *"have the glance skip a rewrite whose only delta is its own timestamp"*

That guard exists — `.claude/hooks/stop-glance.mjs:514-522`, landed in `9a5f397` on 2026-08-13
16:53. It renders a candidate facts block using the file's **own** provenance and timestamps and
writes nothing if the bytes match. miq adopted it in `7c62cac` at 18:29 the same day, **before** the
notes were written. So the incident happened with the antidote in place.

Checking the commit miq's own history says was a bare refresh (`79ad2ce`, "refresh the
appliance-update machine facts") shows why. Its two carriers decode to the same facts on both sides
— status `refined`, no branches, no worktrees, PR 374 — but the `judgment sha` moved
(`afb8aa25` → `f5ea487d`). That hash is of the **human** region. The conductor had edited decisions
or issues, so the block genuinely had to be rewritten. The guard behaved correctly.

**Therefore: suppressing timestamp-only rewrites cannot fix this.** The rewrites that collide are the
legitimate ones.

## Root cause

`state.md` is **generated locally every turn and tracked in git**, so the same bytes have two authors
in two places: this clone's glance, and any merged PR that touched the same feature. Collisions are
not a bug in the writer — they are the arrangement. And the moments a refresh is *most* legitimate
(the human region was edited; a branch took a commit) are the same moments a merge is most likely,
so frequency-reduction attacks the wrong variable.

The machinery's own law already says what to do with a condition it cannot prevent: **it informs, it
never blocks and it never decides.** Nothing here should stash, discard, or pull on anyone's behalf.

## The change

The glance already collects the two things this needs and joins neither:

- it parses tracking info at `.claude/hooks/stop-glance.mjs:325` with `/(?:^|,\s*)ahead (\d+)/` and
  **reads `ahead` only** — `behind` is in the same string and is thrown away;
- it already holds `wrote`, the exact list of files it rewrote this turn.

So: read `behind` alongside `ahead`, and speak when the branch is behind its upstream. When the files
standing in the way are ones the glance itself wrote, say that too, because it changes the remedy
from "resolve a conflict" to "discard a block that regenerates identically".

It stays inside the existing `say()` change-detection, so it is silent while the fact holds steady
and speaks when it moves — the same contract every other line of the glance obeys.

### Why panel

**Why report rather than fix it.** A hook that discarded a dirty file to unblock a pull would be
deciding, and it would eventually discard a human region someone was mid-edit on. The one file this
machinery most exists to protect is the one it would be throwing away. Reporting costs a line and
risks nothing.

**Why not move the facts block out of git.** A gitignored sidecar removes the collision and takes
non-negotiable 4 with it — state stops living in files in the turn it became true, and git stops
being the record of the drift. Too much paid for a message.

**Why `behind` and not "run a fetch".** Tracking info is against the last fetch, which is exactly the
guarantee the glance already gives for `ahead`. A hook that reached the network every turn would be a
new class of thing; the existing sentence pattern already ends "vs last fetch" and means it.

**Why name the glance's own writes specifically.** Without it the message is "you have local changes",
which is true of a working repo constantly and trains the reader to ignore it. With it the message is
"the thing blocking your pull is a block I wrote and can be discarded", which is actionable in one
step and is the fix both miq incidents actually used.
