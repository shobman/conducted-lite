# nag-becomes-wallpaper — tech design

## What happened

bookjob's first turn after adopting the behind-ness entry, 2026-08-14, emitted **twelve** of these
in one block:

```
· api-sizing moved this turn; its Decisions/Issues did not.
· api-telemetry-level moved this turn; its Decisions/Issues did not.
· breakglass-datastate moved this turn; its Decisions/Issues did not.
  ... nine more ...
```

Every one was true. Every one was useless. All twelve were already-complete features being swept to
`archive.md`, whose facts blocks the glance had just refreshed on that same turn — nothing was
decided about any of them because there was nothing left to decide.

## Why it fires

`.claude/hooks/stop-glance.mjs:795-803`. The nag compares a feature's `move` signature against the
previous turn's snapshot and speaks when `move` changed and `human` did not:

```js
if (was.m === f.move) continue;    // it did not move this turn
if (was.h !== f.human) continue;   // the human region moved too — nothing to say
say(`nag:${f.name}`, ...)
```

`moveSig` (line 478) is `derived | declared | docs | extra | branches | worktrees`. So a change to
**declared status alone** — a roadmap row moving, which is exactly what a sweep to `## complete`
does — counts as the feature "moving". Twelve rows swept, twelve signatures moved, twelve nags.

The condition is not wrong. It is unbounded and it does not ask whether a decision could still be
owed.

## The root cause, stated plainly

**The nag has no notion of a feature that is finished.** It is built for work in flight, where a
feature moving without a decision recorded is a real omission. Applied to a completed feature it
asks for a decision that cannot exist. And it has no ceiling, so a single bulk event turns a useful
signal into a block of text — which is the failure the glance's own doctrine names by name:

> A message that is always there is wallpaper, read once and then never again including on the turn
> it finally matters.

## The change

Two independent guards. Either alone leaves a real hole, so both.

**1 · A finished feature is never nagged.** Skip when the feature's derived **or** declared status is
`complete`. Either is sufficient: `declared` is the owner's judgement and `derived` is what the tree
shows, and a feature that reads complete by either measure is not owed a decision. The `feats` entry
currently carries only `{name, move, human, state}`; it gains `derived` and `declared`, which the
loop at line 477 already has in hand.

**2 · A ceiling, with the count preserved.** Past a threshold of nagging features in one turn, say it
once with a count and name none of them, rather than one line each. The names are the least useful
part in bulk — the reader's action is the same for all of them.

### Why panel

**Why not just the `complete` guard.** It fixes the observed incident and leaves the general one: any
bulk event across many in-flight features produces the same wall. A repo with twenty live features
and one branch rename would hit it.

**Why not just the ceiling.** It bounds the noise and keeps nagging about features where no decision
is possible, which is worse than verbose — it is wrong, and it trains the reader to skip the line.

**Why `derived` OR `declared`, not both.** Requiring both means a feature the owner ruled complete
still nags until the tree agrees, which is precisely the state a completed-and-deleted branch leaves
behind. Requiring either is the forgiving direction, and the cost of wrongly staying silent is one
missed nag on a feature that is finished anyway.

**Corrected 2026-08-14, on the builder's measurement.** The paragraph above reaches the right rule by
the wrong reasoning, and the `derived` half of it is dead code. `featureFacts` cannot produce
`complete` — `lite-derive.mjs:417`, *"`complete` is not reachable from here by design"* — so derived
never RISES to complete; a merged-and-deleted branch makes it FALL to `refined`. The whole of the OR
is carried by `declared`. The `derived` arm is kept as a defensive condition against a future or
foreign derivation, and AC #2 is honest about being unfalsifiable against the shipped modules: it is
exercised only through an injected derive shim.

**Corrected 2026-08-14 — an ARCHIVED feature is finished, and the first design missed it.** This page
originally treated "swept to `archive.md`" and "moved to `## complete`" as one event. They are two.
`placeFeatureRows:511` skips an archived feature before any row is placed — *"the archive is the
tombstone"* — so an archived feature has no declared status at all and the `complete` guard cannot
see it. That matters because bookjob's real turn, the incident this feature exists for, WAS the
archive sweep: its own report calls the twelve "archived-complete". As first built, the real incident
was caught only by the ceiling — one line instead of twelve, still claiming a decision was owed on
finished work. Archived now counts as finished in the same guard, and AC #7 gains the archive variant
as a separate case, because the two events must both stay silent for different reasons.

**Why the count and not silence.** Suppressing entirely would hide a real signal on the day a bulk
event coincides with genuine unrecorded decisions. A count is one line and keeps the fact available.

**Why not raise it to the owner.** He is never asked about this: CONDUCTOR.md is explicit that the
machine detects and the conductor writes. This changes when the machine speaks, not who decides.
