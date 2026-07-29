#!/usr/bin/env node
// conducted-lite SessionEnd hook — the full check and the record, BEST-EFFORT.
//
// `SessionEnd` fires "when a session terminates". It is the right place for the end-of-session work
// that `Stop` was wrongly given, because it happens once rather than dozens of times a session. It
// is also, by the documentation's own words, NOTIFICATION-ONLY:
//
//     "Exit code and output are ignored, but the hook can write to files or trigger external
//      services."
//
// So this hook has no decision to make and will not pretend to have one. It runs
// `.claude/scripts/session-end.mjs`, which does the four checks and writes the record, and it exits
// 0 whatever happens — including when every check fails. A failed check now lands in
// `.conducted/last-session.md` and in the next SessionStart's report, which is where a human will
// actually read it, rather than in a block nobody can act on because the session is already over.
//
// TWO THINGS ABOUT IT THAT MUST NEVER BE OVERSTATED, because the whole redesign rests on them:
//
//   1  IT IS NOT GUARANTEED TO FIRE. The documented reasons are `prompt_input_exit`, `logout`,
//      `clear`, `resume`, `bypass_permissions_disabled` and `other`. The documentation says NOTHING
//      about a closed terminal, a SIGKILL or a crash, so this hook must be treated as best-effort
//      and nothing downstream may depend on it. That is why `session-start.mjs` derives everything
//      it reports from git and treats the written record as a convenience that may be absent —
//      SessionStart, not this, is the safety net.
//
//   2  `clear` AND `resume` ARE NOT ENDINGS. They fire while the work continues: the CONTEXT is
//      ending, not the job. So the reason is passed straight through to the script, which writes a
//      record that says which of the two happened and never claims the work finished. Recording
//      "session ended" when someone pressed /clear would be the asserted-not-verified failure this
//      machinery exists to catch, wearing a new hat.
//
// It can also be KILLED MID-WRITE — a terminating session is exactly when that happens — which is
// why every write in lite-core is a temp file plus a rename. See `writeAtomic`.
//
// SessionEnd payload:
//   { session_id, transcript_path, cwd, hook_event_name: "SessionEnd", reason }
// Output: none. Exit: 0, always.
//
// FAILURE MODE IS "DOES NOTHING", and there is no other mode available to it. Every one of these
// exits 0 silently:
//   · stdin read timeout · malformed / absent stdin · not a lite repo (no .conducted/CONDUCTOR.md,
//     no session-end.mjs — both TRACKED FILES, never directories) · git absent or not a repo ·
//     the script timing out, crashing, or exiting nonzero · any unexpected throw.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT_REL = '.claude/scripts/session-end.mjs';
const CONDUCTOR_REL = '.conducted/CONDUCTOR.md';
const STDIN_TIMEOUT_MS = 10_000;
// The script shells git several times and pays for ONE `ls-remote`. Generous, because this is the
// one run per session that is allowed to cost something — and bounded, because a terminating
// session must not be held open by a hook waiting on a dead remote.
const SCRIPT_TIMEOUT_MS = 90_000;

// There is exactly one exit in this file, and it is 0. Anything else would be a claim this hook is
// not entitled to make.
const done = () => process.exit(0);

// Node on Windows needs native paths; a hook cwd may arrive native, Git-Bash /c/-style, or absent.
function resolveCwd(c) {
  if (c) {
    const m = String(c).match(/^\/([a-zA-Z])\/(.*)$/);
    if (m) c = m[1].toUpperCase() + ':/' + m[2];
    if (existsSync(c)) return c;
  }
  return process.cwd();
}

// argv form, never a shell string — the same rule as the script it runs.
const git = (args, cwd) => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
};

// The script resolves its repo the same way, then the MAIN checkout: `.conducted/` lives there and a
// session may be terminating from inside a linked worktree.
function repoRoot(payloadCwd) {
  const start = resolveCwd(process.env.CLAUDE_PROJECT_DIR || payloadCwd);
  const top = (git(['rev-parse', '--show-toplevel'], start) || start).replace(/\\/g, '/');
  const first = git(['worktree', 'list', '--porcelain'], top).split('\n').find((l) => l.startsWith('worktree '));
  return first ? first.slice(9).trim().replace(/\\/g, '/') : top;
}

function main(data) {
  const repo = repoRoot(data.cwd);

  const script = join(repo, SCRIPT_REL);
  if (!existsSync(script)) done();
  if (!existsSync(join(repo, CONDUCTOR_REL))) done();
  if (!git(['rev-parse', '--is-inside-work-tree'], repo)) done();

  // Both are sanitised to the same character class the script itself enforces, so a hostile or odd
  // payload cannot smuggle anything into a file the script writes. An unknown reason is passed
  // through rather than dropped: the script classifies what it recognises and records the rest
  // verbatim as unrecognised, which is more honest than mapping it onto a guess.
  const sessionId = typeof data.session_id === 'string' ? data.session_id.replace(/[^A-Za-z0-9._-]/g, '_') : '';
  const reason = typeof data.reason === 'string' ? data.reason.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64) : '';

  const args = [script];
  if (sessionId) args.push('--session-id', sessionId);
  args.push('--end-reason', reason || 'other');

  try {
    execFileSync(process.execPath, args, {
      cwd: repo, encoding: 'utf8', timeout: SCRIPT_TIMEOUT_MS,
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch { /* exit 1 IS the script's "checks failed" verdict, and it wrote the record before
                saying so. There is nothing here that could act on it and nothing that should
                pretend to: the finding is in .conducted/last-session.md and the next SessionStart
                reads it out. A timeout or a crash lands here too, and is equally not this hook's
                to escalate. */ }
  done();
}

// ---- stdin, with a timeout: a hook that hangs holds a terminating session open.
let input = '';
const timer = setTimeout(done, STDIN_TIMEOUT_MS);
timer.unref?.();
process.stdin.setEncoding('utf8');
process.stdin.on('error', done);
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  clearTimeout(timer);
  let data;
  try { data = JSON.parse(input); } catch { done(); }
  if (!data || typeof data !== 'object') done();
  try { main(data); } catch { done(); }                   // any unexpected throw still exits 0
});
