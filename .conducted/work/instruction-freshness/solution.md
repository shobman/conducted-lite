# instruction-freshness — solution

User stories, outside-in. The user here is the conductor at the top of a session and the owner
reading what that session then tells him.

## The detector that is NOT built, and why that is the main decision

**Do not build "a feature slug named in the instruction file sits under a different roadmap
heading".** Both field deployments proposed it and miq then showed it is already done: session start
regenerates the ledger from disk and git, fact-checks every `state.md`, reports the disagreement
without acting, and counts acceptance criteria without ticking one. Building it again would add a
second voice saying what the first already says, in the one place a conductor still reads.

**Why this is worth stating rather than quietly dropping:** it was the obvious detector, it was
recommended twice, and it was obvious because it is the drift this repo already handles well. The
classes that survive are the ones nothing watches.

## Stories

**As a conductor opening a session, I want to be told when a standing instruction names a path,
service or host that the repo can no longer find, so that** I do not brief a builder — or query an
instrument — from a name that moved. This is miq's confirmed kill: a retired service unit named in
the instruction file produced a confident zero, and the zero was filed as an observation.

**As a conductor, I want an absolute, platform-specific path in a standing instruction flagged when
it appears, so that** a command correct in one shell and wrong in the other two this repo uses does
not become a runbook step. Age is not the signal here and the check must not wait for drift.

**As a conductor, I want a standing instruction that describes an unsettled decision flagged once
the repo shows it settled, so that** the file stops asserting an open question after it has been
ruled. This is MukFork's incident, and it is the weakest of the three: the ruling has to be visible
in a document for the check to see it.

**As the owner, I want the check silent unless it has something with evidence, so that** the one
place the machine speaks stays worth reading. A finding a human dismisses is worse than no finding.

## What a finding looks like

The shape the fact-check already uses — the claim, the contradicting evidence, both sides named, and
nothing changed:

> `CLAUDE.md:31` names `miq-core.service`. Nothing under `.conducted/` or `deploy/` mentions it;
> `miq-server.service` appears in 4 files, most recently `deploy/README.md`. Reported, not acted on.

> `CLAUDE.md:88` carries an absolute path under `/c/Program Files/`. This repo runs commands under
> more than one shell; that path resolves in one of them.

## What is deliberately out

- **Editing the file.** It reports and stops, like everything else session start does.
- **Judging prose.** No detector fires on a sentence for being old, long, vague or confident. Every
  finding must name a token the repo can be searched for and say what the search found.
- **New state.** No cache of what the file said last session, no timestamps, no ledger of claims. The
  detectors above need only the file's text and the tree, both of which the session-start pass
  already holds.
- **Other instruction files, for now.** `CLAUDE.md` is the one loaded into every context. If the
  same check would help elsewhere it can be pointed there later, and that is a smaller decision than
  this one.

## Acceptance sits in `state.md`

Including the one that matters most: **run it against this repo's files and against miq's, and
produce no finding a human then has to dismiss.** miq's 275-line instruction file is the honest test
of whether these detectors are quiet enough to be worth having.
