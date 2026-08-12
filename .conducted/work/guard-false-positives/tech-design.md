# guard-false-positives — tech design

The decisions and why. Corrected after the build where the build proved a decision wrong — a design
document that outlives its falsification is a summary disagreeing with its source.

## The shape of the fix

`scanBash` answers two questions in order: **does this command write** (a shape question — unchanged)
and **what does it write** (a position question, answered per shape, from where that shape puts its
target). Never by scanning the line for filename-shaped tokens: the token scan was the single root
cause behind every field defect, and three symptom patches had already failed to contain it.

| Shape | Target position |
|---|---|
| `>` `>>` and fd/variant forms | the word after the operator, at a code offset |
| `tee` / `sponge` | non-flag words after the verb |
| `sed`/`perl`/`ruby` in-place | the operand words, never the script |
| `cp` `mv` `install` `rsync` `ln` | last word after option stripping; a directory destination joins each source basename |
| interpreter + write call | the argument of the write call, one variable hop, nothing else |
| shell `-c` / `eval` | the inline script re-entered through the same scan, depth-capped at 2 |

Two supporting principles, both earned in the field during this build:

- **One mask.** A single `codeMask()` decides which offsets are code and which are quoted/heredoc
  data; the redirect scan, the segment splitter, and the wrapper verb all consult it. Every branch
  that skipped the mask produced the same bug independently (`->` in prose, `s|a|b|` splitting a
  segment, a wrapper verb inside a PR body).
- **One exit from indeterminacy.** A write-shaped command whose target does not resolve is denied
  naming nothing, in those words. No fallback pass hunts the line for a nameable candidate — that
  pass is where every invented filename came from.

## Decisions the build overturned — kept because a successor may retrace them

- **`argv[N] → Nth positional` resolution was designed here and is NOT built.** It contradicts the
  corpus (fixture A4 requires that exact shape to deny naming nothing) and violates the design's own
  one-hop rule. The variable-binding hop is built; the argv hop is not.
- **`->file` is a real redirect.** An early fix proposal excluded `>` preceded by `-`; a builder ran
  it in bash and `echo hello->out.txt` creates the file. The discriminator is quoting, not the
  preceding character — hence the mask.
- **The proposed rule "a bare extension was never a candidate" was satisfied by removal**, not by a
  predicate: nothing splits `row-*.jpg` into `.jpg` any more.

## The corpus is the contract

`.claude/tests/guard.test.mjs` drives the hook as a black box — payload in, decision out — because
that is the surface the field exercises, and fail-open is only observable from outside. Expectations
derive from the header's promises, never from current behaviour. Field commands enter byte-for-byte
from transcripts (`fixtures/PROVENANCE.md`); a retyped command hit a different branch twice and an
abridged one hid a live defect behind a clean negative. Known-defect cases are written to fail
before the fix and pass after, with no assertion edit between.

## Out of scope, permanently — see the header's declared limits

Determination-shaped paths (git's write verbs, unenumerated interpreter vocabulary, directory
copies, junctions into subdirectories). The guard's contract is drift, not determination — the
ruling and its reopen condition live in `state.md`.
