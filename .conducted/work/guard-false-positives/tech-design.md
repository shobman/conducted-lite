# guard-false-positives — tech design

The decisions and why. Not a spec: the builder chooses the code.

## The shape of the fix

`scanBash` currently answers one question — *is any file-shaped token on this command line out of
bounds?* It should answer two, in order:

1. **Does this command write?** A shape question. Redirection, tee, in-place edit, cp/mv, an
   interpreter carrying a write call. This part is right today and is not being changed.
2. **What does it write?** A *position* question, answered per shape, from the place that shape puts
   its target — and never by scanning the line for things that look like filenames.

Only step 2 changes.

**Why:** the guard's header already states the principle — *"a shape decides WHETHER to look at a
path, never stands in for looking at one"* — and every branch honours it except in where it gets the
path from. Three separate regexes have been added for three earlier field cases (`io.open`,
`>_<` in a commit message, the heredoc that wrote its own `state.md`), and a fourth class arrived
anyway. The token scan is the thing generating the class.

## Per shape, where the target comes from

| Shape | Target is | Today's bug it kills |
|---|---|---|
| `>` / `>>` | the token after the operator | — (already positional) |
| `tee` / `sponge` | the non-flag arguments | — (already positional) |
| `sed -i` / `perl -i` | the operand arguments, not the script | latent: a path inside a `s///` expression |
| `cp` / `mv` / `install` / `rsync` / `ln` | **the last argument after option stripping**, and if it names a directory, that directory joined with each source's basename | Issues 1, 2 |
| interpreter + write call | **the argument of each write call**, and nothing else | Issues 3, 5 |

**Why the cp change:** the destination of `cp` is a position, and it is knowable — it is the last
argument. Today it is guessed as "the last token that looks like a file", which silently becomes a
*source* whenever the real destination is a directory or a variable. Reading the position also gets
the answer right for the case that matters most: `cp docs/a.jpg /c/temp/out/` resolves to a target
outside the repo, which is already an allow.

**Why the interpreter change:** a path that a script *writes* is the argument of its write call.
Scanning all quoted literals cannot distinguish that from a path in the content, a URL, or a search
string — and the content of a write is exactly where arbitrary filenames appear. The field settles
this: a heredoc writing `.conducted/standards.md` was denied for a `creator.html` sitting inside the
text it was replacing, and it is **still denied when the target is a bare literal in plain sight**.
No amount of better target-finding fixes that, because the target was never the problem. The
`strays` veto has to go with the scan, not be tuned: it exists to stop one owned literal buying an
allow for `open('src/app' + '.ts','w')`, and under the argument rule that concatenation simply fails
to resolve, which is already a deny.

## The fallback after indeterminacy is the bug

Two commands can enter the interpreter branch with the same indeterminate target and leave by
different exits. MukFork's `node -e` writes to `process.argv[1]`; a reconstruction of it exited
honestly at *"the target could not be determined"*, while the real one continued, scanned the
command line for something filename-shaped, found `ramen.jpg` inside an `<img src=…>` in the HTML
being written, and announced it as the file the command writes.

**There must be one exit.** When the argument of a write call does not resolve to a path, the branch
denies and says the target could not be determined. It never substitutes a candidate found
elsewhere, and there is no second pass over the line looking for one. That second pass is
`check(fileTokens(cmd), …)` and the `nameable` concatenation above it; both go.

**Why this is the branch worth the attention:** it is the only place in the guard where a *failure to
know* is converted into a *confident claim*. Every other unknown in this file resolves to silence.

**And the failure to know is itself manufactured.** `interpreterTargets` matches quoted literals with
a content class that excludes all three quote characters, so **one inner double quote anywhere in a
script body empties `targets`** — measured: the same `python -c` writing an owned `state.md` allows
without an inner quote and denies with one. A script that does find-and-replace, which is the whole
reason to reach for an interpreter over the editor, contains quoted strings by definition. So the
branch is at its least able to resolve a target exactly when the conductor has the best reason to be
there. Extracting the write call's argument replaces this scan rather than repairing it; do not try
to widen the quote class.

## Resolving one step further, where the step is knowable

Two of the three field commands carry their real target one hop away, and the hop is positional
rather than semantic:

- `p = ".conducted/standards.md"` … `io.open(p, "w")` — a name bound once to a string literal in the
  same script, then used as the argument.
- `node -e '… fs.writeFileSync(process.argv[1], html)' "$D/look4.html"` — `argv[1]` is the first
  positional argument of the invocation, and `D` is assigned a literal on the line above.

A single-hop fold — a name assigned exactly one string literal in the same command, and `argv[N]`
bound to the Nth positional — resolves both, and resolves them to the *right* answer: owned in the
first case, outside the repo in the second.

**Why bother, given unresolved already denies honestly:** because an honest deny here is still a
false positive, and the whole finding is that a false positive gets routed around with the `Write`
tool in seconds. A guard that denies a conductor editing `.conducted/standards.md` has not become
safe by explaining itself clearly.

**Why only one hop:** the second hop is a general interpreter and there is no end to it. One hop
covers what the field actually produced; anything beyond it fails to resolve and denies, which is
the standing default. The builder should not go looking for a parser.

## Unresolvable stays deny for a write, allow for everything else

Two defaults, and they are not in tension:

- **A shape that writes, whose target cannot be resolved → deny**, and the deny says the target could
  not be determined rather than naming a candidate. This is today's behaviour for the interpreter
  branch and it is correct; `$SCRATCH/look4.html` denying is not a bug.
- **A token that cannot be a path → not a target at all.** A bare extension (`.jpg` — an extension
  with no stem), anything containing a glob character, anything that is an identifier rather than a
  path. These do not become unresolvable-and-therefore-denied; they were never candidates.

**Why the distinction matters:** conflating them is Issue 2. The glob broke `row-*.jpg` into a
fragment, the fragment kept an extension, and a non-path was promoted to a resolvable target
pointing at the repo root.

## The corpus is the deliverable, and it drives the hook as a black box

A test file that spawns `conductor-guard.mjs` as a child process, feeds it a real PreToolUse payload
on stdin, and asserts on the JSON it prints: allow, or deny with the expected named path.

**Why out-of-process and not an import:** the hook exports nothing and must not start — its contract
is the payload in and the decision out, and that contract is what the field exercises. It also keeps
the fail-open guarantees testable: malformed stdin, absent `tool_input`, no `.conducted/CONDUCTOR.md`
above the cwd, and an unexpected throw must all exit 0 silently, and those are only observable from
outside.

**Why it comes first:** the guard's header makes about a dozen promises in prose — git always works,
reads are never blocked, `git show HEAD:x > src/app.ts` is still denied, a heredoc writing
`.conducted/**` is allowed. Not one of them is executable today, which is why each field case has
been found by a person rather than a run. The corpus should assert the promises the header already
makes, not just the four defects.

**Warning for the builder:** the guard is armed while you work. A test file containing command
strings like `writeFileSync("src/app.ts")` will trip the guard on your own tool calls — the
maintainer hit exactly this while reproducing the bugs. Fixture strings belong in a data file the
tests read, and this is itself evidence for the design above.

## Out of scope

- MukFork field note §2 (a dispatched builder refused a write inside its own folder). It does not
  reproduce and the cause is unknown. See `state.md`.
- Widening the allow-set. Every defect here is a resolution bug; not one of them is an argument that
  the conductor should own more of the tree.
