#!/usr/bin/env node
// conducted-lite core — the shared machinery behind session-start and session-end.
//
// Everything in here is proven property, not convenience. Three of them are load-bearing and MUST
// survive every edit:
//
//   ARGV FORM, ALWAYS — there is NO shell in this file. Every child is spawned with
//   execFileSync(file, argvArray), so a metacharacter inside a VALUE ('&', ';', '|', '`', '$( )', a
//   space, a quote, a newline) is DATA and can never become syntax. In the M1 engine the
//   shell-string form was a real, exploited injection: a branch name split the command in two and
//   git acted on the wrong ref while the engine reported success. Do not reintroduce a shell string.
//
//   MACHINE REGIONS ARE REWRITTEN BY BYTE SPLICE, NEVER APPENDED — every file this machinery writes
//   has two regions divided by a pair of markers. The scripts own exactly the bytes BETWEEN the
//   markers and splice by index, so everything outside them is preserved byte-for-byte by
//   construction rather than by care. Append-only growth is the measured bloat driver lite exists to
//   avoid. The ONE exception is archive.md, which is a log by definition and is what keeps
//   roadmap.md bounded — it is named as an exception rather than smuggled in.
//
//   EVERY WRITE IS ATOMIC — temp file, then rename over the target. The byte-splice promise above is
//   only worth anything if a half-finished write cannot land: the SessionEnd hook does this work
//   while the session is TERMINATING and may be killed mid-run, and the file it rewrites carries a
//   human region. See writeAtomic().
//
//   FRESHNESS IS A CONTENT HASH, NEVER AN MTIME — these scripts write the files they check, so an
//   mtime check would verify their own writing and nothing else.
//
// Every failure exits nonzero with a NAMED error (E_*) on stderr — never a silent half-write.
//
// THE RULES THEMSELVES LIVE ONE FILE OVER, in `lite-rules.mjs`, and are re-exported from here so
// every existing importer is unchanged. They were moved because of the two properties this file
// cannot offer: `fail()` exits nonzero, and importing this file SPAWNS GIT (see REPO below). The
// per-turn Stop hook can afford neither, and it must not mint its own copy of a rule this file also
// holds — two copies of the in-flight derivation is how the hook and session-end end up disagreeing
// about the same repo. Anything both sides must agree on belongs there, not here.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import {
  posix, globToRe, featureNameOf, worktreeLayout, parseLedger, declaredStatuses,
  inFlightState, isInFlight, IN_FLIGHT_STATUS, NAME_RE, ROW_RE, STATUSES, rung,
  CONDUCTED, WORK_REL, ROADMAP_REL, ARCHIVE_REL, CONDUCTOR_REL, LAST_REL, ALLOW_REL, END_REL, START_REL,
  FACTS_START, FACTS_END, LEDGER_START, LEDGER_END, ARCHIVE_START, ARCHIVE_END,
} from './lite-rules.mjs';

export {
  posix, globToRe, featureNameOf, worktreeLayout, parseLedger, declaredStatuses,
  inFlightState, isInFlight, IN_FLIGHT_STATUS, NAME_RE, ROW_RE, STATUSES, rung,
  CONDUCTED, WORK_REL, ROADMAP_REL, ARCHIVE_REL, CONDUCTOR_REL, LAST_REL, ALLOW_REL, END_REL, START_REL,
  FACTS_START, FACTS_END, LEDGER_START, LEDGER_END, ARCHIVE_START, ARCHIVE_END,
};

// ---------------------------------------------------------------------------- errors + shelling

export function fail(code, msg) {
  process.stderr.write(`${code}: ${msg}\n`);
  process.exit(1);
}

// Node on Windows needs native paths; an invocation cwd may arrive native or Git-Bash /c/-style.
// (TWIN: `resolveCwd` in .claude/hooks/stop-glance.mjs. It is the ONE rule those two still keep two
// copies of, because it calls existsSync and lite-rules.mjs may not touch the filesystem. Change one,
// change the other.)
export function resolveCwd(c) {
  if (c) {
    const m = String(c).match(/^\/([a-zA-Z])\/(.*)$/);
    if (m) c = m[1].toUpperCase() + ':/' + m[2];
    if (existsSync(c)) return c;
  }
  return process.cwd();
}

// The one child-process face. argv form, stdout+stderr captured, never throws.
//
// The try wraps the SPAWN AND NOTHING ELSE. Everything the options object needs is computed above it,
// deliberately: a `catch` around option-building would turn a typo in this file (an undefined
// identifier, a bad property read) into "the child failed", which is a lie that reads exactly like a
// git error and is how a feature ships dead. That failure has been observed in the field.
export function runOut(file, args, { cwd, timeout } = {}) {
  const opts = {
    encoding: 'utf8',
    cwd: cwd || REPO,
    env: process.env,
    timeout: timeout || 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  try {
    const out = execFileSync(file, args, opts);
    return { ok: true, out: out || '', err: '' };
  } catch (e) {
    const err = [e.stderr, e.stdout].map((s) => (s ? String(s) : '')).join('\n').trim() || e.message;
    return { ok: false, out: '', err: err.slice(0, 2000) };
  }
}

// The four git faces, all argv (same names and contracts as the M1 engine):
//   gitOut — the reporting form ({ok,out,err}), for anything whose failure is news
//   gitq   — the quiet probe: trimmed stdout, '' on any failure
//   gitRaw — UNTRIMMED stdout, '' on failure — porcelain's leading column is significant
//   gitOk  — exit status only, for the `--is-ancestor`-shaped predicates
export const gitOut = (args, opts) => { const r = runOut('git', args, opts); return { ok: r.ok, out: r.out.trim(), err: r.err }; };
export const gitq = (args, cwd) => gitOut(args, { cwd }).out;
export const gitRaw = (args, cwd) => runOut('git', args, { cwd }).out;
export const gitOk = (args, cwd) => runOut('git', args, { cwd }).ok;

export const refExists = (ref) => gitq(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], REPO) !== '';

export const CWD = resolveCwd(process.env.CLAUDE_PROJECT_DIR || process.cwd());
export const REPO = gitq(['rev-parse', '--show-toplevel'], CWD) || CWD;

// ---------------------------------------------------------------------------- constants

// (The path constants, the marker pairs and THE LADDER moved to lite-rules.mjs and are re-exported
// above: a hook that has to find the same markers in the same files must read them from one place.
// What stays below is session-end's own policy — numbers nothing else needs to agree with.)

// One sitting, generously bounded — long enough for a real session, short enough that yesterday's
// note cannot stand in for today's thinking. Same number the M1 engine used for its handoff check.
export const WINDOW_H = 12;
export const WINDOW_MS = WINDOW_H * 60 * 60 * 1000;

// (There was an ABANDON_FRESH window here, and it is deliberately gone. It existed so a Stop hook
// could decide whether an `--abandon` record was recent enough to RELEASE a block. Nothing blocks
// any more, so nothing needs releasing, and a constant that no longer governs anything is a comment
// pretending to be machinery. `--abandon` still writes its record; the record is now the whole point
// of it rather than the price of getting past a gate.)

// The session log is a LOG inside a REWRITTEN block, which is a contradiction unless it is bounded.
// It is: the block carries the most recent SESSION_LOG_KEEP entries and drops the rest, so two runs
// a year apart still produce the same number of lines.
export const SESSION_LOG_KEEP = 6;

// ---------------------------------------------------------------------------- small helpers

// CATCH ONLY WHAT YOU MEAN. A bare `catch {}` around anything larger than one I/O call swallows this
// file's OWN programming errors — a ReferenceError from an identifier that does not exist reads
// exactly like "the file was absent", and the feature silently does nothing while reporting success.
// That is not hypothetical: it is how the field's own allow-dirty fix shipped dead (a `join(REPO, …)`
// where REPO was never imported, inside a bare catch). These two are the narrowing, used everywhere:
//   missing()  — an absent/unreadable-as-a-directory path, the one filesystem outcome that is normal
//   onlyBadJson() — a parse failure of data we did not write, and NOTHING else
export const missing = (e) => !!e && (e.code === 'ENOENT' || e.code === 'ENOTDIR');
export const onlyBadJson = (e) => { if (e instanceof SyntaxError || e instanceof TypeError) return; throw e; };

export const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
export const unb64 = (s) => { try { return Buffer.from(String(s), 'base64').toString('utf8'); } catch (e) { onlyBadJson(e); return ''; } };

// Free text from the caller (--reason, --effort, session notes) is written into files this
// machinery PARSES on the next run. Neutralise anything that could forge or truncate a marker.
export function sanitize(s) {
  return String(s)
    .replace(/\r?\n/g, ' ')
    .split('<!--').join('(!--')
    .split('-->').join('--)')
    .split('conducted-lite:').join('conducted-lite․')
    .trim()
    .slice(0, 2000);
}

// Hash of a HUMAN region. Line endings normalised and trailing whitespace trimmed, so an editor's
// newline habits are not mistaken for a change of mind.
export const judgmentHash = (text) => createHash('sha256')
  .update(String(text).replace(/\r\n/g, '\n').replace(/\s+$/, ''), 'utf8').digest('hex').slice(0, 16);

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { flags[a.slice(2)] = true; continue; }
      flags[a.slice(2)] = next; i++;
    } else positional.push(a);
  }
  return { positional, flags };
}

export function rejectUnknownFlags(flags, allowed, cmd) {
  const bad = Object.keys(flags).filter((k) => k !== 'help' && !allowed.includes(k));
  if (bad.length) fail('E_BAD_FLAG', `unknown flag(s) for '${cmd}': ${bad.map((b) => '--' + b).join(', ')} — legal: ${allowed.map((a) => '--' + a).join(', ')}`);
}

// ---------------------------------------------------------------------------- checkouts

// `git worktree list` names the main checkout FIRST; everything after it is a linked worktree.
//
// The feature name and the layout verdict are BOTH minted by `featureNameOf` / `worktreeLayout` in
// lite-rules.mjs — one copy, imported by everything that reads a worktree, because the roadmap's
// 'development' derivation, session-end's reconcile and the Stop hook's in-flight glance all have to
// call the same directory the same feature. Minting it twice is how they drift apart.
export function checkouts() {
  const lines = gitq(['worktree', 'list', '--porcelain'], REPO).split('\n').filter((l) => l.startsWith('worktree '));
  const paths = lines.map((l) => posix(l.slice(9).trim()));
  if (!paths.length) return { main: posix(REPO), all: [{ path: posix(REPO), label: '(main checkout)', name: null, layout: 'main' }] };
  const main = paths[0];
  return {
    main,
    all: paths.map((p, i) => (i === 0
      ? { path: p, label: '(main checkout)', name: null, layout: 'main' }
      : { path: p, label: p.toLowerCase().startsWith(main.toLowerCase() + '/') ? p.slice(main.length + 1) : p, name: featureNameOf(p, main), layout: worktreeLayout(main, p) })),
  };
}

// The one sentence said about a worktree that is not where the convention puts it — same words from
// session-start and session-end, so a conductor is never told two different stories.
export const outOfConvention = (w, main) =>
  `worktree for '${w.name}' is at ${w.path}, OUTSIDE the repo. The convention for a conducted repo is ` +
  `\`worktrees/<feature>/\` inside it — one place, already covered by .gitignore, and the directory name IS the ` +
  `feature name. This one was read as feature '${w.name}'${w.layout === 'sibling' ? " by stripping the '<repo>_' prefix" : ''} and reconciled ` +
  `normally: nothing failed and nothing was moved. To move it: git worktree move ${w.path} ${main}/worktrees/${w.name}`;

// ---------------------------------------------------------------------------- marker splice I/O

// Read a file and split it at a marker pair, BY INDEX. head and tail are exact byte slices, so the
// human region survives a rewrite unchanged by construction: the writer never holds it in a buffer
// it rewrites.
// `truncated` separates the two ways markers can be absent, because they mean different things and
// the SessionStart fact-check has to say which: NO marker at all is a file nobody scaffolded, while
// an OPENING marker with no closing one is a file that was cut in half. Since every write here is
// atomic that can no longer be this machinery's doing, so saying "truncated" points at the real
// cause — an editor, a merge conflict, a hand-edit — instead of at a script that did not do it.
export function readSplit(path, START, END) {
  if (!existsSync(path)) return { exists: false, markers: false, truncated: false, text: '', head: '', body: '', tail: '' };
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { return fail('E_UNREADABLE', `${posix(path)}: ${e.message}`); }
  const s = text.indexOf(START);
  const e = text.indexOf(END);
  if (s === -1 || e === -1 || e < s) return { exists: true, markers: false, truncated: s !== -1 || e !== -1, text, head: '', body: '', tail: '' };
  return { exists: true, markers: true, truncated: false, text, head: text.slice(0, s), body: text.slice(s + START.length, e), tail: text.slice(e + END.length) };
}

// THE ONE WRITE FACE, AND IT IS ATOMIC. A sibling temp file is written in full and then RENAMED over
// the target. rename replaces in a single step — on Windows Node uses MoveFileEx with
// MOVEFILE_REPLACE_EXISTING, which is likewise one step — so any reader, and any kill, sees either
// the whole old file or the whole new one. There is no window in which the target is half a file.
//
// This is not tidiness. The SessionEnd hook runs this machinery while the session is TERMINATING and
// can be killed mid-run, and what it rewrites is a file whose HUMAN region the byte-splice guarantee
// promises to preserve. Truncate-then-write would break that promise at exactly the moment nobody is
// watching: `writeFileSync` truncates first, so a kill between truncate and the last byte leaves a
// state.md with its '## Decisions' gone. Atomic rename makes that unrepresentable.
//
// The temp name carries the pid so two runs cannot collide, and `*.conducted-lite-tmp.*` is in
// .gitignore: a rename that never happened leaves debris, and debris must not become a finding in
// the check that reads the tree. If the rename itself fails (a Windows file lock, a full disk) the
// OLD file is still whole and untouched, which is the safe direction to fail in.
export function writeAtomic(path, text) {
  try { mkdirSync(dirname(path), { recursive: true }); } catch (e) { fail('E_WRITE_FAILED', `${posix(dirname(path))}: ${e.message}`); }
  const tmp = `${path}.conducted-lite-tmp.${process.pid}`;
  let err = null;
  try { writeFileSync(tmp, text); renameSync(tmp, path); } catch (e) { err = e; }
  if (err) {
    // The temp file is debris and never the record, so removing it is best-effort — and its OWN
    // failure must not replace the real error below, which is the only reason this is allowed to be
    // quiet. It is still not silent: a leftover is named on stderr so nobody has to find it.
    try { unlinkSync(tmp); } catch (e2) { if (!missing(e2)) process.stderr.write(`W_TMP_LEFT: ${posix(tmp)} could not be removed (${e2.message})\n`); }
    fail('E_WRITE_FAILED', `${posix(path)}: ${err.message} — the target was NOT modified.`);
  }
}

export function writeSplit(path, split, START, END, body) {
  writeAtomic(path, split.head + START + body + END + split.tail);
}

// --rescaffold's ONE rule about where the machine block goes, shared by both scripts so a roadmap and
// a state.md are scaffolded the same way. It lands AFTER a leading `# ` title when the file has one:
// every other file this machinery writes opens with its title, and the field's rescaffold left the
// document opening with a machine block and the title stranded twenty lines down. A file with no
// leading heading is unchanged from before — the block goes first, then the existing content.
export function rescaffoldSplit(text) {
  const s = String(text);
  const m = s.match(/^\s*#[ \t]+[^\n]*(?:\r?\n|$)/);
  if (!m) return { head: '', tail: s.startsWith('\n') ? s : '\n' + s };
  const rest = s.slice(m[0].length);
  return { head: m[0].replace(/\s+$/, '') + '\n\n', tail: rest.startsWith('\n') ? rest : '\n' + rest };
}

export const noMarkers = (path, START, END, howToFix) => fail('E_LITE_NO_MARKERS',
  `${posix(path)} exists but carries no machine markers, so this script cannot tell which region it owns — and it will not guess. NOTHING WAS WRITTEN.\n` +
  `  Add these two lines where the machine block should live (the script owns everything between them, and rewrites it every run):\n` +
  `    ${START}\n    ${END}\n` + (howToFix ? `  ${howToFix}\n` : ''));

// ---------------------------------------------------------------------------- git reality

// The default branch, LOCALLY (no network). Never guessed: a repo whose origin/HEAD is unknown gets
// `null` and every judgement that depends on it is reported UNVERIFIED rather than assumed. Guessing
// 'main' here would silently mis-answer "is this branch merged?" on every repo that uses another.
export function defaultBranch() {
  const a = gitq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], REPO);
  if (a.startsWith('origin/')) return a.slice(7);
  const b = gitq(['rev-parse', '--abbrev-ref', 'origin/HEAD'], REPO);
  if (b.startsWith('origin/')) return b.slice(7);
  return null;
}

export const localBranches = () => gitq(['for-each-ref', '--format=%(refname:short)%09%(objectname)', 'refs/heads'], REPO)
  .split('\n').filter(Boolean).map((l) => { const [name, sha] = l.split('\t'); return { name, sha }; });

export const remoteTrackingBranches = () => gitq(['for-each-ref', '--format=%(refname:short)%09%(objectname)', 'refs/remotes/origin'], REPO)
  .split('\n').filter(Boolean).map((l) => { const [name, sha] = l.split('\t'); return { name: name.replace(/^origin\//, ''), sha }; })
  .filter((b) => b.name !== 'HEAD');

// LOCAL-ONLY COMMITS, WITH NO NETWORK CALL. `%(upstream:track)` is computed from `refs/remotes/` —
// the tracking refs this clone cached at its LAST FETCH — so the whole repo costs ONE process and no
// round trip. The price is that it may be STALE, and every caller must therefore say "vs last fetch"
// rather than "vs origin": a branch this clone believes is ahead may already have been pushed from
// another machine, and one it believes is level may be behind an origin it has not spoken to. Stale
// is the right trade for a per-turn glance and is the WRONG trade for the assurance block, which is
// why session-end still pays for one real `ls-remote`. The two must never be confused, so they are
// worded differently wherever they print.
//
// `remoteRefs` is counted from the same call: a clone with no tracking refs at all is a repo that
// does not talk to a remote, and "this branch has no upstream" is not news there.
export function trackingSnapshot(cwd) {
  const out = gitq(['for-each-ref', '--format=%(refname)%09%(upstream:short)%09%(upstream:track,nobracket)', 'refs/heads', 'refs/remotes'], cwd || REPO);
  const branches = [];
  let remoteRefs = 0;
  for (const line of out.split('\n')) {
    if (!line) continue;
    const [refname, upstream, track] = line.split('\t');
    if (refname.startsWith('refs/remotes/')) { remoteRefs++; continue; }
    if (!refname.startsWith('refs/heads/')) continue;
    const m = /(?:^|,\s*)ahead (\d+)/.exec(track || '');
    branches.push({ name: refname.slice(11), upstream: upstream || '', ahead: m ? Number(m[1]) : 0, gone: /(?:^|,\s*)gone(?:,|$)/.test(track || '') });
  }
  return { branches, remoteRefs };
}

// Is `sha` contained in the default branch as this clone last saw it? THREE states, never two —
// containment is a question about OBJECTS this clone may not hold, and collapsing "cannot verify"
// into "not merged" prints a verdict nothing checked.
export function mergedIntoDefault(sha, def) {
  if (!def) return { state: 'unverified', why: "this clone has no origin/HEAD, so the default branch is unknown — run 'git remote set-head origin -a'" };
  const target = gitq(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${def}^{commit}`], REPO);
  if (!target) return { state: 'unverified', why: `this clone has no 'origin/${def}' — run 'git fetch origin'` };
  if (!refExists(sha)) return { state: 'unverified', why: `${sha.slice(0, 8)} is not an object in this clone` };
  return { state: gitOk(['merge-base', '--is-ancestor', sha, target], REPO) ? 'merged' : 'unmerged', target };
}

// ---------------------------------------------------------------------------- features

// (NAME_RE — what a feature may be called — is in lite-rules.mjs and re-exported above: the Stop
// hook filters the same folder listing by the same rule, so a folder session-end rejects can never
// be one the hook silently accepts as a live builder.)
export const DOCS = ['problem.md', 'solution.md', 'tech-design.md'];
// One line of accommodation for superpowers, not a dependency: if it is used, its plan and spec land
// in the same folder and are LISTED. Nothing here requires them, reads them, or waits for them.
export const EXTRA_DOCS = ['plan.md', 'spec.md', 'research.md'];

export function listFeatures(main) {
  const dir = join(main, WORK_REL);
  let entries = [];
  // NARROW: 'the folder is not there yet' is the normal case and returns nothing. Anything else — a
  // permission error, a bad handle, a mistake in this file — must NOT be read as "this repo has no
  // features", because that answer silently switches off checks 3 and 4.
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch (e) { if (missing(e)) return { ok: [], rejected: [] }; return fail('E_UNREADABLE', `${posix(dir)}: ${e.message} — this is not "no features"; nothing was checked against it.`); }
  const names = entries.filter((d) => d.isDirectory()).map((d) => d.name);
  const ok = [], rejected = [];
  for (const n of names.sort()) {
    if (n.startsWith('.') || n.startsWith('_')) continue;
    (NAME_RE.test(n) ? ok : rejected).push(n);
  }
  return { ok, rejected };
}

// A DIRECTORY GIT HAS NEVER SEEN IS REPORTED COLLAPSED. `git status --porcelain` prints ONE entry —
// '?? .conducted/work/' or '?? .conducted/work/<name>/' — at the highest level that is entirely
// untracked, and never a line for the file inside it. So a folder holding nothing but the state.md
// this machinery writes is invisible to a lookup by path, and both readers of a porcelain line would
// call it work nothing accounts for: session-end's check 1 would FAIL the moment `--new-feature`
// created one, which makes the check unpassable by construction — the one thing it must never be.
//
// So the question is not about a path SHAPE, it is: is every FILE under this directory a state.md
// this machinery writes? Walked, and answered. NARROW ON PURPOSE — one other file in there (an
// uncommitted tech-design.md, a builder's note) and it is stranded work again, which it is.
// ONE COPY, imported by both scripts: two readers of the same porcelain line must not disagree.
const COLLAPSE_MAX_DEPTH = 4;
const FEATURE_FOLDER_RE = new RegExp(`^${WORK_REL.replace(/\./g, '\\.')}/[^/]+$`);
export function collapsedMachineDir(main, path) {
  if (!path.endsWith('/')) return false;
  const rel = path.slice(0, -1);
  if (rel !== WORK_REL && !rel.startsWith(`${WORK_REL}/`)) return false;   // never walk anything else
  const walk = (dirRel, depth) => {
    if (depth > COLLAPSE_MAX_DEPTH) return false;
    let entries;
    // NARROW: absent is the normal race (the folder went away between the status call and now).
    // Anything else is NAMED, because "accounted for" is the answer that SUPPRESSES a finding.
    try { entries = readdirSync(join(main, dirRel), { withFileTypes: true }); }
    catch (e) { if (missing(e)) return false; return fail('E_UNREADABLE', `${dirRel}: ${e.message} — refusing to read that as "accounted for", which would hide uncommitted work.`); }
    if (!entries.length) return false;
    for (const e of entries) {
      if (e.isDirectory()) { if (!walk(`${dirRel}/${e.name}`, depth + 1)) return false; continue; }
      if (!(e.name === 'state.md' && FEATURE_FOLDER_RE.test(dirRel))) return false;
    }
    return true;
  };
  return walk(rel, 0);
}

// Everything the machine can KNOW about a feature, from files on disk and refs in git. No network,
// no declarations, nothing a human has to maintain. This is the whole basis of the derived status,
// and that is the point: a status derived from evidence cannot drift from the evidence.
//
// The two conventions, deliberately dumb and stated in CONDUCTOR.md so they are predictable:
//   branch   — any local or origin branch whose LAST '/'-segment is the feature name (so
//              'feat/checkout-flow', 'checkout-flow' and 'simon/checkout-flow' all match)
//   worktree — any linked worktree whose DIRECTORY NAME is the feature name
export function featureFacts(main, name, ctx) {
  const folder = join(main, WORK_REL, name);
  const rel = `${WORK_REL}/${name}`;
  const has = (f) => existsSync(join(folder, f));
  const docs = DOCS.filter(has);
  const extra = EXTRA_DOCS.filter(has);
  const leaf = (b) => b.slice(b.lastIndexOf('/') + 1);

  const branches = [];
  for (const b of ctx.locals) if (leaf(b.name) === name) branches.push({ name: b.name, sha: b.sha, where: 'local' });
  for (const b of ctx.remotes) {
    if (leaf(b.name) !== name) continue;
    const hit = branches.find((x) => x.name === b.name);
    if (hit) { hit.where = hit.sha === b.sha ? 'local+origin' : 'local+origin (tips differ)'; hit.originSha = b.sha; }
    else branches.push({ name: b.name, sha: b.sha, where: 'origin only', originSha: b.sha });
  }
  const worktrees = ctx.worktrees.filter((w) => w.name === name);

  // The derived rung, bottom-up. `development` outranks the documents because work having STARTED is
  // a louder fact than which documents exist; `complete` is not reachable from here by design.
  let derived = 'new';
  if (docs.includes('solution.md')) derived = 'accepted';
  if (docs.includes('tech-design.md')) derived = 'refined';
  if (branches.length || worktrees.length) derived = 'development';

  const statePath = join(folder, 'state.md');
  return {
    name, folder: posix(folder), rel, docs, extra, branches, worktrees, derived,
    hasProblem: docs.includes('problem.md'),
    statePath, hasState: existsSync(statePath),
  };
}

// The context every feature is measured against, gathered ONCE per run. Flat cost: N features cost
// the same number of git invocations as one.
export function scanContext(main) {
  const cos = checkouts();
  return {
    main,
    locals: localBranches(),
    remotes: remoteTrackingBranches(),
    worktrees: cos.all.slice(1).map((c) => ({ path: c.path, name: c.name, label: c.label, layout: c.layout })),
    def: defaultBranch(),
    cos,
  };
}

// ---------------------------------------------------------------------------- did it ship?

// THE LEDGER IS DERIVED FROM WHAT EXISTS, AND MERGING DESTROYS THE EVIDENCE IT DERIVES FROM.
// `development` is derived from a branch or a worktree existing. Merge the branch, delete it, remove
// the worktree, and both are gone — so the row falls back to `refined` and READS AS NOT BUILT. A
// branch that merged and was deleted is INDISTINGUISHABLE from one that never existed.
//
// The never-demote rule does not save this, and that is the whole shape of the finding: never-demote
// HOLDS a row that is already at `development`, and a repo that adopts lite AFTER its features merged
// has nothing to hold — its first-ever derivation is already wrong. The guard protects against
// regression, not against being born wrong. The field cost was three shipped features written up as
// needing builders, in the HAND-WRITTEN region of their state.md, where nothing will ever re-derive it.
//
// So what follows is A QUESTION WITH ITS EVIDENCE ATTACHED and nothing else. It adds no rung, moves no
// row, writes into no human region. `complete` stays the one rung a machine never assigns.
//
// NO NETWORK. Every source is a ref, a log or a reflog this clone ALREADY HOLDS, so the reading is as
// of the LAST FETCH and every caller says so.
const SHIP_LOG_MAX = 400;
const SHIP_REFLOG_MAX = 300;

const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The feature name as a WHOLE token. The boundary characters are exactly the ones a name may not
// contain, so 'css' never matches inside 'dead-css' — a substring match here would ask the question
// about the wrong feature, and a question asked wrongly is one people stop reading.
export const mentionsName = (text, name) =>
  new RegExp(`(?:^|[^A-Za-z0-9._-])${escRe(name)}(?:[^A-Za-z0-9._-]|$)`).test(String(text));

// A subject that is a merge or a squash-merge landing. Merge commits list NO paths under
// `--name-only`, so they cannot be tested by "did it touch product code" and are recognised by shape
// instead — which is also the exact shape the field's evidence took ('Merge pull request #N from o/x').
const prShaped = (s) => /^Merge\s+(pull request|branch|remote-tracking branch)\b/i.test(String(s).trim())
  || /\(#\d+\)\s*$/.test(String(s).trim());

// Gathered ONCE per run, and only if some feature is actually eligible to be asked about: four local
// git calls for the whole repo, whatever the feature count. Flat cost, same discipline as scanContext.
export function shipContext(def) {
  const empty = { ok: false, why: '', target: '', subjects: [], productShas: new Set(), refs: [], reflog: [], merged: new Map() };
  if (!def) return { ...empty, why: "this clone has no origin/HEAD, so the default branch is unknown — run 'git remote set-head origin -a'" };
  const target = gitq(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${def}^{commit}`], REPO);
  if (!target) return { ...empty, why: `this clone has no 'origin/${def}' — run 'git fetch origin'` };

  // A: subjects on the default branch as this clone last saw it. Everything listed is an ancestor of
  // it BY CONSTRUCTION, so no per-commit containment call is needed for this source.
  const subjects = [];
  for (const line of gitq(['log', `refs/remotes/origin/${def}`, `--max-count=${SHIP_LOG_MAX}`, '--format=%H%x1f%cI%x1f%s'], REPO).split('\n')) {
    if (!line) continue;
    const [sha, at, ...rest] = line.split('\x1f');
    if (sha) subjects.push({ sha, at: at || '', subject: rest.join('\x1f') });
  }
  // B: which of those commits touched anything OUTSIDE `.conducted/`. This is the discriminator that
  // keeps the question honest: the commit that CREATED a feature folder also mentions its name, and
  // asking "did it ship?" about a folder that was merely written up is the false positive that would
  // make this check noise. Shipping means code landed somewhere other than the ledger.
  const productShas = new Set(gitq(['log', `refs/remotes/origin/${def}`, `--max-count=${SHIP_LOG_MAX}`, '--format=%H', '--', '.', `:!${CONDUCTED}`], REPO).split('\n').filter(Boolean));
  // C: every OTHER ref in this clone — tags, other remotes. refs/heads and refs/remotes/origin are
  // already the branch derivation's business and are excluded so nothing is counted twice.
  const refs = [];
  for (const line of gitq(['for-each-ref', '--format=%(refname)%x1f%(objectname)', 'refs/'], REPO).split('\n')) {
    if (!line) continue;
    const [refname, sha] = line.split('\x1f');
    if (!refname || !sha) continue;
    if (refname.startsWith('refs/heads/') || refname.startsWith('refs/remotes/origin/')) continue;
    refs.push({ refname, sha });
  }
  // D: what this clone REMEMBERS. A deleted branch takes its own reflog with it, but HEAD's reflog
  // keeps 'checkout: moving from <branch> to <branch>' long after the branch is gone.
  const reflog = [];
  for (const line of gitq(['reflog', 'show', `--max-count=${SHIP_REFLOG_MAX}`, '--format=%H%x1f%gs', 'HEAD'], REPO).split('\n')) {
    if (!line) continue;
    const [sha, ...rest] = line.split('\x1f');
    if (sha) reflog.push({ sha, msg: rest.join('\x1f') });
  }
  return { ok: true, why: '', target, subjects, productShas, refs, reflog, merged: new Map() };
}

// Containment, memoised by sha across every feature — the same three states as everywhere else, so
// "cannot verify" is never printed as "not merged".
function containedIn(sha, def, sc) {
  if (!sc.merged.has(sha)) sc.merged.set(sha, mergedIntoDefault(sha, def));
  return sc.merged.get(sha);
}

// The evidence, strongest first. An EMPTY list is the answer "nothing here says it shipped", and the
// caller says nothing at all — silence is the right output for a feature that simply has not started.
export function shipEvidence(f, def, sc, ctx) {
  const out = [];
  if (!sc.ok) return out;

  for (const c of sc.subjects) {
    if (!mentionsName(c.subject, f.name)) continue;
    const isPr = prShaped(c.subject);
    if (!isPr && !sc.productShas.has(c.sha)) continue;   // ledger-only bookkeeping is not shipping
    out.push(`commit \`${c.sha.slice(0, 8)}\` "${c.subject.slice(0, 120)}" names it and is contained in \`origin/${def}\`` +
      `${c.at ? ` (dated ${c.at})` : ''} — ${isPr ? 'a merge/squash-merge subject' : 'and that commit touched files outside ' + CONDUCTED + '/'}`);
    break;                                               // the most recent one is the evidence
  }

  for (const r of sc.refs) {
    const leaf = r.refname.slice(r.refname.lastIndexOf('/') + 1);
    if (leaf !== f.name) continue;
    const m = containedIn(r.sha, def, sc);
    if (m.state !== 'merged') continue;
    out.push(`ref \`${r.refname}\` @ \`${r.sha.slice(0, 8)}\` still exists and is contained in \`origin/${def}\``);
    break;
  }

  for (const e of sc.reflog) {
    if (!mentionsName(e.msg, f.name)) continue;
    const m = containedIn(e.sha, def, sc);
    if (m.state !== 'merged') continue;
    out.push(`this clone's reflog remembers "${e.msg.slice(0, 100)}" at \`${e.sha.slice(0, 8)}\`, which is contained in \`origin/${def}\``);
    break;
  }

  for (const b of (f.prev ? f.prev.claimed.branches : [])) {
    if (ctx.locals.some((x) => x.name === b) || ctx.remotes.some((x) => x.name === b)) continue;
    out.push(`${f.rel}/state.md's facts block records branch \`${b}\`${f.prev.claimed.at ? ` (as of ${f.prev.claimed.at})` : ''}, and no branch by that name exists here or on origin now — merged and deleted, or deleted unmerged; nothing local can tell those two apart`);
    break;
  }
  return out;
}

// ---------------------------------------------------------------------------- configs that glob the tree

// GITIGNORED HIDES A WORKTREE FROM GIT AND FROM NOTHING ELSE. The convention puts worktrees at
// `worktrees/<feature>/` INSIDE the repo, and most test runners, linters, typecheckers and coverage
// tools walk the filesystem BY GLOB rather than by git — so every one of them sees a second and third
// copy of the whole source tree. The field ran 174 test files instead of 58 and reported "889 tests
// green on main" into a roadmap and a showcase the owner read before ruling a merge: a green result on
// `main` that was partly exercising code which was not on `main`. It cuts the other way too, and that
// way is worse in normal use — a builder mid-edit can turn the main checkout's suite red for a reason
// unrelated to the branch under test, which with a parallel fleet is constant.
//
// SO THIS REPORTS AND NEVER EDITS. A build config is the maintainer's, and a machine that quietly
// rewrote one would be doing exactly what this whole system refuses to do.
//
// WHAT IT CANNOT SEE, said here rather than implied away: it is a TEXT SEARCH for the string
// `worktrees` in each config, because a vite/jest/eslint config is a PROGRAM and evaluating it is not
// something a fact-check may do. A config that mentions worktrees in a comment reads as covered; one
// that excludes them by computing the string does not. It only looks at TRACKED files, so a config
// nobody committed is invisible to it. And it knows only the tools named below.
const GLOBBING_CONFIGS = [
  { re: /^vite\.config\.[cm]?[jt]s$/, what: 'vite — its `test.include` default walks the whole tree' },
  { re: /^vitest\.config\.[cm]?[jt]s$/, what: 'vitest — `test.exclude`' },
  { re: /^vitest\.workspace\.[cm]?[jt]sx?$/, what: 'vitest workspaces — every glob in it' },
  { re: /^jest\.config\.([cm]?[jt]s|json)$/, what: 'jest — `testPathIgnorePatterns` / `roots`' },
  { re: /^tsconfig(\.[A-Za-z0-9._-]+)?\.json$/, what: 'typescript — `include` / `exclude`' },
  { re: /^\.eslintrc(\.[A-Za-z0-9]+)?$/, what: 'eslint — `ignorePatterns`' },
  { re: /^eslint\.config\.[cm]?[jt]s$/, what: 'eslint flat config — `ignores`' },
  { re: /^\.c8rc(\.[A-Za-z0-9]+)?$/, what: 'c8 coverage — `exclude`' },
  { re: /^\.nycrc(\.[A-Za-z0-9]+)?$/, what: 'nyc coverage — `exclude`' },
  { re: /^nyc\.config\.[cm]?[jt]s$/, what: 'nyc coverage — `exclude`' },
];
// package.json only counts when it CARRIES one of these config blocks: flagging every package.json in
// the repo for not containing the word 'worktrees' is the kind of finding people learn to skip.
const PKG_CONFIG_KEYS = ['jest', 'nyc', 'c8', 'vitest', 'ava', 'mocha'];

const isJsonish = (base) => base.endsWith('.json') || /^\.(eslintrc|c8rc|nycrc)$/.test(base);

// JSON with comments and trailing commas — tsconfig.json's real dialect. Strings are scanned properly
// so a '//' inside "https://…" is not mistaken for a comment; anything this cannot make sense of is
// reported as unparseable rather than guessed at.
export function stripJsonc(text) {
  let out = '';
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      let j = i + 1;
      while (j < s.length) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === '"') break; j++; }
      out += s.slice(i, Math.min(j + 1, s.length)); i = j; continue;
    }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = e === -1 ? s.length : e + 1; out += ' '; continue; }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

// The pathspecs the one `git ls-files` is narrowed by. A bare `git ls-files` would hand back every
// tracked path in the repo — hundreds of thousands of them in a big estate, past the child process's
// output buffer, which would make this scan silently return nothing on exactly the repos that most
// need it. Git's pathspec `*` crosses directory separators, so each of these matches at any depth and
// a monorepo's package configs are found the same way the root's are.
const GLOB_CONFIG_PATHSPECS = [
  '*vite.config.*', '*vitest.config.*', '*vitest.workspace.*', '*jest.config.*',
  '*tsconfig*.json', '*.eslintrc*', '*eslint.config.*', '*.c8rc*', '*.nycrc*', '*nyc.config.*',
  '*package.json',
];

// ONE `git ls-files`, narrowed. Returns three lists and never a verdict.
export function worktreeGlobScan(main) {
  const res = { checked: [], covered: [], missing: [], unreadable: [] };
  const files = gitq(['ls-files', '--', ...GLOB_CONFIG_PATHSPECS], main).split('\n').map(posix).filter(Boolean);
  for (const rel of files) {
    if (rel.startsWith('worktrees/')) continue;             // a config INSIDE a worktree is that checkout's copy
    const base = rel.slice(rel.lastIndexOf('/') + 1);
    let what = (GLOBBING_CONFIGS.find((g) => g.re.test(base)) || {}).what || '';
    const isPkg = base === 'package.json';
    if (!what && !isPkg) continue;

    let text = null;
    // NARROW: absent is normal (ls-files lists what the index holds, which a working tree may not
    // have). Anything else is NAMED — a config this scan could not read is a config it must not
    // report as fine.
    try { text = readFileSync(join(main, rel), 'utf8'); }
    catch (e) { if (missing(e)) continue; res.unreadable.push({ rel, why: `could not be read (${e.message}) — this scan cannot tell whether it excludes worktrees` }); continue; }

    let parsed = null, badJson = '';
    if (isJsonish(base)) {
      try { parsed = JSON.parse(stripJsonc(text)); }
      catch (e) { onlyBadJson(e); badJson = String(e.message).split('\n')[0]; }
    }
    if (isPkg) {
      if (!parsed || typeof parsed !== 'object') continue;   // a package.json that is not JSON is not this check's news
      const keys = PKG_CONFIG_KEYS.filter((k) => parsed[k] && typeof parsed[k] === 'object');
      if (!keys.length) continue;
      what = `package.json carries ${keys.map((k) => '`' + k + '`').join(', ')} config`;
    }
    res.checked.push(rel);
    if (badJson) { res.unreadable.push({ rel, why: `is not parseable JSON (${badJson}), so this scan will not guess whether it excludes worktrees — read it yourself`, what }); continue; }
    if (text.includes('worktrees')) { res.covered.push(rel); continue; }
    res.missing.push({ rel, what });
  }
  return res;
}

// ---------------------------------------------------------------------------- state.md

export const STATE_HUMAN_SCAFFOLD = `

## Decisions

<!-- What was decided and WHY, with the evidence that would reopen it. Rewrite in place, dated. -->

## Issues

<!-- What is wrong or unresolved right now. Delete an issue when it is gone, never strike it out. -->

## Acceptance criteria

<!-- Binary lines. Only a human ticks these: no script in this repo will ever tick one for you. -->
`;

export const stateHead = (name) => `# ${name} — feature state

<!-- Two regions. The facts block below is MACHINE-WRITTEN and REWRITTEN on every \`session-end\`
     run: branch, PR, worktree, folder, documents, and the session log. Everything under it is
     yours — decisions, issues, acceptance criteria — and no script touches it. -->

`;

// A WELL-FORMED, EMPTY state.md — the whole file, markers and all. It lives here beside `stateHead`
// and `STATE_HUMAN_SCAFFOLD` because those two ARE the shape session-end owns, and a generator that
// minted the shape somewhere else would be a second copy of it waiting to drift out of step with the
// script that rewrites it. Every fact in the block is a fact about a folder that was just created, so
// it asserts nothing: the first `session-end` run that touches this feature rewrites the block from
// git and the filesystem.
export function newFeatureState(name, at) {
  const carrier = { at, status: 'new', branches: [], worktrees: [], pr: '' };
  const sessions = [{ at, id: 'scaffold', note: `folder and state.md created by ${END_REL} --new-feature` }];
  const body = [
    '',
    '<!-- MACHINE-WRITTEN. REWRITTEN IN PLACE on every session-end run that touches this feature —',
    '     never appended to. Everything OUTSIDE the two markers is yours; the script never touches,',
    '     reorders or rewrites it, never reads it as an instruction, and NEVER ticks an acceptance',
    '     criterion. Do not hand-edit inside the markers: the next run overwrites it. -->',
    '',
    `**Scaffolded ${at}** by \`node ${END_REL} --new-feature ${name}\`. NOTHING IS VERIFIED HERE YET:`,
    'the folder exists and that is the only fact in this block. The first session-end run that touches',
    'this feature replaces every line of it with what git and the filesystem actually show.',
    '',
    `- feature: \`${name}\``,
    `- folder: \`${WORK_REL}/${name}/\``,
    `- documents: (none yet — legal; see the altitude law in ${CONDUCTOR_REL})`,
    '- derived status: `new` — the folder exists and nothing else does yet',
    '- branches: none matching this feature name',
    '- worktrees: none',
    '- PR: none declared (to declare one, put `PR: #<n>` or the pull-request URL on a LINE OF ITS OWN below the markers — a mention inside a sentence is not a declaration)',
    '- session log (most recent, bounded):',
    ...sessions.map((s) => `  - \`${s.at}\` session \`${s.id}\` — ${s.note}`),
    `<!-- conducted-lite:state ${b64(JSON.stringify(carrier))} -->`,
    `<!-- conducted-lite:sessions ${b64(JSON.stringify(sessions))} -->`,
    '',
  ].join('\n');
  return stateHead(name) + FACTS_START + body + FACTS_END + STATE_HUMAN_SCAFFOLD;
}

// Read back what the PREVIOUS run recorded into a facts block. These are the CLAIMS the SessionStart
// fact-check tests against reality: the file says a branch/worktree/PR existed, so go and look.
export function readFactsCarrier(body) {
  const m = String(body).match(/conducted-lite:state ([A-Za-z0-9+/=]*)/);
  let rec = {};
  // NARROW: a corrupt carrier is a SyntaxError and nothing else. A wider catch here would turn a
  // mistake in this function into "the file claimed nothing", and a claim that is silently empty is
  // never fact-checked against reality — the fact-check would pass by having nothing to test.
  if (m) { try { rec = JSON.parse(unb64(m[1])) || {}; } catch (e) { onlyBadJson(e); rec = {}; } }
  const j = String(body).match(/conducted-lite:judgment sha=([0-9a-f]+) at=([0-9T:.\-Z]+)/);
  const s = String(body).match(/conducted-lite:sessions ([A-Za-z0-9+/=]*)/);
  let sessions = [];
  if (s) { try { const a = JSON.parse(unb64(s[1])); if (Array.isArray(a)) sessions = a; } catch (e) { onlyBadJson(e); sessions = []; } }
  return {
    claimed: {
      branches: Array.isArray(rec.branches) ? rec.branches : [],
      worktrees: Array.isArray(rec.worktrees) ? rec.worktrees : [],
      pr: typeof rec.pr === 'string' ? rec.pr : '',
      status: typeof rec.status === 'string' ? rec.status : '',
      at: typeof rec.at === 'string' ? rec.at : '',
    },
    judgmentSha: j ? j[1] : null,
    judgmentAt: j ? j[2] : null,
    sessions,
  };
}

// The PR is the one fact a human must DECLARE, because nothing in git knows about it. THAT MAKES
// THIS THE ONE PLACE THE HUMAN REGION IS INPUT TO SOMETHING THE MACHINE WRITES, so the form is exact
// rather than generous — the opposite register from the worktree check, and deliberately so.
//
// It used to be a loose scan (`/\bPR[:\s]*#?(\d+)/i`) and the field proved what that costs. One
// honest sentence — "The repo adopted conducted-lite from PR #40 head" — was written into four
// features' state.md, and on the next run all four facts blocks asserted `PR: #40`: four features
// with no branch, no worktree and no pull request anywhere, asserting one in the region whose entire
// promise is that every line is a command's output or a file that exists. Then session-start spent a
// real `gh` API call chasing it. Nothing structural broke: the byte-splice guarantee held, and the
// parser went AROUND it, because its input is prose and its output is written into the facts.
//
// So: DECLARING A PR IS A DELIBERATE ACT, never a side effect of writing a sentence. The line is
// anchored at BOTH ends, the colon is MANDATORY, and nothing else may sit on the line — a leading
// markdown bullet aside, because a list is how people write and `- PR: #40` is still a whole line
// that says one thing. `PR 40`, `pr40`, and any mid-sentence mention declare NOTHING. The URL branch
// is anchored the same way for one form, not two.
//
// And the declaration is QUOTED back by every caller that prints it, the way check 1 names the
// source of every allowance: a quoted source makes a false declaration obvious on sight, which is
// the thing that makes machine-written output trustworthy.
//
// (matchAll does not mutate the regex it is given — it clones with the source lastIndex, which is
// never advanced here — so this shared /g literal is safe to keep at module scope.)
const PR_LINE_RE = /^[ \t]*(?:[-*+][ \t]+)?PR:[ \t]*(#?\d+|https?:\/\/\S+)[ \t]*$/gim;

// The declaration itself: { number, line } for the first legal line, or null. ONE parser, so the
// number written into the facts block and the source quoted beside it can never disagree.
export function prDeclaration(humanText) {
  for (const m of String(humanText).matchAll(PR_LINE_RE)) {
    const v = m[1];
    if (/^#?\d+$/.test(v)) return { number: v.replace(/^#/, ''), line: m[0].trim() };
    const u = v.match(/\/pull\/(\d+)/);   // a URL declares only if it names a pull request
    if (u) return { number: u[1], line: m[0].trim() };
  }
  return null;
}

export function declaredPR(humanText) {
  const d = prDeclaration(humanText);
  return d ? d.number : '';
}

// ---------------------------------------------------------------------------- the roadmap ledger

// (ROW_RE, `parseLedger` and `declaredStatuses` — reading the ledger — are in lite-rules.mjs and
// re-exported above. Rendering it stays here: only this side writes.)

const trimBlanks = (lines) => {
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
};

// Render the ledger. Human lines first, verbatim and in their original order; generated rows after.
// Leading/trailing blank lines per section are normalised so two runs produce identical bytes, and
// no NON-BLANK human line is ever altered, reordered or dropped.
export function renderLedger({ preamble, sections }) {
  const out = [''];
  const pre = trimBlanks(preamble);
  if (pre.length) out.push(...pre);
  out.push('');
  for (const s of STATUSES) {
    const sec = sections.get(s);
    out.push(`## ${s}`, '');
    const human = trimBlanks(sec.human);
    if (human.length) out.push(...human, '');
    if (sec.rows.length) out.push(...sec.rows.map((r) => r.line), '');
  }
  return out.join('\n');
}

export function rowLine(f, status) {
  const bits = [];
  bits.push(f.docs.length || f.extra.length ? [...f.docs, ...f.extra].join(', ') : 'no documents yet');
  for (const b of f.branches) bits.push(`branch \`${b.name}\` (${b.where})`);
  for (const w of f.worktrees) bits.push(`worktree \`${w.label}\``);
  return `- [${f.name}](work/${f.name}/) — ${bits.join(' · ')}`;
}

// Every archived feature name, read out of archive.md. A feature named here is NOT regenerated into
// the roadmap: the archive is the tombstone, and without that rule the sweep would resurrect
// everything it swept on the very next run. To bring one back, delete its archive row by hand.
export function archivedNames(main) {
  const path = join(main, ARCHIVE_REL);
  if (!existsSync(path)) return new Set();
  let text = '';
  // NARROW: existsSync already said the file is there, so a read failure now is real. An empty set
  // here means "nothing is archived", which RESURRECTS every archived feature into the roadmap — far
  // too consequential to infer from a swallowed error.
  try { text = readFileSync(path, 'utf8'); } catch (e) { if (missing(e)) return new Set(); return fail('E_UNREADABLE', `${posix(path)}: ${e.message} — refusing to read that as "nothing is archived", which would regenerate every archived feature back onto the roadmap.`); }
  const out = new Set();
  for (const line of text.split(/\r?\n/)) { const m = line.match(ROW_RE); if (m) out.add(m[1]); }
  return out;
}

export const ROADMAP_HEAD = `# Roadmap — forward-looking. The headings ARE the status.

<!-- The block below is the LEDGER. Two kinds of line live in it:
       generated rows  '- [name](work/name/) ...'  — written by the SessionStart fact-check from
                       what exists on disk and in git. Do not hand-edit one; the next run rewrites it.
       everything else — yours, preserved byte-for-byte under the heading you wrote it beneath.
                       An 'idea' is exactly this: a hand-written line and no folder.
     You change an item's status by making it true, not by editing this file. The ONE exception is
     '## complete': moving a row there is a human judgement, and it is the only rung a machine will
     never assign. The next SessionStart sweeps it into archive.md. -->

`;

export const ARCHIVE_HEAD = `# Archive — what left the roadmap, so the roadmap stays forward-looking

<!-- Swept mechanically at session start, ONLY from '## complete' in roadmap.md, so the human's move
     is always the trigger. This file is the one place the machinery appends rather than rewrites:
     it is a log by definition, and it is what keeps roadmap.md bounded. A feature named here is
     never regenerated into the roadmap — delete its row by hand to bring it back. -->

`;

// ---------------------------------------------------------------------------- printing

export function quoted(outputs) {
  const lines = [];
  for (const o of outputs) {
    lines.push(`      $ ${o.where}`);
    // trimEnd only — porcelain's leading column is significant, and quoted output must be the
    // command's output, not a tidied version of it.
    const text = (o.text || '').replace(/\s+$/, '');
    if (!text.trim()) lines.push('      (empty)');
    else for (const l of text.split('\n')) lines.push(`      ${l}`);
  }
  return lines;
}

export { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, join };
