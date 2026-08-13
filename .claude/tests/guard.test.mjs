#!/usr/bin/env node
// The corpus for .claude/hooks/conductor-guard.mjs. Zero dependencies, no package.json:
//
//     node .claude/tests/guard.test.mjs            # from anywhere; paths resolve off this file
//     node .claude/tests/guard.test.mjs --verbose  # print the full deny text for every failure
//     node .claude/tests/guard.test.mjs A5         # run only cases whose id contains A5
//
// THE GUARD IS DRIVEN AS A BLACK BOX. It is spawned with `node`, handed a real PreToolUse payload on
// stdin, and judged on what it prints. Nothing here imports it and nothing here reaches inside it —
// its contract is payload-in, decision-out, and that contract is what the field exercises. It is
// also the only way to test the fail-open guarantees: malformed stdin, an absent tool_input, and a
// cwd with no .conducted/CONDUCTOR.md above it are all observable only from outside the process.
//
// EXIT CODE IS NON-ZERO WHILE ANY COUNTED CASE FAILS. Group A is expected to fail today — those are
// the defects in .conducted/work/guard-false-positives/state.md, written as assertions of what
// the guard SHOULD do, so each one turns green when its defect is fixed and no assertion is edited.
// Group B passes today and a group-B failure is a regression or a new finding.
//
// WHAT COULD NOT BE TESTED FROM OUTSIDE, stated rather than worked around:
//   · "any unexpected throw fails open" — a throw inside main() cannot be provoked through the
//     payload. B-failopen-hostile-shapes feeds nested objects and numbers where strings are
//     expected, which is as close as the boundary allows; it exercises the coercions, not the catch.
//   · the 5-second stdin read timeout — testable only by holding stdin open for five seconds, which
//     would put a five-second sleep in every run. Left out deliberately, not overlooked.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { cases, REPO_ROOT } from './cases.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(REPO_ROOT, '.claude', 'hooks', 'conductor-guard.mjs');

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const FILTER = argv.filter((a) => !a.startsWith('--'))[0] || '';

// A directory outside any conducted-lite repo, for the "this law is not in force" cases. Fixed
// name, never a timestamp or a random suffix: a run of this corpus must be reproducible.
const OUTSIDE = join(tmpdir(), 'conducted-lite-guard-corpus-outside');
mkdirSync(OUTSIDE, { recursive: true });

if (!existsSync(GUARD)) {
  console.error(`the guard is not where the corpus expects it: ${GUARD}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------------- driving it
function invoke({ stdin, cwd }) {
  // CLAUDE_PROJECT_DIR is a second way for the guard to find a repo root, and inheriting the
  // maintainer's would make the "not a lite repo" cases pass for the wrong reason.
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  const r = spawnSync(process.execPath, [GUARD], { input: stdin, cwd, env, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
}

function readDecision(res) {
  const out = res.stdout.trim();
  if (!out) return { decision: 'allow', reason: '', parseError: null };
  try {
    const j = JSON.parse(out);
    const h = j.hookSpecificOutput || {};
    return { decision: h.permissionDecision || '(none)', reason: String(h.permissionDecisionReason || ''), parseError: null };
  } catch (e) {
    return { decision: '(unparseable stdout)', reason: out, parseError: String(e.message) };
  }
}

// THE PATH THE MESSAGE NAMES. Deliberately pattern-based and forgiving of wording: the deny prose
// belongs to the guard's author and will be rewritten. What must survive a rewrite is that a deny
// either names one path or names none, and that is what these read.
const NAME_PATTERNS = [
  /\bThis command writes\s+(\S+?)\s*\(/,                                 // Bash, resolved target
  /\bThis (?:Write|Edit|MultiEdit|NotebookEdit) of\s+(\S+?)\s+is denied/, // Edit/Write path
  /\bwrites?\s+([^\s(),]+\.[A-Za-z][A-Za-z0-9]{0,11})\b/,                // fallback, any rewording
  // A PATH MAY CONTAIN A SPACE, and the three above all stop at one: each reads the name with `\S`
  // or a class that excludes whitespace, so `src/my app.ts` came back as "names nothing" from a
  // message that named it perfectly well. Added rather than edited, and added LAST on purpose — it
  // is reached only where the three above already returned null, so no case that passed before can
  // change verdict. It is anchored on the parenthesised reason and the comma that follows it, which
  // is the one piece of that sentence's shape a rewording is unlikely to drop.
  /\bThis command writes\s+(.+?)\s+\([^)\n]*\),/,
];
function namedPath(reason) {
  for (const re of NAME_PATTERNS) {
    const m = reason.match(re);
    if (m) return m[1];
  }
  return null;
}

// ------------------------------------------------------------------------------------ asserting
function judge(kase, res) {
  const fails = [];
  const { decision, reason, parseError } = readDecision(res);
  const want = kase.expect;

  if (res.error) fails.push({ what: 'spawn', detail: `the guard could not be spawned: ${res.error.message}` });
  if (res.status !== 0) {
    fails.push({ what: 'exit', detail: `exit ${res.status}, want 0 — the hook must never wedge a session` });
  }
  if (parseError) fails.push({ what: 'stdout', detail: `stdout is not JSON: ${parseError}` });

  if (decision !== want.decision) {
    fails.push({ what: 'decision', detail: `want ${want.decision}, got ${decision}` });
  }

  if (want.decision === 'deny') {
    const got = namedPath(reason);
    if (want.named === null) {
      if (got !== null) {
        fails.push({
          what: 'named path',
          detail: `the message must name no path (the target is unresolvable), it named ${got}`,
        });
      }
    } else if (got !== want.named) {
      fails.push({ what: 'named path', detail: `want ${want.named}, message names ${got === null ? 'nothing' : got}` });
    }
    if (want.reason && !want.reason.test(reason)) {
      fails.push({ what: 'reason', detail: `no match for ${want.reason}` });
    }
  }

  for (const s of want.notMentions || []) {
    if (reason.includes(s)) {
      fails.push({ what: 'names a file it does not write', detail: `the message contains ${s}, which this command does not write (state.md issue 4)` });
    }
  }

  return { fails, decision, reason };
}

// --------------------------------------------------------------------------------------- running
const selected = cases.filter((c) => !FILTER || c.id.includes(FILTER));
const results = [];

for (const kase of selected) {
  const outside = kase.outsideRepo === true;
  const payloadCwd = outside ? OUTSIDE.replace(/\\/g, '/') : (kase.payload && kase.payload.cwd);
  const stdin = kase.rawStdin !== undefined
    ? kase.rawStdin
    : JSON.stringify(outside ? { ...kase.payload, cwd: payloadCwd } : kase.payload);
  // The child's own cwd matters: resolveCwd() falls back to process.cwd() when the payload has no
  // usable cwd, so it is set to the same place the payload claims.
  const childCwd = outside ? OUTSIDE : (typeof payloadCwd === 'string' && existsSync(payloadCwd) ? payloadCwd : REPO_ROOT);

  const res = invoke({ stdin, cwd: childCwd });
  const { fails, decision, reason } = judge(kase, res);
  results.push({ kase, fails, decision, reason, counted: kase.group === 'A' || kase.group === 'B' });
}

// ---------------------------------------------------------------------------------- the table
const W = Math.max(...results.map((r) => r.kase.id.length), 4);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));
const line = (n) => '-'.repeat(n);

console.log('');
console.log(`conductor-guard corpus  ·  guard: ${GUARD}`);
console.log(`                        ·  root:  ${REPO_ROOT}`);
console.log('');
console.log(`${pad('CASE', W)}  GRP  RESULT  WHAT`);
console.log(line(W + 2 + 3 + 2 + 6 + 2 + 40));

let printedGroup = null;
for (const r of results) {
  const g = r.kase.group;
  if (g !== printedGroup) {
    printedGroup = g;
    const heading = {
      A: 'A — known defects. These FAIL today; each turns green when its defect is fixed.',
      B: 'B — correct behaviour. These PASS today; a failure here is a regression.',
      observed: 'observed — real, out of this fix\'s scope. NOT COUNTED, reported only.',
      unverified: 'unverified — miq, quoted not transcribed. NOT COUNTED, reported only.',
    }[g] || g;
    console.log('');
    console.log(heading);
    console.log('');
  }
  const ok = r.fails.length === 0;
  const verdict = r.counted ? (ok ? 'PASS' : 'FAIL') : (ok ? '(ok)' : '(--)');
  const tag = { A: 'A', B: 'B', observed: 'O', unverified: 'U' }[g] || '?';
  console.log(`${pad(r.kase.id, W)}  ${pad(tag, 3)}  ${pad(verdict, 6)}  ${r.kase.what}`);
  for (const f of r.fails) {
    const tag = r.kase.defect ? ` [state.md issue ${r.kase.defect.join(', ')}]` : '';
    console.log(`${pad('', W)}       ->     ${f.what}: ${f.detail}${tag}`);
  }
  if (!ok && !r.counted && r.kase.note) {
    console.log(`${pad('', W)}       ->     ${r.kase.note}`);
  }
  if (VERBOSE && !ok && r.reason) {
    console.log(`${pad('', W)}       msg    ${r.reason.replace(/\s+/g, ' ').slice(0, 400)}`);
  }
}

// ---------------------------------------------------------------------------------- the summary
const counted = results.filter((r) => r.counted);
const failed = counted.filter((r) => r.fails.length > 0);
const failedA = failed.filter((r) => r.kase.group === 'A');
const failedB = failed.filter((r) => r.kase.group === 'B');
const uncounted = results.filter((r) => !r.counted);

const defects = [...new Set(failedA.flatMap((r) => r.kase.defect || []))].sort((a, b) => a - b);

console.log('');
console.log(line(78));
const uncountedFailed = uncounted.filter((r) => r.fails.length > 0);
console.log(
  `SUMMARY  ${counted.length} counted  ·  ${counted.length - failed.length} passed  ·  ${failed.length} failed` +
  `  (A ${failedA.length}, B ${failedB.length})  ·  ${uncounted.length} not counted` +
  `, ${uncountedFailed.length} of them not behaving as written`,
);
if (failedA.length) {
  console.log(`         group A failures map to state.md issues: ${defects.join(', ')}`);
}
if (failedB.length) {
  console.log(`         GROUP B FAILED — this is a regression or a new finding, not a known defect:`);
  for (const r of failedB) console.log(`           ${r.kase.id}`);
} else if (counted.some((r) => r.kase.group === 'B')) {
  console.log(`         group B clean: every promise the guard's header makes still holds.`);
}
console.log(line(78));
console.log('');

process.exit(failed.length === 0 ? 0 : 1);
