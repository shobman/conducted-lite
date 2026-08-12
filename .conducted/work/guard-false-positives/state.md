# guard-false-positives — feature state

<!-- Two regions. The facts block below is MACHINE-WRITTEN and REWRITTEN on every `session-end`
     run: branch, PR, worktree, folder, documents, and the session log. Everything under it is
     yours — decisions, issues, acceptance criteria — and no script touches it. -->

<!-- conducted-lite:facts:start -->
<!-- MACHINE-WRITTEN. REWRITTEN IN PLACE on every session-end run that touches this feature —
     never appended to. Everything OUTSIDE the two markers is yours; the script never touches,
     reorders or rewrites it, never reads it as an instruction, and NEVER ticks an acceptance
     criterion. Do not hand-edit inside the markers: the next run overwrites it. -->

**Scaffolded 2026-08-12T14:42:47.034Z** by `node .claude/scripts/session-end.mjs --new-feature guard-false-positives`. NOTHING IS VERIFIED HERE YET:
the folder exists and that is the only fact in this block. The first session-end run that touches
this feature replaces every line of it with what git and the filesystem actually show.

- feature: `guard-false-positives`
- folder: `.conducted/work/guard-false-positives/`
- documents: (none yet — legal; see the altitude law in .conducted/CONDUCTOR.md)
- derived status: `new` — the folder exists and nothing else does yet
- branches: none matching this feature name
- worktrees: none
- PR: none declared (to declare one, put `PR: #<n>` or the pull-request URL on a LINE OF ITS OWN below the markers — a mention inside a sentence is not a declaration)
- session log (most recent, bounded):
  - `2026-08-12T14:42:47.034Z` session `scaffold` — folder and state.md created by .claude/scripts/session-end.mjs --new-feature
<!-- conducted-lite:state eyJhdCI6IjIwMjYtMDgtMTJUMTQ6NDI6NDcuMDM0WiIsInN0YXR1cyI6Im5ldyIsImJyYW5jaGVzIjpbXSwid29ya3RyZWVzIjpbXSwicHIiOiIifQ== -->
<!-- conducted-lite:sessions W3siYXQiOiIyMDI2LTA4LTEyVDE0OjQyOjQ3LjAzNFoiLCJpZCI6InNjYWZmb2xkIiwibm90ZSI6ImZvbGRlciBhbmQgc3RhdGUubWQgY3JlYXRlZCBieSAuY2xhdWRlL3NjcmlwdHMvc2Vzc2lvbi1lbmQubWpzIC0tbmV3LWZlYXR1cmUifV0= -->
<!-- conducted-lite:facts:end -->

## Decisions

<!-- What was decided and WHY, with the evidence that would reopen it. Rewrite in place, dated. -->

**2026-08-13 — the Bash scan resolves the write expression, not the token stream.** Every defect
below is one root cause: `scanBash` collects file-shaped tokens from the whole command line and then
asks whether any of them is out of bounds. A path the command *mentions* and a path the command
*writes* are not the same thing, and the token scan cannot tell them apart. Patching the individual
symptoms was rejected — three regexes were already added for three earlier field cases and the fourth
class arrived anyway. Reopens if a builder demonstrates that the write expression cannot be resolved
for a shape that matters more than the false positives cost.

**2026-08-13 — a false positive is a defect of the same severity as a miss.** CONDUCTOR.md already
argues this (*"a guard that guesses is a guard that gets turned off"*), and MukFork counted it: all
three Bash denials in that session were false positives, **all three were worked around by
re-attempting the identical path with the `Write`/`Edit` tool, and none was noticed as a denial at
the time.** For the same target the guard denies Bash and permits `Write`, so what it teaches is
"use the other tool", not "do not build". Reopens if a fix for this drives the false-negative rate
up enough that a conductor ships product code — but note that today's false positives cost nothing
to route around, so the rule is already not enforcing what it claims to.

## Issues

<!-- What is wrong or unresolved right now. Delete an issue when it is gone, never strike it out. -->

All reproduced against this repo's `conductor-guard.mjs` on 2026-08-13 by feeding the hook crafted
PreToolUse payloads out-of-process. MukFork's copy of the guard is byte-identical to this one
(`diff` clean), and so is miq's — all three run the same file. Issues 1, 2 and 5 are the three real
denials from the MukFork session, reproduced from the **verbatim command lines** supplied 2026-08-13
with transcript line numbers (main session
`~/.claude/projects/C--code-repos-mukfork/307243ed-d214-4345-b128-d9a52cdde1bb.jsonl`, lines 2054,
3904, 4399 — a durable path; the subagent transcript cited in the same answer lives in Temp and will
rot, but nothing here depends on it).

**An earlier reconstruction of issue 2 hit a different branch and named nothing.** The verbatim
command names `ramen.jpg`, as the field reported. Reconstructing a command from a description is
itself a summary standing in for a source, and it produced a wrong reading of which branch was at
fault. The corpus takes the transcript's bytes, not a retyping of them.

1. **`cp <file> <directory>/` denies, naming the source.** `cp docs/assets/row-1.jpg /c/temp/out/`
   → *"This command writes docs/assets/row-1.jpg (copying or moving over it)"*. The cp/mv branch
   takes the last file-shaped token as the destination; a directory has no extension, so it is not
   file-shaped, and the scan falls back to the source. Every copy OUT of the repo is denied, and the
   deny message's own sentence — *"anything outside the repo are exempt"* — is false for the shape.
2. **A glob in the source manufactures a phantom target.** `cp docs/assets/row-*.jpg "$SCRATCH/"`
   → *"This command writes .jpg"*. `rawTokens` excludes `*` from its character class, so the token
   splits and `.jpg` survives as an extension with no stem. `classify` then resolves it against the
   repo root and denies it. This is the MukFork note's case A verbatim.
3. **A payload string vetoes a write to a path the conductor owns.**
   `node -e 'require("fs").writeFileSync(".conducted/roadmap.md", "see src/app.ts for detail")'`
   → *"This command writes src/app.ts"*. The `strays` veto counts any separator-carrying token
   anywhere on the line, including inside the content being written.
4. **A deny names a file the command does not write.** Every issue here produces a confident, wrong
   filename. The guard's own header commits to the opposite — *"A DENY NEVER INVENTS THE FILE IT IS
   DENYING"* — written after the field caught it reporting `io.open` as a path. The commitment was
   made; the mechanism that broke it was not.
5. **THE ONE NOBODY NOTICED, and the worst of them.** MukFork main transcript line 2054: a python
   heredoc doing two `str.replace` passes over `.conducted/standards.md`, denied with *"This command
   writes **creator.html**"*. `creator.html` occurs once, inside a **search string** — the old text
   being replaced. The write target is `p`, a literal assigned three lines above, and
   `.conducted/**` is the FIRST ENTRY in the guard's own `YOU STILL OWN` list. Reproduced, and
   pinned down further than the field report goes:
   - the same heredoc with the filename removed from the search string is **allowed** — the payload
     is the whole cause;
   - the same heredoc with the target written as a **bare literal** rather than via `p` is **still
     denied**, still naming `creator.html`. So this is not a variable-resolution failure. Even with
     the target sitting in plain sight inside the allow-set, a filename in the content overrides it.

**Not a defect, recorded so nobody "fixes" it:** an interpreter write whose target genuinely cannot
be resolved is deliberately denied (guard header, *"CONSERVATIVE WHERE IT CANNOT TELL"*). The same
command with a literal out-of-repo path is allowed — verified. What is wrong in that case is only
the invented name.

6. **A single inner double quote flips an owned write from allowed to denied.** `interpreterTargets`
   finds paths with a quoted-literal regex whose content class excludes every quote character, so
   one `"` anywhere in a script body destroys the extraction; `targets` comes back empty, and empty
   is treated as *"the target could not be determined"* — the honest-sounding deny. Proved by
   holding everything else constant: the same `python -c` writing
   `.conducted/work/<feature>/state.md`, with and without one inner double-quoted string, allows and
   then denies. **This is the mechanism behind miq's two interpreter denials on conductor-owned
   paths**, both of which the note attributes to variable binding. Variable binding is not the
   cause — the same script with the target bound to a variable and no inner quote is allowed here.

**Still correct, verified, must not regress:** `Write` of `legal/README.md`, `Write` of
`docs/product/2026-08-11-duotone.html`, and `echo … > local.properties` all deny. The first two were
real denials in the MukFork session; the third is miq's single genuine catch across nine denials —
an Android build-config write. All three are right.

7. **The guard denied the conductor writing `.conducted/**` inside a worktree.** Found by being
   subject to it: an `Edit` of `worktrees/guard-false-positives/.conducted/work/.../state.md`, from
   a session whose cwd was the main checkout, was denied by a message that listed `.conducted/**` as
   owned. `findRoot()` walked up from the CWD, so the root resolved to the main checkout and the
   target relativised to `worktrees/<feature>/.conducted/…`, which no OWNED pattern matches.
   **Not an edge case:** CONDUCTOR.md mandates worktrees at `worktrees/<feature>/` inside the repo,
   so this fires for every conductor who keeps a feature's `state.md` current while a builder works
   in its worktree. It also falsified a promise in the guard's own header — *"a conductor working
   inside `worktrees/<feature>` is measured against that worktree's own tree"* — which held only
   when the cwd was inside the worktree.

   Fixed by resolving the tree from **the target path** rather than the cwd. The builder rejected
   the narrower fix of stripping a leading `worktrees/<name>/`, and was right to: the stripper
   leaves the opposite hole open, where a cwd inside a worktree makes the main checkout's
   `src/app.ts` relativise to `../../src/app.ts`, read as outside the repo, and be silently allowed.
   It also hard-codes a directory name that is doctrine rather than mechanism. Both directions now
   have corpus cases, and this entry was written through the path that was denied.

### Corpus and fix landed 2026-08-13 — 71 counted cases, all passing

Two things the tech design got wrong, returned as negative results rather than worked around:

- **`argv[N]` → the Nth positional is not buildable, and was not built.** The design named it as one
  of two knowable hops, using MukFork's `node -e '… writeFileSync(process.argv[1], html)'
  "$D/look4.html"` as its example and expecting it to resolve outside the repo and allow. That
  command is fixture A4, whose assertion is a deny that names nothing — the design contradicted the
  corpus. It also breaks the design's own one-hop rule: `argv[1]` → `$D/look4.html` is one hop and
  `$D` → literal is a second. The other half of the rule, a name bound once to a string literal, is
  built and is what clears defects 5 and 6.
- **Deleting the second pass broke a case that was passing for the wrong reason.**
  `B-interpreter-unresolvable` denied only because `process.argv` tokenised as a file-shaped name
  resolving inside the repo — a right verdict reached by naming an identifier as a file. Carrying it
  needed a new positive rule: **write-shaped plus any unresolved target = deny, naming nothing.**
  That is the single exit from indeterminacy the design asked for, arrived at from the other side.

Deliberate narrowings, named rather than smuggled: verbs are matched as shell words, so
`echo "cp x src/app.ts"` no longer reads as a `cp` invocation; and `\` is an ordinary character in
word splitting, which keeps `cp C:\temp\x.ts src\app.ts` denied at the cost of losing a target in
`a\ b.txt`. That is a miss, which is the direction this file errs in everywhere.

### The miq sample, and a warning about how to use it

miq supplied a second sample on 2026-08-13: **nine denials across the project's history — roughly
one real catch, one borderline (copying a build output, which is deploying rather than building and
wants a deliberate ruling), and seven false positives.** It also answers the `agent_id` question
independently and decisively: **113 subagent transcripts, zero denials.**

**But its verbatim commands do not reproduce, and the corpus must not be built from them.** Fed to a
byte-identical guard, miq's quoted `grep`, its `gh pr create` body, and a reconstruction of its
`Math.Max` case all **allow**. At least one is provably abridged: the deny names
`server__miq-server__appsettings.json` while the quoted body line reads
`server__miq-server__appsettings.json.txt:14`, and that token cannot produce that deny. The note is
a faithful summary; the commands in it have been tidied, and tidying a command changes which branch
it hits. Their transcripts hold the bytes. **Ask for the raw lines before writing those cases.**

This is the second time a retyped command has produced a wrong diagnosis — the first was in this
folder, reconstructing MukFork's `node -e`. The rule the corpus needs is the doctrine's own: the
source is the transcript, and a quotation of a command is a summary of it.

### RESOLVED 2026-08-13 — MukFork field note §2 was not this guard

Retracted at source. The refusal of `spikes/react-boot/REPORT.md` was a platform `tool_use_error` —
*"Subagents should return findings as text, not write report files"* — carrying none of the guard's
vocabulary: no `Non-negotiable 1`, no `permissionDecisionReason`, no `FIX:` line. The same builder
made **25 successful `Write` calls and 5 `Edit`s**, including one into that very folder 800
transcript lines earlier, so the guard saw its `agent_id` and allowed it throughout. This matches
the probe run here before the answer arrived: a payload carrying `agent_id` writes that exact path
silently.

The builder had written *"my harness blocked"*, which was accurate, and the note rendered it as the
build-guard. **`agent_id` is not in doubt and nothing in this feature depends on it.** The surviving
observation — an 850-line measurement report that came back inline and survived only because the
builder pasted rather than summarised — is real, and belongs to whoever owns the subagent report
rule, not here.

## Acceptance criteria

<!-- Binary lines. Only a human ticks these: no script in this repo will ever tick one for you. -->

- [ ] A test corpus exists, runs the real hook out-of-process, and asserts allow/deny AND the named
      path for every case in Issues 1–5 plus the shapes the guard's header already promises (git
      always works, reads never blocked, `git show HEAD:x > src/app.ts` denied, `.conducted/**`
      writable by heredoc, an interpreter with an unresolvable target denied).
- [ ] The three MukFork commands go in **byte-for-byte from the transcript**, not retyped from a
      description. A retyping already produced a different branch and a wrong diagnosis once.
- [ ] Issues 1, 2, 3 and 5 allow, and each one's deny is gone for the right reason, not by widening
      the allow-set.
- [ ] `Write` of `legal/README.md` and of `docs/**.html` still deny. Both were correct denials in
      the field and both are in the corpus as such.
- [ ] No deny names a path the command does not write to. Where the target cannot be resolved, the
      deny says so in those words rather than naming a candidate.
- [ ] Every deny shape the guard's header promises still denies — checked by the corpus, not by
      reading the diff.
- [ ] A fresh evaluator that never saw the change confirms the guard still stops a conductor writing
      product code, working only from the guard's stated contract.
