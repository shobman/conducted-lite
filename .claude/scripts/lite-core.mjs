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
//   human region. See writeAtomic(), which now lives in lite-derive.mjs and is re-exported here.
//
//   FRESHNESS IS A CONTENT HASH, NEVER AN MTIME — these scripts write the files they check, so an
//   mtime check would verify their own writing and nothing else.
//
// Every failure exits nonzero with a NAMED error (E_*) on stderr — never a silent half-write.
//
// THREE LAYERS NOW, AND THE SPLIT IS BY WHAT A CALLER CAN AFFORD, NOT BY TOPIC:
//
//   lite-rules.mjs    NO I/O AT ALL. Constants, regexes, pure functions. One parse to import.
//   lite-derive.mjs   FILESYSTEM ONLY. No child processes, no module-level work, and NEVER
//                     process.exit — its failure face is a THROW, and lite-core replaces it with
//                     `fail` below via `setFail`, so every script keeps the exit-nonzero behaviour it
//                     has always had.
//   lite-core.mjs     THIS FILE: git, `fail()`, and a MODULE SCOPE THAT SPAWNS GIT (see REPO).
//
// The per-turn Stop hook can afford neither `fail()` nor a git process at import, and it must not
// mint its own copy of a rule this file also holds — two copies of the in-flight derivation, of the
// placement ratchet, or of the facts-block shape is how the hook and the scripts end up rewriting
// each other's output all session. Anything both sides must agree on belongs in lite-rules (if it
// touches nothing) or lite-derive (if it touches the disk), never here.
//
// EVERYTHING MOVED IS RE-EXPORTED FROM HERE UNDER ITS ORIGINAL NAME. No importer of this file
// changed when the derivations moved down.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  posix, globToRe, featureNameOf, worktreeLayout, parseLedger, declaredStatuses,
  inFlightState, isInFlight, IN_FLIGHT_STATUS, NAME_RE, ROW_RE, STATUSES, rung,
  CONDUCTED, WORK_REL, ROADMAP_REL, ARCHIVE_REL, CONDUCTOR_REL, LAST_REL, ALLOW_REL, END_REL, START_REL,
  FACTS_START, FACTS_END, LEDGER_START, LEDGER_END, ARCHIVE_START, ARCHIVE_END,
} from './lite-rules.mjs';
import {
  setFail, missing, onlyBadJson, b64, unb64, sanitize, judgmentHash,
  readSplit, writeAtomic, writeSplit, rescaffoldSplit, noMarkers,
  DOCS, EXTRA_DOCS, listFeatures, collapsedMachineDir, featureFacts,
  renderLedger, rowLine, placeFeatureRows, archivedNames, declaredLabel, ROADMAP_HEAD, ARCHIVE_HEAD,
  readFactsCarrier, readProvenance, prDeclaration, declaredPR, toBinary, bytesOf,
  STATE_HUMAN_SCAFFOLD, stateHead, newFeatureState, renderFactsBody, FACTS_CLAIM_VERIFIED,
  SESSION_LOG_KEEP,
} from './lite-derive.mjs';

export {
  posix, globToRe, featureNameOf, worktreeLayout, parseLedger, declaredStatuses,
  inFlightState, isInFlight, IN_FLIGHT_STATUS, NAME_RE, ROW_RE, STATUSES, rung,
  CONDUCTED, WORK_REL, ROADMAP_REL, ARCHIVE_REL, CONDUCTOR_REL, LAST_REL, ALLOW_REL, END_REL, START_REL,
  FACTS_START, FACTS_END, LEDGER_START, LEDGER_END, ARCHIVE_START, ARCHIVE_END,
};

export {
  missing, onlyBadJson, b64, unb64, sanitize, judgmentHash,
  readSplit, writeAtomic, writeSplit, rescaffoldSplit, noMarkers,
  DOCS, EXTRA_DOCS, listFeatures, collapsedMachineDir, featureFacts,
  renderLedger, rowLine, placeFeatureRows, archivedNames, declaredLabel, ROADMAP_HEAD, ARCHIVE_HEAD,
  readFactsCarrier, readProvenance, prDeclaration, declaredPR, toBinary, bytesOf,
  STATE_HUMAN_SCAFFOLD, stateHead, newFeatureState, renderFactsBody, FACTS_CLAIM_VERIFIED,
  SESSION_LOG_KEEP,
};

// ---------------------------------------------------------------------------- errors + shelling

export function fail(code, msg) {
  process.stderr.write(`${code}: ${msg}\n`);
  process.exit(1);
}

// THE ONE LINE THAT MAKES THE SPLIT SAFE. lite-derive's failure face defaults to a THROW so a
// per-turn hook can catch it and answer with silence; a SCRIPT must keep exiting nonzero with a named
// E_* on stderr, which is what every --help and every field report already promises. Wiring it here,
// at import, means no derivation function has to know which caller it is serving.
setFail(fail);

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

// (The path constants, the marker pairs and THE LADDER moved to lite-rules.mjs; the filesystem
// derivations and the renderers moved to lite-derive.mjs. Both are re-exported above: a hook that has
// to find the same markers in the same files, and now to WRITE the same bytes into them, must read
// them from one place. What stays below is session-end's own policy — numbers nothing else needs to
// agree with.)

// One sitting, generously bounded — long enough for a real session, short enough that yesterday's
// note cannot stand in for today's thinking. Same number the M1 engine used for its handoff check.
export const WINDOW_H = 12;
export const WINDOW_MS = WINDOW_H * 60 * 60 * 1000;

// (There was an ABANDON_FRESH window here, and it is deliberately gone. It existed so a Stop hook
// could decide whether an `--abandon` record was recent enough to RELEASE a block. Nothing blocks
// any more, so nothing needs releasing, and a constant that no longer governs anything is a comment
// pretending to be machinery. `--abandon` still writes its record; the record is now the whole point
// of it rather than the price of getting past a gate.)

// ---------------------------------------------------------------------------- small helpers

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

// (NAME_RE — what a feature may be called — is in lite-rules.mjs; `listFeatures`, `featureFacts` and
// `collapsedMachineDir` are in lite-derive.mjs. All are re-exported above. `featureFacts` spawns
// nothing: everything git-shaped reaches it through the `ctx` built below, which is what lets the
// per-turn hook derive the same facts from one `for-each-ref` it was already paying for.)

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
