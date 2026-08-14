# Roadmap — forward-looking. The headings ARE the status.

<!-- The block below is the LEDGER. Two kinds of line live in it:
       generated rows  '- [name](work/name/) ...'  — written by the SessionStart fact-check from
                       what exists on disk and in git. Do not hand-edit one; the next run rewrites it.
       everything else — yours, preserved byte-for-byte under the heading you wrote it beneath.
                       An 'idea' is exactly this: a hand-written line and no folder.
     You change an item's status by making it true, not by editing this file. The ONE exception is
     '## complete': moving a row there is a human judgement, and it is the only rung a machine will
     never assign. The next SessionStart sweeps it into archive.md. -->

<!-- conducted-lite:ledger:start -->

## idea

- A test can assert the defect it guards — miq found nine, none caught by its author, one where reintroducing the original bug left 1,044 tests green. Evidence for non-negotiable 2, and maybe a standard.
- A control that has never failed is indistinguishable from a broken one — miq's secret scanner passed vacuously until it was shown failing three ways. Accept a check only after watching it fail.
- Green means two things — "checks passed" and "review complete" — and only the conductor knows which. miq's answer: open PRs as drafts, so "not a draft" means finished. Lite has no PR flow, so decide whether this reaches us at all.
- The glance should speak when the fact changes and stay silent when it does not. Reported by two independent deployments four days apart; the doctrine's own bar is two incidents.
- The ledger regenerates only at session start, so a feature created mid-session reads as an orphan worktree until someone re-runs it. Happened three times in one miq session and looked like a fault each time.
- Copying a build output is deploying, not building, and the guard denies it. Needs a ruling either way rather than a case-by-case workaround.
- The per-turn glance can contradict itself inside one sentence: it reported "no .conducted/work/guard-false-positives/ folder exists" while naming ` M .conducted/work/guard-false-positives/state.md` as the uncommitted file. It reads folder existence from the main checkout and dirt from the worktree. Observed 2026-08-13, twice.
- A reader in a multi-checkout repo should name the tree it read. Three incidents of one class: the guard resolving the wrong tree from cwd (defect 7), the old glance reading folders from main and dirt from a worktree in one sentence, and a miq evaluator filing a false finding from a worktree pinned at an old commit. Cheapest form: a standard line in evaluator briefs — state your HEAD and cwd before reporting on .conducted/.
- Capture the failing test's name by default. Two miq agents independently lost it to a grep pattern that omitted the failure marker, and neither intermittent failure was ever identified.
- A generated row should name what it found, never assert an absence wider than what it checked. bookjob's ledger printed "no documents yet" for a folder holding a complete brief.md — true about the three doctrine documents, false in plain reading, and the agent spent a paragraph teaching the owner not to misread the board. Cheapest form: "brief.md only". Observed 2026-08-13.
- Three rounds on one species is a design finding, not a third fix. A miq CI workflow took three /code-review passes; each found a different route to one failure — a safety mechanism silently disarmed while a green check watched — and every finding graded LOW or MEDIUM, so nothing ever escalated on severity. Fresh-context review cannot see this by law: each reviewer holds exactly one instance and correctly moves on. superpowers:systematic-debugging Phase 4.5 states it precisely, scoped to debugging, which has no counterpart for review→fix cycles. Sits beside "a review closes; it does not open", and may be machinery — the glance can count review rounds on a feature from git — rather than a line on the page. Observed 2026-08-14.
- Arming a PR after retrofitting an `OWNER:` box merges it off the STALE check. Editing the body to ADD boxes queues a new owner-verify run while the old run — green because the body had no boxes — is still the recorded conclusion, so `gh pr merge --auto` reads green and merges instantly. Cost miq a real accidental merge (#377) within the hour of the ruling that PRs be opened armed, carrying two unanswered owner questions. If lite ships or recommends the armed-PR pattern, the ordering IS the rule: boxes at `gh pr create` time, or edit the body, watch owner-verify go red, and only then arm. Observed 2026-08-14.
- The "no upstream" nag fires on a branch with zero commits of its own. A worktree cut for a live builder legitimately sits at main with nothing to push; the flag is technically true and actionable-looking every turn until the builder commits. Suppressing it while the branch has no commits of its own costs nothing. Observed 2026-08-14.
- A machine report whose subject no longer exists should say that, not persist. miq's "NOT TRACKED: its subject is no longer in this clone. NOT re-checked, and not resolved" ran for two turns after the worktree was removed and the branch merged and pruned — honest, but reads as an outstanding problem when it is a completed one. Same shape as a stale roadmap row the fact-check reports and never moves. Observed 2026-08-14.
- Ship `.gitattributes` with `*.md text eol=lf` in the scaffold. Writing a `.conducted/` file from Python on Windows silently converted the whole file to CRLF, turning a 38-line edit into a 419-line diff — caught only because someone checked `git diff --numstat` rather than trusting the commit. Not lite's bug; the scaffold line makes it impossible. Observed 2026-08-14.
- A branch whose upstream is `gone` is silent in both directions. `ahead` and `behind` are both empty, and the "no upstream" line does not fire because `b.upstream` is truthy — so a branch whose remote was deleted says nothing at all, which is exactly the "work exists on one machine and nowhere else" case stop-glance's own header calls the deceptive failure. Found by a fresh evaluator 2026-08-14 while judging behind-ness; pre-existing, and left as found because a review closes.
- A machine that names a fact should stop short of prescribing a remedy it has not checked applies. Three routes to this in one evaluation of the behind-ness line: a diverged branch told `git pull --ff-only`, which cannot work; a detached HEAD told the same; and a discard advised as lossless while the human region of the same file was uncommitted. Each finding was true and separately graded MEDIUM, MEDIUM, HIGH — the shape is only visible across all three. Cheapest form: the glance names the state and the file, and offers a remedy only when it has observed the state the remedy needs. Observed 2026-08-14.
- The law reaches the agent through a file conducted does not own, and nothing detects its loss. `CLAUDE.md`'s two pointer lines are the only thing that makes an agent read `CONDUCTOR.md` — the hooks use the page's EXISTENCE as a detector (`if (!existsSync(CONDUCTOR_REL)) quiet()`) and never instruct anyone to read it. So a repo that rewrites its `CLAUDE.md` keeps every hook running perfectly, loses the doctrine entirely, and no check fires because each hook's own detector is still satisfied. Design agreed 2026-08-14, for a later build: KEEP the `CLAUDE.md` pointer (it costs nothing and it is the only thing that survives compaction in the system prompt) AND inject the law from hooks at three events — `SessionStart`, `SubagentStart` and `PostCompact`. Three gaps that shaped it: hook output is a conversation message and can be compacted away where `CLAUDE.md` persists; SessionStart fires for the main session only, so a dispatched builder or evaluator would get no route to the law at all; and `/clear` and resume need confirming as SessionStart triggers, which is unmeasured. Open choice: inject a POINTER or the PAGE ITSELF — the page removes the last place compliance can quietly fail, at about 170 lines of context per agent. The upgrade entry for it would be the first that edits a repo's own `CLAUDE.md`, and it should REMOVE conducted's lines only if the injection lands first.
- The human-region nag fires per feature and becomes wallpaper in bulk. bookjob's first turn after adopting the behind-ness entry emitted TWELVE `<feature> moved this turn; its Decisions/Issues did not` lines in one block — every one for an already-complete, about-to-be-archived feature whose facts block the glance itself had just refreshed. Nothing was decided about any of them, so there was nothing to write; the nag was correct about each and useless about all. This is precisely the failure the glance's own doctrine names — "a message that is always there is wallpaper, read once and then never again including on the turn it finally matters". Cheapest forms: do not nag a feature whose derived or declared status is `complete`; and where more than N features nag in one turn, say it once with a count rather than once per feature. Observed 2026-08-14 in a second deployment, on the turn the machinery it ships with was adopted.
- The gate ladder has rungs above the estate floor (gates + owner-verify + auto-merge, applied to 16 repos 2026-08-13). Each rung is one more required check, so adoption is a workflow plus one ruleset edit: a coverage floor that only ratchets up; brief-conformance as CI — a fresh-context agent answers "does this diff do what the brief said" and fails otherwise; build evidence in the PR — screenshots of the changed surface beside the OWNER box so the tick is informed. Admission test for any rung: watch it fail first (the "control that has never failed" line above is the same law).

## new

## accepted

- [instruction-freshness](work/instruction-freshness/) — problem.md, solution.md

## refined

## development

## complete

- [guard-false-positives](work/guard-false-positives/) — tech-design.md
- [nag-becomes-wallpaper](work/nag-becomes-wallpaper/) — tech-design.md · merged to main 2026-08-14
- [pull-blocked-by-machine-facts](work/pull-blocked-by-machine-facts/) — tech-design.md
<!-- conducted-lite:ledger:end -->
