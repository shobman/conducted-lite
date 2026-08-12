# Where these fixtures came from

One command per file, bytes only, no comments — a fixture is the command, not a description of it.
This page is the record of which bytes are a transcript's and which are not, because that
distinction has twice decided a diagnosis on this feature.

**The rule these follow:** a quotation of a command is a summary of it. A reconstruction of mukfork's
`node -e` from a prose description hit a different branch of the guard than the real command did and
produced a wrong reading of which branch was at fault. So the field commands below are `sed`-copied
out of the note, never retyped.

## Copied from a field note, unmodified

Source: `C:\code\repos\mukfork\docs\field-notes\2026-08-13-maintainer-questions.md`, which quotes
the mukfork main-session transcript
`~/.claude/projects/C--code-repos-mukfork/307243ed-d214-4345-b128-d9a52cdde1bb.jsonl` with 1-indexed
line numbers.

| fixture | note lines | transcript line |
|---|---|---|
| `a2-mukfork-4399-cp-glob.txt` | 91–93 | 4399, denied at 4400 |
| `a4-mukfork-3904-argv-target.txt` | 106–120 | 3904, denied at 3905 |
| `a5-mukfork-2054-heredoc.txt` | 161–175 | 2054, denied at 2055 |

### Bytes that are NOT the transcript's, listed rather than smoothed over

The note elides. Every elision is recorded here; none was invented or filled in.

- **`a2`** — the session UUID in the scratchpad path is shortened to `307243ed-...` in the note. The
  path is under `%LOCALAPPDATA%\Temp` either way, so it classifies as outside the repo either way,
  and the elision cannot move the verdict.
- **`a4`** — carries five `…` (U+2026) elisions: one standing for omitted script lines, three inside
  the HTML string being written, one in the Chrome argument list. **Reproduces the field's deny
  exactly regardless**, naming `ramen.jpg`, which is the deny text the note quotes in full — so the
  elisions are not load-bearing for this case. It is still not byte-for-byte, and that is why it is
  said here.
- **`a5`** — no elisions. Complete as quoted.

## Derived from a fixture above, by one deliberate change each

Generated from `a5-mukfork-2054-heredoc.txt` so that they differ from it in exactly one dimension.

- `a5-control-no-filename-in-search.txt` — the two filenames inside the `old2` **search string**
  replaced with prose. Nothing about the write expression changed.
- `a5-control-bare-literal-target.txt` — the write target written as a bare literal instead of
  through the variable `p`. Nothing about the payload changed.

## Written for this corpus

Everything else. Two of them are a matched pair and the pairing is the measurement:

- `a6-control-no-inner-quote.txt` and `a6-one-inner-quote.txt` differ by **exactly the two
  characters `\"`** inserted into the replacement string, and by nothing else. Verify with
  `diff` before trusting either.
- `a3b-payload-escape-veto.txt` and `b-heredoc-owned.txt` differ by **exactly the two characters
  `\n`** at the end of the content being written.

The `w-*.txt` four are for the tree-resolution cases — which repo root a path is measured against
when the cwd sits in a different tree. They are the only fixtures that are **not pure bytes**:
`{{MAIN}}` and `{{WT}}` are substituted by `cases.mjs` with paths into a synthetic two-level lite
tree it builds under `tmpdir()`. An absolute path into that tree cannot be committed, because
tmpdir differs per machine. No fixture copied from a transcript contains either placeholder.

- `w-worktree-owned-redirect.txt`, `w-worktree-owned-heredoc.txt` — a relative write into a
  worktree's `research/`, run with the cwd in the main checkout. `research/**` is owned and `.json`
  is not scratch-exempt, so these measure the tree and nothing else.
- `w-worktree-product-cp.txt` — the same direction, onto product code. It must stay denied:
  resolving the root from the target must not buy a worktree's `src/app.ts` an allow.
- `w-main-product-redirect.txt` — the reverse direction, cwd inside the worktree and the target in
  the main checkout. Absolute, hence the `{{MAIN}}` placeholder. Assumes tmpdir has no spaces in
  it, which is what a redirect target can carry.

### The `>`-in-prose set (defect 8)

`b-pr-body-arrow.txt` is the command the conductor **ran against both the pre-fix and the post-fix
guard** while opening this branch's pull request; it denied on both, naming
`server__miq-server__appsettings.json` as a "shell redirection into it" with no redirection anywhere
in it. It is the second incident of the same shape — miq's, `u-miq-gh-pr-body.txt`, is the first, and
the difference between them is instructive: miq's filename ends `.txt`, a scratch extension, so that
one allows for a reason that has nothing to do with the defect. This one carries the bytes that
actually reproduce.

The other twelve are written for this corpus. Two pairs are the measurement and must be read as
pairs:

- `b-pr-body-arrow.txt` / `b-arrow-unquoted-is-a-real-redirect.txt` — the same `->` quoted and
  unquoted. Verified in a real bash: `echo hello->out.txt` **creates** `out.txt` containing
  `hello-`, and so do `a-->b.txt` and `x=>c.txt`, while `echo "a -> d.txt"` creates nothing. `>` is
  a metacharacter that delimits the word before it, so the arrow is not what makes the field case
  safe — the quoting is. A fix that reads the `-` turns the second of this pair red.
- `b-redirect-quoted-target.txt` / `b-pr-body-arrow-plain-quote.txt` — quoting on the target versus
  quoting on the operator. Only the operator's position decides whether a redirection exists.

## Not this guard's, and not verified

`u-miq-*.txt` are quoted in `C:\code\repos\miq\docs\notes\2026-08-13-conducted-lite-field-notes.md`
(on branch `docs/conducted-lite-field-notes`, not on `main`). They are quoted from a note, not
lifted from a transcript, and fed to a byte-identical guard they **allow** where the note records a
denial — they have been tidied for the note, and tidying a command changes which branch it hits.
Two carry a literal `...` inside the command. `u-miq-gh-pr-body.txt` is provably abridged: the deny
names `server__miq-server__appsettings.json` while the quoted body reads
`server__miq-server__appsettings.json.txt:14`, and that token cannot produce that deny.

**The raw transcript lines have been requested.** Until they arrive these do not count toward the
corpus result and nothing is tuned to make them fire.
