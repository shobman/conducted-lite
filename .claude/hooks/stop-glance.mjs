#!/usr/bin/env node
// conducted-lite Stop hook — a LOCAL GLANCE, once per turn. It informs. It cannot block.
//
// WHAT THIS FILE IS CORRECTING, said plainly because the mistake is instructive. The first build
// wired the FULL end-of-session check to `Stop`. Claude Code's hooks documentation groups its events
// by cadence, and the grouping is unambiguous:
//
//     once per session:  SessionStart, SessionEnd
//     once per turn:     UserPromptSubmit, Stop, StopFailure
//
// `Stop` fires "when Claude finishes responding" — EVERY TURN, dozens of times a session, not once
// at the end of one. Three consequences, all of them real and none of them measured at the time:
//
//   · a `git ls-remote` NETWORK ROUND TRIP per turn. Measured on a throwaway repo: 495 ms per turn
//     against a local file:// origin, the cheapest remote that exists, and 21.5 SECONDS against an
//     unreachable one.
//   · `state.md` and `last-session.md` REWRITTEN PER TURN — so the guard rail was a perpetual source
//     of dirt in the very tree it audits. The detection of that dirt was patched twice; the writing
//     was never questioned.
//   · a HARD BLOCK on ordinary mid-work dirt. One untracked scratch file made an ordinary turn cost
//     an extra assistant turn, every turn, via `stop_hook_active`.
//
// So this hook now does only what a per-turn event can afford, and only what it can guarantee:
//
//   LOCAL ONLY.   `git worktree list`, `git for-each-ref`, and one `git status --porcelain` per
//                 LINKED WORKTREE. That is 2 git processes in a repo with no worktrees, 2 + N with
//                 them, and ZERO network calls. Push position comes from `refs/remotes/`, the
//                 tracking refs cached at the LAST FETCH, which is why every line about it says
//                 "vs last fetch" and never "vs origin". It may be stale, and claiming more than
//                 that would be the asserted-not-verified failure this project exists to catch, one
//                 level down.
//   NO WRITES.    Not one byte. A hook that writes into the tree it audits is its own finding.
//   NEVER BLOCKS. There is no `decision` field anywhere in this file, under any condition. Search
//                 for it: it is not here. The worst this hook can do is say something.
//   SILENT WHEN CLEAN, AND SILENT FOR MOST OF WHAT IS NOT — see the next paragraph, which is the
//                 whole design of this file.
//
// WHAT IT SPEAKS ABOUT, AND WHY THAT IS A SHORTER LIST THAN IT WAS. The first version of this glance
// spoke about ANY unaccounted dirt, including the main checkout — which on a working tree mid-edit is
// EVERY SINGLE TURN. A message that is always there is wallpaper: it is read once, and then it is
// never read again, including on the turn it finally matters. Worse, the space while builders run is
// exactly where the conductor is thinking, and that is the space this hook was spending. So the test
// is now narrow and it is not "is something uncommitted": it is IS THIS INVISIBLE, AND IS IT AT RISK.
//
//   SPEAKS · local commits ahead of their upstream, vs last fetch, and a checked-out branch with no
//            upstream at all. This is the DECEPTIVE failure: work that looks finished because it is
//            committed, but exists on one machine and nowhere else. It is the 18-stranded-commits
//            case, and it does not fire every turn — it fires after you commit and stops when you
//            push.
//   SPEAKS · unaccounted dirt in a worktree that is NOT in flight. Invisible by construction: nobody
//            is looking at that checkout, and its builder is not live.
//   SILENT · uncommitted dirt in the MAIN checkout. Deliberately, and do not put it back. The human
//            can see it in their own editor and in their own `git status`; it is the normal state of
//            working rather than a fact anyone is missing; and it is the one condition that fires on
//            every turn of every session. `session-end.mjs` and the SessionStart fact-check both
//            still report it in full — this hook stopped repeating what those two say, not what
//            anyone would otherwise never learn.
//   SILENT · a worktree that IS in flight. A live builder holds uncommitted work by design.
//
// A consequence worth stating plainly: SILENCE FROM THIS HOOK DOES NOT MEAN THE TREE IS CLEAN. It
// means nothing invisible is at risk. The emitted text says so too, so nobody reads it the other way.
//
// Stop payload:
//   { session_id, transcript_path, cwd, hook_event_name: "Stop", stop_hook_active: bool, ... }
// Injecting context, exit 0 with JSON on stdout — the documented shape for Stop, whose own note is
// "this context appears at the end of the turn and Claude can act on it":
//   { "hookSpecificOutput": { "hookEventName": "Stop", "additionalContext": "<text>" } }
// Silence = exit 0 with no output.
//
// WHERE THE RULES COME FROM, AND WHY THE IMPORT IS DYNAMIC. The glob matcher, the worktree-name mint,
// the ledger read and the in-flight conjunction are NOT minted here: they are imported from
// `.claude/scripts/lite-rules.mjs`, the one copy that `session-end.mjs` also uses through lite-core.
// An earlier version of this file duplicated all four, with a sound reason — lite-core's failure face
// is `fail()`, which exits nonzero, and importing lite-core SPAWNS GIT at module scope, neither of
// which a per-turn hook can afford. The fix was to move the rules somewhere that has neither
// property rather than to copy them: lite-rules does no I/O, exits nothing, and runs no module-level
// code, so importing it costs one parse. Now the hook and the script cannot disagree about whether a
// worktree is in flight, because there is only one answer to disagree with.
//   The import is DYNAMIC (and its rejection is silence) for one reason: a STATIC import of a file
// that has been deleted, or that carries a syntax error, fails at module load — before any of this
// file's error handling exists — and a per-turn hook would print that failure into every turn. This
// way an absent or broken lite-rules.mjs is just one more silent exit 0.
//   `resolveCwd` below is still duplicated from lite-core, and deliberately: it calls existsSync, so
// it cannot live in a file whose promise is that it touches nothing. Its twin is `resolveCwd` in
// `.claude/scripts/lite-core.mjs` — change one, change the other.
//
// FAILURE MODE IS "SILENTLY SAYS NOTHING", NEVER "BLOCKS" AND NEVER "WEDGES" — every one of these
// exits 0 with no output at all:
//   · stop_hook_active === true      something else in this session blocked; repeating our note into
//                                    a block loop helps nobody. We never block, so this is courtesy,
//                                    not loop safety — there is no loop for this hook to be in.
//   · stdin read timeout             stdin that never closes must not hang every turn
//   · malformed / absent stdin       nothing to reason about
//   · lite-rules.mjs absent or broken   the import rejects and we say nothing
//   · not a lite repo                no .conducted/CONDUCTOR.md -> instant silence. A TRACKED FILE,
//                                    never a directory: git tracks files, not directories, so a
//                                    directory-existence guard silently disarms the moment its last
//                                    file moves.
//   · git absent / not a repo        `git worktree list` returns nothing -> nothing to derive from
//   · any git call failing           each one degrades to '' and its section is simply skipped
//   · nothing at risk                the normal case, and the loudest thing this hook does
//   · any unexpected throw           fails silent
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// The one copy of the rules. Resolved against THIS file, so the hook and the scripts it agrees with
// are always the pair that shipped together in this clone.
const RULES_URL = new URL('../scripts/lite-rules.mjs', import.meta.url).href;

const STDIN_TIMEOUT_MS = 10_000;
const GIT_TIMEOUT_MS = 10_000;
const CONTEXT_CAP = 8_000;
const MAX_LISTED = 10;          // a glance names a handful and counts the rest

const quiet = () => process.exit(0);

// Node on Windows needs native paths; a hook cwd may arrive native, Git-Bash /c/-style, or absent.
// (TWIN: `resolveCwd` in .claude/scripts/lite-core.mjs. It reads the filesystem, so it cannot move
// into lite-rules.mjs, whose whole promise is that it does not. Change one, change the other.)
function resolveCwd(c) {
  if (c) {
    const m = String(c).match(/^\/([a-zA-Z])\/(.*)$/);
    if (m) c = m[1].toUpperCase() + ':/' + m[2];
    if (existsSync(c)) return c;
  }
  return process.cwd();
}

// argv form, never a shell string — the same rule as every other file in this machinery: a
// metacharacter inside a VALUE stays data and can never become syntax.
const git = (args, cwd) => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return ''; }
};

// ---------------------------------------------------------------------------- reality, cheaply

// ONE `git worktree list --porcelain` gives the main checkout, every linked worktree, and each
// one's HEAD branch. It also stands in for "is this a git repo at all": no output, no repo.
function checkouts(start, posix) {
  const out = git(['worktree', 'list', '--porcelain'], start);
  const cos = [];
  let cur = null;
  for (const line of out.split('\n')) {
    const l = line.replace(/\r$/, '');
    if (l.startsWith('worktree ')) { cur = { path: posix(l.slice(9).trim()), branch: '' }; cos.push(cur); }
    else if (cur && l.startsWith('branch refs/heads/')) cur.branch = l.slice(18).trim();
  }
  return cos;
}

// Feature folders, filtered by the same NAME_RE session-end filters by — a folder that script
// REJECTS must not be one this hook silently accepts as a live builder.
// NARROW: an absent folder is the normal case and means "no features". Anything else — a permission
// error, a bad handle — must not be read as "no features", because that would silently switch the
// in-flight derivation off and start reporting live builders as a problem.
function featureFolders(main, R) {
  try {
    return new Set(readdirSync(join(main, R.WORK_REL), { withFileTypes: true })
      .filter((d) => d.isDirectory() && R.NAME_RE.test(d.name)).map((d) => d.name));
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return new Set();
    return null;                                          // unknown, and the caller treats it as such
  }
}

// The roadmap's DECLARED status per feature, read out of the ledger block by the shared parser. Read
// only: this hook never writes, and two writers of one ledger is how a ledger starts drifting.
function declaredStatuses(main, R) {
  let text = '';
  try { text = readFileSync(join(main, R.ROADMAP_REL), 'utf8'); }
  catch { return new Map(); }
  const s = text.indexOf(R.LEDGER_START);
  const e = text.indexOf(R.LEDGER_END);
  if (s === -1 || e === -1 || e < s) return new Map();
  return R.declaredStatuses(text.slice(s + R.LEDGER_START.length, e));
}

// The TRACKED declaration of what may be dirty. A hook is a fresh process, so nothing from the
// conductor's shell reaches it; a committed file does, and it shows up in review.
function allowGlobs(main, R) {
  let raw = '';
  try { raw = readFileSync(join(main, R.ALLOW_REL), 'utf8'); }
  catch { return []; }
  return raw.split('\n').map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean).map((g) => ({ g, re: R.globToRe(g) }));
}

function main(data, R) {
  const start = resolveCwd(process.env.CLAUDE_PROJECT_DIR || data.cwd);
  const cos = checkouts(start, R.posix);
  if (!cos.length) quiet();                               // git absent, or not a repo
  const MAIN = cos[0].path;
  if (!existsSync(join(MAIN, R.CONDUCTOR_REL))) quiet();  // not the lite layout — not this hook's business

  // Linked worktrees only. The main checkout is not read at all: its dirt is the human's own screen
  // (see the header), and skipping it is also what makes the common case two git processes.
  const linked = cos.slice(1);

  const risks = [];          // the only things that make this hook speak
  const notes = [];          // context, printed only once it is already speaking
  const inFlight = new Set();
  let allowed = 0;

  if (linked.length) {
    const folders = featureFolders(MAIN, R);
    const declared = declaredStatuses(MAIN, R);
    const allow = allowGlobs(MAIN, R);

    for (const co of linked) {
      // IN FLIGHT, DERIVED by the ONE copy of the conjunction (lite-rules), which is the same answer
      // session-end reaches about the same worktree. A live builder holds uncommitted work by design;
      // reporting that every turn would train everyone to ignore this hook. When the folder listing
      // failed outright, nothing is known to be in flight and everything is simply reported — an
      // unknown must not silently widen an allowance.
      co.feature = R.featureNameOf(co.path, MAIN);
      const state = R.inFlightState(!!folders && folders.has(co.feature), declared.get(co.feature));
      if (state === 'in-flight') inFlight.add(co.path);

      const label = co.path.toLowerCase().startsWith(MAIN.toLowerCase() + '/') ? co.path.slice(MAIN.length + 1) : co.path;
      const fields = git(['status', '--porcelain', '-z'], co.path).split('\0').filter((f) => f !== '');
      const dirty = [];
      let flew = 0;
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const xy = f.slice(0, 2);
        const path = R.posix(f.slice(3));
        if (xy[0] === 'R' || xy[0] === 'C') i++;           // the rename/copy source field
        if (state === 'in-flight') { flew++; continue; }
        if (allow.some((a) => a.re.test(path))) { allowed++; continue; }
        dirty.push(`${xy} ${path}`);
      }
      if (flew) {
        notes.push(`worktree \`${label}\` is IN FLIGHT (feature '${co.feature}' is declared under '## development') and holds ${flew} uncommitted file(s). Expected while a builder is live, and not counted against anything — but those bytes are on this machine only.`);
      }
      if (dirty.length) {
        const why = state === 'no-folder'
          ? `no ${R.WORK_REL}/${co.feature}/ folder exists, so nothing declares this worktree`
          : `${R.ROADMAP_REL} has '${co.feature}' under '## ${declared.get(co.feature) || '(no row at all)'}', not '## development'`;
        risks.push(`${dirty.length} uncommitted file(s) in a worktree NOBODY IS LOOKING AT — \`${label}\` (${why}): ` +
          dirty.slice(0, MAX_LISTED).map((d) => '`' + d + '`').join(', ') + (dirty.length > MAX_LISTED ? ` … and ${dirty.length - MAX_LISTED} more` : ''));
      }
    }
  }

  // Push position from the CACHED tracking refs. No network: `%(upstream:track)` is computed from
  // refs/remotes/, which is what this clone saw at its last fetch. Everything below therefore says
  // "vs last fetch", and means it.
  const trackOut = git(['for-each-ref', '--format=%(refname)%09%(upstream:short)%09%(upstream:track,nobracket)', 'refs/heads', 'refs/remotes'], MAIN);
  const ahead = [];
  const noUpstream = [];
  let remoteRefs = 0;
  const headBranches = new Set(cos.filter((c) => c.branch && !inFlight.has(c.path)).map((c) => c.branch));
  for (const line of trackOut.split('\n')) {
    if (!line.trim()) continue;
    const [refname, upstream, track] = line.replace(/\r$/, '').split('\t');
    if (refname.startsWith('refs/remotes/')) { remoteRefs++; continue; }
    if (!refname.startsWith('refs/heads/')) continue;
    const name = refname.slice(11);
    const m = /(?:^|,\s*)ahead (\d+)/.exec(track || '');
    if (m) ahead.push(`\`${name}\` is ${m[1]} commit(s) ahead of \`${upstream}\``);
    else if (!upstream && headBranches.has(name)) noUpstream.push(name);
  }
  if (ahead.length) {
    risks.push(`local-only commits, VS LAST FETCH (read from \`refs/remotes/\`, which may be stale — this hook makes no network call): ${ahead.slice(0, MAX_LISTED).join('; ')}. \`git push\` when it is ready.`);
  }
  // A branch with no upstream at all is only news in a repo that HAS a remote, and only for a branch
  // something is actually checked out on. An in-flight worktree's branch is excluded above: its
  // whole point is that it has not landed yet.
  if (noUpstream.length && remoteRefs > 0) {
    risks.push(`branch(es) with no upstream recorded in this clone — nothing on them has been shown to reach origin: ${noUpstream.slice(0, MAX_LISTED).map((n) => '`' + n + '`').join(', ')}. \`git push -u origin <branch>\` when it is ready.`);
  }

  // SILENT WHEN NOTHING INVISIBLE IS AT RISK. This is the loudest thing this hook does.
  if (!risks.length) quiet();

  if (allowed) notes.push(`${allowed} file(s) are accounted for by a glob in ${R.ALLOW_REL}.`);

  const text =
    'conducted-lite — a local glance at the end of this turn. FACTS ONLY: nothing here blocks, nothing\n' +
    'here was decided for you, and this check made no network call and wrote no file.\n\n' +
    risks.map((r) => `  · ${r}`).join('\n') +
    (notes.length ? '\n\n  named, not counted against anything:\n' + notes.map((n) => `    · ${n}`).join('\n') : '') +
    `\n\nThis is a GLANCE, and it is deliberately less than a check: it never asked origin anything, and\n` +
    `it says NOTHING about uncommitted work in the main checkout — that one is already on your screen\n` +
    `and in your own \`git status\`. So silence here means "nothing INVISIBLE is at risk", never "the\n` +
    `tree is clean". The full end-of-session check — one real \`ls-remote\`, every checkout reconciled,\n` +
    `a fresh state.md for every feature this session touched, and the assurance block — is one command:\n` +
    `  node ${R.END_REL}\n` +
    `It also runs by itself when this context ends, which is best-effort and may not happen.\n` +
    `If this is ordinary work in progress, it is fine to carry on: this is a fact, not a finding.`;

  // The documented Stop shape. There is deliberately NO `decision` field: this hook informs.
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'Stop', additionalContext: text.slice(0, CONTEXT_CAP) },
  }));
  process.exit(0);
}

// ---- stdin, with a timeout: this fires every turn, so it must never hang one.
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
  // Courtesy, not loop safety: this hook has no block to loop on. If something ELSE in this session
  // blocked, saying the same thing again into the retry helps nobody.
  if (data.stop_hook_active === true) quiet();
  // Rules first, and a rejection is silence — see the header: a broken or absent lite-rules.mjs must
  // cost this turn nothing at all, which a static import could not promise.
  import(RULES_URL).then((R) => { try { main(data, R); } catch { quiet(); } }, quiet);
});
