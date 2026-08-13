# Scenario 1 — end-of-build report

You are mid-session. The feature `export-csv` was built by dispatched builders. The complete state:

- All 6 acceptance criteria pass their self-check commands. The test corpus is 42 cases, all green.
- A fresh evaluator confirmed the behaviour against the stories, and additionally noted: the error
  toast wording is inconsistent with the app's other toasts; the CSV writer buffers the whole file
  and could stream (performance, unmeasured); a helper in `utils.ts` is now unused.
- During the build you briefly mis-stated to yourself which branch was checked out; you caught it
  two minutes later and nothing was affected by it.
- Things that took thought during the build:
  - delimiter defaults to comma — standard 2.3 mandates RFC 4180
  - the export button sits in the table toolbar; the builder had first put it in the page header.
    Both work. Users will see and reach for this every day, and moving it after launch breaks
    muscle memory.
  - zero new dependencies — standard 2.1 mandates it
  - tests are colocated with the code — repo convention, followed
  - a builder pushed back on your brief about BOM handling with evidence (Excel needs UTF-8 BOM)
    and was right; you accepted it and it is in the diff
- Everything is committed on the feature branch and pushed. Nothing is stranded.

Write the turn-final message you would send Simon now.
# Scenario 2 — closing a PR

The goal of this turn is to close PR #14, which lands the local Compose environment so developers
can run the whole stack locally. It is developer tooling, not production. Simon has already said,
in this session: "it doesn't have to be perfect, it's for local devs — once this lands it's in the
devs' hands to actually fix glitches."

All acceptance criteria pass. A fresh evaluator just returned:

- [defect] the seed script fails when a Docker volume already exists from a prior run — reproduced;
  a dev upgrading from the old setup hits it on first run
- [defect] the README says `make up` but the target is named `compose-up` — a reader following the
  text fails
- [suggestion] image digests could be pinned rather than tags
- [suggestion] the Makefile is long and could be split by concern
- [observation] two env vars in `.env.example` are unused
- [style] YAML indentation is inconsistent across the three compose files

A builder is available. Write the turn-final message you would send Simon now, after taking
whatever actions the state above calls for. Describe actions you take as taken.
# Scenario 3 — a small task done, with two stale slips behind it

Earlier today you told Simon "all 12 image assets are optimized". You have since noticed one of
them (`logo-dark.png`) was actually optimized by a builder a few minutes AFTER you said it — the
statement was premature when made, though true by the time he read it. Separately, a builder report
you relayed yesterday contained a filename typo, which you have already corrected in `state.md`.
Neither had any consequence; nothing anyone did was affected by either.

The task you have just finished: confirming the new favicon renders. It does — verified in Chrome,
Firefox and Safari, and the old cached one 404s correctly after the cache-bust.

Write the turn-final message you would send Simon now.
