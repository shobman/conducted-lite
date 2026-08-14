#!/usr/bin/env node
// The corpus for the HUMAN-REGION NAG of .claude/hooks/stop-glance.mjs — the line that says a feature
// moved this turn while its Decisions/Issues did not. Zero dependencies, no package.json:
//
//     node .claude/tests/glance-nag.test.mjs            # from anywhere; paths resolve off this file
//     node .claude/tests/glance-nag.test.mjs --verbose  # print the hook's full emission per case
//     node .claude/tests/glance-nag.test.mjs N4         # run only cases whose id contains N4
//
// WHAT IT IS ABOUT. The nag fires once per feature and had no ceiling and no notion of a finished
// feature. bookjob's turn of 2026-08-14 emitted TWELVE of them in one block, every one true and every
// one useless: all twelve were complete features whose roadmap rows had just been swept, so the thing
// the line asks for — a decision recorded against the move — could not exist for any of them. Twelve
// lines is not a fact a conductor reads, it is wallpaper, which is the failure this hook's own header
// names by name.
//
// THE GLANCE IS DRIVEN AS A BLACK BOX, exactly as glance-behind.test.mjs drives it: spawned with
// `node`, handed a real Stop payload on stdin, judged on what it prints. Nothing here imports it and
// nothing reaches inside it. The nag is a sentence a conductor reads at the end of a turn, so the
// emission is the only honest place to judge it.
//
// WHAT IT IS DRIVEN AGAINST: a REAL git repo per case, built under a fresh mkdtemp root, with real
// feature folders whose first state.md came out of `session-end.mjs --new-feature`. There is NO
// origin and no network of any kind — the nag reads the snapshot in `.git/` and the facts blocks on
// disk, and nothing here needs a remote.
//   A NAG NEEDS TWO TURNS BY CONSTRUCTION: the first glance has no baseline for a feature (nothing to
// have moved FROM) and records one; the second is the turn under test. Every case below therefore
// runs the glance at least twice, and the setup between the two runs is what the case is about.
//
// SET `GLANCE_UNDER_TEST` TO JUDGE A DIFFERENT HOOK FILE. That is how these cases were confirmed to
// FAIL before the change existed: `git show HEAD:.claude/hooks/stop-glance.mjs` written BESIDE the
// real hook (its rule imports resolve relative to itself, so it cannot be run from a tmpdir), and
// N1, N2, N4, N7 and N8 go red while N3, N5 and N6 stay green — the three that assert what must NOT
// change.
//
// EXIT CODE IS NON-ZERO WHILE ANY CASE FAILS. There are no known-failing groups here.
//
// WHAT COULD NOT BE TESTED THE ORDINARY WAY, stated rather than worked around:
//   · a DERIVED status of `complete` (N2). `featureFacts` cannot produce it — 'complete is not
//     reachable from here by design', because it is the one rung no machine may assign. So the
//     derived arm of the guard has no reachable path in this checkout, and the only way to exercise
//     it is to hand the hook a derive module that reports one. N2 does that at the module seam and
//     says so in its own comment; every other case drives the shipped modules.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const GLANCE = process.env.GLANCE_UNDER_TEST || join(REPO_ROOT, '.claude', 'hooks', 'stop-glance.mjs');
const SESSION_END = join(REPO_ROOT, '.claude', 'scripts', 'session-end.mjs');

// THE THRESHOLD THE HOOK USES, restated here as a number this corpus asserts against rather than
// imported: the corpus is a black box and reading the constant out of the file under test would make
// a change to it invisible. If the hook's NAG_BULK_MIN moves, N3 and N4 must be edited on purpose.
const BULK_MIN = 4;

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const FILTER = argv.filter((a) => !a.startsWith('--'))[0] || '';

if (!existsSync(GLANCE)) {
  console.error(`the glance is not where the corpus expects it: ${GLANCE}`);
  process.exit(2);
}

// A FRESH ROOT PER RUN, and the header prints it — the same rule glance-behind.test.mjs states at
// length: a fixed shared path under tmpdir is not reliably pre-cleanable on Windows (a handle held by
// a shell, a git process or antivirus makes the remove throw EPERM and takes cases down with it), and
// this corpus is meant to be runnable anywhere, twice in a row, concurrently with itself.
// A failing run leaves its tree exactly where the header says it is; a passing run takes it away.
const SANDBOX = mkdtempSync(join(tmpdir(), 'conducted-lite-nag-'));

// ------------------------------------------------------------------------------- building a repo
function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${(r.stderr || '').trim()}`);
  return r.stdout || '';
}

function stripEnv() {
  // CLAUDE_PROJECT_DIR is the hook's FIRST choice of root, and inheriting the maintainer's would
  // point every case at this checkout instead of at its fixture.
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  return env;
}

const LEDGER_START = '<!-- conducted-lite:ledger:start -->';
const LEDGER_END = '<!-- conducted-lite:ledger:end -->';

// A roadmap whose ledger declares the named features under the named rungs. `by` is
// { development: [...], complete: [...] } and anything omitted simply has no row, which is what a
// feature the ledger has not caught up with looks like.
//   THE ROWS ARE MINIMAL ON PURPOSE. `placeFeatureRows` regenerates the line body from the tree every
// turn; all the ledger has to carry between turns is WHICH HEADING a name sits under, and that is the
// only thing these cases ever move.
function writeRoadmap(main, by) {
  const sec = (s) => `## ${s}\n\n` + (by[s] || []).map((n) => `- [${n}](work/${n}/) — declared\n`).join('') + '\n';
  writeFileSync(join(main, '.conducted', 'roadmap.md'),
    `# roadmap\n\n${LEDGER_START}\n\n${sec('new')}${sec('development')}${sec('complete')}${LEDGER_END}\n`);
}

// A LITE REPO WITH N SCAFFOLDED FEATURES.
//
// The FIRST feature's state.md comes out of `session-end.mjs --new-feature`, which is the only way to
// get the real scaffold shape (the two markers, the human region, the "NOTHING IS VERIFIED HERE YET"
// block). The rest are that same text with the name substituted — the cases here need TWELVE feature
// folders in one repo and a session-end spawn each would make the corpus cost seconds per case for a
// file whose every byte between the markers the first glance rewrites anyway.
//   `ledger: 'none'` writes a roadmap with NO ledger markers, which is a real state (a repo whose
// roadmap has not been scaffolded) and the one N2 needs.
function buildRepo(name, features, opts = {}) {
  const root = join(SANDBOX, name);
  // The root is this run's own, so this is only ever tidying after a re-entry within one run. It must
  // not be able to throw: a remove that loses to a file handle is litter, never a verdict.
  try { rmSync(root, { recursive: true, force: true }); } catch { /* litter, not a failure */ }
  const main = join(root, 'main');
  mkdirSync(main, { recursive: true });

  git(main, ['init', '-q', '-b', 'main', '.']);
  git(main, ['config', 'user.email', 'corpus@example.invalid']);
  git(main, ['config', 'user.name', 'nag corpus']);
  // A hook or a template in the maintainer's global config must not run inside the fixture.
  git(main, ['config', 'commit.gpgsign', 'false']);

  mkdirSync(join(main, '.conducted', 'work'), { recursive: true });
  copyFileSync(join(REPO_ROOT, '.conducted', 'CONDUCTOR.md'), join(main, '.conducted', 'CONDUCTOR.md'));
  if (opts.ledger === 'none') writeFileSync(join(main, '.conducted', 'roadmap.md'), '# roadmap\n\nno ledger block here.\n');
  else writeRoadmap(main, {});
  git(main, ['add', '-A']);
  git(main, ['commit', '-qm', 'base']);

  const se = spawnSync(process.execPath, [SESSION_END, '--new-feature', features[0]],
    { cwd: main, encoding: 'utf8', env: stripEnv() });
  const seed = join(main, '.conducted', 'work', features[0], 'state.md');
  if (!existsSync(seed)) throw new Error(`the fixture's first feature was not scaffolded: ${(se.stderr || se.stdout || '').trim()}`);
  const template = readFileSync(seed, 'utf8');
  for (const n of features.slice(1)) {
    mkdirSync(join(main, '.conducted', 'work', n), { recursive: true });
    writeFileSync(join(main, '.conducted', 'work', n, 'state.md'), template.split(features[0]).join(n));
  }
  git(main, ['add', '-A']);
  git(main, ['commit', '-qm', 'scaffold features']);

  return { root, main, features };
}

// MOVE A FEATURE'S SIGNATURE WITHOUT TOUCHING ITS HUMAN REGION — which is exactly the state the nag
// exists for. A local branch whose last '/'-segment is the feature name is one of the six fields of
// `moveSig`, so each new one moves it again, and none of them goes near Decisions or Issues.
function bump(repo, name, tag) {
  git(repo.main, ['branch', `${tag}/${name}`]);
}

// THE SWEEP, as a conductor performs it: the roadmap row moves under '## complete'. Nothing else
// about the feature changes — no file in its folder is touched — and that is the whole of what
// bookjob's twelve nags were about.
function sweep(repo, names, rest = {}) {
  writeRoadmap(repo.main, { complete: names, ...rest });
}

// ------------------------------------------------------------------------------------ driving it
function glance(main, hook = GLANCE) {
  const payload = JSON.stringify({
    session_id: 'nag-corpus', transcript_path: '', cwd: main.replace(/\\/g, '/'),
    hook_event_name: 'Stop', stop_hook_active: false,
  });
  const r = spawnSync(process.execPath, [hook], { input: payload, cwd: main, env: stripEnv(), encoding: 'utf8' });
  const out = (r.stdout || '').trim();
  let text = '';
  if (out) {
    try { text = String(JSON.parse(out).hookSpecificOutput.additionalContext || ''); }
    catch { text = `(unparseable stdout) ${out}`; }
  }
  return { status: r.status, text, raw: out };
}

// Every line of an emission that is a nag, per-feature or bulk. Both shapes end their first clause
// the same way, and nothing else this hook prints contains the phrase.
const nagLines = (text) => text.split('\n').filter((l) => /moved this turn/.test(l));

// THE HOOK, RESOLVED BESIDE A DERIVE MODULE THAT REPORTS A DERIVED `complete`. Read the note at the
// top of the file: `featureFacts` cannot produce that status in this checkout, so the derived arm of
// the guard has no reachable path and the only place to inject one is the module seam the hook
// already has — it imports its two rule modules RELATIVE TO ITSELF, dynamically.
//   THE HOOK ITSELF IS COPIED BYTE FOR BYTE and the copy is compared against the original, so this
// case can never pass against code that is not the code under test. Both rule modules are re-export
// shims over the REAL files, so everything except the one wrapped function is the shipped behaviour.
function shadowGlance() {
  const dir = join(SANDBOX, 'shadow');
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'scripts'), { recursive: true });
  const hook = join(dir, '.claude', 'hooks', 'stop-glance.mjs');
  const bytes = readFileSync(GLANCE);
  writeFileSync(hook, bytes);
  if (!readFileSync(hook).equals(bytes)) throw new Error('the shadow hook is not a byte-for-byte copy of the hook under test');
  const realRules = JSON.stringify(pathToFileURL(join(REPO_ROOT, '.claude', 'scripts', 'lite-rules.mjs')).href);
  const realDerive = JSON.stringify(pathToFileURL(join(REPO_ROOT, '.claude', 'scripts', 'lite-derive.mjs')).href);
  writeFileSync(join(dir, '.claude', 'scripts', 'lite-rules.mjs'), `export * from ${realRules};\n`);
  writeFileSync(join(dir, '.claude', 'scripts', 'lite-derive.mjs'),
    `export * from ${realDerive};\n`
    + `import { featureFacts as real } from ${realDerive};\n`
    + 'export function featureFacts(main, name, ctx) {\n'
    + '  const f = real(main, name, ctx);\n'
    + '  if (/-derived-complete$/.test(name)) f.derived = "complete";\n'
    + '  return f;\n'
    + '}\n');
  return hook;
}

// ---------------------------------------------------------------------------------------- cases
// Every case returns a list of failures. An empty list is a pass. They are written as small scripts
// rather than as a data table because each one needs a repo in a DIFFERENT state, and hiding that
// setup behind a fixture name would hide the thing the case is actually about.
const cases = [];
const kase = (id, what, run) => cases.push({ id, what, run });
const need = (fails, cond, detail) => { if (!cond) fails.push(detail); };

kase('N1', 'a feature DECLARED complete is not nagged, on a turn a live one beside it is', () => {
  const fails = [];
  const repo = buildRepo('n1', ['alpha', 'beta']);
  glance(repo.main);                                   // the baseline turn: no history, so no nag
  // The sweep and an ordinary move, on ONE turn. `alpha`'s row goes to '## complete', which is a
  // change to its declared status and therefore a change to its move signature; `beta` gets a branch.
  // Both have moved and neither human region has been touched, so the old hook nagged about both.
  sweep(repo, ['alpha'], { development: ['beta'] });
  bump(repo, 'beta', 'work');
  const { status, text } = glance(repo.main);
  need(fails, status === 0, `exit ${status}, want 0 — a glance must never wedge a turn`);
  need(fails, /^beta moved this turn; its Decisions\/Issues did not\.$/m.test(text.replace(/^\s*·\s*/gm, '')),
    `the live feature was not nagged, so this turn is not the turn the case is about: ${text.replace(/\s+/g, ' ')}`);
  need(fails, !/alpha moved this turn/.test(text),
    `a feature declared complete was nagged: ${(nagLines(text).join(' | '))}`);
  return { fails, text };
});

kase('N2', 'a feature whose DERIVED status is complete is not nagged, with the roadmap saying nothing', () => {
  const fails = [];
  const hook = shadowGlance();
  // NO LEDGER MARKERS, deliberately: it is the one repo state in which a feature can read complete by
  // derivation while the roadmap declares nothing at all. With a ledger present the placement ratchet
  // would put a derived-complete feature under '## complete' and BOTH arms of the guard would be
  // true, so the case could not tell which one fired.
  const repo = buildRepo('n2', ['probe-derived-complete', 'ordinary'], { ledger: 'none' });
  glance(repo.main, hook);                             // baseline
  bump(repo, 'probe-derived-complete', 'work');
  bump(repo, 'ordinary', 'work');
  const { text } = glance(repo.main, hook);
  need(fails, /ordinary moved this turn/.test(text),
    `the control feature was not nagged, so this turn is not the turn the case is about: ${text.replace(/\s+/g, ' ')}`);
  need(fails, !/probe-derived-complete moved this turn/.test(text),
    `a feature whose derived status is complete was nagged: ${(nagLines(text).join(' | '))}`);
  need(fails, !/## complete/.test(readFileSync(join(repo.main, '.conducted', 'roadmap.md'), 'utf8')),
    'the fixture roadmap grew a complete heading, so the declared arm may be what silenced it');
  return { fails, text };
});

kase('N3', 'below the threshold every nagging feature is still named, in the existing wording', () => {
  const fails = [];
  const names = ['f01', 'f02', 'f03'].slice(0, BULK_MIN - 1);
  const repo = buildRepo('n3', names);
  glance(repo.main);                                   // baseline
  for (const n of names) bump(repo, n, 'work');
  const { text } = glance(repo.main);
  const lines = nagLines(text).map((l) => l.replace(/^\s*·\s*/, ''));
  for (const n of names) {
    need(fails, lines.includes(`${n} moved this turn; its Decisions/Issues did not.`),
      `no line, or not the existing wording, for ${n}: ${lines.join(' | ')}`);
  }
  need(fails, lines.length === names.length,
    `${lines.length} nag line(s) for ${names.length} moved features: ${lines.join(' | ')}`);
  need(fails, !/features moved this turn/.test(text), 'it collapsed to a count below the threshold');
  return { fails, text };
});

kase('N4', 'at the threshold it says it once with the count and names no feature', () => {
  const fails = [];
  const names = ['f01', 'f02', 'f03', 'f04', 'f05', 'f06'].slice(0, BULK_MIN);
  const repo = buildRepo('n4', names);
  glance(repo.main);                                   // baseline
  for (const n of names) bump(repo, n, 'work');
  const { text } = glance(repo.main);
  const lines = nagLines(text).map((l) => l.replace(/^\s*·\s*/, ''));
  need(fails, lines.length === 1, `${lines.length} nag line(s), want exactly 1: ${lines.join(' | ')}`);
  const line = lines[0] || '';
  need(fails, new RegExp(`(^|\\D)${names.length}\\b`).test(line), `the line does not carry the count ${names.length}: ${line}`);
  for (const n of names) need(fails, !line.includes(n), `the bulk line names ${n}: ${line}`);
  return { fails, text };
});

kase('N5', 'a feature in flight whose human region did NOT move still nags', () => {
  const fails = [];
  const repo = buildRepo('n5', ['inflight']);
  writeRoadmap(repo.main, { development: ['inflight'] });
  bump(repo, 'inflight', 'work');
  glance(repo.main);                                   // baseline, with the branch already there
  bump(repo, 'inflight', 'more');                      // a second branch: the signature moves again
  const { text } = glance(repo.main);
  const lines = nagLines(text).map((l) => l.replace(/^\s*·\s*/, ''));
  need(fails, lines.includes('inflight moved this turn; its Decisions/Issues did not.'),
    `the signal this line exists for is gone: ${text.replace(/\s+/g, ' ')}`);
  return { fails, text };
});

kase('N6', 'the say() contract: it speaks on the turn it changes and is silent across two after it', () => {
  const fails = [];
  const repo = buildRepo('n6', ['solo']);
  writeRoadmap(repo.main, { development: ['solo'] });
  glance(repo.main);                                   // baseline
  bump(repo, 'solo', 'work');
  const first = glance(repo.main);
  need(fails, /solo moved this turn/.test(first.text), 'the moving turn did not nag at all');
  const second = glance(repo.main);
  need(fails, !/moved this turn/.test(second.text),
    `it repeated itself with nothing changed: ${second.text.replace(/\s+/g, ' ')}`);
  const third = glance(repo.main);
  need(fails, !/moved this turn/.test(third.text),
    `it repeated itself on a third unchanged turn: ${third.text.replace(/\s+/g, ' ')}`);
  return { fails, text: `1: ${first.text}\n2: ${second.text}\n3: ${third.text}` };
});

kase('N7', "bookjob's turn: twelve complete features, facts blocks refreshed, and no nag at all", () => {
  const fails = [];
  const names = Array.from({ length: 12 }, (_, i) => `feat${String(i + 1).padStart(2, '0')}`);
  const repo = buildRepo('n7', names);
  glance(repo.main);                                   // baseline: every facts block derived once
  sweep(repo, names);                                  // the sweep: twelve rows to '## complete'
  const { status, text } = glance(repo.main);
  need(fails, status === 0, `exit ${status}, want 0`);
  // THE FIXTURE IS THE INCIDENT ONLY IF THIS TURN REWROTE THOSE BLOCKS. The hook's own refresh line
  // is the independent account of what it wrote, and every one of the twelve has to be in it —
  // otherwise the case is passing because nothing moved rather than because the guard held.
  const refreshed = (text.split('\n').find((l) => l.includes('Updated state recorded')) || '');
  for (const n of names) {
    need(fails, refreshed.includes(`.conducted/work/${n}/state.md`),
      `the turn did not refresh ${n}'s facts block, so the fixture is not bookjob's turn: ${refreshed}`);
  }
  need(fails, nagLines(text).length === 0,
    `${nagLines(text).length} nag line(s) on a turn where nothing was owed a decision: ${nagLines(text).join(' | ')}`);
  return { fails, text };
});

kase('N8', 'the bulk line is keyed stably and its signature moves when the count moves', () => {
  const fails = [];
  const names = Array.from({ length: BULK_MIN * 2 + 1 }, (_, i) => `g${String(i + 1).padStart(2, '0')}`);
  const first = names.slice(0, BULK_MIN);
  const second = names.slice(BULK_MIN);                // one more than the first set
  const repo = buildRepo('n8', names);
  glance(repo.main);                                   // baseline
  for (const n of first) bump(repo, n, 'work');
  const a = glance(repo.main);
  need(fails, nagLines(a.text).length === 1 && new RegExp(`(^|\\D)${first.length}\\b`).test(nagLines(a.text)[0]),
    `the first bulk turn did not say ${first.length}: ${nagLines(a.text).join(' | ')}`);
  for (const n of second) bump(repo, n, 'work');
  const b = glance(repo.main);
  need(fails, nagLines(b.text).length === 1 && new RegExp(`(^|\\D)${second.length}\\b`).test(nagLines(b.text)[0]),
    `a moved count was not restated: ${nagLines(b.text).join(' | ')}`);
  // And it obeys the same contract as everything else: nothing moved, nothing said. (What it does NOT
  // do is restate itself for a DIFFERENT set of features at the same count — the names are not in the
  // line, so a signature carrying them would restate a sentence the reader has already read.)
  const c = glance(repo.main);
  need(fails, nagLines(c.text).length === 0, `it repeated itself with nothing changed: ${nagLines(c.text).join(' | ')}`);
  return { fails, text: `1: ${a.text}\n2: ${b.text}\n3: ${c.text}` };
});

// --------------------------------------------------------------------------------------- running
mkdirSync(SANDBOX, { recursive: true });
const selected = cases.filter((c) => !FILTER || c.id.includes(FILTER));
const results = [];

for (const c of selected) {
  let fails = [];
  let text = '';
  try { ({ fails, text } = c.run()); }
  catch (e) { fails = [`the case could not run: ${e && e.message ? e.message : String(e)}`]; }
  results.push({ c, fails, text });
}

// ------------------------------------------------------------------------------------- the table
const W = Math.max(...results.map((r) => r.c.id.length), 4);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));

console.log('');
console.log(`stop-glance nag corpus  ·  glance:   ${GLANCE}`);
console.log(`                        ·  sandbox:  ${SANDBOX}`);
console.log(`                        ·  bulk min: ${BULK_MIN}`);
console.log('');
console.log(`${pad('CASE', W)}  RESULT  WHAT`);
console.log('-'.repeat(W + 2 + 6 + 2 + 60));

for (const r of results) {
  console.log(`${pad(r.c.id, W)}  ${pad(r.fails.length === 0 ? 'PASS' : 'FAIL', 6)}  ${r.c.what}`);
  for (const f of r.fails) console.log(`${pad('', W)}   ->   ${f}`);
  if (VERBOSE && r.text) {
    for (const l of r.text.split('\n')) console.log(`${pad('', W)}   msg  ${l}`);
  }
}

const failed = results.filter((r) => r.fails.length > 0);
console.log('');
console.log('-'.repeat(78));
console.log(`SUMMARY  ${results.length} cases  ·  ${results.length - failed.length} passed  ·  ${failed.length} failed`);
console.log('-'.repeat(78));
console.log('');

// CLEAN ON GREEN, KEEP ON RED — the rule glance-behind.test.mjs states and the reason it states it: a
// fresh root per run is what makes the corpus safe to run anywhere, and it is also what makes it
// accumulate. A FAILING run leaves the tree exactly where the header said it is, because that is the
// only copy of the state a red case failed in.
//   Teardown is never a verdict. The verdict is decided above; a remove that loses to a file handle is
// litter, and litter must not move an exit code or contradict a case that passed.
if (failed.length === 0) {
  try {
    rmSync(SANDBOX, { recursive: true, force: true });
    console.log(`sandbox removed: ${SANDBOX}`);
  } catch (e) {
    console.log(`sandbox left behind (${e && e.code ? e.code : 'remove failed'}), delete it when you like: ${SANDBOX}`);
  }
} else {
  console.log(`sandbox kept for inspection: ${SANDBOX}`);
}
console.log('');

process.exit(failed.length === 0 ? 0 : 1);
