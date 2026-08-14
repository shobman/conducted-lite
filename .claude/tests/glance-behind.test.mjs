#!/usr/bin/env node
// The corpus for the BEHIND-ITS-UPSTREAM line of .claude/hooks/stop-glance.mjs. Zero dependencies,
// no package.json:
//
//     node .claude/tests/glance-behind.test.mjs            # from anywhere; paths resolve off this file
//     node .claude/tests/glance-behind.test.mjs --verbose  # print the hook's full emission per case
//     node .claude/tests/glance-behind.test.mjs G3         # run only cases whose id contains G3
//
// THE GLANCE IS DRIVEN AS A BLACK BOX, the same way guard.test.mjs drives the guard: it is spawned
// with `node`, handed a real Stop payload on stdin, and judged on what it prints. Nothing here
// imports it and nothing here reaches inside it. That is the only way to test what this line is
// actually about — the emission a conductor reads at the end of a turn.
//
// WHAT IT IS DRIVEN AGAINST: a REAL git repo built in tmpdir, with a REAL local bare origin, so the
// tracking refs the hook reads are the ones git itself computed. `behind` is manufactured the way it
// happens in the field and without a single network call: push, then move the local branch back, so
// `refs/remotes/origin/main` is ahead of `refs/heads/main` exactly as it is after a fetch.
//   The fixture does NOT copy `.claude/` — the hook resolves lite-rules and lite-derive against its
// OWN location, so the code under test is always this checkout's, and a stale copy in a tmpdir can
// never be what passed.
//
// SET `GLANCE_UNDER_TEST` TO JUDGE A DIFFERENT HOOK FILE. That is how these cases were confirmed to
// FAIL before the change existed: point it at `git show HEAD:.claude/hooks/stop-glance.mjs` written
// beside the real hook (its rule imports are resolved relative to itself, so it cannot be run from a
// tmpdir), and G1, G2, G4, G5 and G7 go red while G3, G6 and G8 stay green — the three that assert
// what must NOT change.
//
// EXIT CODE IS NON-ZERO WHILE ANY CASE FAILS. There are no known-failing groups here: every case
// asserts behaviour this hook is supposed to have today.
//
// WHAT COULD NOT BE TESTED FROM OUTSIDE, stated rather than worked around:
//   · "no network call is ever made" — asserted structurally in G8 by the absence of any change to
//     HEAD or to the tracking refs across a run, not by intercepting sockets. A hook that fetched
//     would move `refs/remotes/`, and G8 reads those bytes before and after.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const GLANCE = process.env.GLANCE_UNDER_TEST || join(REPO_ROOT, '.claude', 'hooks', 'stop-glance.mjs');
const SESSION_END = join(REPO_ROOT, '.claude', 'scripts', 'session-end.mjs');

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const FILTER = argv.filter((a) => !a.startsWith('--'))[0] || '';

if (!existsSync(GLANCE)) {
  console.error(`the glance is not where the corpus expects it: ${GLANCE}`);
  process.exit(2);
}

// A FRESH ROOT PER RUN, and the header prints it: a failing run still leaves a tree someone can go
// and look at, and no two runs can ever be looking at the same one.
//   It used to be the fixed path `conducted-lite-glance-corpus`, shared by every run on the machine
// and by every checkout of this repo on it, pre-cleaned with `rmSync`. On Windows that pre-clean is
// not reliable: anything holding a handle on the tree — a shell sitting in it, a git process that
// has not exited, antivirus reading it — makes the remove throw EPERM and takes cases down with it.
// Measured on 2026-08-14 in another repo mid-upgrade: 6 of 9 passing with EPERM, then a clean 9 of 9
// once the directory was deleted by hand. Nothing about the hook had changed in between.
//   That is worth more than the flakiness, because `conducted-upgrade.md` names this file as a
// must-pass self-check and a failing self-check is a stop-and-report. A collision in tmpdir would
// falsely halt an upgrade. `mkdtempSync` makes the collision structurally impossible rather than
// something a pre-clean has to survive.
const SANDBOX = mkdtempSync(join(tmpdir(), 'conducted-lite-glance-'));

// ------------------------------------------------------------------------------- building a repo
function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${(r.stderr || '').trim()}`);
  return r.stdout || '';
}

// A LITE REPO WITH A LOCAL BARE ORIGIN AND ONE SCAFFOLDED FEATURE.
//
// The feature's state.md is committed CARRYING ITS SCAFFOLD BLOCK, which is the state a real feature
// folder is in the moment it is created: the block says "NOTHING IS VERIFIED HERE YET" and the next
// glance replaces it with derived facts. That is what gives these cases a refresh that genuinely
// writes, rather than a write staged by hand — the wrote-list under test is the hook's own.
function buildRepo(name) {
  const root = join(SANDBOX, name);
  // The root is this run's own, so this is only ever tidying after a re-entry within one run. It
  // must not be able to throw: a remove that loses to a file handle is litter, never a verdict.
  try { rmSync(root, { recursive: true, force: true }); } catch { /* litter, not a failure */ }
  const main = join(root, 'main');
  const origin = join(root, 'origin.git');
  mkdirSync(main, { recursive: true });
  mkdirSync(origin, { recursive: true });

  git(origin, ['init', '--bare', '-q', '-b', 'main', '.']);
  git(main, ['init', '-q', '-b', 'main', '.']);
  git(main, ['config', 'user.email', 'corpus@example.invalid']);
  git(main, ['config', 'user.name', 'glance corpus']);
  // A hook or a template in the maintainer's global config must not run inside the fixture.
  git(main, ['config', 'commit.gpgsign', 'false']);

  mkdirSync(join(main, '.conducted', 'work'), { recursive: true });
  copyFileSync(join(REPO_ROOT, '.conducted', 'CONDUCTOR.md'), join(main, '.conducted', 'CONDUCTOR.md'));
  writeFileSync(join(main, '.conducted', 'roadmap.md'),
    '# roadmap\n\n<!-- conducted-lite:ledger:start -->\n\n## development\n\n<!-- conducted-lite:ledger:end -->\n');
  git(main, ['add', '-A']);
  git(main, ['commit', '-qm', 'base']);

  const se = spawnSync(process.execPath, [SESSION_END, '--new-feature', 'glancefix'],
    { cwd: main, encoding: 'utf8', env: stripEnv() });
  if (!existsSync(join(main, '.conducted', 'work', 'glancefix', 'state.md'))) {
    throw new Error(`the fixture's feature was not scaffolded: ${(se.stderr || se.stdout || '').trim()}`);
  }
  git(main, ['add', '-A']);
  git(main, ['commit', '-qm', 'scaffold glancefix']);
  git(main, ['remote', 'add', 'origin', origin.replace(/\\/g, '/')]);
  git(main, ['push', '-q', '-u', 'origin', 'main']);

  return { root, main, origin };
}

// PUT THE CLONE `n` FURTHER COMMITS BEHIND, with no fetch and no network — and WITHOUT TOUCHING THE
// WORKING TREE, which matters more than it looks: several cases need the machine-written state.md to
// stay dirty across the move, and any shape built on `commit` + `reset --hard` would discard the very
// file whose collision this feature is about.
//   So the upstream commits are minted with `commit-tree` (same tree, new parent — an empty commit)
// and pushed straight onto the bare origin's branch. The push updates `refs/remotes/origin/main`,
// which leaves `refs/heads/main` behind it: byte-for-byte the state a fetch leaves. It is also
// cumulative, so a case can move the count twice.
function putBehind(repo, n) {
  for (let i = 0; i < n; i++) {
    const parent = git(repo.main, ['rev-parse', 'origin/main']).trim();
    const tree = git(repo.main, ['rev-parse', 'origin/main^{tree}']).trim();
    const sha = git(repo.main, ['commit-tree', tree, '-p', parent, '-m', `upstream commit ${i}`]).trim();
    git(repo.main, ['push', '-q', 'origin', `${sha}:refs/heads/main`]);
  }
}

// A LOCAL COMMIT THAT IS NOT PUSHED — the `ahead` side, unchanged by this feature and asserted so.
function putAhead(repo) {
  writeFileSync(join(repo.main, 'local-only.txt'), 'not pushed\n');
  git(repo.main, ['add', '-A']);
  git(repo.main, ['commit', '-qm', 'local only']);
}

// ------------------------------------------------------------------------------------ driving it
function stripEnv() {
  // CLAUDE_PROJECT_DIR is the hook's FIRST choice of root, and inheriting the maintainer's would
  // point every case at this checkout instead of at its fixture.
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  return env;
}

function glance(main) {
  const payload = JSON.stringify({
    session_id: 'glance-corpus', transcript_path: '', cwd: main.replace(/\\/g, '/'),
    hook_event_name: 'Stop', stop_hook_active: false,
  });
  const r = spawnSync(process.execPath, [GLANCE], { input: payload, cwd: main, env: stripEnv(), encoding: 'utf8' });
  const out = (r.stdout || '').trim();
  let text = '';
  if (out) {
    try { text = String(JSON.parse(out).hookSpecificOutput.additionalContext || ''); }
    catch { text = `(unparseable stdout) ${out}`; }
  }
  return { status: r.status, text, raw: out };
}

// ---------------------------------------------------------------------------------------- cases
// Every case returns a list of failures. An empty list is a pass. They are written as small scripts
// rather than as a data table because each one needs a repo in a DIFFERENT state, and hiding that
// setup behind a fixture name would hide the thing the case is actually about.
const cases = [];
const kase = (id, what, run) => cases.push({ id, what, run });

const need = (fails, cond, detail) => { if (!cond) fails.push(detail); };

kase('G1', 'a branch behind its upstream is reported, with the count and "vs last fetch"', () => {
  const fails = [];
  const repo = buildRepo('g1');
  putBehind(repo, 1);
  const { status, text } = glance(repo.main);
  need(fails, status === 0, `exit ${status}, want 0 — a glance must never wedge a turn`);
  need(fails, /`main` is 1 commit\(s\) behind `origin\/main`/.test(text),
    'no sentence naming the branch, the count and the upstream');
  need(fails, /behind[^\n]*vs last fetch/.test(text),
    'the behind sentence does not end its claim with "vs last fetch"');
  return { fails, text };
});

kase('G2', 'the message names the files THIS turn wrote and says the block regenerates', () => {
  const fails = [];
  const repo = buildRepo('g2');
  putBehind(repo, 2);
  // The first glance on a fresh clone is the one that replaces the scaffold block with derived
  // facts, so this run genuinely writes — which is exactly the collision the feature is about.
  const { text } = glance(repo.main);
  const line = (text.split('\n').find((l) => l.includes('behind')) || '');
  need(fails, /`main` is 2 commit\(s\) behind `origin\/main`/.test(text), 'the count is not 2');
  need(fails, /rewrote[^\n]*`\.conducted\/work\/glancefix\/state\.md`/.test(line),
    'the behind line does not name the state.md this turn rewrote');
  need(fails, /regenerat|writes again|write again/.test(line),
    'the behind line does not say the block comes back identically, so a reader cannot tell discarding it is safe');
  // NOT A FILE IT DID NOT WRITE. Every path the behind line quotes must also appear in the refresh
  // line, which is the hook's own independent account of what it wrote this turn. A path in one and
  // not the other is a claim with no observation behind it.
  const refreshLine = (text.split('\n').find((l) => l.includes('Updated state recorded')) || '');
  for (const q of line.match(/`[^`]+`/g) || []) {
    if (!/[/\\.]/.test(q) || q === '`main`' || q === '`origin/main`') continue;
    need(fails, refreshLine.includes(q), `the behind line names ${q}, which the refresh line does not`);
  }
  return { fails, text };
});

kase('G3', 'a branch level with its upstream says nothing about being behind', () => {
  const fails = [];
  const repo = buildRepo('g3');
  const { text } = glance(repo.main);
  need(fails, !/behind/.test(text), `it spoke about behind-ness on a level branch: ${text.replace(/\s+/g, ' ')}`);
  return { fails, text };
});

kase('G4', 'the say() contract: silent across two turns with nothing changed', () => {
  const fails = [];
  const repo = buildRepo('g4');
  putBehind(repo, 3);
  const first = glance(repo.main);
  need(fails, /3 commit\(s\) behind/.test(first.text), 'the first turn did not report it at all');
  const second = glance(repo.main);
  need(fails, !/behind/.test(second.text),
    `it repeated itself with nothing changed: ${second.text.replace(/\s+/g, ' ')}`);
  const third = glance(repo.main);
  need(fails, !/behind/.test(third.text),
    `it repeated itself on a third unchanged turn: ${third.text.replace(/\s+/g, ' ')}`);
  return { fails, text: `1: ${first.text}\n2: ${second.text}\n3: ${third.text}` };
});

kase('G5', 'the wrote-files sentence appears ONLY on a turn that wrote something', () => {
  const fails = [];
  const repo = buildRepo('g5');
  putBehind(repo, 1);
  const first = glance(repo.main);
  need(fails, /rewrote/.test(first.text), 'the writing turn did not name what it wrote');
  // The facts block is now current, so this turn writes nothing. Moving the count re-opens the
  // keyed fact, so the sentence is spoken again — and must come back WITHOUT a wrote-list.
  putBehind(repo, 2);
  const second = glance(repo.main);
  const line = (second.text.split('\n').find((l) => l.includes('behind')) || '');
  need(fails, /`main` is 3 commit\(s\) behind `origin\/main`/.test(second.text),
    `the moved count was not restated: ${second.text.replace(/\s+/g, ' ')}`);
  need(fails, !/rewrote/.test(line),
    `it claimed to have rewritten files on a turn it wrote none: ${line}`);
  return { fails, text: `1: ${first.text}\n2: ${second.text}` };
});

kase('G6', 'the existing ahead line is untouched, in wording and in behaviour', () => {
  const fails = [];
  const repo = buildRepo('g6');
  putAhead(repo);
  const { text } = glance(repo.main);
  need(fails, /`main` is 1 commit\(s\) ahead of `origin\/main`, vs last fetch\. git push/.test(text),
    `the ahead sentence is not what it was: ${text.replace(/\s+/g, ' ')}`);
  need(fails, !/behind/.test(text), 'an ahead-only branch was also reported behind');
  const again = glance(repo.main);
  need(fails, !/ahead/.test(again.text), 'the ahead line repeated itself with nothing changed');
  return { fails, text };
});

kase('G7', 'behind-ness clears out loud when the branch catches up', () => {
  const fails = [];
  const repo = buildRepo('g7');
  putBehind(repo, 1);
  glance(repo.main);                                   // says it
  git(repo.main, ['merge', '-q', '--ff-only', 'origin/main']);
  const { text } = glance(repo.main);
  need(fails, /CLEARED[^\n]*behind[^\n]*re-checked, now false/.test(text),
    `catching up was not announced as re-checked and false: ${text.replace(/\s+/g, ' ')}`);
  return { fails, text };
});

kase('G8', 'it reports and touches nothing: no stash, no discard, no checkout, no pull, no fetch', () => {
  const fails = [];
  const repo = buildRepo('g8');
  putBehind(repo, 1);
  glance(repo.main);                                   // the writing turn, so the tree is at rest below

  const snap = () => ({
    head: git(repo.main, ['rev-parse', 'HEAD']).trim(),
    status: git(repo.main, ['status', '--short']),
    refs: git(repo.main, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/remotes']),
    stash: git(repo.main, ['stash', 'list']),
  });

  const before = snap();
  const { text } = glance(repo.main);
  const after = snap();

  need(fails, before.head === after.head, `HEAD moved: ${before.head} -> ${after.head}`);
  need(fails, before.status === after.status,
    `git status --short is not byte-identical:\n--- before\n${before.status}--- after\n${after.status}`);
  need(fails, before.refs === after.refs, 'a ref moved — something fetched, pulled or reset');
  need(fails, before.stash === after.stash, 'the stash list moved — something stashed');
  // The tree is dirty with the machine-written state.md, and that is the whole point: the hook
  // reports the blocked pull and leaves the block exactly where it is.
  need(fails, /state\.md/.test(before.status), 'the fixture is not in the state this case is about');
  return { fails, text };
});

kase('G9', 'it never tells a reader the diff is safe to discard, because the human region is in it', () => {
  const fails = [];
  const repo = buildRepo('g9');
  // THE STATE THIS CASE IS ABOUT, and it is the COMMON one rather than a corner: the human region of
  // the same state.md is edited and uncommitted, and the facts block is rewritten this turn. A reader
  // told the file is safe to throw away runs `git checkout --` and loses the Decisions they just
  // wrote. The hook observes the block it regenerates; it has never observed the rest of that diff.
  const statePath = join(repo.main, '.conducted', 'work', 'glancefix', 'state.md');
  const before = readFileSync(statePath, 'utf8');
  const anchor = before.indexOf('<!-- conducted-lite:facts:start -->');
  need(fails, anchor > 0, 'the fixture state.md has no facts marker to sit above');
  const edited = before.slice(0, anchor) + '## Decisions\n\n- 2026-08-14 keep the two-region splice.\n\n' + before.slice(anchor);
  writeFileSync(statePath, edited);

  putBehind(repo, 1);
  const { text } = glance(repo.main);
  const line = (text.split('\n').find((l) => l.includes('behind')) || '');

  need(fails, /`main` is 1 commit\(s\) behind `origin\/main`/.test(line), `no behind line at all: ${text.replace(/\s+/g, ' ')}`);
  need(fails, /rewrote[^\n]*`\.conducted\/work\/glancefix\/state\.md`/.test(line),
    'the fixture is not in the state this case is about: the turn did not rewrite that state.md');
  // The two shapes of the false claim: that the named files' CHANGES lose nothing, and that
  // discarding them is the remedy. Either one, read literally, destroys the human edit above.
  need(fails, !/loses nothing/.test(line),
    `it claims the named files' changes lose nothing, and the human region is in those changes: ${line}`);
  need(fails, !/discard/i.test(line),
    `it points the reader at discarding a file that also holds their uncommitted human region: ${line}`);
  // And it still says the thing it DID observe — the machine block comes back by itself.
  need(fails, /regenerat|writes again|write again/.test(line),
    'it no longer says the machine-written block comes back identically');
  // The human edit is still on disk, untouched: the hook reports, it does not tidy.
  need(fails, readFileSync(statePath, 'utf8').includes('keep the two-region splice'),
    'the human region was not preserved across the refresh');
  return { fails, text };
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
console.log(`stop-glance behind corpus  ·  glance:  ${GLANCE}`);
console.log(`                           ·  sandbox: ${SANDBOX}`);
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

// CLEAN ON GREEN, KEEP ON RED. A fresh root per run is what makes the corpus safe to run anywhere,
// and it is also what makes it accumulate: nine git repos a run, on every repo in the estate that
// runs this as an upgrade self-check. So a passing run takes its own root away again. A FAILING run
// leaves the tree exactly where the header said it is, because that is the only copy of the state a
// red case failed in.
//   Teardown is never a verdict. The verdict is already decided above; a remove that loses to a file
// handle is litter, and litter must not move an exit code or contradict a case that passed.
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
