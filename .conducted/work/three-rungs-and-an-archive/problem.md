# three-rungs-and-an-archive — problem

## What is happening

The ledger holds six rungs where the owner thinks in three, and the view holds state that belongs
elsewhere. Ideas are hand-written lines living only on the roadmap — so the roadmap is part primary
record, part derived view, and the machine must write into a file the owner regards as theirs.
The field showed what that permits: of the idea lines on this repo's own roadmap, only two traced
to the owner's words; the rest were machine-authored, and the law itself directed them there.

`complete` is a transit lounge: the fact "the owner said done" exists only as a row's position
until a sweep carries it to the archive file — and the sweep moves rows, never folders. Three
finished features are archived on paper while their folders still sit in `work/`, so `work/` no
longer means "not finished." The never-demote ratchet stores its memory in the roadmap's own rows,
so the view feeds its own regeneration.

## For whom

The owner, whose ledger should answer three questions at a glance — what ideas exist, what is
ready to build, what is being built now — and whose idea space should contain only their own
thinking. Downstream, every session that opens by reading state: a `work/` folder that may or may
not be finished, and a roadmap that is partly a view and partly a record, both cost trust.

## Why it matters

The machine writing ideas is the widening failure mode this whole framework exists to cage, landed
in the one file that shapes what gets built next. And a finished work item that lingers — in the
ledger or in `work/` — invites exactly what the owner has ruled against: operating from old
rulings. Done work is law in the code; the papers are for mining, and mining material does not
belong on a forward-looking board.

## What is not the problem

Not the derivation itself — a status nobody maintains is the drift-killer and stays. Not the
machine writing the *derived* rows — a projection has no author. Not the archive file — it works;
it is just only half of archiving.

## What success looks like

The owner's model, in their words: *"here's an idea, not fleshed out; here's a worked item ready to
build; here's some items currently being built. THAT IS ALL."*

- **Three headings: idea, refined, active.** Every rung derived from what exists in the feature's
  folder and in git — no hand-written lines on the roadmap, no human region in the ledger at all.
- **An idea is an owner-approved file in `work/`**, entering owner-led like every work item. The
  roadmap's idea rows are derived from those folders, so the roadmap becomes a pure view the
  machine regenerates without ever authoring a word of it.
- **`complete` does not appear on the ledger.** When the owner says done, the folder moves —
  mechanically, on that word — out of `work/` into `archive/`, and the archive row is stamped with
  the commit or PR that made the work law. The roadmap row vanishes by derivation: no folder in
  `work/`, no row. If the owner ever wants to change shipped behaviour, they start from the code,
  never from the archived papers.
- **`work/` means unfinished again**, and the ratchet's memory lives in the work item's own state
  record, not in the view.

Success is bounded the usual way: the machine still never decides done — it clerks done, after the
owner's word, reversibly.
