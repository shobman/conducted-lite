#!/usr/bin/env node
// conducted-lite rules — the DEFINITIONS, and nothing that can fail.
//
// WHY THIS FILE EXISTS. `lite-core.mjs` is where the shared machinery lives, and the Stop hook cannot
// import it. Two reasons, both structural rather than stylistic:
//
//   · lite-core's failure face is `fail()`, which writes to stderr and EXITS NONZERO. That is right
//     for a script a human ran and wrong for a hook that fires every turn, which would then print an
//     error into every turn.
//   · importing lite-core RUNS lite-core: its module scope resolves the cwd and spawns
//     `git rev-parse --show-toplevel` to fix REPO. An import with a git process in it is not
//     something a per-turn hook can afford, and it is not something a hook can fail open around.
//
// So the rules that BOTH sides must agree on live here instead, and both import them. This file is
// therefore held to a harder standard than the rest of the machinery, and the standard is the whole
// point of it:
//
//   NO I/O. No fs, no child_process, no network. Nothing here reads a file or spawns a process.
//   NO EXIT. No `fail()`, no `process.exit`, no `throw` on ordinary input. A rule that cannot fail
//            cannot take a caller down with it, which is what makes it safe in a hook.
//   NO STATE. No module-level work of any kind — importing this file costs one parse and nothing
//            else. Everything is a constant or a pure function of its arguments.
//   ANSWERS, NOT VERDICTS. Where a rule has more than one outcome it RETURNS which one (see
//            `inFlightState`); it never decides what the caller should do about it.
//
// `node:path`'s `basename` is the one import, and it is a pure string function.
//
// WHAT BELONGS HERE: a rule two callers would otherwise mint twice — a path both must name, a marker
// both must find, a derivation whose two copies would let session-end and the Stop hook disagree
// about the same repo. WHAT DOES NOT: anything that touches the disk, git, or the clock.
import { basename } from 'node:path';

export const posix = (p) => String(p).replace(/\\/g, '/');

// ---------------------------------------------------------------------------- paths and markers

export const CONDUCTED = '.conducted';
export const WORK_REL = `${CONDUCTED}/work`;
export const ROADMAP_REL = `${CONDUCTED}/roadmap.md`;
export const ARCHIVE_REL = `${CONDUCTED}/archive.md`;
export const CONDUCTOR_REL = `${CONDUCTED}/CONDUCTOR.md`;
export const LAST_REL = `${CONDUCTED}/last-session.md`;
// The one TRACKED declaration a bare hook can read. A hook spawns a fresh process, so nothing from
// the conductor's shell (a flag, an env var) survives to reach it; a committed file does, and it
// shows up in review, so the allowance can never be set invisibly.
export const ALLOW_REL = `${CONDUCTED}/allow-dirty`;
export const END_REL = '.claude/scripts/session-end.mjs';
export const START_REL = '.claude/scripts/session-start.mjs';
// The per-turn glance. It is here rather than in the hook because the hook now WRITES, and a facts
// block records WHO wrote it — so this string is read back by the comparison that decides whether
// anything needs writing at all. Two copies of it and the glance rewrites every block, every turn.
export const GLANCE_REL = '.claude/hooks/stop-glance.mjs';
// Where the per-turn glance remembers what it last said. OUTSIDE THE TRACKED TREE ON PURPOSE: a hook
// that fires every turn must not be a per-turn source of dirt in the tree it audits, and this is a
// note to itself about one clone rather than state anyone would review. It is joined onto the git
// COMMON dir of the main checkout, so every linked worktree of one clone shares one memory.
export const GLANCE_SNAPSHOT = 'conducted-lite-glance.json';

export const FACTS_START = '<!-- conducted-lite:facts:start -->';
export const FACTS_END = '<!-- conducted-lite:facts:end -->';
export const LEDGER_START = '<!-- conducted-lite:ledger:start -->';
export const LEDGER_END = '<!-- conducted-lite:ledger:end -->';
export const ARCHIVE_START = '<!-- conducted-lite:archive:start -->';
export const ARCHIVE_END = '<!-- conducted-lite:archive:end -->';

// THE LADDER. Order is significant: index = rung. `idea` has no folder (it is a hand-written line
// and nothing else); `complete` is the ONLY rung a machine may never assign — it is the human's
// word, and deriving it from a merged PR is precisely the judgement this machinery refuses to make.
export const STATUSES = ['idea', 'new', 'accepted', 'refined', 'development', 'complete'];
export const rung = (s) => STATUSES.indexOf(s);

// A feature name has to survive being written into a markdown link and read back out of one, so it
// is restricted rather than escaped: an unrestricted name is a parser bug waiting for a ']'.
export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// A generated roadmap row. Everything in it is derived; nothing in it is a status field anyone
// maintains.
export const ROW_RE = /^-\s+\[([A-Za-z0-9][A-Za-z0-9._-]*)\]\(work\//;

// ---------------------------------------------------------------------------- globs

// A repo-relative glob, deliberately small: '**' any depth, '*' one segment, everything else
// literal. A bare directory ('docs/scratch') also matches everything under it.
export function globToRe(g) {
  const lit = (s) => s.replace(/[.+^${}()|[\]\\?]/g, (c) => '\\' + c);
  const body = g.trim().split('**').map((seg) => seg.split('*').map(lit).join('[^/]*')).join('.*');
  return new RegExp('^' + body + '(/.*)?$');
}

// ---------------------------------------------------------------------------- the feature name

// THE ONE PLACE THE FEATURE NAME IS MINTED, and every consumer inherits it: the roadmap's
// 'development' derivation, session-end's worktree reconcile, and the Stop hook's in-flight
// derivation all read the same field. Minting it twice is how they drift apart.
//
// THE CONVENTION IS `worktrees/<feature>` INSIDE THE REPO — one place, covered by .gitignore, and the
// directory name IS the feature name. A worktree BESIDE the repo as `<repo>_<feature>` is still
// PARSED (the `<repo>_` prefix is stripped, case-insensitively, because Windows hands back whatever
// case the filesystem feels like) and still reconciles, because the field's real damage was a check
// that demanded `.conducted/work/olchat_probe-feature/` — a folder that can never exist — and so
// failed every single session. A check that always fails is one people learn to ignore. It is parsed
// and then REPORTED as out of convention: informs, never blocks.
export function featureNameOf(p, main) {
  const b = basename(String(p));
  const mb = basename(String(main));
  return b.toLowerCase().startsWith(mb.toLowerCase() + '_') ? b.slice(mb.length + 1) : b;
}

export function worktreeLayout(main, p) {
  if (p.toLowerCase().startsWith(main.toLowerCase() + '/')) return 'in-repo';
  if (basename(p).toLowerCase().startsWith(basename(main).toLowerCase() + '_')) return 'sibling';
  return 'elsewhere';
}

// ---------------------------------------------------------------------------- the ledger

const HEAD_RE = new RegExp(`^##\\s+(${STATUSES.join('|')})\\s*$`, 'i');

// Parse the ledger block into: per-status HUMAN lines (anything that is not a generated row) and
// per-status generated ROWS. That split is the whole ownership model of roadmap.md, and it is
// uniform: `idea` needs no special case, because an idea IS a human line and nothing else.
// SPLIT ON '\n' AND KEEP THE '\r'. It used to split on /\r?\n/, which silently ATE the carriage
// return off every hand-written line in a CRLF file — and `renderLedger` then rejoined with '\n', so
// one run of session-start or of the per-turn glance rewrote a Windows editor's lines as LF. The
// ledger's generated rows are the machine's and are LF; the human lines are the human's and are now
// whatever bytes they were. A trailing '\r' is invisible to both matchers below: HEAD_RE runs on
// `raw.trim()`, and ROW_RE is anchored at the start of the line.
export function parseLedger(body) {
  const sections = new Map(STATUSES.map((s) => [s, { human: [], rows: [] }]));
  const preamble = [];
  let cur = null;
  for (const raw of String(body).split('\n')) {
    const h = raw.trim().match(HEAD_RE);
    if (h) { cur = h[1].toLowerCase(); continue; }
    const m = raw.match(ROW_RE);
    if (cur && m) sections.get(cur).rows.push({ name: m[1], line: raw });
    else if (cur) sections.get(cur).human.push(raw);
    else preamble.push(raw);
  }
  return { sections, preamble };
}

// Feature name -> the status it is DECLARED under. One reader, so session-end's reconcile and the
// Stop hook's glance can never read the same roadmap two different ways.
export function declaredStatuses(ledgerBody) {
  const { sections } = parseLedger(ledgerBody);
  const map = new Map();
  for (const s of STATUSES) for (const r of sections.get(s).rows) map.set(r.name, s);
  return map;
}

// ---------------------------------------------------------------------------- in flight

// IN FLIGHT, DERIVED. A live builder holds uncommitted work BY DESIGN, so its worktree is allowed to
// be dirty — but the allowance is DERIVED from state that is already declared and machine-visible,
// which is what stops it going stale the way a hand-written line does. A linked worktree is IN
// FLIGHT when BOTH:
//   · a feature folder .conducted/work/<name>/ exists for its minted name, AND
//   · roadmap.md DECLARES that feature under '## development'.
//
// It is not a rubber stamp, and this function returns WHICH of the three states holds rather than a
// boolean, so every caller can say why it said no in its own words without re-deriving the rule:
//   'in-flight'      both conditions hold
//   'no-folder'      nothing on disk declares this worktree at all
//   'not-declared'   there is a folder, but the roadmap has it somewhere other than '## development'
//                    — 'complete' above all. No row is no declaration.
//
// THE MAIN CHECKOUT IS NEVER IN FLIGHT: callers pass LINKED worktrees only, because dirt in the main
// checkout is not a builder's and is never covered by this. Asking about the main checkout is a
// caller bug, not a state this function will answer for.
export const IN_FLIGHT_STATUS = 'development';

export function inFlightState(hasFeatureFolder, declaredStatus) {
  if (!hasFeatureFolder) return 'no-folder';
  return declaredStatus === IN_FLIGHT_STATUS ? 'in-flight' : 'not-declared';
}

export const isInFlight = (hasFeatureFolder, declaredStatus) =>
  inFlightState(hasFeatureFolder, declaredStatus) === 'in-flight';
