# Standards — the rules this project's output is held to

This file is **meant to grow**. It is the blueprint that accumulates across projects: every ruling
that outlives a session, every rule an evaluator can cite by number. `CONDUCTOR.md` stays one page;
this one earns its length. Rules are rewritten in place and dated, never appended to as a log.

One rule per line or short block, numbered, each with a link or a sentence of evidence. An evaluator
cites the number; a builder is briefed with the number. A rule nobody can cite is not a standard,
it is an opinion.

## 1. Review

1.1 **More than one route to the same shape is a design finding, not another fix.** When findings
in one review, or across successive rounds, are different routes to the same *kind* of defect, stop
patching: name the species and bring the owner the shape rather than the next fix. **Severity hides
this** — each instance is correctly graded LOW or MEDIUM, and nothing ever escalates, because the
signal is in the repetition and not in any one finding. Evidence, both 2026-08-14: miq's publish
workflow took three `/code-review` passes, each finding a different route to *a safety mechanism
silently disarmed while a green check watched*, every finding LOW or MEDIUM; and this repo's
behind-ness line drew three routes to *a machine prescribing a remedy for a state it never checked*
— a diverged branch and a detached HEAD both told to run `git pull --ff-only`, and a discard advised
as lossless — graded MEDIUM, MEDIUM, HIGH.

1.2 **The trigger is routes held in one context, not rounds.** Rounds are only the case where no
single context holds the instances. Fresh-context review makes each reviewer trustworthy and blind:
it sees one instance, grades it correctly, and moves on. A conductor counting rounds would have
stayed silent on 1.1's second example, where all three routes arrived in a single pass. Evidence:
the round-counting draft was written on 2026-08-14 and falsified by an evaluation the same day.

1.3 **Noticing is the conductor's duty and nobody else's.** It is the only role that holds the
history across dispatches, so a rule scoped to reviewers cannot catch this.
`superpowers:systematic-debugging` Phase 4.5 states the same principle for debugging, where one
agent sees its own history; review→fix cycles have the identical shape and destroy that history by
design. Evidence: in the miq session the conductor caught it by luck, off a pre-commitment made one
turn earlier in conversation — which is not a mechanism.
