#!/usr/bin/env node
// conducted-lite SessionStart hook — the state of the repo, derived and fact-checked, before the
// first word is written.
//
// The Stop hook is the half that stops a session lying about its state on the way out. This is the
// missing half: on the way IN it runs `.claude/scripts/session-start.mjs`, which regenerates the
// roadmap from what actually exists and then tests every claim in every feature's state.md against
// reality — does that branch exist, is that PR still open, is that worktree on disk, does the folder
// exist. Its report is handed to the session as context, so the session starts from what is TRUE
// rather than from what a file says.
//
// IT REACHES THE MODEL AND NEVER THE HUMAN. A SessionStart hook's stdout is added as context; it is
// NOT shown in the transcript, and `additionalContext` is explicitly documented as not appearing as a
// chat message. `systemMessage` is not available on this event either. So there is no mechanism here
// that can put the fact-check on the owner's screen, and the handoff is BEHAVIOURAL: the script's own
// output opens with an instruction asking the session to relay it. That is why nothing may be
// prepended below — see the note at the write.
//
// IT NEVER BLOCKS, AND IT NEVER DECIDES. A SessionStart hook has no block verdict to give, and this
// one would not use it if it had: the script it runs reports disagreement ("this reads as complete;
// the roadmap says development") and leaves it. The only things either of them will do unasked are
// sweeping a row the human already marked complete, and pruning a worktree that is provably merged
// and clean. Everything else is a sentence.
//
// SessionStart payload:
//   { session_id, transcript_path, cwd, hook_event_name: "SessionStart", source, ... }
// Adding context, exit 0 with JSON on stdout:
//   { "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": "<text>" } }
// Silence = exit 0 with no output.
//
// FAILURE MODE IS "SILENTLY ADDS NOTHING", NEVER "DELAYS OR BREAKS THE SESSION" — the same
// discipline as the Stop hook, and non-negotiable. Every one of these exits 0 with no output:
//   · stdin read timeout             stdin that never closes must not hang the session's start
//   · malformed / absent stdin       nothing to reason about
//   · not a lite repo                no .claude/scripts/session-start.mjs, or no
//                                    .conducted/CONDUCTOR.md -> instant silence. Both guards are
//                                    TRACKED FILES, never directories: git tracks files, not
//                                    directories, so a directory-existence guard silently disarms
//                                    the moment its last file moves.
//   · git absent / not a repo        nothing to derive from
//   · script missing                 nothing to run
//   · script timeout / crash / ANY
//     nonzero exit                   a fact-check that fell over is not a finding. Unlike the Stop
//                                    hook there is no exit code worth interpreting here: this hook
//                                    only ever REPORTS, so a broken run has nothing to report.
//   · empty output                   nothing to say
//   · any unexpected throw           fails open
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT_REL = '.claude/scripts/session-start.mjs';
const CONDUCTOR_REL = '.conducted/CONDUCTOR.md';
const STDIN_TIMEOUT_MS = 10_000;
const SCRIPT_TIMEOUT_MS = 60_000;   // git worktree/status locally, plus at most one ls-remote and one gh call
const CONTEXT_CAP = 24_000;

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

// argv form, never a shell string — same rule as the script it runs.
const git = (args, cwd) => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
};

// Same resolution as the script and the Stop hook, then the MAIN checkout: .conducted/ lives there
// and a session may start inside a linked worktree.
function repoRoot(payloadCwd) {
  const start = resolveCwd(process.env.CLAUDE_PROJECT_DIR || payloadCwd);
  const top = (git(['rev-parse', '--show-toplevel'], start) || start).replace(/\\/g, '/');
  const first = git(['worktree', 'list', '--porcelain'], top).split('\n').find((l) => l.startsWith('worktree '));
  return first ? first.slice(9).trim().replace(/\\/g, '/') : top;
}

function main(data) {
  const repo = repoRoot(data && data.cwd);

  const script = join(repo, SCRIPT_REL);
  if (!existsSync(script)) quiet();
  if (!existsSync(join(repo, CONDUCTOR_REL))) quiet();
  if (!git(['rev-parse', '--is-inside-work-tree'], repo)) quiet();

  let out = '';
  try {
    out = execFileSync(process.execPath, [script], {
      cwd: repo, encoding: 'utf8', timeout: SCRIPT_TIMEOUT_MS,
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
      stdio: ['ignore', 'pipe', 'pipe'],
    }) || '';
  } catch {
    // A timeout, a spawn failure, a throw, a nonzero exit — all the same thing here: the fact-check
    // did not produce facts, so there is nothing honest to hand the session. Silence, never a guess.
    quiet();
  }
  if (!out.trim()) quiet();

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      // The script's own first paragraph is an INSTRUCTION to the reading session, and it is first
      // for a reason: a SessionStart hook's stdout reaches the model and NEVER the transcript, so the
      // only way this reaches the owner is the session choosing to say it. Nothing may be prepended
      // here — a preamble above it is two paragraphs the instruction has to be read through, and the
      // preamble that used to sit here said nothing the script does not already say twice.
      additionalContext: out.slice(0, CONTEXT_CAP),
    },
  }));
  process.exit(0);
}

// ---- stdin, with a timeout: a hook that hangs is a hook that delays every session start.
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
