# instruction-freshness — problem

## What is happening

The file loaded into every session as standing instruction can contradict what the project has
already decided, and nothing notices. In the MukFork adoption it told every session *"the stack is
not chosen"* for a full day after the stack was chosen, ruled, and written into a tech design. It
was caught by accident, when the owner asked an unrelated question.

Every other claim in this repo is checked against reality at session start. Feature status is not
maintained by hand, it is derived from folders and git. A `state.md` claiming a branch that does not
exist is fact-checked and reported. The roadmap is regenerated. The one file that is *asserted to
every session as true*, and that no session was present for the writing of, is the one nothing
verifies.

## For whom

The conductor at the start of a session, who has no memory of the decision and no reason to doubt a
standing instruction. Reading is not the defence: the file is context, not a document anyone opens,
and it is trusted precisely because it arrives as instruction rather than as a claim.

Downstream of that, every builder briefed from a framing the conductor took from it.

## Why it matters

It is a highest-leverage failure. A stale roadmap row misleads one reader once; a stale standing
instruction is asserted at the top of every context, and it is asserted with authority. The cost
compounds through the doctrine's own machinery: the conductor briefs from it, the builder builds from
the brief, and the evaluator judges against a `so that` that inherited the same wrong premise. A
fresh pair of eyes does not help when every pair is handed the same false sentence.

It is also the one class of drift the doctrine's core answer does not reach. *"State lives in
files"* protects against a dead session losing work. It does not protect against a file that is
confidently wrong, and it makes the wrongness durable.

## What is not the problem

Not that the file is edited by hand — everything the conductor owns is. Not that it goes out of date;
every document here drifts and CONDUCTOR.md calls that correct. The problem is that it drifts
**silently, while being asserted as instruction**, when the material that would contradict it is
already on disk and already read by a check that runs every session.

## What success looks like

A session that opens with a standing instruction contradicted by the repo's own state is told so, on
its first turn, with the contradiction named and the evidence attached — in the shape the existing
fact-check already uses: *it asks, with its evidence, and never changes anything*.

Success is also bounded by honesty about what is detectable. A check that flags prose it merely
finds suspicious will be ignored within a week and will have taught the conductor to skip the one
place the machine speaks. Better to detect one class provably — a claim naming something the ledger
can see under a different heading — and say nothing about the rest, than to guess broadly.

## What the field says actually goes stale — answered 2026-08-13

Two deployments answered, and they agree on the shape while disagreeing about the instance.

**MukFork.** The stale line was **seeded at adoption and never edited**, while the bullet directly
beneath it was kept current — the name was ruled and the file updated the same day. So the file is
maintained, and the failure is not neglect: *the person who changed the stack was not looking at the
instruction file.* Of 14 non-heading lines, **5 assert a mutable fact** — a third of the prose, and
the third written to be read.

**miq, and this one has a body count.** Its instruction file named a service unit that had moved:
the live server became a system unit, the old user unit still existed but was inactive. An overnight
session queried the retired unit, got a confident zero, and recorded *"the server had sent the head
no HTTP at all for 50 minutes"* as an observation. Re-queried against the correct unit the next day:
the poller had run every three seconds for 251 continuous minutes with no gaps. **A stale line in a
standing instruction manufactured a defect that did not exist, and it was written into a feature's
`state.md` as evidence and used to set a priority.**

That is the case in full. The doctrine's answer to a false claim is that a fresh pair of eyes checks
it — and here the wrong premise was handed identically to every pair. It also defeats the
instrument-check rule in non-negotiable 3 exactly as that rule warns: *an uninstalled tool returns a
confident zero*, and so does a query against a unit that no longer serves.

**The class is a name that moved** — a path, a service, a host, an artifact. Not a feature slug, not
a stack choice, not an open question that got ruled.

## A second class, which no freshness check would find

miq also recorded a claim that was **never true rather than gone stale**: a runbook written with an
absolute Windows toolchain path, correct in one shell and wrong in the two others the same repo
uses, wrong within minutes of being written. Age is not the signal. **A path-shaped claim that is
absolute and platform-specific is suspect the moment it is written**, and a check that only measures
drift over time misses the class completely.
