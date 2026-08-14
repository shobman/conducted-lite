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
//   · `state.md` and `last-session.md` REWRITTEN PER TURN — unconditionally, whether or not anything
//     had changed — so the guard rail was a perpetual source of dirt in the very tree it audits.
//   · a HARD BLOCK on ordinary mid-work dirt. One untracked scratch file made an ordinary turn cost
//     an extra assistant turn, every turn, via `stop_hook_active`.
//
// The correction to the second of those OVERSHOT, and this version is the correction to the
// correction. "NO WRITES. Not one byte." was the right answer to writing every turn and the wrong
// answer to writing at all: it left the ledger and every facts block true only at SESSION
// BOUNDARIES, which is to say false for the whole middle of every session. The field said so three
// times in one session — a feature folder created mid-session read as an orphan worktree until
// someone re-ran session-start, and it looked like a fault each time. So the rule is no longer "never
// write". It is:
//
//   WRITE ONLY WHEN THE DERIVED CONTENT DIFFERS FROM THE BYTES ALREADY ON DISK. A run that changes
//   nothing touches nothing — no mtime, no dirt, no rewrite — because the comparison is on CONTENT,
//   with the provenance line and the timestamps held constant, and never on a clock.
//
// So this hook now does only what a per-turn event can afford, and only what it can guarantee:
//
//   LOCAL ONLY.   `git worktree list`, ONE `git for-each-ref`, and one `git status --porcelain` per
//                 LINKED WORKTREE. That is 2 git processes in a repo with no worktrees, 2 + N with
//                 them, and ZERO network calls. There is no `ls-remote` and no `gh` in this file;
//                 grep it. Push position comes from `refs/remotes/`, the tracking refs cached at the
//                 LAST FETCH, which is why every line about it says "vs last fetch" and never "vs
//                 origin". It may be stale, and claiming more than that would be the
//                 asserted-not-verified failure this project exists to catch, one level down.
//   REFRESH, NEVER TIDY. It re-derives the roadmap's generated rows and each feature's facts block
//                 and writes ONLY the ones whose content actually changed. It does NOT sweep, prune,
//                 remove a worktree, delete a branch, ask whether something shipped, create a
//                 state.md, or scaffold a marker. Every one of those is a decision with a human
//                 trigger and every one of them belongs to session-start or session-end. This
//                 refresh only makes TRUE THINGS CURRENT.
//   NEVER BLOCKS. There is no `decision` field anywhere in this file, under any condition. Search
//                 for it: it is not here. The worst this hook can do is say something.
//   SPEAKS ONLY WHEN A FACT CHANGED — see the next paragraph, which is the whole design of this file.
//
// SPEAK ONLY WHEN THE FACT CHANGES. Field evidence from two deployments four days apart: the glance
// said "N commits ahead of origin" — a different N, but the same sentence — for twenty consecutive
// turns, and trained its reader to stop reading it. A message that is always there is wallpaper: it
// is read once and then never again, including on the turn it finally matters. So every line this
// hook can emit is a KEYED FACT with a CONTENT SIGNATURE, and it is emitted only when that signature
// differs from what this clone last said. The memory lives in `.git/` of the main checkout —
// per-clone, outside the tracked tree, written atomically. A corrupt or absent memory degrades to
// SPEAKING (everything reads as new), never to crashing and never to silence.
//   A fact that GOES AWAY is also a change, and the persistent ones say so once as they clear.
//
// WHAT IT SPEAKS ABOUT:
//
//   SPEAKS · local commits ahead of their upstream, vs last fetch.
//   SPEAKS · a branch BEHIND its upstream, vs last fetch — and, when this turn's refresh wrote files,
//            which ones, because a generated-and-tracked file is what makes `git pull --ff-only` abort
//            with a success-shaped last line. It reports it; it never unblocks it.
//   SPEAKS · a local branch with NO UPSTREAM — EVERY local branch, keyed on its tip, so each commit
//            onto an unpushed branch restates it once. This is the DECEPTIVE failure: work that looks
//            finished because it is committed, but exists on one machine and nowhere else. It is this
//            hook's flagship purpose and it had NO COVERAGE on the sanctioned workflow until
//            2026-08-13 — see the note beside `inFlightBranches` for the two exclusions that hid it.
//   SPEAKS · unaccounted dirt in a worktree that is NOT in flight; and, separately and quietly, the
//            count of files an in-flight worktree or an allow-dirty glob is covering for.
//   SPEAKS · what state it recorded, naming the paths, in one line.
//   SPEAKS · a file the refresh could NOT write, naming it and the reason, in one line.
//   SPEAKS · that a feature MOVED this turn while its Decisions/Issues did not, in one line. The
//            machine detects; the conductor writes; the owner is never asked. NEVER about a feature
//            that reads 'complete', by declaration or by derivation — a finished feature is owed no
//            decision — and past `NAG_BULK_MIN` of them in one turn it is ONE line carrying the
//            count and naming nobody, because twelve of them was measured to be a block and not a
//            fact. See the note above the nag itself.
//   SILENT · uncommitted dirt in the MAIN checkout. Deliberately, and do not put it back. The human
//            can see it in their own editor and in their own `git status`; it is the normal state of
//            working rather than a fact anyone is missing.
//   SILENT · anything it already said that has not changed since.
//
// THE OUTPUT IS FACTS AND NOTHING ELSE. OWNER RULING, 2026-08-13, on reading a live emission: the
// preamble was "almost entirely waste", the refresh line over-explained, and the silence note and the
// end-of-session reminder both addressed a reader who needed neither. A line of output is a FACT or
// it is not printed. There is no preamble, no footer, no philosophy and no per-turn clean line — the
// block is the tag `conducted-lite:` and then facts. THE ASSURANCES THAT USED TO BE PRINTED EVERY
// TURN LIVE HERE INSTEAD, once, for the maintainer rather than the conductor:
//
//   · SILENCE DOES NOT MEAN THE TREE IS CLEAN. It means nothing this hook watches CHANGED. It is not
//     a clean bill of health and it never was one; a per-turn "state is clean" line was considered
//     and refused, because a line that is always there is the wallpaper this design exists to remove.
//   · NOTHING HERE BLOCKS, and nothing here was decided for anyone. There is no `decision` field.
//   · NO NETWORK CALL IS EVER MADE. Every push-position line is read from `refs/remotes/` and is
//     therefore as of the LAST FETCH, which is why each says so.
//   · EVERY WRITE TOUCHES MACHINE REGIONS ONLY. Human regions are spliced around by BYTE OFFSET and
//     come back as the bytes they were — see the boundary and encoding notes in lite-derive.mjs,
//     which is where both of those were once wrong and are now right.
//   · NOTHING IS SWEPT, TIDIED, REMOVED, DELETED OR MOVED DOWN THE LADDER by this hook, ever.
//   · `node .claude/scripts/session-end.mjs` is the verifier and runs itself from the SessionEnd
//     hook. Its best-effort caveat is in its own --help, not in this output.
//
// THE MARKER BOUNDARY IS NOT `indexOf`, AND THAT MATTERS HERE MORE THAN ANYWHERE. This hook writes
// the two-region files every turn, so it is the fastest possible amplifier of a boundary bug: a human
// paragraph that merely QUOTED a marker string above the real block moved the boundary up and the
// splice deleted the paragraph, the fence around it, and the real marker. The rule is "COLUMN 0, and
// outside a code fence", it lives in ONE place (`readSplit` in lite-derive.mjs), and session-start
// and session-end inherit exactly the same rule and the same fix. Its three revisions — and why the
// two obvious answers were each destructive — are written out there.
//   WHEN THE BOUNDARY CANNOT BE READ, THIS HOOK REFUSES OUT LOUD. A file whose markers are all quoted
// (an unclosed fence above them; a fence spanning the block) is skipped and NAMED through the same
// path an unwritable file uses. Silence there would be the same shrug that let the destruction
// through, one class further along. A file with NO markers at all stays silent — that is a
// scaffolding decision and this hook makes none.
//
// THE CROSS-CHECKOUT CONTRADICTION, FIXED. Observed twice in the field, verbatim in one sentence:
// "no .conducted/work/guard-false-positives/ folder exists, so nothing declares this worktree" while
// naming ` M .conducted/work/guard-false-positives/state.md` as that worktree's uncommitted file. It
// read FOLDER EXISTENCE from the MAIN checkout and DIRT from the WORKTREE, and the two checkouts are
// at different commits by construction. Both are now read from the same place: if the feature folder
// exists in the worktree's OWN checkout, that is what is said — the work is declared on its branch
// and has not landed on main, which is a normal mid-flight state and not an orphan.
//
// Stop payload:
//   { session_id, transcript_path, cwd, hook_event_name: "Stop", stop_hook_active: bool, ... }
// Injecting context, exit 0 with JSON on stdout — the documented shape for Stop, whose own note is
// "this context appears at the end of the turn and Claude can act on it":
//   { "hookSpecificOutput": { "hookEventName": "Stop", "additionalContext": "<text>" } }
// Silence = exit 0 with no output.
//
// WHERE THE RULES COME FROM, AND WHY BOTH IMPORTS ARE DYNAMIC. Nothing in this file is minted here.
// The glob matcher, the worktree-name mint, the ledger parse and the in-flight conjunction come from
// `.claude/scripts/lite-rules.mjs`; the placement ratchet, the ledger renderer, the facts-block
// renderer and the one atomic write face come from `.claude/scripts/lite-derive.mjs`. Both are files
// that do no I/O at module scope, spawn nothing, and never exit — which is exactly why they exist as
// separate layers from `lite-core.mjs`, whose `fail()` exits nonzero and whose module scope spawns
// git. The three-layer split is documented at the top of lite-core.mjs.
//   THIS IS NOT TIDINESS. This hook now WRITES the same two-region files session-start and
// session-end write. A second copy of the placement ratchet or of the facts-block shape would mean
// the hook and the scripts spend the session rewriting each other's output, in the file whose human
// region the whole design exists to protect.
//   The imports are DYNAMIC (and their rejection is silence) for one reason: a STATIC import of a
// file that has been deleted, or that carries a syntax error, fails at module load — before any of
// this file's error handling exists — and a per-turn hook would print that failure into every turn.
// This way an absent or broken rules/derive module is just one more silent exit 0.
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
//   · lite-rules / lite-derive absent or broken   the import rejects and we say nothing
//   · not a lite repo                no .conducted/CONDUCTOR.md -> instant silence. A TRACKED FILE,
//                                    never a directory: git tracks files, not directories, so a
//                                    directory-existence guard silently disarms the moment its last
//                                    file moves.
//   · git absent / not a repo        `git worktree list` returns nothing -> nothing to derive from
//   · any git call failing           each one degrades to '' and its section is simply skipped
//   · nothing CHANGED                the normal case, and the loudest thing this hook does
//   · any unexpected throw           fails silent
// And these degrade WITHOUT silencing the run, because losing them must not lose the facts:
//   · the snapshot is corrupt, unreadable or absent   -> every fact reads as new and is SPOKEN
//   · ONE file cannot be written (read-only, a lock, a directory in its place)   -> that file is
//                                    SKIPPED AND NAMED in the output, every other file is still
//                                    refreshed, and everything already written is still announced.
//                                    THE OLD CLAIM HERE — "the refresh throws, so nothing is written"
//                                    — WAS FALSE AND WAS MEASURED FALSE: one unwritable state.md
//                                    aborted the loop with the roadmap write already on disk and
//                                    unannounced, skipped every alphabetically-later feature, and
//                                    said nothing at all, that turn and every turn after.
//   · the whole refresh throws above that level (a broken derive module)   -> named as one skipped
//                                    item, and the risk lines are still said
// WHAT THIS HOOK CANNOT PROMISE — declared rather than discovered, each one measured:
//
//   HARDLINKS DO NOT SURVIVE A WRITE. Every write goes through `writeAtomic`: a temp file, then a
//   rename over the target. Rename REPLACES the directory entry, so if a state.md or roadmap.md is
//   hardlinked somewhere else, this hook's write UNLINKS it — the other name keeps the old content
//   and the two are no longer one file. That is inherent to atomic-replace and is the price of the
//   guarantee that a kill can never leave half a file, which for a file carrying a human region is
//   the trade worth making. Symlinks have the same shape. If you hardlink a conducted file, expect
//   this; nothing here can warn you at the moment it happens.
//
//   EACH LINKED WORKTREE COSTS ONE `git status`, AND ON WINDOWS THAT IS ~16.6 ms. Measured on this
//   machine over 10 runs per size, beyond node startup: 1 worktree 63 ms, 4 -> 116, 8 -> 179, which
//   is a straight line off a ~46 ms base. So the ~150 ms per-turn budget HOLDS TO ABOUT SIX LINKED
//   WORKTREES AND A WIDE FLEET EXCEEDS IT, linearly and predictably — an eight-builder fleet costs
//   180 ms a turn. The calls are sequential because this file is synchronous throughout;
//   running them concurrently is the fix if it ever bites, and it is a real change rather than a
//   tuning knob, so it is not being made speculatively.
//
//   A HANGING GIT COSTS ONE TURN ~10 SECONDS, ONCE — NOT ONCE PER CALL. `GIT_TIMEOUT_MS` alone was a
//   PER-CALL bound, which sounded sufficient and was not: this hook makes 2 + N git calls, so three
//   hanging worktree `git status` calls were measured costing ONE TURN 30.2 SECONDS. A per-turn hook
//   cannot have a bound that scales with the fleet. `RUN_BUDGET_MS` is now the whole run's allowance:
//   every call gets at most the time remaining, and once it is gone the rest are SKIPPED and the skip
//   is NAMED ("glance truncated: git slow or hung, N worktree(s) not checked"). The per-call bound
//   stays as the inner guard.
//   PROVEN IN BOTH DIRECTIONS with a REAL hanging executable on PATH (a copy of node.exe named
//   git.exe, resolving its first argument to a script that blocks on `Atomics.wait` and never
//   returns; confirmed hung by a 5-second control run). Nothing here blocks; the worst case ends in
//   one line or in silence.
//
//   A HUMAN REGION THAT IS NOT VALID UTF-8 IS PRESERVED EXACTLY BUT HASHED LOOSELY. The bytes are
//   spliced around untouched; the freshness hash is taken over a lossy UTF-8 decode of them, which is
//   stable (the same bytes always give the same hash, so nothing churns) but could in principle
//   collide across two different invalid sequences. It affects change DETECTION, never the content.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';

// The two rule files. Resolved against THIS file, so the hook and the scripts it agrees with are
// always the pair that shipped together in this clone.
const RULES_URL = new URL('../scripts/lite-rules.mjs', import.meta.url).href;
const DERIVE_URL = new URL('../scripts/lite-derive.mjs', import.meta.url).href;

const STDIN_TIMEOUT_MS = 10_000;
// TWO BOUNDS, AND THE OUTER ONE IS THE REAL ONE. `GIT_TIMEOUT_MS` is PER CALL, which sounded
// sufficient and is not: this hook makes 2 + N git calls, so three hanging worktree `git status`
// calls cost ONE TURN 30.2 SECONDS — measured. A per-turn hook cannot have a bound that scales with
// the fleet size. `RUN_BUDGET_MS` is the whole glance's wall-clock allowance: each call is given no
// more than the time remaining, and once it is gone every further call is SKIPPED and the skip is
// NAMED in one change-keyed line. Exit 0, say what you have.
const GIT_TIMEOUT_MS = 10_000;
const RUN_BUDGET_MS = 10_000;
const RUN_START = Date.now();
const msLeft = () => RUN_BUDGET_MS - (Date.now() - RUN_START);
const CONTEXT_CAP = 8_000;
const MAX_LISTED = 10;          // a glance names a handful and counts the rest
// THE CEILING ON THE HUMAN-REGION NAG: at or above this many nagging features in ONE turn, one line
// carrying the count replaces one line each, and no feature is named.
//   FOUR, and it is a judgement rather than a measurement — one bulk event has been observed, at
// twelve. Three lines is a list a reader acts on one at a time, which is exactly what this line asks
// of them; the fourth turns it into a block to skim, and a block nobody reads is worse than a line
// nobody needed. Any number up to twelve would have fixed the observed incident; the low one is what
// also catches the GENERAL bulk event — one branch rename across a repo of live features — which a
// threshold set at the incident's own size would sail under.
const NAG_BULK_MIN = 4;
const SNAPSHOT_V = 1;
// The ASCII record separator, spelled by code point rather than by escape so no editor, diff or
// copy-paste can turn it back into a literal control byte in this source. It joins the bodies this
// run wrote, so the refresh line's signature is a function of the BYTES written and not of the
// filenames — see `refresh`.
const RS = String.fromCharCode(30);
// A literal backtick. The sentences below quote branch names and commands in markdown, and a template
// literal cannot hold one without escaping; spelling it once here keeps those sentences readable and
// keeps this file free of escape sequences that a careless edit turns into something else.
const BQ = String.fromCharCode(96);

const quiet = () => process.exit(0);

// A reason, shortened at a WORD boundary. Cutting a filesystem error mid-word ("illegal operation on
// a dire") reads as a corrupted message rather than a shortened one, and a reader cannot tell which.
const clip = (t, n = 200) => {
  const s = String(t);
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut) + '…';
};

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
//
// TROUBLE IS RECORDED, NOT SWALLOWED. A git call that fails or times out returns '' — which is
// indistinguishable from "this repo has no branches", and deriving facts from that would write
// "branches: none" into a state.md about a feature that has three. So the failure sets a flag the
// caller reads with `hadTrouble()`, and a derivation whose inputs are unreliable is skipped and named
// rather than performed on a lie.
let GIT_TROUBLE = false;
const hadTrouble = () => { const t = GIT_TROUBLE; GIT_TROUBLE = false; return t; };
const git = (args, cwd) => {
  const left = msLeft();
  if (left <= 0) { GIT_TROUBLE = true; return ''; }         // the run's budget is spent; do not start
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: Math.min(GIT_TIMEOUT_MS, left), stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { GIT_TROUBLE = true; return ''; }
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

// ONE `for-each-ref` FOR EVERYTHING REF-SHAPED THIS HOOK NEEDS, and that is the whole reason the
// facts refresh costs no extra git process. It answers four questions at once:
//   · every local branch and its tip sha        -> the ctx `featureFacts` derives 'development' from
//   · every origin branch and its tip sha       -> the same, for a branch that exists only on origin
//   · `%(upstream:track)`                       -> local-only commits, VS LAST FETCH, no network
//   · how many remote-tracking refs exist       -> whether "no upstream" is news in this clone
// `%(upstream:track)` is computed from `refs/remotes/`, which is what this clone cached at its LAST
// FETCH. That is the only push position this hook will ever claim, and every sentence says so.
function readRefs(MAIN) {
  const out = git(['for-each-ref', '--format=%(refname)%09%(objectname)%09%(upstream:short)%09%(upstream:track,nobracket)', 'refs/heads', 'refs/remotes'], MAIN);
  const locals = [], remotes = [];
  let remoteRefs = 0;
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const [refname, sha, upstream, track] = line.replace(/\r$/, '').split('\t');
    if (refname.startsWith('refs/remotes/')) {
      remoteRefs++;
      if (refname.startsWith('refs/remotes/origin/')) {
        const name = refname.slice(20);
        if (name !== 'HEAD') remotes.push({ name, sha });
      }
      continue;
    }
    if (!refname.startsWith('refs/heads/')) continue;
    // BOTH HALVES OF THE TRACK STRING. `%(upstream:track,nobracket)` renders as `ahead 3`,
    // `behind 6`, or `ahead 3, behind 6`, and the second half used to be parsed and thrown away —
    // so a clone sitting behind its upstream produced silence from the one hook that reads this.
    const m = /(?:^|,\s*)ahead (\d+)/.exec(track || '');
    const mb = /(?:^|,\s*)behind (\d+)/.exec(track || '');
    locals.push({ name: refname.slice(11), sha, upstream: upstream || '', ahead: m ? m[1] : '', behind: mb ? mb[1] : '' });
  }
  return { locals, remotes, remoteRefs };
}

// Feature folders in a GIVEN checkout, filtered by the same NAME_RE session-end filters by — a folder
// that script REJECTS must not be one this hook silently accepts as a live builder.
// NARROW: an absent folder is the normal case and means "no features". Anything else — a permission
// error, a bad handle — must not be read as "no features", because that would silently switch the
// in-flight derivation off and start reporting live builders as a problem.
function featureFolders(root, R, readdirSync) {
  try {
    return new Set(readdirSync(join(root, R.WORK_REL), { withFileTypes: true })
      .filter((d) => d.isDirectory() && R.NAME_RE.test(d.name)).map((d) => d.name));
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return new Set();
    return null;                                          // unknown, and the caller treats it as such
  }
}

// The roadmap's DECLARED status per feature IN A GIVEN CHECKOUT, read out of the ledger block by the
// shared parser. A checkout's roadmap describes that checkout's commit, and reading main's roadmap to
// explain a worktree's dirt is exactly the contradiction this version exists to fix.
function declaredStatuses(root, R) {
  let text = '';
  try { text = readFileSync(join(root, R.ROADMAP_REL), 'utf8'); }
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

// ---------------------------------------------------------------------------- the memory

// WHERE THE MEMORY LIVES, AND WHY IT IS NOT IN THE TREE. A per-turn hook that wrote a tracked file to
// remember what it said would be a per-turn source of dirt in the tree it audits — the exact failure
// the first build was corrected for. `.git/` of the MAIN checkout is the natural home: it is
// per-clone, it is never tracked, it is never packaged, and every linked worktree of one clone shares
// one memory because they share one common dir. A linked worktree's `.git` is a FILE holding
// `gitdir: <path>`, so the file form is parsed rather than assumed — the main checkout's is a
// directory, but a caller may hand us either.
function gitCommonDir(MAIN) {
  const p = join(MAIN, '.git');
  try {
    if (statSync(p).isDirectory()) return p;
    const m = readFileSync(p, 'utf8').match(/^gitdir:\s*(.+)$/m);
    if (!m) return null;
    const g = m[1].trim();
    return isAbsolute(g) ? g : join(MAIN, g);
  } catch { return null; }
}

// A CORRUPT OR ABSENT MEMORY DEGRADES TO SPEAKING, NEVER TO CRASHING AND NEVER TO SILENCE. Reading it
// wrong must not cost a conductor a fact; the worst it can cost is one repeated line.
function readSnapshot(path) {
  const empty = { v: SNAPSHOT_V, facts: {}, feat: {} };
  if (!path) return empty;
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return empty; }
  let s = null;
  try { s = JSON.parse(raw); } catch { return empty; }
  if (!s || typeof s !== 'object' || s.v !== SNAPSHOT_V) return empty;
  return {
    v: SNAPSHOT_V,
    facts: s.facts && typeof s.facts === 'object' ? s.facts : {},
    feat: s.feat && typeof s.feat === 'object' ? s.feat : {},
  };
}

// ---------------------------------------------------------------------------- the refresh

// A LOCAL, CHANGE-ONLY FACTS REFRESH. Everything here is derived from git refs already read and from
// the filesystem. NO NETWORK CALL OF ANY KIND — there is no `ls-remote` and no `gh` in this file.
//
// WHAT IT WILL NOT DO, each one load-bearing and each one somebody else's job:
//   · no sweep of '## complete' into the archive          — a tidy with a human trigger: session-start
//   · no worktree removal, no branch deletion, no prune   — same
//   · no 'did this ship?' question, no fact-check         — session-start
//   · no state.md CREATED and no marker SCAFFOLDED        — session-end owns state.md's shape, and
//                                                           creating a file is not "making a true
//                                                           thing current"
//   · nothing written into any HUMAN region, ever         — byte splice, same as everywhere else
//
// AND IT WRITES ONLY WHAT DIFFERS. Every candidate is rendered with the provenance line and the
// timestamps HELD AT WHAT THE FILE ALREADY SAYS, so the comparison is against the FACTS and not
// against a clock. Identical facts produce identical bytes and no write at all — which is what makes
// this affordable once a turn.
//
// PER-FILE ISOLATION, AND IT IS NOT DEFENSIVE PROGRAMMING — IT IS A MEASURED DEFECT'S FIX. One
// unwritable state.md (a read-only attribute; a directory where the file should be) threw out of the
// middle of this loop. The roadmap write had ALREADY landed and was never announced; every feature
// alphabetically after the broken one was never refreshed; and the glance said nothing at all, that
// turn and every turn after. A refresh that can go three-quarters done and report silence is worse
// than one that does not run.
//   So: each file is its own attempt. A file that cannot be written is SKIPPED AND NAMED, the rest of
// the refresh proceeds, and everything already written is announced whatever happens afterwards. This
// function does not throw.
function refresh(MAIN, R, D, ctx) {
  const wrote = [];
  const feats = [];
  const skipped = [];
  const why1 = (e) => clip(e && e.message ? String(e.message).split('\n')[0] : String(e));
  // WHAT WAS WRITTEN, not merely WHICH FILE. The refresh line is change-keyed like everything else,
  // and keying it on the file list alone was measured to swallow a real second write: two turns that
  // each rewrote `roadmap.md` for two DIFFERENT reasons produced one identical key and the second
  // turn said nothing. Keying on the bytes cannot do that — a write only ever happens when the
  // content differs from disk, so every write carries a signature no earlier one had.
  const written = [];
  let features = [];
  try { features = D.listFeatures(MAIN).ok.map((n) => D.featureFacts(MAIN, n, ctx)); }
  catch (e) { return { wrote, feats, skipped: [{ what: `${R.WORK_REL}/`, why: why1(e) }], sig: '', ledgerState: 'ok' }; }

  // ---- the ledger. Hand-written lines are preserved byte-for-byte by `renderLedger` reading the
  // BYTE-EXACT body, and the placement ratchet is `placeFeatureRows` — session-start's own, imported
  // and not reimplemented, so a row is never moved DOWN the ladder and 'complete' stays sticky.
  const roadmapPath = join(MAIN, R.ROADMAP_REL);
  let ledgerState = 'ok';
  let placed = new Map();
  try {
    const rm = D.readSplit(roadmapPath, R.LEDGER_START, R.LEDGER_END);
    if (rm.blocked) skipped.push({ what: R.ROADMAP_REL, why: rm.blocked });
    if (rm.exists && rm.markers) {
      const ledger = R.parseLedger(rm.bodyBin);
      D.placeFeatureRows(ledger, features, D.archivedNames(MAIN));
      for (const f of features) if (f.place) placed.set(f.name, f.place);
      const body = D.renderLedger(ledger);
      if (body !== rm.bodyBin) { D.writeSplit(roadmapPath, rm, R.LEDGER_START, R.LEDGER_END, body); wrote.push(R.ROADMAP_REL); written.push(body); }
    } else {
      // No roadmap, or no markers: a scaffold is a decision and this hook makes none. The facts blocks
      // below still refresh — and they say the declared status is UNKNOWABLE rather than absent. The
      // old fallback called `declaredStatuses`, which needs the very markers that are missing, so it
      // could only ever return empty, and the block then flatly denied a feature the roadmap listed.
      ledgerState = rm.exists ? 'no-markers' : 'absent';
    }
  } catch (e) { skipped.push({ what: R.ROADMAP_REL, why: why1(e) }); }

  // ---- each feature's facts block, in session-end's format, with session-end's markers.
  const now = new Date().toISOString();
  for (const f of features) {
    // The declared status is `declaredLabel`'s to word, including the case where there are no ledger
    // markers and it is UNKNOWABLE. ONE copy, shared with session-end, or the two rewrite each other.
    const declared = D.declaredLabel(ledgerState !== 'absent', ledgerState === 'ok', placed.get(f.name));
    const moveSig = [f.derived, declared, f.docs.join(','), f.extra.join(','),
      f.branches.map((b) => `${b.name}@${b.sha}`).join(','), f.worktrees.map((w) => w.label).join(',')].join('|');
    // The fingerprint entry is pushed BEFORE the attempt and filled in as it succeeds, so a feature
    // whose file could not be read still moves its own baseline forward instead of vanishing.
    //   IT CARRIES THE TWO STATUSES AS WELL AS THE SIGNATURE. Both are already in hand right here,
    // and the nag needs them to tell a feature that MOVED from a feature that is FINISHED — which
    // `moveSig` cannot answer, because it hashes both statuses into one opaque string.
    const entry = { name: f.name, move: moveSig, human: '', state: false, derived: f.derived, declared };
    feats.push(entry);
    try {
      // A feature with no state.md, or one whose markers are absent or truncated, is SKIPPED SILENTLY.
      // Creating the file is session-end's `--new-feature`; inserting the markers is its
      // `--rescaffold`. Both are decisions, and a hook that made one silently would be the failure
      // this whole machinery is about. It is not an error, so it is not named as one.
      if (!f.hasState) continue;
      const split = D.readSplit(f.statePath, R.FACTS_START, R.FACTS_END);
      // AN UNREADABLE BOUNDARY IS NAMED, NOT SHRUGGED AT. A missing marker pair is a scaffolding
      // decision and stays silent; an UNCLOSED FENCE hiding the pair is a file this hook refuses to
      // touch and says so, through the same skip-and-name path an unwritable file uses.
      if (split.blocked) { skipped.push({ what: `${f.rel}/state.md`, why: split.blocked }); continue; }
      if (!split.exists || !split.markers) continue;

      const humanText = split.head + split.tail;
      const jsha = D.judgmentHash(humanText);
      entry.human = jsha; entry.state = true;

      const prev = D.readFactsCarrier(split.body);
      const prov = D.readProvenance(split.body);
      const decl = D.prDeclaration(humanText);
      const pr = decl ? decl.number : '';
      const shape = {
        name: f.name, rel: f.rel, docs: f.docs, extra: f.extra, derived: f.derived, declared,
        branches: f.branches, worktrees: f.worktrees, pr, prLine: decl ? decl.line : '',
        sessions: prev.sessions, judgmentSha: jsha,
      };
      // THE CANDIDATE: the same facts, rendered with the file's OWN provenance and the file's OWN
      // timestamps. If it matches the bytes on disk the facts have not moved and nothing is written —
      // which also means a session-end run's own block is never rewritten merely because a different
      // program's name is on one line of it.
      if (prov) {
        const candidate = D.renderFactsBody({
          ...shape,
          carrier: { at: prev.claimed.at, status: f.derived, branches: f.branches.map((b) => b.name), worktrees: f.worktrees.map((w) => w.label), pr },
          verifiedAt: prov.at, verifiedBy: prov.by, claim: prov.claim,
          judgmentAt: prev.judgmentAt,
        });
        if (candidate === split.body) continue;                  // nothing moved; not one byte written
      }
      const body = D.renderFactsBody({
        ...shape,
        carrier: { at: now, status: f.derived, branches: f.branches.map((b) => b.name), worktrees: f.worktrees.map((w) => w.label), pr },
        verifiedAt: now, verifiedBy: R.GLANCE_REL, claim: GLANCE_CLAIM,
        judgmentAt: prev.judgmentSha === jsha && prev.judgmentAt ? prev.judgmentAt : now,
      });
      // toBinary: the facts body is UTF-8 TEXT and writeSplit assembles BYTES around a human region
      // carried through as the bytes it actually is. See the splice note in lite-derive.mjs.
      D.writeSplit(f.statePath, split, R.FACTS_START, R.FACTS_END, D.toBinary(body));
      wrote.push(`${f.rel}/state.md`);
      written.push(body);
    } catch (e) {
      // NAMED AND SKIPPED, never fatal to the loop. The next feature is still refreshed, and whatever
      // was written before this one is still announced.
      skipped.push({ what: `${f.rel}/state.md`, why: why1(e) });
    }
  }
  return { wrote, feats, skipped, sig: D.judgmentHash(written.join(RS)), ledgerState };
}

// The provenance sentence the glance signs its own writes with. It must NOT claim to be session-end:
// a facts block records who wrote it, and a block that lies about that is the asserted-not-verified
// failure this machinery exists to catch, written into the machinery itself. session-end's next run
// rewrites the block whole and its own sentence comes back — nothing here is foreign to it.
const GLANCE_CLAIM = "Every line below is a command's output or a file that exists — re-derived locally at the end of a turn, with no network call. `node .claude/scripts/session-end.mjs` is the verifier and rewrites this block whole.";

// ---------------------------------------------------------------------------- the glance

function main(data, R, D) {
  const start = resolveCwd(process.env.CLAUDE_PROJECT_DIR || data.cwd);
  const cos = checkouts(start, R.posix);
  if (!cos.length) quiet();                               // git absent, or not a repo
  const MAIN = cos[0].path;
  if (!existsSync(join(MAIN, R.CONDUCTOR_REL))) quiet();  // not the lite layout — not this hook's business

  const linked = cos.slice(1);
  const refs = readRefs(MAIN);
  // If THAT call failed or was cut off, `refs` is empty and every derivation below it would assert
  // "no branches" about features that have them. The refresh is skipped and named instead.
  const refsBad = hadTrouble();

  // A keyed fact speaks only when its SIGNATURE changes. `persist` marks the ones whose going away is
  // itself news worth one line; a nag and a refresh are events, not conditions, and clear silently.
  //
  // AND A FACT THAT LEAVES THE SET IS NOT AUTOMATICALLY RESOLVED. This is the correction to a line
  // that was measured LYING. `git worktree remove` took a branch out of the set this hook was looking
  // at; the key vanished; and the glance printed "CLEARED - branch(es) with no upstream is no longer
  // true" about a branch that still existed, still had no upstream, and held the only copy of a
  // builder's commit. Scope-exclusion had been rendered as resolution.
  //   So a key can leave the live set in exactly two ways, and they are recorded separately:
  //     resolved   the condition was RE-EVALUATED this turn and came out false. Only this says CLEARED.
  //     untracked  the subject is not here to evaluate, or this hook stopped looking at it. This says
  //                NO LONGER TRACKED, and says in the same line that nothing was re-checked.
  //   A key in neither is treated as untracked with the generic reason. Absence of evidence is never
  //   reported as evidence of absence.
  const facts = [];
  const resolved = new Set();          // re-evaluated this turn, and false
  const untracked = new Map();         // key -> why this hook can no longer answer for it
  let truncated = 0;                   // worktrees the run's time budget did not reach
  const say = (key, sig, text, label, persist) => facts.push({ key, sig, text, label, persist: !!persist });
  const inFlight = new Set();

  // ---- worktrees. Folder existence and dirt are now read from THE SAME CHECKOUT.
  if (linked.length) {
    const foldersMain = featureFolders(MAIN, R, D.readdirSync);
    const declaredMain = declaredStatuses(MAIN, R);
    const allow = allowGlobs(MAIN, R);
    const declaredCache = new Map();
    const declaredIn = (root) => { if (!declaredCache.has(root)) declaredCache.set(root, declaredStatuses(root, R)); return declaredCache.get(root); };

    for (const co of linked) {
      // THE BUDGET IS CHECKED BEFORE THE CALL, not after: a worktree we never looked at is reported
      // as not looked at, and is never confused with one that came back clean.
      if (msLeft() <= 0) { truncated++; continue; }
      co.feature = R.featureNameOf(co.path, MAIN);
      // THE FIX. `folderHere` is the worktree's OWN checkout — the same tree the porcelain below
      // comes from. A feature committed on its branch and not yet on main exists HERE and not THERE,
      // which is a normal mid-flight state; the old code read only THERE and called it an orphan
      // while quoting a file from HERE in the same sentence.
      const folderHere = existsSync(join(co.path, R.WORK_REL, co.feature));
      const folderMain = foldersMain ? foldersMain.has(co.feature) : false;
      let dstat = declaredMain.get(co.feature);
      if (dstat === undefined && folderHere) dstat = declaredIn(co.path).get(co.feature);
      const state = R.inFlightState(folderHere || folderMain, dstat);
      if (state === 'in-flight') inFlight.add(co.path);

      const label = co.path.toLowerCase().startsWith(MAIN.toLowerCase() + '/') ? co.path.slice(MAIN.length + 1) : co.path;
      const fields = git(['status', '--porcelain', '-z'], co.path).split('\0').filter((f) => f !== '');
      const dirty = [];
      let flew = 0;
      let covered = 0;
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const xy = f.slice(0, 2);
        const path = R.posix(f.slice(3));
        if (xy[0] === 'R' || xy[0] === 'C') i++;           // the rename/copy source field
        if (state === 'in-flight') { flew++; continue; }
        if (allow.some((a) => a.re.test(path))) { covered++; continue; }
        dirty.push(`${xy} ${path}`);
      }
      if (flew) say('inflight:' + label, String(flew),
        BQ + label + BQ + ' is in flight (' + co.feature + ' is under ' + BQ + '## development' + BQ + ') and holds ' + flew + ' uncommitted file(s), on this machine only.',
        BQ + label + BQ + ' in flight with uncommitted files', true);
      else resolved.add('inflight:' + label);
      if (covered) say('allowed:' + label, String(covered),
        covered + ' uncommitted file(s) in ' + BQ + label + BQ + ' are matched by a glob in ' + R.ALLOW_REL + '.',
        covered + ' file(s) covered by ' + R.ALLOW_REL, true);
      else resolved.add('allowed:' + label);
      // WHY THIS WORKTREE IS NOT BEING REPORTED MATTERS AS MUCH AS THAT IT IS NOT. Clean is
      // resolution; "covered by the in-flight declaration" is not — the files are still uncommitted,
      // something merely started accounting for them.
      if (!dirty.length && !flew) resolved.add('dirty:' + label);
      else if (!dirty.length && flew) untracked.set('dirty:' + label, 'that worktree still holds ' + flew + ' uncommitted file(s); they are now accounted for by the in-flight declaration rather than committed');
      if (dirty.length) {
        const branchOnly = folderHere && !folderMain;
        const why = branchOnly
          ? R.WORK_REL + '/' + co.feature + '/ is in this worktree' + String.fromCharCode(39) + 's own checkout' + (co.branch ? ' on ' + BQ + co.branch + BQ : '') + ', not on main'
          : (state === 'no-folder'
            ? 'no ' + R.WORK_REL + '/' + co.feature + '/ in the main checkout or in this one'
            : R.ROADMAP_REL + ' has ' + co.feature + ' under ' + BQ + '## ' + (dstat || 'no row') + BQ + ', not ' + BQ + '## development' + BQ);
        const list = dirty.slice(0, MAX_LISTED).map((d) => BQ + d + BQ).join(', ') + (dirty.length > MAX_LISTED ? ' and ' + (dirty.length - MAX_LISTED) + ' more' : '');
        say('dirty:' + label, dirty.length + '|' + why + '|' + list,
          dirty.length + ' uncommitted file(s) in ' + BQ + label + BQ + ', unaccounted for (' + why + '): ' + list + '. cd ' + co.path + ' && git add -A && git commit',
          'uncommitted work in ' + BQ + label + BQ, true);
      }
    }
  }

  // ---- push position, from the CACHED tracking refs. No network: read from refs/remotes/, which is
  // what this clone saw at its last fetch. Everything below therefore says "vs last fetch".
  //
  // EVERY LOCAL BRANCH, WITHOUT EXCEPTION. This is the hook's flagship purpose - work that exists on
  // one machine and nowhere else - and it had NO COVERAGE AT ALL on the workflow this framework
  // itself prescribes. A declared feature, with a worktree, with a commit that was never pushed,
  // produced silence: the branch has no upstream (so it is not "ahead" of anything), and the
  // no-upstream line was filtered to branches CHECKED OUT SOMEWHERE and NOT IN FLIGHT - which
  // excluded it while the worktree lived, and excluded it again as un-checked-out once the worktree
  // was removed. Two different exclusions, one blind spot, covering the entire sanctioned path.
  //   IN-FLIGHT NOW SOFTENS THE WORDING AND NEVER THE EXISTENCE. A live builder's branch is expected
  // to be unpushed. That is a reason to say it gently; it is not a reason not to say it.
  const inFlightBranches = new Set(cos.filter((c) => c.branch && inFlight.has(c.path)).map((c) => c.branch));
  // BEHIND IS COLLECTED HERE AND SPOKEN LATER, after the refresh has run, because the sentence names
  // the files THIS TURN's refresh wrote and that list does not exist yet at this point in the run.
  const behind = [];
  for (const b of refs.locals) {
    if (b.ahead) {
      say('ahead:' + b.name, b.ahead + '|' + b.upstream,
        BQ + b.name + BQ + ' is ' + b.ahead + ' commit(s) ahead of ' + BQ + b.upstream + BQ + ', vs last fetch. git push',
        BQ + b.name + BQ + ' ahead of ' + BQ + b.upstream + BQ, true);
    } else {
      resolved.add('ahead:' + b.name);                   // the branch is here, and it is not ahead
    }
    if (b.behind) behind.push(b);
    else resolved.add('behind:' + b.name);               // the branch is here, and it is not behind
    const key = 'noupstream:' + b.name;
    if (b.upstream) { resolved.add(key); continue; }     // it has one: re-evaluated, and false
    if (!refs.remoteRefs) {
      untracked.set(key, 'this clone holds no remote-tracking refs at all, so "has it reached origin" is not a question anything local can answer');
      continue;
    }
    // THE TIP IS PART OF THE SIGNATURE, so every commit onto an unpushed branch restates it once.
    // Keying on the branch NAME alone said it when the branch was created — when there was nothing on
    // it yet to lose — and then went quiet for exactly the window in which the work accumulates. The
    // fact this hook exists for is "these bytes are on one machine", and that fact gets bigger with
    // every commit, so it is a different fact and it is said again.
    const flying = inFlightBranches.has(b.name);
    say(key, (flying ? 'inflight|' : 'plain|') + b.sha,
      BQ + b.name + BQ + ' @ ' + BQ + b.sha.slice(0, 8) + BQ + ' has no upstream'
        + (flying ? ' (in flight)' : '') + '; nothing on it has reached origin. git push -u origin ' + b.name,
      BQ + b.name + BQ + ' has no upstream', true);
  }

  if (truncated) {
    say('truncated', String(truncated),
      'glance truncated: git slow or hung, ' + truncated + ' worktree(s) not checked this turn.',
      'a truncated glance', true);
  } else {
    resolved.add('truncated');
  }

  // ---- the refresh. Wrapped, because losing it must not lose the facts above: a permission error or
  // a named E_* from a derivation means nothing was written, and the risks still get said.
  let ref = { wrote: [], feats: [], skipped: [], sig: '', ledgerState: 'ok' };
  if (refsBad) {
    ref.skipped.push({ what: 'every facts block', why: 'git refs could not be read this turn (slow, hung or failed), so the derived facts would have been wrong' });
  } else try {
    ref = refresh(MAIN, R, D, {
      locals: refs.locals,
      remotes: refs.remotes,
      worktrees: linked.map((c) => ({
        path: c.path,
        name: R.featureNameOf(c.path, MAIN),
        label: c.path.toLowerCase().startsWith(MAIN.toLowerCase() + '/') ? c.path.slice(MAIN.length + 1) : c.path,
        layout: R.worktreeLayout(MAIN, c.path),
      })),
    });
  } catch (e) {
    // `refresh` isolates every file and does not throw, so this catch is for a fault ABOVE it - a
    // mistake in this call, a broken derive module. It must never take the facts above down with it.
    ref = { wrote: [], feats: [], skipped: [{ what: 'the refresh itself', why: clip(e && e.message ? String(e.message).split('\n')[0] : String(e)) }], sig: '', ledgerState: 'ok' };
  }

  if (ref.wrote.length) {
    say('refresh', `${ref.wrote.join(',')}|${ref.sig}`,
      'Updated state recorded: ' + ref.wrote.map((w) => BQ + w + BQ).join(', '),
      'state refresh', false);
  }
  // A FILE THAT COULD NOT BE WRITTEN IS SAID OUT LOUD. Persistent, not an event: it stays true until
  // the file becomes writable, and it clears HONESTLY, because the next turn re-evaluates it by
  // trying again. Silence here used to mean "nothing to do"; it once meant "three-quarters done".
  if (ref.skipped.length) {
    say('refresh-blocked', ref.skipped.map((k) => k.what + ':' + k.why).join('|'),
      'State NOT recorded for ' + ref.skipped.length + ' file(s); the rest was: '
      + ref.skipped.slice(0, MAX_LISTED).map((k) => BQ + k.what + BQ + ' (' + k.why + ')').join('; '),
      'file(s) the refresh could not write', true);
  } else {
    resolved.add('refresh-blocked');                       // tried again this turn, and it worked
  }

  // ---- BEHIND ITS UPSTREAM, from the same cached tracking refs the `ahead` lines above are read
  // from. Same source, same staleness, same "vs last fetch" ending, and NO FETCH: this hook has never
  // touched the network and this line does not start.
  //
  // WHY IT NAMES THIS TURN'S WRITES. `state.md` and `roadmap.md` are generated locally every turn AND
  // tracked in git, so the refresh above routinely leaves a modified file that `git pull --ff-only`
  // refuses to overwrite — measured on 2026-08-14: the pull exits 1, prints `Updating <a>..<b>` to
  // stdout and the abort to stderr, HEAD does not move, and nothing says so again. Naming the files
  // changes the reader's remedy from "resolve a conflict" to "discard a machine-written block", which
  // is what both field incidents actually did. ONLY the files this run wrote are named: `ref.wrote` is
  // that run's own list, and no other dirt in the tree is claimed or implied.
  //
  // IT REPORTS AND STOPS. Nothing here stashes, discards, checks out, pulls or fetches — CONDUCTOR.md,
  // "it informs, it never blocks and it never decides". The file it would be discarding to unblock a
  // pull carries the human region this machinery exists to protect.
  for (const b of behind) {
    // IT CLAIMS THE BLOCK, NEVER THE FILE. The clause used to end "so discarding those changes loses
    // nothing the next glance does not write again", and "those changes" reads as the named files'
    // whole working-tree diff — which this hook has NOT observed. The human region (Decisions, Issues,
    // Acceptance criteria) lives in the SAME file, outside the facts markers, and a reader who follows
    // that to `git checkout -- <file>` loses their own uncommitted judgment. It is not a corner case:
    // the facts block is rewritten precisely BECAUSE the judgment hash moved, so the sentence is
    // likeliest on exactly the turns where a discard destroys something. A generated row names what it
    // found and never asserts a wider absence, so the claim is scoped to the bytes between the markers
    // — the only thing this run rendered and compared — and the rest of the diff is left to its owner.
    const regen = ref.wrote.length
      ? ' This turn the glance rewrote ' + ref.wrote.slice(0, MAX_LISTED).map((w) => BQ + w + BQ).join(', ')
        + (ref.wrote.length > MAX_LISTED ? ' and ' + (ref.wrote.length - MAX_LISTED) + ' more' : '')
        + '; in each, only the machine-written block between the facts markers changed, and the next'
        + ' glance regenerates that block identically; the rest of the diff in those files is human'
        + ' region this hook has not characterised.'
      : '';
    // THE SIGNATURE IS THE COUNT AND THE UPSTREAM, AND DELIBERATELY NOT THE WROTE-LIST. Keying on
    // what was written too was measured restating the same count on the very next turn, because the
    // turn after a write writes nothing and the key therefore "moved" without the fact moving. The
    // news is the count; which files are in the way is context on the turn it is said, and the
    // refresh line names every write on its own account anyway.
    say('behind:' + b.name, b.behind + '|' + b.upstream,
      BQ + b.name + BQ + ' is ' + b.behind + ' commit(s) behind ' + BQ + b.upstream + BQ + ', vs last fetch. git pull --ff-only' + regen,
      BQ + b.name + BQ + ' behind ' + BQ + b.upstream + BQ, true);
  }

  // ---- the human-region nag. The machine detects; the conductor writes; the owner is never asked.
  //
  // TWO GUARDS, AND EACH ONE ALONE LEAVES A REAL HOLE, so both. Measured in the field on 2026-08-14:
  // ONE bookjob turn emitted TWELVE of these lines, every one true and every one useless — all twelve
  // were already-complete features whose roadmap rows had just been swept, so the decision the line
  // asks for could not exist for any of them, and twelve lines is the wallpaper this file's header
  // names by name.
  //
  //   A FINISHED FEATURE IS NEVER NAGGED. `derived` OR `declared` reading 'complete' is enough, and
  // the OR is the forgiving direction ON PURPOSE: requiring both keeps nagging a feature the owner
  // ruled complete until the tree agrees, which is precisely the state a merged-and-deleted branch
  // leaves behind. The cost of being wrong in this direction is one missed nag on a feature that is
  // finished anyway. (`declared` is the arm that fires today: 'complete' is the one rung no machine
  // ever assigns, so `featureFacts` cannot derive it — see its comment. The derived arm is here
  // because the guard is about the STATUS and not about which reader produced it.)
  //   AND THERE IS A CEILING. Past NAG_BULK_MIN in one turn the count is said ONCE and no feature is
  // named: the names are the least useful part in bulk, because the reader's next step is the same
  // for every one of them. The count is kept rather than the whole thing suppressed, so a bulk event
  // that coincides with genuine unrecorded decisions still leaves one line saying how many.
  const snapPath = (() => { const g = gitCommonDir(MAIN); return g ? join(g, R.GLANCE_SNAPSHOT) : null; })();
  const snap = readSnapshot(snapPath);
  const feat = {};
  const nagging = [];
  for (const f of ref.feats) {
    feat[f.name] = { m: f.move, h: f.human };
    const was = snap.feat[f.name];
    if (!was || !f.state) continue;                        // no baseline, or no state.md to have judgment in
    if (was.m === f.move) continue;                        // it did not move this turn
    if (was.h !== f.human) continue;                       // the human region moved too — nothing to say
    if (f.derived === 'complete' || f.declared === 'complete') continue;   // finished: no decision is owed
    nagging.push(f);
  }
  if (nagging.length >= NAG_BULK_MIN) {
    // ONE KEY, AND IT CANNOT COLLIDE WITH A FEATURE'S: the per-feature keys are `nag:<name>` and a
    // feature name can never contain the ':' that puts it there, so 'nag-bulk' is outside that space
    // whatever anyone calls a folder.
    //   THE SIGNATURE IS THE COUNT, AND DELIBERATELY NOT THE NAMES. A signature must be a function of
    // what the line SAYS — the same rule the behind line records paying for. The names are not in
    // this sentence, so keying on them would restate a sentence the reader has already read, which is
    // the failure this whole file is built against. The consequence is stated rather than hidden: a
    // different set of features at the same count is silent that turn.
    say('nag-bulk', String(nagging.length),
      nagging.length + ' features moved this turn; their Decisions/Issues did not. Not named individually: at '
        + NAG_BULK_MIN + ' or more, this is one line with the count.',
      'nag for ' + nagging.length + ' features', false);
  } else {
    for (const f of nagging) {
      say(`nag:${f.name}`, `${f.move}|${f.human}`,
        `${f.name} moved this turn; its Decisions/Issues did not.`, `nag for ${f.name}`, false);
    }
  }

  // ---- SPEAK ONLY WHAT CHANGED.
  const lines = [];
  for (const f of facts) {
    const was = snap.facts[f.key];
    if (Array.isArray(was) && was[0] === f.sig) continue;
    lines.push(f.text);
  }
  const live = new Set(facts.map((f) => f.key));
  for (const [key, was] of Object.entries(snap.facts)) {
    if (live.has(key)) continue;
    if (!Array.isArray(was) || !was[2]) continue;          // only a persistent condition clears out loud
    if (resolved.has(key)) { lines.push('CLEARED: ' + was[1] + ' - re-checked, now false.'); continue; }
    lines.push('NOT TRACKED: ' + was[1] + ' - ' + (untracked.get(key) || 'its subject is no longer in this clone') + '. NOT re-checked, and not resolved.');
  }

  // The memory is written whether or not anything is said: a fact that stayed the same still has to
  // be remembered as the same, and a feature's fingerprint has to move forward even on a silent turn.
  // Its own failure is swallowed on purpose — a hook that could not remember must still be able to
  // speak, and the cost of forgetting is one repeated line, never a lost fact.
  const next = { v: SNAPSHOT_V, at: new Date().toISOString(), facts: {}, feat };
  for (const f of facts) next.facts[f.key] = [f.sig, f.label, f.persist];
  if (snapPath) { try { D.writeAtomic(snapPath, JSON.stringify(next)); } catch { /* remembering is best-effort */ } }

  if (!lines.length) quiet();                              // NOTHING CHANGED — the loudest thing this hook does

  // A SOURCE TAG AND THE FACTS. Nothing else. OWNER RULING, 2026-08-13, on reading a live emission:
  // the preamble was "almost entirely waste", the refresh paragraph over-explained, and the silence
  // note and the end-of-session reminder both addressed a reader who needed neither. A line of this
  // output is a FACT or it is not printed. Everything that used to be said here every turn - what
  // silence means, that nothing blocks, that no network call was made, that human regions are spliced
  // around byte-for-byte, that nothing is swept or moved down the ladder - is in this file's header,
  // stated once, for the maintainer who needs it rather than the conductor who does not.
  //   The tag stays so a multi-hook setup can attribute the lines. It is one word.
  const text = 'conducted-lite:\n' + lines.map((r) => `  · ${r}`).join('\n');

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
  // Rules and derivations first, and a rejection is silence — see the header: a broken or absent
  // module must cost this turn nothing at all, which a static import could not promise.
  Promise.all([import(RULES_URL), import(DERIVE_URL)])
    .then(([R, D]) => { try { main(data, R, D); } catch { quiet(); } }, quiet);
});
