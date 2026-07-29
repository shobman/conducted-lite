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
// BASH COVERAGE IS BEST-EFFORT, AND THE Edit/Write PATH IS THE REAL GUARANTEE. Say it plainly: a
// shell is a general-purpose machine and no regex owns it. What is here catches the obvious
// file-writing shapes — redirection, tee, sed/perl -i, cp/mv onto a path, a heredoc or -c/-e fed to
// an interpreter that then names a file and a write call. EVERY ONE OF THEM ENDS AT THE SAME
// QUESTION: resolve the target, and is it in the allow-set. The interpreter shape used to stop at
// the mechanism and never ask, which denied a conductor rewriting his own `state.md` — a shape
// decides WHETHER to look at a path, never stands in for looking at one.
// A determined session gets past all of it, and that is accepted. GIT ALWAYS WORKS: the conductor commits, pushes, branches and runs worktree
// commands, none of those shapes are matched, git is exempt from the cp/mv scan, and the git
// subcommands that carry a human-written MESSAGE — commit, tag, notes, merge, revert, stash — are
// exempt from the redirection scan, because a message is prose and prose may contain `>`. The field
// proved what happens otherwise: a message containing `<repo>_<feature>` read as `>` redirecting
// into `_`, and the commit was denied by a guard whose own header promises git always works. The
// exemption is that list and not git as a whole, so `git show HEAD:x > src/app.ts` is still a write
// and still denied. Reads, builds, tests and installs are
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
//   · a path we cannot resolve    variables, globs, anything outside the repo root -> unknown is
//                                 always an allow. A guard that guesses is a guard that gets turned
//                                 off, and a disabled guard is worse than none.
//   · any unexpected throw        fails open
import { existsSync } from 'node:fs';
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
// directory entries. A linked worktree has the file checked out too, so a conductor working inside
// worktrees/<feature> is measured against that worktree's own tree, which is what it should be.
function findRoot(start) {
  let dir = pathResolve(start);
  for (let i = 0; i < 40; i++) {
    if (existsSync(join(dir, CONDUCTOR_REL))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  return null;
}

// 'owned' | 'denied' | 'unknown'. Unknown is always an allow.
function classify(raw, cwd, root) {
  const p = norm(raw);
  if (!p) return 'unknown';
  if (/[$*?`{}]|^-/.test(p)) return 'unknown';           // variables, globs, flags: we do not guess
  const abs = isAbsolute(p) ? pathResolve(p) : pathResolve(cwd, p);
  const rel = pathRelative(root, abs).replace(/\\/g, '/');
  if (!rel || rel.startsWith('../') || rel === '..' || isAbsolute(rel)) return 'unknown';  // outside the repo
  return OWNED.some((re) => re.test(rel)) ? 'owned' : 'denied';
}

const relOf = (raw, cwd, root) =>
  pathRelative(root, isAbsolute(norm(raw)) ? pathResolve(norm(raw)) : pathResolve(cwd, norm(raw))).replace(/\\/g, '/');

// ---------------------------------------------------------------- Bash, best-effort by declaration
// A token that looks like a file: has an extension-ish tail and is not a flag. Extension-less
// targets (`> Makefile`) are missed, and that is a deliberate fail-open.
const looksLikeFile = (t) => /\.[A-Za-z0-9]{1,12}$/.test(t) && !t.startsWith('-');
const rawTokens = (s) => String(s).match(/[A-Za-z0-9_.\-/\\~$:]{2,}/g) || [];
const fileTokens = (s) => rawTokens(s).filter(looksLikeFile);

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
// mentions a file is a read, and reads are never denied.
const WRITE_CALL = /(writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream|open\s*\([^)]*['"][wa]|write_text|write_bytes|writelines|\.write\s*\(|Set-Content|Out-File|Add-Content|File\.WriteAll)/i;
const INTERPRETER = /\b(node|node\.exe|python|python3|deno|bun|perl|ruby|pwsh|powershell)\b/i;
const HEREDOC = /<<[-~]?\s*['"]?[A-Za-z_]\w*/;
const INLINE_SCRIPT = /\s-(c|e|Command)\b/;
const WHY_INTERPRETER = 'a script fed to an interpreter, writing a file';

// THE PATHS A SCRIPT NAMES, as opposed to the identifiers sitting next to them. A path handed to an
// interpreter is a STRING LITERAL — `io.open('.conducted/work/x/state.md', 'w')`,
// writeFileSync("docs/y.md", …), Set-Content -Path '.conducted/roadmap.md' — and the quoting is the
// only thing that separates the path from the `io.open` in front of it. The field caught this branch
// reporting `io.open` as "the file this command writes"; it is a function name scraped out of a body
// by a token scan that cannot tell an identifier from a filename, and `.write` and `os.environ` come
// out of the same scan the same way. Quoted, no whitespace, and an extension that STARTS WITH A
// LETTER — which keeps `'w'`, `'utf-8'` and `"1.0.0"` out. Deliberately NOT a general path parser:
// it is only ever asked whether everything it found is inside the allow-set, and everything it
// misses leaves the answer at no.
//
// A `http(s)://` string is a URL, not a file, and naming one as the written path is the same lie as
// naming `io.open`. Only those two schemes: node's fs takes a `file:` URL and writes through it, so
// that one stays a path.
const QUOTED_LITERAL = /(['"`])([^'"`\n]{1,300})\1/g;
const QUOTED_PATH = /^[^\s]+\.[A-Za-z][A-Za-z0-9]{0,11}$/;
const HTTP_URL = /^https?:\/\//i;
function interpreterTargets(cmd) {
  const out = [];
  for (const m of String(cmd).matchAll(QUOTED_LITERAL)) {
    const s = m[2].trim();
    if (QUOTED_PATH.test(s) && !s.startsWith('-') && !HTTP_URL.test(s)) out.push(s);
  }
  return out;
}

// Returns { rel, why } for the first clearly-denied target, or null. `rel` is null when the shape is
// a write but no target could be resolved — a deny that names nothing rather than naming the wrong
// thing; main() has the sentence for it.
function scanBash(cmd, cwd, root) {
  const check = (tokens, why) => {
    for (const t of tokens) {
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
  // allow-set; so does this one now, through THE SAME classify()/OWNED/relOf trio — no second copy
  // of either, because minted twice is how the two drift apart.
  //
  // CONSERVATIVE WHERE IT CANNOT TELL, WHICH IS MOST OF THE TIME. The allow fires only when path
  // literals came out of the script AND EVERY ONE OF THEM is inside the allow-set. No literals, one
  // literal outside it, one path built at runtime — all still deny, on exactly the test that denied
  // them before. An interpreter writing files is a builder-shaped move and the default stays deny;
  // this only stops it firing on paths the conductor demonstrably owns. And allowing here skips THIS
  // BRANCH ONLY: the segment loop below still runs, so `python3 <<EOF … EOF > src/app.ts` is still a
  // redirect into product code and still denied, as is a script that shells out to `cp`.
  if (INTERPRETER.test(cmd) && (HEREDOC.test(cmd) || INLINE_SCRIPT.test(cmd)) && WRITE_CALL.test(cmd)) {
    const targets = interpreterTargets(cmd);
    const quoted = new Set(targets);
    // A token carrying a path SEPARATOR is credible as a path whether or not it came out whole, and
    // it gets a VETO over the allow. This is what stops the allow being bought with one owned
    // literal: `open('.conducted/a.md','w'); open('src/app' + '.ts','w')` yields exactly one
    // extractable target, the owned one, while `src/app` sits there in plain sight. Extension-less
    // on purpose — half a concatenated path has no extension, and this list only ever votes no.
    // Identifiers get no vote: `io.open`, `.write`, `os.environ` carry no separator, which is the
    // whole point of the separator test.
    const strays = rawTokens(cmd).filter((t) => /[/\\]/.test(t) && !quoted.has(t) && !HTTP_URL.test(t));
    const allOwned = targets.length > 0
      && targets.every((t) => classify(t, cwd, root) === 'owned')
      && strays.every((t) => classify(t, cwd, root) !== 'denied');
    if (!allOwned) {
      // Name a target only if it is credible AS A PATH: the script quoted it, or it carries a
      // separator. A bare dotted token scraped out of a body — `io.open`, `.write`, `os.environ` —
      // is an identifier, and reporting one as "the file this command writes" is a falsehood the
      // field caught. Unnameable is not un-denied: the last line here is the ORIGINAL test,
      // unchanged, so nothing that denied before stops denying — it loses its invented name, not
      // its verdict, and main() has an honest sentence for a target it cannot determine. A stray
      // earns a NAME only if it also looks like a file: `src/app` is enough to veto an allow, not
      // enough to be announced as the file being written.
      const nameable = targets.concat(strays.filter(looksLikeFile));
      const named = check(nameable, WHY_INTERPRETER);
      if (named) return named;
      if (check(fileTokens(cmd), WHY_INTERPRETER)) return { rel: null, why: WHY_INTERPRETER };
    }
  }

  for (const seg of String(cmd).split(/\n|;|&&|\|\||\|/)) {
    // Redirection. `2>&1` and `2>/dev/null` are excluded by the digit/& guards; /dev/null is outside
    // the repo anyway, so it classifies as unknown.
    //
    // TWO EXEMPTIONS, both because the field caught this branch reading PROSE as a redirect. A commit
    // message describing the worktree convention contains `<repo>_<feature>`, which contains `>_<`:
    // the scan saw `>`, read `_` as the target, and DENIED a `git commit` — while this file's own
    // header promises "GIT ALWAYS WORKS: the conductor commits, pushes, branches". A guard that
    // guesses is a guard that gets switched off, so:
    //   · a segment whose git subcommand CARRIES A HUMAN-WRITTEN MESSAGE is skipped — see
    //     GIT_MESSAGE_SUBCOMMAND above. Not all of git: that blanket version also swallowed
    //     `git show HEAD:x > src/app.ts`, a real write to product code, which this narrowing catches
    //     again. What is knowable is where prose appears on a git command line, not which git verbs
    //     are safe.
    //   · the target must LOOK LIKE A FILE — the same predicate the other branches use. `_` has no
    //     extension and no separator. This inherits the deliberate fail-open that predicate already
    //     declares (`> Makefile` is missed), and that is the accepted price: the Edit/Write path is
    //     the real guarantee, and a Bash deny kills a whole chained command including its reads.
    // The two split the work: a heredoc BODY is on its own lines, so the newline split above makes it
    // its own segment which is NOT a git invocation — the second exemption is what carries that case,
    // and the first carries `-m "…"` on the command line itself. Bash coverage stays best-effort by
    // declaration; the Edit/Write path is the guarantee.
    if (!isGitMessageCommand(seg)) {
      for (const m of seg.matchAll(/(?:^|[^0-9&>])>>?\s*(?!&)(['"]?)([^\s;&|<>'"]+)\1/g)) {
        if (!looksLikeFile(m[2])) continue;
        const hit = check([m[2]], 'shell redirection into it');
        if (hit) return hit;
      }
    }
    // tee / sponge.
    for (const m of seg.matchAll(/\b(?:tee|sponge)\b\s+(?:-\S+\s+)*(['"]?)([^\s;&|'"]+)\1/gi)) {
      const hit = check([m[2]], 'tee/sponge writing it');
      if (hit) return hit;
    }
    // In-place edit.
    if (/\b(?:sed|perl|ruby)\b[^\n]*\s-i(\.\w+)?\b/i.test(seg)) {
      const hit = check(fileTokens(seg), 'an in-place edit of it');
      if (hit) return hit;
    }
    // Copy / move onto a path. The destination is the last file-shaped token.
    if (/\b(?:cp|mv|install|rsync|ln)\b/.test(seg) && !/^\s*git\b/.test(seg.trim())) {
      const toks = fileTokens(seg);
      const dest = toks[toks.length - 1];
      const hit = dest ? check([dest], 'copying or moving over it') : null;
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
  // a script body, presented as the path being written. A guard that names the wrong thing teaches
  // the reader to stop believing the right things it says too.
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
