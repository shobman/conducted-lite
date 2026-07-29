# Contributing

The most useful thing you can send is **evidence from real use**. Every substantive change in this
repository so far came from someone adopting it, hitting something, and writing down what actually
happened with the command output attached. Not from anyone reading the code and having an opinion
about it.

## Field reports beat bug reports

If something went wrong, or went right in a way you did not expect, write it up like this:

- **what you were doing** when it happened, not just what broke;
- **the real command output**, pasted, rather than a description of it;
- **whether it is a defect, a papercut, or a design question** — and say if you are not sure;
- **what you would suggest**, and where you think your own suggestion is weak.

Keep operator error in the report, marked as such. A tool that is easy to hold wrong is still a
finding about the tool.

Reports that named the limitations of their own fixes have been the most valuable ones received, and
several were acted on precisely because the reporter said which half they were unsure about.

## The bar for a change

**Prove it against a real repository, not a description of one.** Paste the before and the after.
A change that cannot show the old behaviour failing and the new behaviour passing is a claim.

**Name what you could not do.** Every honest limit in this codebase is written into the file or the
`--help` rather than left for someone to discover. If your change has a hole, say where it is. A
disclosed hole is a design decision; an undisclosed one is a trap.

**Do not widen a `catch`.** Several catches here are deliberately narrow because a bare one once
swallowed a `ReferenceError` and shipped a safety feature that silently did nothing while reporting
itself as working. Catch what you mean, and rethrow the rest.

**Spawn child processes with an argument array, never a shell string.** A node path interpolated into
a shell string was a real injection here, and it printed "nothing was created" while having created
two things.

**A hook must fail open.** Malformed input, a missing file, a syntax error in a script it calls, a
timeout, an unexpected throw — every one of those exits zero and stays silent. A hook that can trap
a session is worse than no hook.

## Things this project will keep saying no to

- **A machine deciding something a human should.** Nothing marks work complete, ticks an acceptance
  criterion, or reads a merged pull request as an ending.
- **A check that always fires.** One you learn to ignore is worse than one that does not exist.
- **A guard that guesses.** Parse confidently or refuse; never allow because a pattern half-matched.
- **Prose where a mechanism would do.** If it can be a hook, it should not be a paragraph — the
  paragraph is what gets forgotten.
- **Growth in `CONDUCTOR.md`.** It is one page and stays one page. Anything added must evict
  something or become machinery.

## Style

Plain commit messages. No trailers, no em dashes, nothing that reads as written by a machine.

## Licence

Contributions are accepted under the MIT licence in [LICENSE](LICENSE).
