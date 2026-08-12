#!/usr/bin/env node
// conducted-lite PreToolUse hook — non-negotiable 1, made mechanical.
//
// CONDUCTOR.md: "You dispatch, you review, you never build." That was prose, and the first field
// adoption showed what prose costs: a conductor edited the scripts itself, shipped a safety feature
// that was silently dead because a bare `catch` swallowed a ReferenceError, and reported it working.
// A reviewer would have caught it in seconds. Nobody was reviewing, because the conductor was the
// builder. This hook makes the rule machinery instead of a reminder.
//
// THE DISCRIMINATOR IS `agent_id`, AND IT COMES FROM THE HOOK PAYLOAD ITSELF. Claude Code's hooks
// documentation, on the common input fields:
//
//   agent_id   — "Unique identifier for the subagent. Present only when the hook fires inside a
//                 subagent call. Use this to distinguish subagent hook calls from main-thread calls."
//   agent_type — "Agent name (for example, "Explore" or "security-reviewer"). Present when the
//                 session uses --agent or the hook fires inside a subagent."
//
// and, on subagents: "Hooks from settings files, managed policy settings, and plugins also run
// inside subagents. When a subagent calls a tool, tool events such as PreToolUse and PostToolUse
// fire the same configured hooks as in the main conversation, and the input carries the agent_id
// and agent_type common input fields that identify the subagent."
//
// So: agent_id PRESENT = a dispatched builder, which is exactly who is supposed to be writing code
// -> ALLOW IMMEDIATELY, before any other work. agent_id ABSENT = the main thread, which in a lite
// repo is the conductor -> the rule applies. `agent_type` is deliberately NOT used: it is also
// present for a session started with `--agent`, so it cannot tell a subagent from a main thread.
//
// WHAT THE CONDUCTOR STILL OWNS (the whole allow-set, kept deliberately small — every entry is a
// place CONDUCTOR.md names as the conductor's own hand, and nothing else is):
//
//   .conducted/**            the documents. Vision, roadmap, standards, archive, work/<feature>/*.
//                            "State lives in files" is non-negotiable 4; this is those files.
//   research/**              non-negotiable 5, "what you learn lands in research/".
//   docs/**  (.md .mdx .txt) maintainer prose only. NOT the whole folder: a docs/ site has config,
//                            components and build scripts in it, and those are product code.
//   CLAUDE.md                the harness's own briefing page.
//   README.md                the one top-level page a maintainer keeps by hand.
//
// Everything else is DENIED to the main thread: product code, tests, config, package manifests,
// CI, and .claude/** — that last one is the olchat case verbatim, and it is not carved out for
// being "just a hook". A guard the conductor can rewrite unreviewed is the same failure again.
//
// WHICH TREE A PATH IS MEASURED AGAINST IS DECIDED BY THE PATH, NOT BY THE CWD. The allow-set is a
// set of REPO-RELATIVE patterns, so "relative to which repo" is half the answer, and the cwd is the
// wrong half. CONDUCTOR.md mandates worktrees at `worktrees/<feature>/` INSIDE the repo, and a
// conductor dispatching into one sits in the main checkout while the feature's own `state.md` lives
// under `worktrees/<feature>/.conducted/work/<feature>/`. Measured from the cwd that path
// relativises to `worktrees/<feature>/.conducted/…`, which no OWNED pattern matches — so the guard
// denied a write to `.conducted/**` in a message whose last line grants `.conducted/**`. It fails in
// the other direction too: from inside a worktree, the main checkout's `src/app.ts` relativises to
// `../../src/app.ts`, reads as outside the repo, and is silently allowed. So the root for a path is
// THE NEAREST ANCESTOR OF THAT PATH holding .conducted/CONDUCTOR.md, and the cwd's root is only the
// fallback for a path with no such ancestor. This needs no knowledge of what a worktree is; a linked
// worktree has the file checked out, which is the whole mechanism.
//
// BASH COVERAGE IS BEST-EFFORT, AND THE Edit/Write PATH IS THE REAL GUARANTEE. Say it plainly: a
// shell is a general-purpose machine and no regex owns it. What is here catches the obvious
// file-writing shapes — redirection, tee, sed/perl -i, cp/mv onto a path, a heredoc or -c/-e fed to
// an interpreter that then names a file and a write call. EVERY ONE OF THEM ENDS AT THE SAME
// QUESTION: resolve the target, and is it in the allow-set. The interpreter shape used to stop at
// the mechanism and never ask, which denied a conductor rewriting his own `state.md` — a shape
// decides WHETHER to look at a path, never stands in for looking at one.
//
// AND THE TARGET COMES FROM A POSITION, NEVER FROM A SCAN OF THE LINE. A shape answers two
// questions in order: does this command write (a shape question), and WHAT does it write (a
// POSITION question, answered per shape from the slot that shape puts its target in). The second one
// used to be answered by collecting every file-shaped substring on the command line and asking
// whether any of them was out of bounds — but a path a command MENTIONS and a path a command WRITES
// are not the same thing, and a token scan cannot tell them apart. It cost four field denials, all
// of them false, none of them noticed at the time: `cp docs/a.jpg /c/temp/out/` denied naming its
// SOURCE because a directory has no extension; `cp docs/row-*.jpg "$D/"` denied naming `.jpg`,
// a fragment the glob left behind, resolved against the repo root as if it were a file in it; a
// heredoc rewriting `.conducted/standards.md` denied for a `creator.html` sitting inside the search
// string it was replacing; and a `node -e` denied naming a `ramen.jpg` that appears only in the HTML
// it was writing. Three regexes had already been added for three earlier cases of the same class and
// a fourth class arrived anyway. So the scan is gone, and each shape reads its own slot:
//
//   > / >>                     the word after the operator
//   tee / sponge               the non-flag words after the verb
//   sed / perl / ruby -i       the OPERANDS, never the script — a path inside `s/…/…/` is not a target
//   cp / mv / install /        THE LAST WORD AFTER OPTION STRIPPING. If it names a directory (a
//   rsync / ln                 trailing slash, or it exists and is one), the targets are that
//                              directory joined with each source's basename. `cp x /c/temp/out/`
//                              therefore resolves OUTSIDE the repo, which the deny's own sentence
//                              already calls exempt.
//   interpreter + write call   THE ARGUMENT OF THE WRITE CALL, and nothing else.
//
// The words are split the way a shell splits them, so `"$D/"` is one word and `echo "cp x src/a.ts"`
// contains no cp invocation. A word that cannot be a path was never a candidate: a glob, a variable,
// a bare extension. That is different from a target that cannot be RESOLVED, and conflating the two
// is what manufactured `.jpg`.
//
// A determined session gets past all of it, and that is accepted. GIT ALWAYS WORKS: the conductor commits, pushes, branches and runs worktree
// commands, none of those shapes are matched, git is exempt from the cp/mv scan, and the git
// subcommands that carry a human-written MESSAGE — commit, tag, notes, merge, revert, stash — are
// exempt from the redirection scan, because a message is prose and prose may contain `>`. The field
// proved what happens otherwise: a message containing `<repo>_<feature>` read as `>` redirecting
// into `_`, and the commit was denied by a guard whose own header promises git always works. The
// exemption is that list and not git as a whole, so `git show HEAD:x > src/app.ts` is still a write
// and still denied. THE SAME LESSON, GENERALISED: a `>` is a redirection only where the shell is
// reading CODE, so the scan skips one inside a quoted word or a heredoc body — that is what a `gh pr
// create` body is, and prose in one denied two pull requests before it was fixed. See codeMask().
// Reads, builds, tests and installs are
// never touched. Scratch and prose extensions (.md .txt .log .out .tmp .diff .patch) are exempt on the
// Bash path but not on the Edit/Write path — asymmetric on purpose: a Bash deny kills a whole
// chained command including the reads after it, so its false-positive cost is much higher.
//
// PreToolUse payload:
//   { session_id, transcript_path, cwd, hook_event_name: "PreToolUse", tool_name, tool_input,
//     agent_id?, agent_type?, ... }
// Denying, exit 0 with JSON on stdout:
//   { "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "deny",
//                             "permissionDecisionReason": "<why, and the fix>" } }
// Allowing = exit 0 with no output.
//
// FAILURE MODE IS "SILENTLY ALLOWS", NEVER "WEDGES THE SESSION" — the same discipline as the
// sibling hooks, and non-negotiable. Every one of these exits 0 with no output:
//   · stdin read timeout          stdin that never closes must not hang every tool call
//   · malformed / absent stdin    nothing to reason about
//   · a payload shape we do not
//     recognise                   no tool_name, no tool_input, no target path -> nothing to judge
//   · not a lite repo             no .conducted/CONDUCTOR.md at or above the cwd -> instant silence.
//                                 The guard is a TRACKED FILE, never a directory: git tracks files,
//                                 not directories, so a directory-existence guard silently disarms
//                                 the moment its last file moves.
//   · a path we cannot resolve    variables, globs, anything outside every lite root -> unknown is
//                                 always an allow. A guard that guesses is a guard that gets turned
//                                 off, and a disabled guard is worse than none. THE ONE EXCEPTION IS
//                                 NAMED AND DELIBERATE: a script fed to an interpreter that plainly
//                                 writes files, whose target cannot be resolved, is DENIED — with a
//                                 message that says the target could not be determined and NAMES
//                                 NOTHING. One shape, one exit; there is no second pass hunting the
//                                 line for a candidate to blame.
//   · any unexpected throw        fails open
import { existsSync, statSync } from 'node:fs';
import { join, dirname, resolve as pathResolve, relative as pathRelative, isAbsolute } from 'node:path';

const CONDUCTOR_REL = '.conducted/CONDUCTOR.md';
const STDIN_TIMEOUT_MS = 5_000;
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

// The allow-set, matched against a repo-relative POSIX path. Small on purpose — see the header.
const OWNED = [
  /^\.conducted\/.+$/,
  /^research\/.+$/,
  /^docs\/.+\.(md|mdx|txt)$/i,
  /^CLAUDE\.md$/,
  /^README\.md$/,
];
const OWNED_SUMMARY = '.conducted/**, research/**, docs/**.md, CLAUDE.md, README.md';

// Bash only: output that is never product source. A conductor dumping a test log or a diff into the
// repo is untidy, not building, and denying it would be exactly the kind of noise that gets a guard
// switched off.
const SCRATCH_EXT = /\.(md|mdx|txt|log|out|tmp|diff|patch)$/i;

const quiet = () => process.exit(0);

// Node on Windows needs native paths; a hook cwd may arrive native, Git-Bash /c/-style, or absent.
function resolveCwd(c) {
  if (c) {
    const m = String(c).match(/^\/([a-zA-Z])\/(.*)$/);
    if (m) c = m[1].toUpperCase() + ':/' + m[2];
    if (existsSync(c)) return c;
  }
  return process.cwd();
}

// Same /c/-style normalisation for a path that may not exist yet (a Write creates its target).
const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/^\/([a-zA-Z])\//, (_, d) => d.toUpperCase() + ':/');

// The repo root is the nearest ancestor holding .conducted/CONDUCTOR.md. No child process: this
// hook runs on EVERY tool call in the main thread, so it spawns nothing and reads nothing but
// directory entries. Memoised because it is now asked once per candidate path rather than once per
// invocation, and the answers repeat.
const rootCache = new Map();
function findRoot(start) {
  let dir = pathResolve(start);
  const key = dir;
  if (rootCache.has(key)) return rootCache.get(key);
  let found = null;
  for (let i = 0; i < 40; i++) {
    if (existsSync(join(dir, CONDUCTOR_REL))) { found = dir; break; }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  rootCache.set(key, found);
  return found;
}

// WHICH TREE THIS PATH BELONGS TO. The nearest lite root ABOVE THE PATH ITSELF, falling back to the
// root the cwd resolved to. See the header: a conductor in the main checkout editing a worktree's
// own state.md, and a conductor in a worktree touching the main checkout's product code, are the two
// directions of the same mistake, and both are answered by asking the path instead of the cwd.
const rootOf = (abs, fallback) => findRoot(dirname(abs)) || fallback;

const absOf = (raw, cwd) => {
  const p = norm(raw);
  return isAbsolute(p) ? pathResolve(p) : pathResolve(cwd, p);
};

// 'owned' | 'denied' | 'unknown'. Unknown is always an allow.
function classify(raw, cwd, root) {
  const p = norm(raw);
  if (!p) return 'unknown';
  if (/[$*?`{}]|^-/.test(p)) return 'unknown';           // variables, globs, flags: we do not guess
  const abs = absOf(p, cwd);
  const rel = pathRelative(rootOf(abs, root), abs).replace(/\\/g, '/');
  if (!rel || rel.startsWith('../') || rel === '..' || isAbsolute(rel)) return 'unknown';  // outside any tree
  return OWNED.some((re) => re.test(rel)) ? 'owned' : 'denied';
}

const relOf = (raw, cwd, root) => {
  const abs = absOf(raw, cwd);
  return pathRelative(rootOf(abs, root), abs).replace(/\\/g, '/');
};

// ---------------------------------------------------------------- Bash, best-effort by declaration
// A word that looks like a file: has an extension-ish tail and is not a flag. Extension-less targets
// (`> Makefile`) are missed, and that is a deliberate fail-open. It is a CANDIDACY test, never a
// target-finder: every shape below already knows which slot its target sits in, and this only says
// whether what is in that slot could be a filename at all.
const looksLikeFile = (t) => /\.[A-Za-z0-9]{1,12}$/.test(t) && !t.startsWith('-');

// WORDS, THE WAY A SHELL SPLITS THEM. Every shape below reads a POSITION, so it needs the words and
// not a scrape of file-shaped substrings. Quotes group and are stripped, so `"$D/"` is one word and
// `echo "cp x src/app.ts"` is two words of which neither is a cp invocation. An unbalanced quote
// swallows the rest of the segment into one word, which can only lose a target — a fail-open, in
// keeping with the rest of this file.
//
// A BACKSLASH IS AN ORDINARY CHARACTER HERE, not an escape, and that is a choice rather than an
// oversight. The shell would read `cp C:\temp\x.ts src\app.ts` as `C:tempx.ts` and `srcapp.ts`,
// which is what the shell deserves, but this hook runs on Windows where an unquoted native path is
// the thing a person actually types, and mangling it would judge a path nobody named. The price is
// that `a\ b.txt` splits into two words and its target is lost — a miss, which is the direction
// this file errs in everywhere else.
function words(seg) {
  const out = [];
  let cur = '', started = false, q = null;
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (q) {
      if (c === q) q = null; else cur += c;
      continue;
    }
    if (c === '"' || c === "'") { q = c; started = true; continue; }
    if (/\s/.test(c)) { if (started || cur) out.push(cur); cur = ''; started = false; continue; }
    cur += c;
    started = true;
  }
  if (started || cur) out.push(cur);
  return out;
}

// Redirections are not arguments. `2>/dev/null` trailing a cp is not its destination, and `<<'EOF'`
// is not an operand of anything.
function stripRedirections(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (/^\d*(?:>>?|<<?<?)$/.test(t)) { i++; continue; }   // the file is the NEXT word
    if (/^\d*(?:>>?|<<?<?)\S/.test(t)) continue;           // glued: `2>/dev/null`, `>out.txt`
    if (t === '&' || t === '&&' || t === '|') continue;
    out.push(t);
  }
  return out;
}

const CP_VERB = /^(?:.*[/\\])?(?:cp|mv|install|rsync|ln)(?:\.exe)?$/i;
const TEE_VERB = /^(?:.*[/\\])?(?:tee|sponge)(?:\.exe)?$/i;
const EDIT_VERB = /^(?:.*[/\\])?(?:sed|perl|ruby)(?:\.exe)?$/i;
// Options that swallow the word after them, so it is not a positional. Short and specific: guessing
// which options take values is how a positional scan turns an option's value into a destination.
const CP_OPT_VALUE = /^(?:-S|--suffix|--exclude|--include|-e|--rsh|--files-from|--backup|--chmod)$/;
const SCRIPT_OPT = /^(?:-e|-f|--expression|--file)$/;

const dirLike = (p, cwd) => {
  if (/[/\\]$/.test(p)) return true;
  try { return statSync(absOf(p, cwd)).isDirectory(); } catch { return false; }
};
const baseName = (p) => String(p).replace(/[/\\]+$/, '').split(/[/\\]/).pop();
const intoDir = (dir, base) => `${String(dir).replace(/[/\\]+$/, '')}/${base}`;

// cp / mv / install / rsync / ln — THE DESTINATION IS THE LAST ARGUMENT, which is a position and is
// knowable. Guessing it as "the last word that looks like a file" silently made it a SOURCE whenever
// the real destination was a directory or a variable, and the field's every copy out of the repo was
// denied by naming the file being copied. If the destination names a directory, the real targets are
// that directory joined with each source's basename — `cp docs/a.jpg /c/temp/out/` resolves to
// `/c/temp/out/a.jpg`, outside the repo, an allow.
function cpTargets(seg, cwd) {
  const toks = stripRedirections(words(seg));
  const vi = toks.findIndex((t) => CP_VERB.test(t));
  if (vi < 0) return [];
  const args = toks.slice(vi + 1);
  const pos = [];
  let destOpt = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { pos.push(...args.slice(i + 1)); break; }
    if (a.length > 1 && a.startsWith('-')) {
      const m = a.match(/^(?:-t|--target-directory)=(.+)$/);
      if (m) { destOpt = m[1]; continue; }
      if (/^(?:-t|--target-directory)$/.test(a)) { destOpt = args[++i]; continue; }
      if (CP_OPT_VALUE.test(a)) i++;
      continue;
    }
    pos.push(a);
  }
  const dest = destOpt != null ? destOpt : pos.pop();
  if (typeof dest !== 'string' || !dest) return [];
  // `-t`/`--target-directory` says so in its name; otherwise ask the path and the filesystem.
  if (destOpt == null && !dirLike(dest, cwd)) return [dest];
  return pos.map((s) => intoDir(dest, baseName(s))).filter((t) => baseName(t));
}

// tee / sponge — the non-flag words after the verb.
function teeTargets(seg) {
  const toks = stripRedirections(words(seg));
  const vi = toks.findIndex((t) => TEE_VERB.test(t));
  if (vi < 0) return [];
  return toks.slice(vi + 1).filter((a) => !(a.length > 1 && a.startsWith('-')));
}

// sed / perl / ruby -i — THE OPERANDS, NOT THE SCRIPT. `sed -i 's|old/a.ts|new/b.ts|' notes.md`
// edits notes.md; the two paths in the expression are text. Without an -e/-f the script is the first
// positional, so it is dropped; with one, every positional is a file.
function inPlaceTargets(seg) {
  const toks = stripRedirections(words(seg));
  const vi = toks.findIndex((t) => EDIT_VERB.test(t));
  if (vi < 0) return [];
  const args = toks.slice(vi + 1);
  const pos = [];
  let scriptIsAnOption = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { pos.push(...args.slice(i + 1)); break; }
    if (a.length > 1 && a.startsWith('-')) {
      if (SCRIPT_OPT.test(a)) { scriptIsAnOption = true; i++; continue; }
      if (/^(?:-e|-f|--expression|--file)=/.test(a)) { scriptIsAnOption = true; continue; }
      if (/^-[A-Za-z]*[ef]/.test(a)) scriptIsAnOption = true;   // bundled, e.g. `perl -pe`
      continue;
    }
    pos.push(a);
  }
  return scriptIsAnOption ? pos : pos.slice(1);
}

// The git subcommands that carry a message a HUMAN WROTE, and only those. This is deliberately not a
// list of "safe git commands" — which of git's hundred verbs cannot be turned into a write is not
// knowable, and guessing at it is how the blanket `git` exemption let `git show HEAD:x > src/app.ts`
// through. This is a list of WHERE PROSE LEGITIMATELY APPEARS IN A GIT COMMAND LINE, which is
// knowable: a `-m`/`-F` message is a message, not a script, and prose is allowed to contain `>` —
// the field case was a commit message describing `<repo>_<feature>`. Everything else under git
// (show, cat-file, archive, diff, log, describe) goes through the redirect scan like any other
// command, because those DO emit content and a `>` after them is a real write. What the list still
// costs, named rather than smuggled: the read sub-verbs of a listed command — `git stash show`,
// `git notes show`, `git tag -l` — ride in on the verb and are still missed. That is a handful of
// shapes instead of all of git, and the Edit/Write path remains the guarantee.
const GIT_MESSAGE_SUBCOMMAND = /^(commit|tag|notes|merge|revert|stash)$/;
// `git -c k=v`, `git -C dir`, `git --no-pager` may sit between `git` and the verb, so step over
// leading options (and the separate argument that -c/-C take) before reading it.
function isGitMessageCommand(seg) {
  const toks = seg.trim().split(/\s+/);
  if (!/^git(\.exe)?$/i.test(toks[0])) return false;
  let i = 1;
  while (i < toks.length && toks[i].startsWith('-')) {
    if (/^-[cC]$/.test(toks[i])) i++;
    i++;
  }
  return i < toks.length && GIT_MESSAGE_SUBCOMMAND.test(toks[i]);
}

// A write call named inside an interpreter body. Without one, a heredoc or -c/-e that merely
// mentions a file is a read, and reads are never denied. This is the SHAPE test only — what the
// script writes is read out of the call's argument below.
const WRITE_CALL = /(writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream|open\s*\([^)]*['"][wa]|write_text|write_bytes|writelines|\.write\s*\(|Set-Content|Out-File|Add-Content|File\.WriteAll)/i;
const INTERPRETER = /\b(node|node\.exe|python|python3|deno|bun|perl|ruby|pwsh|powershell)\b/i;
const HEREDOC = /<<[-~]?\s*['"]?[A-Za-z_]\w*/;
const INLINE_SCRIPT = /\s-(c|e|Command)\b/;
const WHY_INTERPRETER = 'a script fed to an interpreter, writing a file';
const HTTP_URL = /^https?:\/\//i;

// THE PATH A SCRIPT WRITES IS THE ARGUMENT OF ITS WRITE CALL. Nothing else on the line is evidence.
// This replaced a scan of every quoted literal in the body, which could not tell a target from a
// path in the CONTENT being written, a filename in a search string, or a URL — and the content of a
// write is exactly where arbitrary filenames appear. Two field denials came straight out of that:
// a heredoc rewriting `.conducted/standards.md` denied for a `creator.html` inside the old text it
// was replacing, and a `node -e` denied for a `ramen.jpg` inside an `<img src=…>` in the HTML it
// wrote. The scan also carried a `strays` veto — any separator-carrying token anywhere on the line
// could cancel an allow — which is the same bug wearing a hat, and it is gone with it. What that
// veto existed to stop, `open('src/app' + '.ts','w')`, is handled better by the argument rule: a
// concatenation is not a literal, so it does not resolve, and unresolved is already a deny.
//
// It is also STRICTLY MORE ABLE TO RESOLVE than the scan it replaces. That scan matched quoted
// literals with a content class excluding all three quote characters, so ONE inner double quote
// anywhere in a script body re-paired every quote after it and emptied the extraction — measured:
// the same `python -c` writing an owned `state.md` allowed without an inner quote and denied with
// one. A find-and-replace is the whole reason to reach for an interpreter, and it contains quoted
// strings by definition, so the branch was least able to resolve a target exactly when the conductor
// had the best reason to be there. Reading one call's argument list is anchored at the call and
// cannot be thrown off by a quote three lines away. The quote class was NOT widened; widening it
// would have left the class of bug alive.
const FS_WRITE_FN = /\b(?:writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream|WriteAllText|WriteAllBytes|WriteAllLines)\s*\(/g;
const OPEN_CALL = /\bopen\s*\(/g;
const WRITE_MODE = /^(?:mode\s*=\s*)?(['"])[wa]/;
const PATH_WRITE_METHOD = /(['"][^'"\n]{0,300}['"]|[A-Za-z_$][\w$]*)\s*\)?\s*\.\s*write_(?:text|bytes)\s*\(/g;
const PS_WRITE = /\b(?:Set-Content|Add-Content|Out-File)\b\s+(?:-(?:Path|LiteralPath|FilePath)\s+)?(['"]?)([^\s'";|]+)\1/gi;

// The top-level arguments of the call whose `(` sits at `open`. Quote- and depth-aware, bounded, and
// it returns null for a call it cannot close — an unterminated call is not evidence of anything.
function callArgs(s, open, max = 12, span = 4000) {
  const args = [];
  let depth = 0, q = null, cur = '';
  for (let i = open; i < s.length && i - open < span; i++) {
    const c = s[i];
    if (q) {
      cur += c;
      if (c === '\\') { cur += s[++i] || ''; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; if (depth > 1) cur += c; continue; }
    if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) { args.push(cur.trim()); return args; }
      cur += c;
      continue;
    }
    if (c === ',' && depth === 1) {
      args.push(cur.trim());
      if (args.length >= max) return args;
      cur = '';
      continue;
    }
    cur += c;
  }
  return null;
}

const unquote = (s) => s.replace(/\\(['"`\\])/g, '$1');

// ONE HOP, AND THE HOP IS POSITIONAL. A name bound EXACTLY ONCE to a string literal in the same
// command resolves to that literal — `p = ".conducted/standards.md"` … `io.open(p, "w")` is how the
// field wrote it, and denying it is a false positive that costs nothing to route around with the
// editor tool, so an honest deny would not have made the guard safe. Bound twice, bound to anything
// other than a literal, or not bound here: it does not resolve. A SECOND HOP IS A GENERAL
// INTERPRETER AND THERE IS NO END TO IT; anything that does not resolve in one hop fails to resolve,
// and unresolved-but-write-shaped stays a deny.
function bindingOf(name, cmd) {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return null;
  const re = new RegExp(
    `(?<![\\w$.=!<>+\\-*/%&|^])${name}\\s*=(?!=)\\s*(['"\`])((?:\\\\.|(?!\\1)[^\\\\\\n]){0,300})\\1`,
    'g',
  );
  const seen = new Set();
  for (const m of cmd.matchAll(re)) seen.add(unquote(m[2]));
  return seen.size === 1 ? [...seen][0] : null;
}

// An argument expression to a path, or null for "could not be determined". A whole string literal,
// or a name resolved by the single hop above. Anything else — a concatenation, a call, an index into
// argv, an f-string — does not resolve, and that is the honest answer rather than a worse one.
function resolveArg(expr, cmd) {
  if (typeof expr !== 'string') return null;
  const e = expr.trim();
  if (!e) return null;
  const lit = e.match(/^(['"`])((?:\\.|(?!\1)[^\\])*)\1$/);
  if (lit) return unquote(lit[2]);
  if (/^[A-Za-z_$][\w$]*$/.test(e)) return bindingOf(e, cmd);
  return null;
}

// A resolved path is only usable if it is a path AT ALL. A variable or a glob left in it means the
// bytes that will hit the filesystem are not the bytes here — that is unresolved, not "outside the
// repo", and the difference is the whole of issue 2.
const knowable = (p) => typeof p === 'string' && p !== '' && !/[$*?`{}]/.test(p);

// One entry per write call found: the path it writes, or null when that could not be determined.
function writeCallTargets(cmd) {
  const out = [];
  for (const m of cmd.matchAll(FS_WRITE_FN)) {
    const args = callArgs(cmd, m.index + m[0].length - 1);
    out.push(args ? resolveArg(args[0], cmd) : null);
  }
  for (const m of cmd.matchAll(OPEN_CALL)) {
    const args = callArgs(cmd, m.index + m[0].length - 1);
    if (!args) continue;                                          // unreadable: not evidence of a write
    if (!args.slice(1).some((a) => WRITE_MODE.test(a))) continue; // a read, and reads are never denied
    out.push(resolveArg(args[0], cmd));
  }
  for (const m of cmd.matchAll(PATH_WRITE_METHOD)) out.push(resolveArg(m[1], cmd));
  for (const m of cmd.matchAll(PS_WRITE)) out.push(m[2].startsWith('-') ? null : m[2]);
  return out;
}

// ------------------------------------------ QUOTING, because `>` is not a redirect wherever it sits
// A `>` is a redirection only where the shell is READING CODE. Inside a quoted word or a heredoc
// body it is a character in a piece of prose, and the field caught this branch reading prose as a
// write twice: once from miq — a filename in a fenced block in a `gh pr create` body — and once from
// the conductor opening this very branch's pull request. Both were this shape,
//
//     gh pr create --title "x" --body "$(cat <<'EOF'
//     findings: github-pat -> server__miq-server__appsettings.json  (in the tarball)
//     EOF
//     )"
//
// denied as "writes server__miq-server__appsettings.json (shell redirection into it)" with no
// redirection anywhere in the command. Both were worked around by writing the body to a scratch file
// and passing --body-file, which is the worst outcome a guard can produce: the rule was not obeyed,
// it was routed around, and the lesson taught was "switch tools when the hook complains".
//
// THE FIX IS NOT "A `-` BEFORE THE `>` MAKES IT AN ARROW". That was the first theory — that `->file`
// is an ordinary word because a redirection is `>` or `N>` STARTING a word — and it is measurably
// wrong. Run it in a real shell before believing either version:
//
//     $ echo hello->out.txt ; cat out.txt      ->  hello-      (out.txt was created)
//     $ echo a-->b.txt      ; cat b.txt        ->  a--         (so was b.txt)
//     $ echo x=>c.txt       ; cat c.txt        ->  x=          (and c.txt)
//     $ echo "a -> d.txt"   ; ls d.txt         ->  no such file
//
// `>` is a METACHARACTER: it delimits the word before it wherever it appears in code, so `foo->bar`
// really does redirect into `bar`. Excluding a preceding `-` would therefore have cured the reported
// symptom by accident while opening a hole — `echo x->src/app.ts` writes product code — and a guard
// that trades a real catch for a false one has moved the error, not removed it. The fourth line is
// the actual discriminator, and it is QUOTING: in every field case the arrow sat inside a `<<'EOF'`
// body inside a `"…"` argument, which is why none of them was ever a redirect.
//
// So: one pass over the command marks which OFFSETS are unquoted shell code, and a `>` at an offset
// that is not code is not an operator. Only the OPERATOR's position is tested — a target may be
// quoted (`> "src/app.ts"` is a real write and stays caught), and that asymmetry is the point.
// Command substitutions are RE-ENTERED, because `"$(git show HEAD:x > src/app.ts)"` is code inside a
// quoted word and is a genuine write; the header's reason for not exempting git wholesale is this
// same reason. What cannot be parsed — an unbalanced quote, an unterminated heredoc — marks the
// remainder as not-code, which loses targets rather than inventing them, the direction this file
// errs in everywhere else.
const HEREDOC_DELIM = /^[A-Za-z_]\w*$/;

// A heredoc operator at `i`, or null: `<<EOF`, `<<-EOF`, `<< 'EOF'`, `<<"END"`. `<<<` is a
// here-string and not one. An unquoted delimiter must be a plain word, which keeps `$((a<<2))` from
// registering a heredoc named `2` and blanking the rest of the command.
function heredocAt(s, i) {
  if (s[i] !== '<' || s[i + 1] !== '<' || s[i + 2] === '<') return null;
  let j = i + 2;
  let strip = false;
  if (s[j] === '-' || s[j] === '~') { strip = true; j++; }
  while (s[j] === ' ' || s[j] === '\t') j++;
  let delim = '', quoted = false;
  while (j < s.length) {
    const d = s[j];
    if (d === "'" || d === '"') {
      quoted = true;
      j++;
      while (j < s.length && s[j] !== d) { delim += s[j]; j++; }
      j++;
      continue;
    }
    if (d === '\\') { j++; if (j < s.length) { delim += s[j]; j++; } continue; }
    if (/[\s;&|<>()]/.test(d)) break;
    delim += d;
    j++;
  }
  if (!delim || (!quoted && !HEREDOC_DELIM.test(delim))) return null;
  return { delim, strip, end: j };
}

// 1 where the offset is unquoted shell code, 0 where the shell would read a literal character.
function codeMask(cmd) {
  const s = String(cmd);
  const mask = new Uint8Array(s.length).fill(1);
  const off = (from, to) => { for (let k = from; k < to && k < s.length; k++) mask[k] = 0; };
  const stack = [{ t: 'code', close: null }];   // top is where the parser is; `close` ends a $( ) or ` `
  const pending = [];                           // heredocs whose body starts after the next newline
  let i = 0;

  const consumeBodies = () => {
    while (pending.length) {
      const h = pending.shift();
      while (i < s.length) {
        let eol = s.indexOf('\n', i);
        if (eol < 0) eol = s.length;
        const line = s.slice(i, eol).replace(/\r$/, '');
        const cand = h.strip ? line.replace(/^\t+/, '') : line;
        off(i, eol);                            // body line, or the delimiter line: neither is code
        i = eol < s.length ? eol + 1 : eol;
        if (cand === h.delim) break;
      }
    }
  };

  while (i < s.length) {
    const st = stack[stack.length - 1];
    const c = s[i];

    if (st.t === 'sq') {                        // '…' — everything is literal, including "
      off(i, i + 1);
      if (c === "'") stack.pop();
      i++;
      continue;
    }

    if (st.t === 'dq') {                        // "…" — literal, except a substitution re-enters code
      if (c === '\\') { off(i, i + 2); i += 2; continue; }
      if (c === '"') { off(i, i + 1); stack.pop(); i++; continue; }
      if (c === '$' && s[i + 1] === '(') { off(i, i + 2); stack.push({ t: 'code', close: ')' }); i += 2; continue; }
      if (c === '`') { off(i, i + 1); stack.push({ t: 'code', close: '`' }); i++; continue; }
      off(i, i + 1);
      i++;
      continue;
    }

    if (c === '\n') { i++; if (pending.length) consumeBodies(); continue; }
    if (c === '\\') { off(i, i + 2); i += 2; continue; }
    if (c === "'") { off(i, i + 1); stack.push({ t: 'sq' }); i++; continue; }
    if (c === '"') { off(i, i + 1); stack.push({ t: 'dq' }); i++; continue; }
    if (c === '`') {
      off(i, i + 1);
      if (st.close === '`') stack.pop(); else stack.push({ t: 'code', close: '`' });
      i++;
      continue;
    }
    if (c === '$' && s[i + 1] === '(') { stack.push({ t: 'code', close: ')' }); i += 2; continue; }
    if (c === ')' && st.close === ')') { stack.pop(); i++; continue; }
    const hd = heredocAt(s, i);
    if (hd) { pending.push({ delim: hd.delim, strip: hd.strip }); i = hd.end; continue; }
    i++;
  }
  return mask;
}

// The same split the segment loop has always used, carrying each segment's offset in the command so
// a match inside one can be asked whether it is code. Splitting is unchanged: only the offsets are new.
const SEGMENT = /\n|;|&&|\|\||\|/g;
function segments(s) {
  const out = [];
  let start = 0;
  for (const m of s.matchAll(SEGMENT)) {
    out.push({ text: s.slice(start, m.index), at: start });
    start = m.index + m[0].length;
  }
  out.push({ text: s.slice(start), at: start });
  return out;
}

// Returns { rel, why } for the first clearly-denied target, or null. `rel` is null when the shape is
// a write but no target could be resolved — a deny that names nothing rather than naming the wrong
// thing; main() has the sentence for it.
function scanBash(cmd, cwd, root) {
  const check = (targets, why, mustLookLikeFile) => {
    for (const t of targets) {
      if (mustLookLikeFile && !looksLikeFile(t)) continue;
      if (SCRATCH_EXT.test(t)) continue;
      if (classify(t, cwd, root) === 'denied') return { rel: relOf(t, cwd, root), why };
    }
    return null;
  };

  // Whole-command shapes first: a heredoc body is on its own lines, so it cannot be attributed to a
  // single segment.
  //
  // THE MECHANISM IS NOT THE VERDICT, THE PATH IS. This branch used to classify on the shape alone
  // and never look at where the script wrote, so a conductor rewriting
  // `.conducted/work/<feature>/state.md` with a Python heredoc was denied by a message that ended by
  // listing `.conducted/**` as his own. Denying a write to a path the same sentence grants is how a
  // guard loses its authority. Every other branch here resolves a target and checks it against the
  // allow-set; so does this one, through THE SAME classify()/OWNED/relOf trio — no second copy of
  // either, because minted twice is how the two drift apart.
  //
  // CONSERVATIVE WHERE IT CANNOT TELL, AND THERE IS EXACTLY ONE EXIT FOR NOT KNOWING. Every write
  // call's argument is resolved. If one of them is product code, that is the deny and it is named.
  // Otherwise, if any of them failed to resolve — including a shape that plainly writes but whose
  // call could not be read at all — the branch denies and SAYS THE TARGET COULD NOT BE DETERMINED,
  // naming nothing. It never substitutes a candidate found elsewhere on the line, and there is no
  // second pass looking for one: this is the only place in the guard where a failure to know could
  // be converted into a confident claim, and the field caught it doing exactly that twice. A target
  // that resolves to a real path outside every lite root is not a failure to know; it allows, as it
  // always has. And allowing here skips THIS BRANCH ONLY: the segment loop below still runs, so
  // `python3 <<EOF … EOF > src/app.ts` is still a redirect into product code and still denied, as is
  // a script that shells out to `cp`.
  if (INTERPRETER.test(cmd) && (HEREDOC.test(cmd) || INLINE_SCRIPT.test(cmd)) && WRITE_CALL.test(cmd)) {
    const targets = writeCallTargets(cmd);
    let unresolved = targets.length === 0;
    let denied = null;
    for (const t of targets) {
      if (!knowable(t)) { unresolved = true; continue; }
      if (HTTP_URL.test(t)) continue;                    // a URL is not a file this command writes
      if (SCRATCH_EXT.test(t)) continue;
      if (!denied && classify(t, cwd, root) === 'denied') {
        denied = { rel: relOf(t, cwd, root), why: WHY_INTERPRETER };
      }
    }
    if (denied) return denied;
    if (unresolved) return { rel: null, why: WHY_INTERPRETER };
  }

  const isCode = codeMask(cmd);

  for (const { text: seg, at } of segments(String(cmd))) {
    // Redirection. `2>&1` is excluded by the `&` guard and `2>/dev/null` by the candidacy test —
    // /dev/null has no extension, and it is outside every lite root anyway. THE FILE DESCRIPTOR IS
    // PART OF THE OPERATOR, not a reason to look away: `cmd 2> src/app.ts` writes product code
    // exactly as `cmd > src/app.ts` does, so the digits are matched (`\d*`) rather than used to
    // disqualify the `>` that follows them.
    //
    // THREE EXEMPTIONS, all because the field caught this branch reading PROSE as a redirect. A commit
    // message describing the worktree convention contains `<repo>_<feature>`, which contains `>_<`:
    // the scan saw `>`, read `_` as the target, and DENIED a `git commit` — while this file's own
    // header promises "GIT ALWAYS WORKS: the conductor commits, pushes, branches". A guard that
    // guesses is a guard that gets switched off, so:
    //   · a segment whose git subcommand CARRIES A HUMAN-WRITTEN MESSAGE is skipped — see
    //     GIT_MESSAGE_SUBCOMMAND above. Not all of git: that blanket version also swallowed
    //     `git show HEAD:x > src/app.ts`, a real write to product code, which this narrowing catches
    //     again. What is knowable is where prose appears on a git command line, not which git verbs
    //     are safe.
    //   · the target must LOOK LIKE A FILE — the same candidacy test the other branches use. `_` has
    //     no extension and no separator. This inherits the deliberate fail-open that predicate already
    //     declares (`> Makefile` is missed), and that is the accepted price: the Edit/Write path is
    //     the real guarantee, and a Bash deny kills a whole chained command including its reads.
    //   · the `>` MUST BE AT AN OFFSET THE SHELL WOULD READ AS CODE — see codeMask() above, and the
    //     two `gh pr create` denials that put it here. This is the exemption that actually covers a
    //     heredoc body: the body is prose by construction, and it was previously protected only by
    //     the accident that most prose filenames have a scratch extension.
    // They split the work: `-m "…"` on the command line is carried by the first and the third, a
    // filename in a PR body by the third alone, and `>_<` by all three. Bash coverage stays
    // best-effort by declaration; the Edit/Write path is the guarantee.
    if (!isGitMessageCommand(seg)) {
      for (const m of seg.matchAll(/(?:^|[^0-9&>])\d*>>?\s*(?!&)(['"]?)([^\s;&|<>'"]+)\1/g)) {
        if (!isCode[at + m.index + m[0].indexOf('>')]) continue;
        if (!looksLikeFile(m[2])) continue;
        const hit = check([m[2]], 'shell redirection into it', false);
        if (hit) return hit;
      }
    }
    // tee / sponge.
    const tee = check(teeTargets(seg), 'tee/sponge writing it', false);
    if (tee) return tee;
    // In-place edit.
    if (/\b(?:sed|perl|ruby)\b[^\n]*\s-i(\.\w+)?\b/i.test(seg)) {
      const hit = check(inPlaceTargets(seg), 'an in-place edit of it', true);
      if (hit) return hit;
    }
    // Copy / move onto a path. git is exempt from this scan by declaration in the header.
    if (!/^\s*git\b/.test(seg.trim())) {
      const hit = check(cpTargets(seg, cwd), 'copying or moving over it', true);
      if (hit) return hit;
    }
  }
  return null;
}

// ------------------------------------------------------------------------------------------- deny
function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

function main(data) {
  // A dispatched builder is the one who is SUPPOSED to be writing. Out before any other work.
  if (data.agent_id) quiet();

  const tool = data.tool_name || '';
  if (tool !== 'Bash' && !WRITE_TOOLS.has(tool)) quiet();
  const ti = data.tool_input;
  if (!ti || typeof ti !== 'object') quiet();

  const cwd = resolveCwd(data.cwd);
  const root = findRoot(cwd) || (process.env.CLAUDE_PROJECT_DIR ? findRoot(resolveCwd(process.env.CLAUDE_PROJECT_DIR)) : null);
  if (!root) quiet();                                     // not a lite repo — this law is not in force

  if (WRITE_TOOLS.has(tool)) {
    const target = ti.file_path || ti.filePath || ti.path || ti.notebook_path || '';
    if (!target) quiet();
    if (classify(target, cwd, root) !== 'denied') quiet();
    const rel = relOf(target, cwd, root);
    return deny(
      `Non-negotiable 1: you dispatch, you review, you never build. This ${tool} of ${rel} is denied. ` +
      `The point is not ceremony, it is that a context which did not write the change reads it: the first ` +
      `field adoption shipped a dead safety feature and reported it working, because the conductor was also ` +
      `the builder and nobody reviewed the diff. FIX: dispatch a builder — mission, acceptance in one binary ` +
      `line, files in and out of bounds, standards cited by number, self-check commands — then review what ` +
      `comes back and commit it. A genuine one-line fix is a one-line brief; brief it anyway, because the ` +
      `fresh pair of eyes is the thing you are buying, not the typing. YOU STILL OWN: ${OWNED_SUMMARY}.`
    );
  }

  const cmd = ti.command;
  if (typeof cmd !== 'string' || !cmd) quiet();
  const hit = scanBash(cmd, cwd, root);
  if (!hit) quiet();
  // A DENY NEVER INVENTS THE FILE IT IS DENYING. When the scan cannot resolve a target it says so,
  // in those words. The alternative is what the field saw: `io.open`, a function name scraped out of
  // a script body, presented as the path being written; and `ramen.jpg`, a filename that appears
  // only inside the HTML the command was writing. A guard that names the wrong thing teaches the
  // reader to stop believing the right things it says too.
  const what = hit.rel
    ? `This command writes ${hit.rel} (${hit.why}), and writing product files is building. Denied.`
    : `This command feeds a script to an interpreter that appears to write files, and the target could ` +
      `not be determined from the script, so it is not provably one of yours. An interpreter writing ` +
      `files is a builder-shaped move and the default is deny. Denied. If the target IS one of yours, ` +
      `name it as a plain quoted path in the script — or edit it with the editor tool, which is the ` +
      `better move anyway.`;
  return deny(
    `Non-negotiable 1: you dispatch, you review, you never build. ${what} FIX: dispatch a builder and review what ` +
    `comes back — a fresh context reading the change is the guarantee, not the ceremony; a genuine one-line ` +
    `fix is a one-line brief. Git, reads, builds, tests and installs are never blocked, so if you meant to ` +
    `inspect rather than write, run the read. Scratch output (.md .txt .log .out .tmp .diff .patch) and ` +
    `anything outside the repo are exempt. YOU STILL OWN: ${OWNED_SUMMARY}.`
  );
}

// ---- stdin, with a timeout: this hook runs on every tool call, so it must never hang one.
let input = '';
const timer = setTimeout(quiet, STDIN_TIMEOUT_MS);
timer.unref?.();
process.stdin.setEncoding('utf8');
process.stdin.on('error', quiet);
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  clearTimeout(timer);
  let data;
  try { data = JSON.parse(input); } catch { quiet(); }
  if (!data || typeof data !== 'object') quiet();
  try { main(data); } catch { quiet(); }                  // any unexpected throw fails open
});
