#!/usr/bin/env node
// conducted-lite migrate-from-full — move a repo off FULL conducted (v11 … v12.2) onto lite.
//
//   node <this>/.claude/scripts/migrate-from-full.mjs --repo /path/to/their/repo            (DRY RUN)
//   node <this>/.claude/scripts/migrate-from-full.mjs --repo /path/to/their/repo --apply
//
// WHO RUNS THIS AND WHY EVERY LINE IS SHAPED THAT WAY. It is run by somebody else's agent, on
// somebody else's machine, on a repo that works fine today, and nobody who wrote it will see what
// happened. So the properties below are not preferences, they are the whole design:
//
//   NEVER DELETE, NEVER OVERWRITE — every move is `git mv`, so history follows the file. Anything
//   lite has no concept for is MOVED to .conducted/archive/<path>, never dropped. Every install
//   target that already exists is archived before the new one is written.
//
//   NEVER MERGE, NEVER PUSH — it works on a NEW branch and stops. It does not push and it does not
//   open a PR even when `gh` is sitting there: a network write to a stranger's origin is the one
//   side effect nobody local can undo. The exact commands are PRINTED instead, and the human runs
//   them.
//
//   PREFLIGHT REFUSES RATHER THAN PROCEEDS — a dirty tree, an unidentifiable version, a missing
//   .conducted/, node work it cannot safely map, a target branch that already exists: each is a
//   NAMED E_* error raised before ANYTHING has changed.
//
//   ONE COMMIT — the whole migration is a single commit on a fresh branch, so `git revert` puts the
//   old world back exactly. Running it twice refuses (the branch exists, and .conducted/CONDUCTOR.md
//   exists), so nothing can double-move.
//
//   DRY RUN IS THE DEFAULT — `--apply` is required to change a byte.
//
//   IT NEVER GUESSES. Where the shape it is handed is not the shape it knows — an unrecognised root
//   CLAUDE.md, an unparseable settings.json, a gates.yml that is not the seed's — it does the
//   NON-DESTRUCTIVE thing (archive the whole file, or change nothing) and says so loudly in the
//   report. A migrator that guesses on a repo nobody is watching is the failure mode this whole file
//   is built against.
//
// The git faces, the marker splice I/O, the feature derivation and the ladder all come from
// lite-core.mjs — the same machinery session-start and session-end run on, so a repo this script
// produces is a repo those two already understand. lite-core binds its REPO at module load from
// CLAUDE_PROJECT_DIR, so the target repo is resolved FIRST and the import is dynamic.
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmdirSync } from 'node:fs';

const HELP = `conducted-lite migrate-from-full — move a repo off FULL conducted onto conducted-lite.

THE WHOLE RUNBOOK, in four commands. Do not improvise around them; this script is the tested part.

  git clone --depth 1 https://github.com/shobman/conducted-lite.git /tmp/conducted-lite
  node /tmp/conducted-lite/.claude/scripts/migrate-from-full.mjs --repo <THE REPO>
      ^ that is the DRY RUN. It changes nothing. Read what it says it would do.
  node /tmp/conducted-lite/.claude/scripts/migrate-from-full.mjs --repo <THE REPO> --apply
  # then paste .conducted/archive/MIGRATION-REPORT.md back to whoever asked

It installs lite's files FROM the checkout it is run out of, so it must be run by path from one.
If it refuses, it will say exactly why and it will have changed nothing: read the E_* line, fix the
one thing it names, run it again. Do not work around a refusal by hand.

  node .claude/scripts/migrate-from-full.mjs [--repo <path>] [--apply] [--branch <name>]

  --repo <path>    the repo to migrate. Default: the current directory. This script lives in the
                   conducted-lite tree and reads its payload from there, so it is normally run by
                   absolute path from a checkout of conducted-lite.
  --apply          actually do it. WITHOUT THIS NOTHING IS WRITTEN — the default is a dry run that
                   prints the complete plan and the report it would write.
  --branch <name>  the branch to create. Default: conducted-lite-migration.
  --help           this text.

WHAT IT DOES (all of it in ONE commit on a NEW branch; it never merges and never pushes):
  .conducted/VISION.md                       stays exactly where it is. It heads the chain in lite too.
  .conducted/work/<node>/                 -> .conducted/work/<feature>/   (node path below work/, '/'->'-')
                                             brief/plan/showcase/code-review/evaluations and
                                             everything else in the node come along untouched.
  .conducted/work/<node>/status.json      -> archived, after its phase / evaluator verdict / DoD
                                             clauses are carried into the feature's state.md as
                                             CLAIMS in the human region.
  ROADMAP · DECISIONS · BOT · CONSOLIDATION
  ledger · wake · findings · field-notes
  audits · ideas · feedback · visions
  templates · scripts · engine · hooks    -> .conducted/archive/<path>   (moved, never deleted)
  root CLAUDE.md                             the conducted doctrine BLOCK is replaced by lite's
                                             pointer; everything the maintainers wrote is kept. If
                                             the block cannot be identified with certainty the WHOLE
                                             file is archived and the report says so in capitals.
  .claude/settings.json                      lite's four hooks merged in — SessionStart, Stop,
                                             SessionEnd, PreToolUse; the full hooks (auth-preflight,
                                             automerge-arm, status-guard, conducted-session-end)
                                             removed. Nothing else touched. NONE of lite's hooks can
                                             block a session.
  .github/workflows/gates.yml                the 'gates' job is KEPT (secret scan, tests, lint are
                                             worth having whatever doctrine you run); the
                                             'bookkeeping-merge' job and the steps that read
                                             archived conducted machinery are removed.
  then installs                              CONDUCTOR.md, standards.md, roadmap.md, archive.md,
                                             work/README.md, example.md, .claude/scripts/,
                                             .claude/hooks/.
  and REPORTS, never edits                   any tracked config that globs the tree — vite/vitest/
                                             jest, tsconfig include, eslint, c8/nyc — with no
                                             \`worktrees\` exclusion. Lite puts worktrees INSIDE the
                                             repo, gitignored, and gitignored hides them from git and
                                             from nothing else. It is a to-do in the report.

WHAT IT WILL NOT DO, EVER: split a brief into problem/solution · distil a DECISIONS ruling into a
standard · give a roadmap row a real status · merge · push · delete. Those are judgements, and the
report hands each of them to a human as a numbered to-do.

EXIT: 0 on a clean dry run or a clean apply. Nonzero with a NAMED E_* error, having changed NOTHING.`;

// ---------------------------------------------------------------------------- args (before any import that binds a repo)

function parseArgv(argv) {
  const flags = {}; const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { positional.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > -1) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { flags[a.slice(2)] = true; continue; }
    flags[a.slice(2)] = next; i++;
  }
  return { flags, positional };
}

const { flags, positional } = parseArgv(process.argv.slice(2));
if (flags.help) { process.stdout.write(HELP + '\n'); process.exit(0); }

const ALLOWED = ['repo', 'apply', 'branch', 'help'];
const badFlags = Object.keys(flags).filter((k) => !ALLOWED.includes(k));

const die = (code, msg) => { process.stderr.write(`${code}: ${msg}\nNOTHING WAS CHANGED.\n`); process.exit(1); };

if (badFlags.length) die('E_BAD_FLAG', `unknown flag(s): ${badFlags.map((b) => '--' + b).join(', ')} — legal: ${ALLOWED.map((a) => '--' + a).join(', ')}`);
if (positional.length) die('E_USAGE', `this script takes no positional arguments (got: ${positional.join(' ')}) — see --help`);
if (flags.repo === true) die('E_USAGE', '--repo needs a value: --repo <path-to-the-repo-being-migrated>');
if (flags.branch === true) die('E_USAGE', '--branch needs a value: --branch <name>');

const APPLY = flags.apply === true;
const BRANCH = typeof flags.branch === 'string' && flags.branch.trim() ? flags.branch.trim() : 'conducted-lite-migration';
if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(BRANCH) || BRANCH.endsWith('/') || BRANCH.includes('..')) {
  die('E_BAD_BRANCH', `'${BRANCH}' is not a branch name this script will create — use [A-Za-z0-9][A-Za-z0-9._/-]*`);
}

// Native path, whether the caller handed us C:/x, C:\x or Git-Bash's /c/x.
function nativePath(p) {
  let s = String(p);
  const m = s.match(/^\/([a-zA-Z])\/(.*)$/);
  if (m) s = m[1].toUpperCase() + ':/' + m[2];
  return s;
}
const TARGET_ARG = typeof flags.repo === 'string' ? nativePath(flags.repo) : process.cwd();
if (!existsSync(TARGET_ARG)) die('E_NO_SUCH_REPO', `--repo ${TARGET_ARG} does not exist`);

// lite-core reads CLAUDE_PROJECT_DIR at module load. Set it BEFORE the dynamic import so every git
// face in it, and every derivation built on those faces, points at the repo being migrated.
process.env.CLAUDE_PROJECT_DIR = TARGET_ARG;

const HERE = dirname(fileURLToPath(import.meta.url));
const PAYLOAD = resolve(HERE, '..', '..');                     // the conducted-lite tree this script ships in
if (!existsSync(join(PAYLOAD, '.conducted', 'CONDUCTOR.md'))) {
  die('E_PAYLOAD_MISSING', `${PAYLOAD} does not look like a conducted-lite tree (no .conducted/CONDUCTOR.md). This script installs lite's files FROM its own checkout; run it by path out of one.`);
}

const core = await import('./lite-core.mjs');
const {
  posix, gitq, gitOut, gitRaw, checkouts, scanContext, featureFacts, judgmentHash, sanitize,
  b64, renderLedger, missing, onlyBadJson, worktreeGlobScan, STATUSES, NAME_RE, DOCS, EXTRA_DOCS,
  FACTS_START, FACTS_END, LEDGER_START, LEDGER_END, ROADMAP_HEAD, stateHead,
} = core;

// ---------------------------------------------------------------------------- constants

const CONDUCTED = '.conducted';
const ARCHIVE_DIR = `${CONDUCTED}/archive`;
const REPORT_REL = `${ARCHIVE_DIR}/MIGRATION-REPORT.md`;
const WORK_REL = `${CONDUCTED}/work`;
const DOCTRINE_BLOCK_REL = `${ARCHIVE_DIR}/CLAUDE.md.doctrine-block.md`;

// Everything full conducted puts under .conducted/ that lite has no concept for. Every one of these
// is MOVED to the archive, and the catch-all below sweeps anything not on the list, so a version
// that invented a folder we have never seen still loses nothing.
const ARCHIVE_NAMES = [
  'ROADMAP.md', 'DECISIONS.md', 'BOT.md', 'CONSOLIDATION.md',
  'ledger', 'wake', 'findings', 'field-notes', 'audits', 'ideas', 'feedback', 'visions',
  'templates', 'scripts', 'engine', 'hooks',
];
const KEEP_NAMES = ['VISION.md', 'work'];

// Installed verbatim out of this script's own conducted-lite tree.
const INSTALL = [
  '.conducted/CONDUCTOR.md',
  '.conducted/standards.md',
  '.conducted/archive.md',
  '.conducted/example.md',
  '.conducted/work/README.md',
  '.claude/scripts/lite-rules.mjs',
  // lite-derive.mjs is NOT optional and NOT new-in-name-only: the per-turn Stop glance imports it
  // directly (it holds every derivation the glance and the scripts must agree on byte-for-byte), so
  // a repo migrated without it gets a hook that silently exits 0 on every turn — the failure mode
  // that looks exactly like "nothing to report". Added 2026-08-13 with the file.
  '.claude/scripts/lite-derive.mjs',
  '.claude/scripts/lite-core.mjs',
  '.claude/scripts/session-start.mjs',
  '.claude/scripts/session-end.mjs',
  '.claude/hooks/session-start-factcheck.mjs',
  '.claude/hooks/stop-glance.mjs',
  '.claude/hooks/session-end-record.mjs',
  '.claude/hooks/conductor-guard.mjs',
];

// The full-conducted hooks. Lite has no bot mode, no status.json and its own hook set, so a
// settings.json entry pointing at any of these is dead the moment .conducted/hooks/ is archived.
const FULL_HOOK_MARKERS = [
  'conducted-auth-preflight',
  'conducted-automerge-arm',
  'conducted-status-guard',
  'conducted-session-end',
];

// gates.yml steps that read machinery this migration archives. Matched on the seed's exact literals;
// a step whose name is not one of these is the maintainers' and is never touched.
const GATE_STEPS_TO_DROP = [
  'Territory manifest check',
  'Leftover template placeholders',
  'Bot-mode commit authorship (identity law)',
];

const now = new Date().toISOString();

// ---------------------------------------------------------------------------- git, always against the target

const MAIN = posix(gitq(['rev-parse', '--show-toplevel'], TARGET_ARG) || '');
if (!MAIN) die('E_NOT_A_REPO', `${posix(TARGET_ARG)} is not inside a git repository (or git is not on PATH). This migration is entirely git moves; without git there is nothing safe it can do.`);

const g = (args) => gitq(args, MAIN);
const gOut = (args) => gitOut(args, { cwd: MAIN });
const T = (rel) => resolve(MAIN, rel);
const readT = (rel) => readFileSync(T(rel), 'utf8');
const hasT = (rel) => existsSync(T(rel));

// ---------------------------------------------------------------------------- PREFLIGHT
// Every check below is a READ. Nothing in this section may write, and the first failure exits with a
// named error while the repo is still untouched.

const refuse = (code, msg) => die(code, msg);

// --- the main checkout. A migration run from inside a linked worktree would `git mv` files the
// worktree does not own and leave the estate half-moved.
const cos = checkouts();
if (posix(cos.main).toLowerCase() !== MAIN.toLowerCase()) {
  refuse('E_NOT_MAIN_CHECKOUT', `${MAIN} is a linked worktree; the main checkout is ${cos.main}. Run the migration there — .conducted/ lives in the main checkout and a half-moved estate is exactly what this script exists to prevent.`);
}

// --- clean, everywhere. Uncommitted work is work that exists in no commit, so a migration commit
// would either swallow it or strand it. Both are unacceptable, so neither is attempted.
const dirtyReport = [];
for (const co of cos.all) {
  const out = gitRaw(['status', '--porcelain'], co.path).replace(/\s+$/, '');
  if (out) dirtyReport.push(`${co.label} (${co.path}):\n${out.split('\n').map((l) => '    ' + l).join('\n')}`);
}
if (dirtyReport.length) {
  refuse('E_DIRTY_TREE', `the working tree is not clean, so this migration will not start. Commit or stash first — every byte below exists in no commit, and a migration that swallowed it could not be reverted.\n  ${dirtyReport.join('\n  ')}`);
}

// --- is this even a full-conducted repo?
if (!hasT(CONDUCTED)) refuse('E_NO_CONDUCTED', `there is no ${CONDUCTED}/ directory in ${MAIN}. This script migrates a repo that is already running full conducted; there is nothing here to migrate.`);
if (hasT(`${CONDUCTED}/CONDUCTOR.md`)) refuse('E_ALREADY_LITE', `${CONDUCTED}/CONDUCTOR.md already exists, so this repo is already on conducted-lite (or a migration already ran). Nothing to do — and this script never overwrites a file it did not write.`);
if (hasT(ARCHIVE_DIR)) refuse('E_ARCHIVE_EXISTS', `${ARCHIVE_DIR}/ already exists. That is where this migration puts everything it moves, and it will not write into a directory somebody else is using. Move it aside and re-run.`);

// --- the version. Refusing to identify it is the point: a layout this script has not been tested
// against is a layout it must not touch.
if (!hasT('CLAUDE.md')) refuse('E_NO_VERSION', `there is no root CLAUDE.md, so the conducted doctrine version cannot be identified. Every conducted version from v10 on carries a 'Doctrine version: **vN**' line there; without it this script cannot know which layout it is looking at, and it will not guess.`);
const claudeMdText = readT('CLAUDE.md');
const vm = claudeMdText.match(/^Doctrine version:\s*\*\*v([0-9]+(?:\.[0-9]+)?)\*\*/m);
if (!vm) refuse('E_NO_VERSION', `root CLAUDE.md carries no 'Doctrine version: **vN**' line, so the conducted version cannot be identified. This script refuses rather than guesses: the artifact layout changed at v11, and migrating the wrong layout is how work gets lost.`);
const VERSION = vm[1];
const vnum = Number(VERSION);
if (!(vnum >= 11)) {
  refuse('E_PRE_V11_LAYOUT', `this repo declares doctrine v${VERSION}. Before v11 conducted's artifacts lived at the repo root and under docs/ (work/, templates/, scripts/, docs/ROADMAP.md, docs/ledger/ …), not under .conducted/ — a completely different move table, and one this script has never been run against. Bring the repo to v11+ first (a Principal session's Migrate applies the ledger entries in order), then run this. Refusing an untested layout on your repo is deliberate.`);
}
if (vnum > 12.2) {
  refuse('E_VERSION_UNSUPPORTED', `this repo declares doctrine v${VERSION}, which is newer than the v12.2 this migrator was built and tested against. A version it does not know may have artifact classes it would archive blindly. Refusing.`);
}

// --- the target branch
const branchExistsLocal = g(['rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`]) !== '';
const branchExistsRemote = g(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${BRANCH}`]) !== '';
if (branchExistsLocal || branchExistsRemote) {
  refuse('E_TARGET_BRANCH_EXISTS', `branch '${BRANCH}' already exists (${[branchExistsLocal ? 'locally' : '', branchExistsRemote ? 'on origin' : ''].filter(Boolean).join(' and ')}). This is also how running the migration twice is stopped: the first run's branch is still there. Delete it, or pass --branch <other-name>.`);
}

// ---------------------------------------------------------------------------- read the estate

const ctx = scanContext(MAIN);
const tracked = new Set(g(['ls-files']).split('\n').filter(Boolean).map(posix));
const trackedUnder = (rel) => [...tracked].filter((f) => f === rel || f.startsWith(rel + '/')).sort();

// Files that are on disk under .conducted/ but not in git. `git mv` cannot move them with their
// history, so this script does not move them at all — it names them and leaves them exactly where
// they are. Nothing is lost either way; the report says so rather than the file quietly vanishing
// from the folder its siblings left.
const ignoredUnderConducted = gitRaw(['ls-files', '--others', '--ignored', '--exclude-standard', '--', CONDUCTED], MAIN)
  .split('\n').map((s) => s.trim()).filter(Boolean).map(posix);

// --- the node tree. A NODE is a directory under .conducted/work/ that directly contains one of full
// conducted's node artifacts. That test matters: a node's `evaluations/` and `evidence/` folders also
// contain tracked files, and treating THEM as nodes would shatter one node into four features. The
// work tree is recursive in doctrine, so a marker-bearing directory inside another one is a CHILD
// node and gets its own feature; a directory with no marker is a container and is descended through.
// The slug is full conducted's own: the path below work/ with '/' -> '-'.
// Full conducted's node artifacts, plus lite's own three documents and state.md — a folder somebody
// already wrote in lite's shape is a feature, not an unrecognised pile.
const NODE_MARKERS = ['brief.md', 'plan.md', 'showcase.md', 'status.json', 'code-review.md', ...DOCS, 'state.md'];
function findNodes() {
  const dirs = new Set();
  for (const f of trackedUnder(WORK_REL)) {
    const relToWork = f.slice(WORK_REL.length + 1);
    const cut = relToWork.lastIndexOf('/');
    if (cut === -1) continue;                            // a loose file directly in work/ — not a node
    const dir = relToWork.slice(0, cut);
    if (NODE_MARKERS.includes(relToWork.slice(cut + 1))) dirs.add(dir);
  }
  const nodeDirs = [...dirs].sort();
  const nodes = [];
  for (const dir of nodeDirs) {
    // A node's OWN files are everything tracked beneath it that belongs to no DEEPER node.
    const deeper = nodeDirs.filter((d) => d !== dir && d.startsWith(dir + '/'));
    const own = trackedUnder(`${WORK_REL}/${dir}`).filter((f) => !deeper.some((d) => f.startsWith(`${WORK_REL}/${d}/`)));
    if (!own.length) continue;
    nodes.push({ path: dir, slug: dir.split('/').join('-'), files: own });
  }
  return nodes;
}
const nodes = findNodes();

// --- loose files sitting directly in .conducted/work/ (not inside any node)
const looseWorkFiles = trackedUnder(WORK_REL).filter((f) => f.slice(WORK_REL.length + 1).indexOf('/') === -1);

// --- in-flight node work this script cannot safely map. It reports what it found and stops; it does
// NOT try to be clever about a branch or a worktree whose name means nothing to it.
const unmappable = [];
const slugSet = new Set(nodes.map((n) => n.slug));
const seen = new Map();
for (const n of nodes) {
  if (!NAME_RE.test(n.slug)) unmappable.push(`node '${WORK_REL}/${n.path}/' slugs to '${n.slug}', which is not a legal lite feature name ([A-Za-z0-9][A-Za-z0-9._-]*) — a name has to survive being written into a markdown link and read back out of one. Rename the node folder first.`);
  if (seen.has(n.slug)) unmappable.push(`two nodes slug to the same feature name '${n.slug}': '${seen.get(n.slug)}' and '${n.path}'. Merging them is a judgement, not a move. Rename one first.`);
  seen.set(n.slug, n.path);
}
const allBranchNames = [...ctx.locals.map((b) => b.name), ...ctx.remotes.map((b) => 'origin/' + b.name)];
for (const b of allBranchNames) {
  const bare = b.replace(/^origin\//, '');
  if (!bare.startsWith('node/')) continue;
  const slug = bare.slice(5);
  if (slugSet.has(slug)) continue;                        // maps cleanly onto a feature folder
  unmappable.push(`branch '${b}' is conducted node work (node/<slug>), but there is no ${WORK_REL}/ node that slugs to '${slug}' — so this script cannot say which feature folder that branch belongs to, and it will not invent one. Merge it, delete it, or create the node folder, then re-run.`);
}
for (const w of ctx.worktrees) {
  if (slugSet.has(w.name)) continue;
  unmappable.push(`linked worktree '${w.path}' has directory name '${w.name}', which matches no node in ${WORK_REL}/. In lite a worktree's directory name IS the feature it belongs to, so an unmatched worktree has no home. Remove it (git worktree remove) or rename it to a feature, then re-run.`);
}
if (unmappable.length) {
  refuse('E_INFLIGHT_NODE_WORK', `there is conducted node work here that this script cannot safely map onto a lite feature. It found:\n${unmappable.map((u, i) => `  ${i + 1}. ${u}`).join('\n')}\nNothing was touched. Each of these is a decision about work in flight, and a script deciding it unattended is how work disappears.`);
}

// ---------------------------------------------------------------------------- the plan
// Everything below computes; nothing writes. `--apply` executes exactly this list and nothing else.

const moves = [];      // { from, to, why }
const writes = [];     // { path, why, content }
const notes = [];      // things the report must say
const refused = [];    // things this script deliberately did not do, and why
const todos = [];      // numbered human judgement items

const archivePathFor = (repoRel) => repoRel.startsWith(CONDUCTED + '/')
  ? `${ARCHIVE_DIR}/${repoRel.slice(CONDUCTED.length + 1)}`
  : `${ARCHIVE_DIR}/${repoRel}`;

const plannedTargets = new Set();
const accountedFor = new Set();          // every tracked path this plan has a home for
function planMove(from, to, why) {
  if (plannedTargets.has(to)) refuse('E_ARCHIVE_COLLISION', `two different files would both land at '${to}' — this script will not overwrite one with the other. Nothing was changed. (second source: '${from}')`);
  plannedTargets.add(to);
  const files = trackedUnder(from);
  for (const f of files) accountedFor.add(f);
  moves.push({ from, to, why, files });
}
function planWrite(path, why, content) { writes.push({ path, why, content }); }

// --- 1. the .conducted/ top level, entry by entry. Known -> archived; unknown -> archived by the
// catch-all, because "we have never seen this" must never mean "leave it to rot next to a layout it
// no longer belongs to".
const topLevel = readdirSync(T(CONDUCTED), { withFileTypes: true }).map((d) => d.name).sort();
const archivedTop = [];
for (const name of topLevel) {
  if (KEEP_NAMES.includes(name)) continue;
  const rel = `${CONDUCTED}/${name}`;
  const files = trackedUnder(rel);
  if (!files.length) { notes.push(`${rel} is on disk but has no tracked files — LEFT EXACTLY WHERE IT IS. \`git mv\` only moves what git knows about, and this script never touches an untracked path.`); continue; }
  const known = ARCHIVE_NAMES.includes(name);
  archivedTop.push({ name, rel, files, known });
  planMove(rel, archivePathFor(rel), known ? 'full-conducted artifact class; lite has no concept for it' : 'NOT a conducted artifact class this migrator knows — archived rather than left behind or deleted');
  if (!known) notes.push(`${rel} is not something this migrator recognises from conducted v11..v12.2. It was ARCHIVED (moved, with history) rather than guessed about. If it is yours, move it back out.`);
}

// --- 2. the work tree, node by node.
const features = [];
for (const n of nodes) {
  const from = `${WORK_REL}/${n.path}`;
  const to = `${WORK_REL}/${n.slug}`;
  const carried = [];
  let statusJson = null;
  for (const f of n.files) {
    const rel = f.slice(from.length + 1);
    if (rel === 'status.json') {
      statusJson = f;
      planMove(f, archivePathFor(f), 'lite has no status.json; its phase, evaluator verdict and DoD clauses are carried into state.md as CLAIMS, and the original is kept whole');
      continue;
    }
    if (rel === 'state.md') {
      // Never overwrite. The pre-existing file is archived first, then lite's is written.
      planMove(f, archivePathFor(f), 'a state.md already existed here; archived so the generated one never overwrites it');
      notes.push(`${f} already existed and was ARCHIVED before the generated state.md was written — this script never overwrites a file it did not write.`);
      continue;
    }
    carried.push(rel);
    if (from !== to) planMove(f, `${to}/${rel}`, 'node -> feature');
    else accountedFor.add(f);              // a flat node's slug equals its folder name; nothing to move
  }
  const docs = DOCS.filter((d) => carried.includes(d));
  const extra = EXTRA_DOCS.filter((d) => carried.includes(d));
  features.push({ name: n.slug, nodePath: n.path, from, to, carried, docs, extra, statusJson, moved: from !== to });
}
for (const f of looseWorkFiles) {
  if (basename(f) === 'README.md') { planMove(f, archivePathFor(f), "lite installs its own work/README.md; the old one is archived rather than overwritten"); continue; }
  planMove(f, archivePathFor(f), 'a loose file directly in work/ belongs to no node, so it maps to no feature');
}

// --- 3. status.json -> the claims carried into state.md. Read, never judged.
// NARROW, and the two failures are separated: a file that is not there is null, a file that is there
// but is not JSON is null. Anything else — including a mistake in this script — is NOT quietly turned
// into "there were no claims to carry", which would silently drop everything a node had recorded.
function readJson(rel) {
  let raw;
  try { raw = readT(rel); } catch (e) { if (missing(e)) return null; throw e; }
  try { return JSON.parse(raw); } catch (e) { onlyBadJson(e); return null; }
}
function firstString(...vals) { for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim(); return ''; }

function carriedClaims(f) {
  const out = { ok: false, phase: '', branch: '', base: '', worktree: '', pr: '', verdict: '', clauses: [], parseError: '' };
  if (!f.statusJson) return out;
  const j = readJson(f.statusJson);
  if (!j || typeof j !== 'object') { out.parseError = 'status.json could not be parsed as JSON — nothing was carried from it, and the file is archived whole'; return out; }
  out.ok = true;
  out.phase = firstString(j.phase);
  out.branch = firstString(j.branch);
  out.base = firstString(j.base);
  out.worktree = firstString(j.worktree);
  out.pr = typeof j.pr === 'number' ? String(j.pr)
    : typeof j.pr === 'string' ? j.pr
      : (j.pr && typeof j.pr === 'object' ? firstString(j.pr.url, j.pr.number !== undefined ? String(j.pr.number) : '') : '');
  if (!out.pr) out.pr = firstString(j.pr_url);

  const ev = j.evaluator;
  if (typeof ev === 'string') out.verdict = ev;
  else if (ev && typeof ev === 'object') {
    out.verdict = firstString(ev.verdict);
    if (!out.verdict && Array.isArray(ev.rounds) && ev.rounds.length) {
      const last = ev.rounds[ev.rounds.length - 1];
      if (last && typeof last === 'object') out.verdict = firstString(last.verdict, last.result);
    }
  }

  // DoD clauses. Full conducted wrote them two ways across versions: an ARRAY of {clause, passes[]},
  // and an OBJECT keyed by clause name. Both are read; neither is interpreted. A pass is counted, a
  // verdict is quoted, and nothing is ticked.
  const countPasses = (p) => (Array.isArray(p) ? p.filter((x) => x && String(x.verdict || x.result || '').toUpperCase().startsWith('PASS')).length : 0);
  if (Array.isArray(j.dod)) {
    for (const d of j.dod) {
      if (!d || typeof d !== 'object') continue;
      out.clauses.push({ text: firstString(d.clause, d.name) || '(unnamed clause)', passes: countPasses(d.passes), total: Array.isArray(d.passes) ? d.passes.length : 0 });
    }
  } else if (j.dod && typeof j.dod === 'object') {
    for (const [k, v] of Object.entries(j.dod)) {
      out.clauses.push({ text: k, passes: v && typeof v === 'object' ? countPasses(v.passes) : 0, total: v && typeof v === 'object' && Array.isArray(v.passes) ? v.passes.length : 0 });
    }
  }
  return out;
}
for (const f of features) f.claims = carriedClaims(f);

// --- 4. the roadmap ledger, seeded from the old ROADMAP.md.
// The old top-cut graph's EDGE TYPES are deliberately not parsed — merge-gated / findings-gated /
// ruling-gated is a shape lite does not have, and translating it would be a reading, not a move. What
// is mechanical is the item HEADINGS, and each becomes an `idea` line for a human to give a real
// status. Rows for nodes that became features are not seeded at all: session-start DERIVES those.
function seedIdeas() {
  const rel = `${CONDUCTED}/ROADMAP.md`;
  if (!hasT(rel)) return { lines: [], why: 'there is no .conducted/ROADMAP.md to seed from' };
  const text = readT(rel);
  const heads = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(#{2,6})\s+(.*\S)\s*$/);
    if (m) heads.push({ level: m[1].length, text: m[2] });
  }
  if (!heads.length) return { lines: [], why: 'ROADMAP.md has no headings below the title, so there was nothing mechanical to seed from — read the archived file' };
  const deepest = Math.max(...heads.map((h) => h.level));
  const lines = [];
  for (const h of heads.filter((x) => x.level === deepest)) {
    // The leading token of a conducted roadmap heading is the node name; if it became a feature the
    // row is derived and seeding an idea for it would duplicate it.
    const lead = h.text.split(/\s+[·—-]\s+|\s+·|\s/)[0].replace(/[`*]/g, '');
    if (slugSet.has(lead)) continue;
    lines.push(`- ${sanitize(h.text)}`);
  }
  return { lines, why: `every level-${deepest} heading in the old ROADMAP.md (its deepest heading level, which is where conducted writes its items), minus the ones that became feature folders` };
}
const ideaSeed = seedIdeas();

function buildRoadmap() {
  const sections = new Map(STATUSES.map((s) => [s, { human: [], rows: [] }]));
  const idea = sections.get('idea');
  idea.human.push(`<!-- SEEDED BY THE MIGRATION FROM FULL CONDUCTED, ${now}.`);
  idea.human.push(`     These lines came from ${ideaSeed.why}.`);
  idea.human.push(`     They are IDEAS and nothing more: no status was derived and none was invented. The full`);
  idea.human.push(`     text of every one of them, with its old status and its edges, is in`);
  idea.human.push(`     ${ARCHIVE_DIR}/ROADMAP.md. Read it, then give each line here a real status by making`);
  idea.human.push(`     it true — create ${WORK_REL}/<feature>/ and the row derives itself. Delete the ones`);
  idea.human.push(`     that are already done or no longer wanted. -->`);
  if (ideaSeed.lines.length) { idea.human.push(''); idea.human.push(...ideaSeed.lines); }
  else { idea.human.push(''); idea.human.push(`- (nothing could be seeded mechanically — read ${ARCHIVE_DIR}/ROADMAP.md and write the real ideas here)`); }
  return ROADMAP_HEAD + LEDGER_START + renderLedger({ preamble: [], sections }) + LEDGER_END + '\n';
}

// --- 5. root CLAUDE.md: replace ONLY the doctrine block.
// The recogniser is deliberately strict, and when it is not certain it does NOT edit: it archives the
// whole file and writes lite's, saying so in capitals. Editing the wrong region of the file a
// maintainer wrote is worse than replacing it wholesale where the original is one `git show` away.
// Every anchor here has to be UNIQUE TO CONDUCTED, because it is used in both directions: enough of
// them inside the block is what makes it the doctrine block, and ONE of them outside is what makes
// this script refuse to cut. A loose anchor is therefore not merely noisy, it is a false refusal —
// `^#+ .*Roles$` was tried and it matched a maintainer's own "### User Roles" heading in a real
// estate, which refused a file the script could have edited perfectly. Anchors earn their place by
// being sentences conducted wrote, not words a project might use.
const DOCTRINE_ANCHORS = [
  /^Doctrine version:/m,
  /^#+ .*conducted development/im,
  /^#+ .*Session end \(no session ends dirty\)/im,
  /^#+ .*The work tree\s*$/im,
  /^#+ .*Gates \(never on the menu/im,
  /^#+ .*Economics\b.*two currencies/im,
  /^#+ .*Scope deltas/im,
  /^#+ .*Where conducted lives/im,
];

function planClaudeMd() {
  const lines = claudeMdText.split(/\r?\n/);
  const vIdx = lines.findIndex((l) => /^Doctrine version:\s*\*\*v/.test(l));
  let start = -1, level = 0;
  for (let i = vIdx; i >= 0; i--) {
    const m = lines[i].match(/^(#{1,6})\s+\S/);
    if (m) { start = i; level = m[1].length; break; }
  }
  if (start === -1) return { ok: false, why: `the 'Doctrine version' line is not under any markdown heading, so there is no block boundary to cut on` };

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+\S/);
    if (m && m[1].length <= level) { end = i; break; }
  }

  const block = lines.slice(start, end).join('\n');
  const outside = lines.slice(0, start).concat(lines.slice(end)).join('\n');
  const hits = DOCTRINE_ANCHORS.filter((re) => re.test(block)).length;
  const leaks = DOCTRINE_ANCHORS.filter((re) => re.test(outside));
  if (hits < 3) return { ok: false, why: `the block found (lines ${start + 1}-${end}) carries only ${hits} of the ${DOCTRINE_ANCHORS.length} conducted doctrine markers, which is not enough to be sure it IS the doctrine block` };
  if (leaks.length) return { ok: false, why: `${leaks.length} conducted doctrine marker(s) appear OUTSIDE the block that was found, so the doctrine is not one contiguous region of this file and cutting the block would leave doctrine behind` };

  const head = lines.slice(0, start);
  const tail = lines.slice(end);
  let pointer = readFileSync(join(PAYLOAD, 'CLAUDE.md'), 'utf8').replace(/\s+$/, '');
  if (head.some((l) => /^#\s+\S/.test(l))) pointer = pointer.replace(/^#\s+[^\n]*\n+/, '');   // the file already has its H1
  const rebuilt = [
    ...trimTrailingBlank(head),
    ...(head.length ? [''] : []),
    ...pointer.split('\n'),
    ...(tail.length ? [''] : []),
    ...trimLeadingBlank(tail),
  ].join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';

  return { ok: true, startLine: start + 1, endLine: end, block, rebuilt, headLines: head.length, tailLines: tail.length, hits };
}
const trimTrailingBlank = (a) => { const b = a.slice(); while (b.length && !b[b.length - 1].trim()) b.pop(); return b; };
const trimLeadingBlank = (a) => { const b = a.slice(); while (b.length && !b[0].trim()) b.shift(); return b; };

const claudePlan = planClaudeMd();
if (claudePlan.ok) {
  planWrite('CLAUDE.md', `the conducted doctrine block (lines ${claudePlan.startLine}-${claudePlan.endLine}, ${claudePlan.hits}/${DOCTRINE_ANCHORS.length} doctrine markers matched) replaced by lite's pointer; ${claudePlan.headLines} line(s) above it and ${claudePlan.tailLines} line(s) below it kept exactly`, claudePlan.rebuilt);
  planWrite(DOCTRINE_BLOCK_REL, 'the doctrine block that was cut out of root CLAUDE.md, kept whole so nothing in it is lost', `<!-- The conducted doctrine block removed from root CLAUDE.md by the conducted-lite migration on ${now}.\n     It was lines ${claudePlan.startLine}-${claudePlan.endLine} of that file. It is kept here whole and unedited.\n     Some of it is very likely YOURS rather than conducted's — a "local law map", rulings a\n     maintainer wrote inside the block, project-specific doctrine. Read it and move anything that is\n     still true into .conducted/standards.md. Nothing here was distilled for you. -->\n\n${claudePlan.block.replace(/\s+$/, '')}\n`);
  todos.push({
    title: 'Read the doctrine block that was cut out of CLAUDE.md',
    body: `${DOCTRINE_BLOCK_REL} holds the ${claudePlan.endLine - claudePlan.startLine + 1} lines removed from root CLAUDE.md. Most of it is conducted machinery you no longer run. Some of it is probably YOUR project's law that happened to be written inside the block (a "local law map", retained rulings, project conventions). Anything still true belongs in .conducted/standards.md, numbered. Nothing was moved there automatically.`,
  });
} else {
  planMove('CLAUDE.md', archivePathFor('CLAUDE.md'), `THE DOCTRINE BLOCK COULD NOT BE IDENTIFIED — ${claudePlan.why}`);
  planWrite('CLAUDE.md', "lite's pointer, written fresh because the old file was archived whole", readFileSync(join(PAYLOAD, 'CLAUDE.md'), 'utf8'));
  refused.push(`**It refused to edit root CLAUDE.md in place.** ${claudePlan.why}. Rather than guess which part of a file the maintainers wrote is conducted's, it ARCHIVED THE WHOLE FILE to ${archivePathFor('CLAUDE.md')} and wrote lite's pointer in its place. **Nothing was lost, but everything that was in that file is now only in the archive** — read it and put back whatever was yours.`);
  todos.push({
    title: 'PUT BACK YOUR OWN CONTENT FROM THE OLD CLAUDE.md',
    body: `The old root CLAUDE.md was archived WHOLE to ${archivePathFor('CLAUDE.md')} because the conducted doctrine block inside it could not be identified with certainty (${claudePlan.why}). Everything the maintainers wrote in it — build commands, conventions, project notes — is in that archived file and is NOT in the new root CLAUDE.md. Copy back what you still want.`,
  });
}

// --- 6. .claude/settings.json
function planSettings() {
  const liteSettings = JSON.parse(readFileSync(join(PAYLOAD, '.claude', 'settings.json'), 'utf8'));
  const rel = '.claude/settings.json';
  if (!hasT(rel)) {
    return { action: 'create', content: JSON.stringify(liteSettings, null, 2) + '\n', removed: [], added: Object.keys(liteSettings.hooks || {}) };
  }
  // The read and the parse are separate, and only the PARSE failure is reported as "not parseable
  // JSON". Blaming the user's file for a permission error, or for a mistake in this script, is a lie
  // that also loses the real cause.
  const rawSettings = readT(rel);
  let cur;
  try { cur = JSON.parse(rawSettings); } catch (e) { onlyBadJson(e); return { action: 'refused', why: `${rel} is not parseable JSON (${String(e.message).split('\n')[0]}), so merging into it could only be done by guessing. It was left EXACTLY as it is.` }; }
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return { action: 'refused', why: `${rel} parses to ${Array.isArray(cur) ? 'an array' : typeof cur}, not a settings object. Left exactly as it is.` };

  const removed = [];
  const hooks = (cur.hooks && typeof cur.hooks === 'object' && !Array.isArray(cur.hooks)) ? cur.hooks : null;
  if (hooks) {
    for (const [event, groups] of Object.entries(hooks)) {
      if (!Array.isArray(groups)) continue;
      const keptGroups = [];
      for (const grp of groups) {
        if (!grp || typeof grp !== 'object' || !Array.isArray(grp.hooks)) { keptGroups.push(grp); continue; }
        const keptHooks = grp.hooks.filter((h) => {
          const cmd = h && typeof h.command === 'string' ? h.command : '';
          const marker = FULL_HOOK_MARKERS.find((m) => cmd.includes(m));
          if (marker) { removed.push(`${event}: ${marker} — a full-conducted hook; lite has no bot mode, no status.json and its own hook set, and .conducted/hooks/ is archived by this migration so the path is dead`); return false; }
          return true;
        });
        if (keptHooks.length) keptGroups.push({ ...grp, hooks: keptHooks });
        else removed.push(`${event}: an empty hook group was dropped after its only entries were removed`);
      }
      if (keptGroups.length) hooks[event] = keptGroups; else delete hooks[event];
    }
  }

  const added = [];
  const target = cur.hooks && typeof cur.hooks === 'object' && !Array.isArray(cur.hooks) ? cur.hooks : (cur.hooks = {});
  for (const [event, groups] of Object.entries(liteSettings.hooks)) {
    if (!Array.isArray(target[event])) target[event] = [];
    for (const grp of groups) {
      const cmds = grp.hooks.map((h) => h.command);
      const already = target[event].some((g2) => Array.isArray(g2 && g2.hooks) && g2.hooks.some((h) => cmds.includes(h && h.command)));
      if (already) continue;
      target[event].push(JSON.parse(JSON.stringify(grp)));
      added.push(event);
    }
  }
  if (!Object.keys(target).length) delete cur.hooks;
  return { action: 'merge', content: JSON.stringify(cur, null, 2) + '\n', removed, added };
}
const settingsPlan = planSettings();
if (settingsPlan.action === 'refused') {
  refused.push(`**It refused to touch .claude/settings.json.** ${settingsPlan.why} That means lite's four hooks are NOT wired up: the roadmap will not regenerate itself, the session-end checks will not run, and the conductor guard is not armed, until somebody adds them by hand.`);
  todos.push({
    title: 'Wire up lite\'s four hooks by hand in .claude/settings.json',
    body: `This migration could not merge them: ${settingsPlan.why} Copy the whole \`hooks\` object from this migrator's own conducted-lite checkout at .claude/settings.json — SessionStart -> session-start-factcheck.mjs, Stop -> stop-glance.mjs, SessionEnd -> session-end-record.mjs, PreToolUse -> conductor-guard.mjs — and remove any hook whose command mentions ${FULL_HOOK_MARKERS.join(', ')}. None of lite's hooks can block a session.`,
  });
} else {
  planWrite('.claude/settings.json', settingsPlan.action === 'create'
    ? "no settings.json existed, so lite's was installed whole"
    : `lite's hooks merged in (${settingsPlan.added.length} added: ${settingsPlan.added.join(', ') || 'none — already present'}); ${settingsPlan.removed.length} full-conducted hook entr(y/ies) removed; everything else in the file preserved`, settingsPlan.content);
}

// --- 7. .github/workflows/gates.yml
// Keep the gates job: a secret scan and a test/lint run are worth having under any doctrine. Remove
// the bookkeeping-merge job (there is no bot lane in lite) and the steps that READ machinery this
// migration archives, because a gate that can never go green is worse than no gate. Anything whose
// shape is not the seed's is left alone and reported.
// Remove one YAML block by INDENTATION, which is the only structure YAML actually has. The block runs
// from its own line to the first later non-blank line that is a sibling or a dedent. Two shapes, and
// they end differently: a mapping key ('  bookkeeping-merge:') ends at any line indented no further
// than it; a sequence item ('      - name: X') ends only at a dedent or at the next '- ' at the same
// indent, because its own body sits deeper. Comments indented inside the block belong to the block.
function dropYamlBlock(lines, matcher) {
  const idx = lines.findIndex(matcher);
  if (idx === -1) return null;
  const head = lines[idx];
  const indent = head.length - head.trimStart().length;
  const isItem = head.trimStart().startsWith('- ');
  let end = lines.length;
  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const ind = l.length - l.trimStart().length;
    if (ind < indent) { end = i; break; }
    if (ind === indent && (!isItem || l.trimStart().startsWith('- '))) { end = i; break; }
  }
  while (end > idx + 1 && !lines[end - 1].trim()) end--;
  return { start: idx, end, removed: lines.slice(idx, end) };
}

function planGates() {
  const rel = '.github/workflows/gates.yml';
  if (!hasT(rel)) return { action: 'absent' };
  const text = readT(rel);
  let lines = text.split(/\r?\n/);
  const shape = ['^jobs:\\s*$', '^  gates:\\s*$', '^  bookkeeping-merge:\\s*$'].map((r) => new RegExp(r));
  const missing = shape.filter((re) => !lines.some((l) => re.test(l)));
  if (missing.length) {
    return { action: 'unrecognised', why: `${rel} does not have the shape this migrator knows (it is missing ${missing.map((m) => "a line matching /" + m.source + "/").join(' and ')}). NOTHING in it was changed.` };
  }
  const dropped = [];
  const job = dropYamlBlock(lines, (l) => /^  bookkeeping-merge:\s*$/.test(l));
  if (job) { lines = [...lines.slice(0, job.start), ...lines.slice(job.end)]; dropped.push(`the whole 'bookkeeping-merge' job (${job.removed.length} lines) — lite has no bot lane, no clerk and no auto-merge; a human merges`); }
  for (const name of GATE_STEPS_TO_DROP) {
    const step = dropYamlBlock(lines, (l) => l.trimStart() === `- name: ${name}`);
    if (!step) { dropped.push(`(step '${name}' was not present — nothing to remove)`); continue; }
    lines = [...lines.slice(0, step.start), ...lines.slice(step.end)];
    dropped.push(`step '${name}' (${step.removed.length} lines) — it reads .conducted/scripts/, .conducted/BOT.md or node trailers, all of which this migration archives. Left in place it would FAIL every future PR, because a lite PR carries no node trailer.`);
  }
  // pull_request_target existed only to run bookkeeping-merge. Removed only when it is a bare key.
  const pIdx = lines.findIndex((l) => /^  pull_request_target:\s*$/.test(l));
  if (pIdx > -1) {
    const next = lines.slice(pIdx + 1).find((l) => l.trim());
    if (!next || /^\s{0,2}\S/.test(next)) { lines.splice(pIdx, 1); dropped.push(`the 'pull_request_target:' trigger — it existed only to run bookkeeping-merge`); }
    else dropped.push(`(left 'pull_request_target:' alone — it has settings under it, and this migrator only removes it when it is a bare trigger)`);
  }
  return { action: 'edit', content: lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n', dropped };
}
const gatesPlan = planGates();
if (gatesPlan.action === 'edit') {
  planWrite('.github/workflows/gates.yml', 'the gates job kept; the conducted-only job and steps removed', gatesPlan.content);
  for (const d of gatesPlan.dropped) notes.push(`.github/workflows/gates.yml — ${d}`);
  notes.push('.github/workflows/gates.yml — the secret scan and the tests/lint step were KEPT untouched: they are worth having whatever doctrine you run. Comments left in the file may still mention the removed job; they are comments, and this migrator does not rewrite prose it did not write.');
}
else if (gatesPlan.action === 'unrecognised') {
  refused.push(`**It refused to change .github/workflows/gates.yml.** ${gatesPlan.why} The conducted 'bookkeeping-merge' job and the conducted-only gate steps may therefore still be there. If they are, the territory-manifest step will FAIL every PR from now on, because a lite PR carries no \`node:\` trailer. Delete those steps by hand.`);
  todos.push({ title: 'Check .github/workflows/gates.yml by hand', body: `${gatesPlan.why} If the file still has a 'bookkeeping-merge' job or steps named ${GATE_STEPS_TO_DROP.map((s) => `'${s}'`).join(', ')}, remove them: they read conducted machinery this migration archived, and the territory step fails any PR without a \`node:\` trailer.` });
} else notes.push('.github/workflows/gates.yml does not exist here — nothing to change.');

// --- 8. install lite's own files. Any existing target is archived FIRST, never overwritten.
for (const rel of INSTALL) {
  if (hasT(rel)) {
    if (!tracked.has(rel)) refuse('E_INSTALL_TARGET_UNTRACKED', `${rel} exists on disk but git does not track it, so it can be neither moved with its history nor safely replaced. Nothing was changed. Commit it or move it aside, then re-run.`);
    planMove(rel, archivePathFor(rel), 'an existing file stood where lite installs one; archived rather than overwritten');
    notes.push(`${rel} already existed and was ARCHIVED to ${archivePathFor(rel)} before lite's version was installed.`);
  }
  planWrite(rel, "installed from conducted-lite", readFileSync(join(PAYLOAD, rel), 'utf8'));
}
planWrite(`${CONDUCTED}/roadmap.md`, `the lite ledger, seeded with ${ideaSeed.lines.length} idea line(s) from the old ROADMAP.md`, buildRoadmap());

// A pointer, not a distillation. standards.md ships as a scaffold; this adds four lines telling the
// next session where the old rulings are. Which of them are still live is exactly the judgement a
// script must not make.
const stdPath = INSTALL.indexOf('.conducted/standards.md');
if (stdPath > -1 && hasT(`${CONDUCTED}/DECISIONS.md`)) {
  const w = writes.find((x) => x.path === '.conducted/standards.md');
  w.content = w.content.replace(/\s+$/, '') + `\n\n<!-- MIGRATION NOTE (${now}). This project ran full conducted before lite, and its rulings are in\n     ${ARCHIVE_DIR}/DECISIONS.md — kept whole, with history. They were NOT distilled into rules\n     here: judging which rulings are still live is the judgement a script must not make. The\n     migration report lists every entry so a human can work through them. -->\n`;
  w.why += '; with a four-line pointer at the archived DECISIONS.md added (a pointer, never a distillation)';
}

// --- 8b. THE COMPLETENESS CHECK. Every tracked file under .conducted/ must have a home in the plan:
// kept where it is, carried into a feature, or archived. A file with no home would be a file this
// migration silently walked past, and "silently walked past" is one bad edit away from "lost".
const unaccounted = trackedUnder(CONDUCTED)
  .filter((f) => f !== `${CONDUCTED}/VISION.md` && !accountedFor.has(f));
if (unaccounted.length) {
  refuse('E_UNACCOUNTED_FILES', `${unaccounted.length} tracked file(s) under ${CONDUCTED}/ have no place in this migration's plan, which means the plan does not cover this repo's shape. Refusing rather than moving everything around them and leaving these stranded in a layout their siblings have left:\n${unaccounted.map((f) => '  ' + f).join('\n')}\n` +
    `  Almost always these sit in a ${WORK_REL}/ folder that is not a node: a node is a folder holding one of ${NODE_MARKERS.join(', ')}.\n` +
    `  Two ways to fix it, both one command, both yours to choose:\n` +
    `    git mv <file> <somewhere outside ${CONDUCTED}/>     if it is not conducted's\n` +
    `    give the folder a node artifact (a brief.md, or one of lite's problem/solution/tech-design) so it is a feature\n` +
    `  then re-run. Nothing was changed.`);
}

// --- 8c. CONFIGS THAT GLOB THE TREE. This migration is what moves worktrees INSIDE the repo, so it
// is the moment the hazard is created and the moment somebody is reading. They are gitignored, which
// hides them from git and from NOTHING ELSE: a test runner, a linter, a typechecker or a coverage
// tool that walks the filesystem by glob sees a second and third copy of the whole source tree. The
// field measured 174 test files where there are 58, and a "green on main" that was partly running
// code which was not on main. REPORTED, NEVER EDITED — a build config is the maintainers'.
const globScan = worktreeGlobScan(MAIN);
if (globScan.missing.length || globScan.unreadable.length) {
  todos.push({
    title: `Exclude \`worktrees/**\` from ${globScan.missing.length + globScan.unreadable.length} config file(s) that glob the tree`,
    body: `In lite, worktrees live at \`worktrees/<feature>/\` INSIDE the repo and are gitignored — which hides them from git and from NOTHING ELSE. Most test runners, linters, typecheckers and coverage tools walk the filesystem by glob, so each one will see a second and third copy of your whole source tree the first time a feature gets a worktree: a suite can pass on your default branch while partly exercising code that is not on it, and a builder mid-edit can turn the main checkout's suite red for a reason unrelated to the branch under test. THE TELL IS A TEST COUNT THAT CHANGED WHEN NO TEST CHANGED. NOTHING BELOW WAS EDITED — these are yours, and this migration only ever reports on them. The check is a TEXT SEARCH for the string 'worktrees' in each TRACKED config; it does not evaluate your build config and cannot see an untracked one.`,
    list: [
      ...globScan.missing.map((m) => `${m.rel} — ${m.what} — no mention of \`worktrees\``),
      ...globScan.unreadable.map((u) => `${u.rel} — ${u.why}`),
    ],
  });
} else if (globScan.checked.length) {
  notes.push(`every one of the ${globScan.checked.length} tree-globbing config file(s) found (${globScan.checked.join(', ')}) already mentions \`worktrees\`. Worth knowing, because lite puts worktrees INSIDE the repo and gitignored hides them from git and from nothing else.`);
} else {
  notes.push('no tree-globbing config (vite/vitest/jest/tsconfig/eslint/c8/nyc) was found in this repo, so nothing was checked for a `worktrees` exclusion. When you add one, exclude `worktrees/**`: lite puts worktrees INSIDE the repo, and gitignored hides them from git and from nothing else.');
}

// --- 9. the human to-do list, built from what was actually found.
function decisionEntries() {
  const rel = `${CONDUCTED}/DECISIONS.md`;
  if (!hasT(rel)) return [];
  const out = [];
  for (const line of readT(rel).split(/\r?\n/)) {
    const m = line.match(/^#{2,3}\s+(.*\S)\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}
const decisions = decisionEntries();
if (decisions.length) {
  todos.push({
    title: `Distil ${decisions.length} DECISIONS entr${decisions.length === 1 ? 'y' : 'ies'} into .conducted/standards.md`,
    body: `The old append-only ruling log is archived whole at ${ARCHIVE_DIR}/DECISIONS.md. NOTHING was auto-distilled — deciding which of these rulings is still live is exactly the judgement a script must not make. Read each one; the ones that still bind become numbered rules in .conducted/standards.md with a sentence of evidence; the rest stay history. The entries, newest first:`,
    list: decisions,
  });
}
const needSplit = features.filter((f) => f.carried.includes('brief.md'));
if (needSplit.length) {
  todos.push({
    title: `Split ${needSplit.length} brief.md into problem.md / solution.md where the work warrants it`,
    body: `A conducted brief.md carries problem, solution and constraints in one document. Lite's chain is problem -> solution -> tech-design, and SPLITTING one into the other is a READING of what the brief means, not a transform a script can do — so the brief.md files were carried across UNTOUCHED and untouched they remain. Until a feature has solution.md it sits under '## accepted' or lower on the roadmap, which is honest. Per the altitude law in CONDUCTOR.md, none, some or all of the three documents may be warranted: a finished feature probably needs none of them. The briefs:`,
    list: needSplit.map((f) => `${WORK_REL}/${f.name}/brief.md`),
  });
}
todos.push({
  title: `Give the ${ideaSeed.lines.length} seeded roadmap idea(s) a real status`,
  body: `.conducted/roadmap.md's '## idea' section was seeded from the old ROADMAP.md's item headings. Every one of them is an idea and nothing else: no status was derived and none was invented. In lite you change a status by making it true — create .conducted/work/<feature>/ and the next session start moves the row itself. Delete the lines that are already done or no longer wanted. The old graph, with its statuses and its edges, is at ${ARCHIVE_DIR}/ROADMAP.md.`,
});
const withClaims = features.filter((f) => f.claims && f.claims.ok);
if (withClaims.length) {
  todos.push({
    title: `Confirm or delete the carried claims in ${withClaims.length} state.md file(s)`,
    body: `Each feature's state.md has a '## Carried over from conducted (unverified)' section holding what the old status.json recorded — phase, evaluator verdict, DoD clauses, PR. NONE of it was verified by this migration; it is quoted, not endorsed. The DoD clauses were written under '## Acceptance criteria' as UNTICKED boxes even where conducted recorded a pass, because nothing in lite ticks a box for you. Read each one, tick what is true, delete what is stale.`,
    list: withClaims.map((f) => `${WORK_REL}/${f.name}/state.md — conducted phase '${f.claims.phase || '(none)'}', ${f.claims.clauses.length} DoD clause(s)`),
  });
}

// ---------------------------------------------------------------------------- the report

// A move of a directory is ONE `git mv`, but the report owes the reader every file inside it — a
// directory name is not an answer to "where did my file go".
const fmtMove = (m) => [
  `  ${m.from}`,
  `      -> ${m.to}`,
  `      (${m.why})`,
  ...(m.files.length === 1 && m.files[0] === m.from
    ? []
    : m.files.map((f) => `        ${f}  ->  ${m.to}${f.slice(m.from.length)}`)),
].join('\n');
const movedFileCount = moves.reduce((n, m) => n + m.files.length, 0);

function buildReport(sha) {
  const L = [];
  L.push(`# Migration report — this repo moved from full conducted to conducted-lite`);
  L.push('');
  L.push(`Written by \`.claude/scripts/migrate-from-full.mjs\` on ${now}.`);
  L.push('');
  L.push(`**You can paste this whole file to whoever asked you to run the migration.** It says what`);
  L.push(`changed, what did not, and what still needs a person. Nothing here needs to be read in order.`);
  L.push('');
  L.push('## What it found');
  L.push('');
  L.push(`- repo: \`${MAIN}\``);
  L.push(`- conducted doctrine version detected: **v${VERSION}** (from the \`Doctrine version:\` line in root CLAUDE.md)`);
  L.push(`- branch created: \`${BRANCH}\`, cut from \`${startBranch}\` at \`${startSha.slice(0, 12)}\``);
  L.push(`- the whole migration is **one commit**${sha ? ` — \`${sha}\`` : ''}`);
  L.push(`- work nodes found: ${features.length}${features.length ? ' — ' + features.map((f) => `\`${f.nodePath}\` -> feature \`${f.name}\``).join(', ') : ''}`);
  L.push(`- files moved: ${movedFileCount} (in ${moves.length} \`git mv\` call(s)) · files written: ${writes.length + features.length}`);
  L.push('');
  L.push('## Nothing was deleted, and nothing was overwritten');
  L.push('');
  L.push(`Every move below is a \`git mv\`, so \`git log --follow <new-path>\` still shows the file's whole`);
  L.push(`history. Everything conducted-lite has no concept for went to \`${ARCHIVE_DIR}/\` — moved, not`);
  L.push(`dropped. Where a file already stood where lite installs one, the existing file was archived`);
  L.push(`first and only then was lite's written.`);
  L.push('');
  L.push('## Every file that moved');
  L.push('');
  if (!moves.length) L.push('  (none)');
  for (const m of moves) L.push(fmtMove(m));
  L.push('');
  L.push('## Every file that was written');
  L.push('');
  for (const w of writes) L.push(`  ${w.path}\n      (${w.why})`);
  for (const f of features) L.push(`  ${WORK_REL}/${f.name}/state.md\n      (generated from this node's status.json plus git reality — branches, worktrees and documents that actually exist)`);
  L.push(`  ${REPORT_REL}\n      (this file)`);
  L.push('');
  L.push('## What is where now');
  L.push('');
  L.push('| lite | what it is |');
  L.push('|---|---|');
  L.push('| `.conducted/VISION.md` | untouched. It heads the chain in lite exactly as it did in full conducted |');
  L.push('| `.conducted/CONDUCTOR.md` | the whole operating law, one page. Read it first |');
  L.push('| `.conducted/standards.md` | the rules this project is held to. Empty scaffold — the old DECISIONS entries are yours to distil into it |');
  L.push('| `.conducted/roadmap.md` | the ledger. Its headings ARE the status, and the statuses are DERIVED every session start |');
  L.push('| `.conducted/archive.md` | where completed rows go, swept mechanically |');
  L.push('| `.conducted/work/<feature>/` | one folder per feature: problem/solution/tech-design/state, plus whatever the old node carried |');
  L.push(`| \`${ARCHIVE_DIR}/\` | everything full conducted had that lite does not. Nothing here was read or changed; it is kept so nothing is lost |`);
  L.push('');
  L.push('## WHAT NEEDS A HUMAN');
  L.push('');
  L.push('None of the following was done for you, and none of it will be done by any script in this');
  L.push('repo. Each one is a judgement, and a script making it unattended is how a project quietly');
  L.push('acquires rules nobody agreed to.');
  L.push('');
  todos.forEach((t, i) => {
    L.push(`### ${i + 1}. ${t.title}`);
    L.push('');
    L.push(t.body);
    if (t.list && t.list.length) { L.push(''); for (const x of t.list) L.push(`  - ${x}`); }
    L.push('');
  });
  L.push('## What it REFUSED to do, and why');
  L.push('');
  if (!refused.length) L.push('Nothing. Every shape it was handed was one it recognised.');
  for (const r of refused) L.push(`- ${r}`);
  L.push('');
  L.push('It also refuses these on principle, on every run, however tempting:');
  L.push('');
  L.push('- **it never merges and never pushes.** It made a branch and stopped. You merge.');
  L.push('- **it never distils a ruling into a standard.** Judging which old rulings are still live is');
  L.push('  the judgement a script must not make.');
  L.push('- **it never splits a brief into problem and solution.** That is a reading of what the brief');
  L.push('  means, not a move.');
  L.push('- **it never gives a roadmap row a real status.** In lite you change a status by making it');
  L.push('  true; a seeded idea line is an idea and nothing more.');
  L.push('- **it never ticks an acceptance criterion**, even where the old status.json recorded a pass.');
  L.push('');
  if (notes.length) {
    L.push('## Notes');
    L.push('');
    for (const n of notes) L.push(`- ${n}`);
    L.push('');
  }
  if (ignoredUnderConducted.length) {
    L.push('## Files under `.conducted/` that git does not track');
    L.push('');
    L.push('`git mv` only moves what git knows about, so these were **left exactly where they are**.');
    L.push('Nothing was lost — but their siblings moved and they did not, so look at them:');
    L.push('');
    for (const f of ignoredUnderConducted) L.push(`  - ${f}`);
    L.push('');
  }
  L.push('## How to undo all of it');
  L.push('');
  L.push('The whole migration is ONE commit, so one command puts the old world back:');
  L.push('');
  L.push('```');
  L.push(`git checkout ${BRANCH}`);
  L.push(`git revert --no-edit ${BRANCH}`);
  L.push('```');
  L.push('');
  L.push(`That branch has exactly ONE commit on it, so the branch name and the commit are the same thing —`);
  L.push(`which is why this file names the branch rather than a sha. (The sha itself was printed in the`);
  L.push('terminal when the migration ran, and `git log -1 --format=%H ' + BRANCH + '` prints it again.');
  L.push('This file is not rewritten after the commit to insert it: doing that would leave the working');
  L.push('tree dirty the moment the migration finished, and a migration that hands you a dirty repo has');
  L.push('already broken the first promise it made.)');
  L.push('');
  L.push(`Or just never merge the branch: \`git checkout ${startBranch} && git branch -D ${BRANCH}\` —`);
  L.push(`nothing was merged and nothing was pushed, so \`${startBranch}\` was never touched.`);
  L.push('');
  L.push('## How to continue');
  L.push('');
  L.push('```');
  L.push(`git push -u origin ${BRANCH}`);
  L.push(`gh pr create --base ${startBranch} --head ${BRANCH} --title "move to conducted-lite" --body-file ${REPORT_REL}`);
  L.push('```');
  L.push('');
  L.push('**This script did not run either of those, deliberately.** It has no way to know whether');
  L.push('pushing to your origin is safe or wanted, and a push is the one thing nobody local can undo.');
  L.push('If `gh` is not installed, open the pull request in the browser instead — the branch name is');
  L.push(`\`${BRANCH}\` and the base is \`${startBranch}\`.`);
  L.push('');
  L.push('Once it is merged, the next Claude Code session in this repo runs the lite SessionStart hook,');
  L.push('which regenerates `.conducted/roadmap.md` from what actually exists and fact-checks every');
  L.push('claim in every `state.md` against git. **None of lite\'s hooks can block a session** — they');
  L.push('inform. You can run the fact-check yourself right now without waiting:');
  L.push('');
  L.push('```');
  L.push('node .claude/scripts/session-start.mjs');
  L.push('```');
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------- state.md

// Written through lite's OWN marker splice, with lite's OWN derivation supplying the facts, so the
// file this migration produces is byte-shaped exactly like one session-end writes — and session-end
// rewrites the facts block from scratch on its next run regardless.
function stateFor(f, factsCtx) {
  const facts = featureFacts(MAIN, f.name, factsCtx);
  // In a dry run the folder has not moved yet, so the document list comes from the plan. In an apply
  // run the plan and the disk agree by construction.
  facts.docs = f.docs; facts.extra = f.extra;
  let derived = 'new';
  if (f.docs.includes('solution.md')) derived = 'accepted';
  if (f.docs.includes('tech-design.md')) derived = 'refined';
  if (facts.branches.length || facts.worktrees.length) derived = 'development';
  facts.derived = derived;

  const c = f.claims || {};
  const carried = [];
  carried.push('## Carried over from conducted (unverified)');
  carried.push('');
  carried.push(`<!-- Written by the conducted-lite migration on ${now} from this node's status.json.`);
  carried.push(f.statusJson
    ? `     The original is archived whole at ${archivePathFor(f.statusJson)}. Every line below is a CLAIM the`
    : '     This node had no status.json. Every line below is a CLAIM the');
  carried.push('     old machinery recorded. NONE of it was verified by the migration, and nothing in this repo');
  carried.push('     will verify it for you. Confirm what is true, delete what is stale, and delete this whole');
  carried.push('     section once you have. -->');
  carried.push('');
  if (!f.statusJson) carried.push('- this node had no `status.json`, so nothing was carried');
  else if (c.parseError) carried.push(`- ${sanitize(c.parseError)}`);
  else {
    carried.push(`- conducted phase: \`${sanitize(c.phase) || '(not recorded)'}\``);
    carried.push(`- evaluator verdict last recorded: ${c.verdict ? sanitize(c.verdict) : '(none recorded)'}`);
    carried.push(`- node branch recorded: ${c.branch ? '`' + sanitize(c.branch) + '`' : '(none recorded)'}${c.base ? ` (based on \`${sanitize(c.base)}\`)` : ''}`);
    carried.push(`- worktree recorded: ${c.worktree ? '`' + sanitize(c.worktree) + '`' : '(none recorded)'}`);
    if (c.pr) {
      // The note goes ABOVE the line, not beside it: a PR is DECLARED by a line whose whole content
      // is the declaration, so a trailing comment would stop lite reading this as one at all.
      carried.push('<!-- Carried verbatim. If the line below is the documented form — `PR: #<n>` or the pull-request');
      carried.push('     URL, alone on its line — lite reads it as a DECLARED PR and reports it UNVERIFIED until gh can');
      carried.push('     see it. Delete the line if the PR no longer matters. -->');
      carried.push(`- PR: ${sanitize(c.pr)}`);
    } else carried.push('- PR: (none recorded)');
    // Bounded: an evidence-heavy node carries forty files and a forty-item sentence is not a fact,
    // it is a wall. The full list is `git ls-files` away and the folder is right there.
    const shown = f.carried.slice(0, 12);
    carried.push(`- ${f.carried.length} file(s) carried across from the node, untouched: ${shown.length ? shown.map((x) => '`' + x + '`').join(', ') : '(none)'}${f.carried.length > shown.length ? `, and ${f.carried.length - shown.length} more in the folder` : ''}`);
  }
  carried.push('');

  const human = [
    ...carried,
    '## Decisions',
    '',
    '<!-- What was decided and WHY, with the evidence that would reopen it. Rewrite in place, dated. -->',
    '',
    '## Issues',
    '',
    '<!-- What is wrong or unresolved right now. Delete an issue when it is gone, never strike it out. -->',
    '',
    ...(f.carried.includes('brief.md')
      ? ['- MIGRATION: `brief.md` was carried across untouched and has NOT been split into `problem.md` /',
        '  `solution.md`. That split is a reading of what the brief means, not something a script can do.',
        '  Until `solution.md` exists this feature cannot rise above `## new` on the roadmap, which is',
        '  honest. Per the altitude law it may warrant none of the three documents at all.', '']
      : []),
    '## Acceptance criteria',
    '',
    '<!-- Binary lines. Only a human ticks these: no script in this repo will ever tick one for you. -->',
    '',
    ...(c.clauses && c.clauses.length
      ? [`<!-- The ${c.clauses.length} DoD clause(s) the old status.json recorded, carried across UNTICKED even where`,
        '     conducted recorded a pass. Nothing in lite ticks a box, and a migration inventing a tick would be',
        '     the worst version of that. The recorded pass count is quoted beside each one, unverified. -->',
        '',
        ...c.clauses.map((cl) => `- [ ] ${sanitize(cl.text)}   <!-- conducted recorded ${cl.passes}/${cl.total} pass(es) -->`),
        '']
      : []),
  ].join('\n');

  const head = stateHead(f.name);
  const tail = '\n\n' + human;
  const sha = judgmentHash(head + tail);
  const carrier = {
    at: now,
    status: facts.derived,
    branches: facts.branches.map((b) => b.name),
    worktrees: facts.worktrees.map((w) => w.label),
    pr: core.declaredPR(head + tail),
  };
  const body = [
    '',
    '<!-- MACHINE-WRITTEN. Seeded by the conducted-lite migration and REWRITTEN IN PLACE by every',
    '     session-end run that touches this feature. Everything OUTSIDE the two markers is yours. -->',
    '',
    `**Derived ${now}** by the conducted-lite migration from files on disk and refs in git. Every line`,
    'below is something that exists, not something anyone claimed.',
    '',
    `- feature: \`${f.name}\`   (was conducted node \`${WORK_REL}/${f.nodePath}\`)`,
    `- folder: \`${WORK_REL}/${f.name}/\``,
    `- documents: ${[...facts.docs, ...facts.extra].join(' · ') || '(none of problem/solution/tech-design — legal; see the altitude law in .conducted/CONDUCTOR.md)'}`,
    `- derived status: \`${facts.derived}\``,
    ...(facts.branches.length ? ['- branches:', ...facts.branches.map((b) => `  - \`${b.name}\` @ \`${b.sha.slice(0, 8)}\` (${b.where})`)] : ['- branches: none matching this feature name']),
    ...(facts.worktrees.length ? ['- worktrees:', ...facts.worktrees.map((w) => `  - \`${w.label}\` -> ${w.path}`)] : ['- worktrees: none']),
    '- session log (most recent, bounded):',
    `  - \`${now}\` session \`migration\` — created by migrate-from-full.mjs from conducted node \`${f.nodePath}\``,
    `<!-- conducted-lite:state ${b64(JSON.stringify(carrier))} -->`,
    `<!-- conducted-lite:sessions ${b64(JSON.stringify([{ at: now, id: 'migration', note: `created by migrate-from-full.mjs from conducted node ${f.nodePath}` }]))} -->`,
    `<!-- conducted-lite:judgment sha=${sha} at=${now} -->`,
    '',
  ].join('\n');

  return { path: `${WORK_REL}/${f.name}/state.md`, content: head + FACTS_START + body + FACTS_END + tail, derived: facts.derived, branches: facts.branches.map((b) => b.name), worktrees: facts.worktrees.map((w) => w.label) };
}

// ---------------------------------------------------------------------------- where we start from

const startBranch = g(['rev-parse', '--abbrev-ref', 'HEAD']) || '(detached)';
const startSha = g(['rev-parse', 'HEAD']);
if (!startSha) refuse('E_NO_COMMIT', 'this repo has no commits, so there is nothing to branch from and nothing to revert to.');

// ---------------------------------------------------------------------------- DRY RUN

if (!APPLY) {
  const states = features.map((f) => stateFor(f, ctx));
  const out = [];
  out.push(`conducted-lite migrate-from-full — DRY RUN. NOTHING HAS BEEN CHANGED.`);
  out.push(`repo ${MAIN}`);
  out.push(`detected conducted doctrine v${VERSION}   ·   currently on \`${startBranch}\` @ ${startSha.slice(0, 12)}`);
  out.push(`would create branch \`${BRANCH}\` and land ONE commit on it. It would not merge and would not push.`);
  out.push('');
  out.push(`PREFLIGHT: passed. clean tree in ${cos.all.length} checkout(s) · .conducted/ present · CONDUCTOR.md absent · archive/ absent · branch \`${BRANCH}\` free · ${nodes.length} node(s) all map to legal feature names`);
  out.push('');
  out.push(`WOULD MOVE ${movedFileCount} file(s) in ${moves.length} \`git mv\` call(s) — history follows every one:`);
  for (const m of moves) out.push(fmtMove(m));
  out.push('');
  out.push(`WOULD WRITE ${writes.length + states.length} file(s):`);
  for (const w of writes) out.push(`  ${w.path}\n      (${w.why})`);
  for (const s of states) out.push(`  ${s.path}\n      (generated from status.json + git reality: derived status \`${s.derived}\`, branches [${s.branches.join(', ') || 'none'}], worktrees [${s.worktrees.join(', ') || 'none'}])`);
  out.push('');
  out.push(`WOULD DELETE 0 file(s). It never deletes.`);
  out.push('');
  out.push('--- the report it would write, in full -------------------------------------------------');
  out.push('');
  out.push(buildReport(null));
  out.push('--- end of report ----------------------------------------------------------------------');
  out.push('');
  out.push('NOTHING ABOVE HAPPENED. Re-run with --apply to do it:');
  out.push(`  node ${posix(fileURLToPath(import.meta.url))} --repo ${MAIN} --apply`);
  process.stdout.write(out.join('\n') + '\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------- APPLY

const step = (args, what) => {
  const r = gOut(args);
  if (!r.ok) {
    process.stderr.write(`E_STEP_FAILED: ${what}\n  git ${args.join(' ')}\n  ${r.err.split('\n').join('\n  ')}\n`);
    process.stderr.write(`The migration stopped part-way. NOTHING WAS COMMITTED, so the fix is one command:\n  git checkout ${startBranch} && git reset --hard ${startSha} && git branch -D ${BRANCH}\n`);
    process.exit(1);
  }
  return r.out;
};

// `checkout -b`, not `switch -c`: switch arrived in git 2.23 and this runs on machines nobody here
// chose. checkout -b has meant the same thing since forever.
step(['checkout', '-b', BRANCH], `create branch ${BRANCH}`);

for (const m of moves) {
  try { mkdirSync(dirname(T(m.to)), { recursive: true }); } catch (e) { die('E_WRITE_FAILED', `${dirname(m.to)}: ${e.message}`); }
  step(['mv', m.from, m.to], `move ${m.from} -> ${m.to}`);
}

function write(rel, content) {
  try { mkdirSync(dirname(T(rel)), { recursive: true }); writeFileSync(T(rel), content); }
  catch (e) { die('E_WRITE_FAILED', `${rel}: ${e.message}`); }
}
for (const w of writes) write(w.path, w.content);

// A nested node ('work/infra/dns' -> feature 'infra-dns') leaves its container directory behind,
// EMPTY. Git does not track directories so nothing would be committed, but `listFeatures` reads the
// DISK: an empty 'work/infra/' becomes a phantom feature with a roadmap row on this very machine.
// Removing it deletes NOTHING — the check below refuses to touch a directory holding any entry at
// all, and every removal is named in the run's output.
const prunedDirs = [];
function pruneEmptyDirs(rel) {
  // NARROW: only a directory that is NOT THERE counts as empty. A directory we could not read is
  // reported as non-empty — the conservative answer, because "empty" is the answer that leads to a
  // removal, and a swallowed error must never be the reason something is deleted.
  let entries;
  try { entries = readdirSync(T(rel), { withFileTypes: true }); } catch (e) { return missing(e); }
  for (const e of entries) if (e.isDirectory()) pruneEmptyDirs(`${rel}/${e.name}`);
  let after;
  try { after = readdirSync(T(rel)); } catch (e) { return missing(e); }
  if (after.length === 0 && rel !== WORK_REL) {
    try { rmdirSync(T(rel)); prunedDirs.push(rel); return true; } catch { return false; }
  }
  return after.length === 0;
}
pruneEmptyDirs(WORK_REL);

// state.md AFTER the moves: the folders are real now, so lite's own derivation reads the truth.
const ctx2 = scanContext(MAIN);
const states = features.map((f) => stateFor(f, ctx2));
for (const s of states) write(s.path, s.content);

write(REPORT_REL, buildReport(null));

// Scoped to the paths this migration touched, and only the ones that exist — `git add -A -- <path>`
// errors on a pathspec that matches nothing, and a broad `git add -A` would be relying on the
// clean-tree preflight rather than on knowing what it staged.
const stagePaths = [CONDUCTED, '.claude', 'CLAUDE.md', '.github'].filter((p) => hasT(p));
step(['add', '-A', '--', ...stagePaths], 'stage the migration');

const msg = `move this repo to conducted-lite

Everything the lite machinery has no concept for is under .conducted/archive,
moved and not deleted, so git log --follow still finds its history. The one page
of law is .conducted/CONDUCTOR.md and the ledger derives itself from what exists.

Read .conducted/archive/MIGRATION-REPORT.md: it lists every file that moved and
everything that still needs a person, including the rulings to distil into
standards.md and the briefs nobody split.
`;
step(['commit', '--no-verify', '-m', msg], 'commit the migration');
const sha = g(['rev-parse', 'HEAD']);

// The report on disk names the BRANCH as the revert target, not the sha, and is NOT rewritten now
// that the sha exists. Rewriting it would leave the working tree dirty the second the migration
// finished; amending to re-commit it would change the very sha it had just recorded. The branch
// carries exactly one commit, so its name IS the commit, and the sha is printed below.
const finalDirty = gitRaw(['status', '--porcelain'], MAIN).replace(/\s+$/, '');

process.stdout.write([
  `conducted-lite migration APPLIED.`,
  ``,
  `  repo            ${MAIN}`,
  `  detected        conducted doctrine v${VERSION}`,
  `  branch          ${BRANCH}   (cut from ${startBranch} @ ${startSha.slice(0, 12)})`,
  `  commit          ${sha}`,
  `  moved           ${movedFileCount} file(s) in ${moves.length} git mv call(s)`,
  `  wrote           ${writes.length + states.length + 1} file(s)`,
  `  deleted         0 file(s). It never deletes a file.`,
  ...(prunedDirs.length
    ? [`  emptied dirs    ${prunedDirs.length} now-COMPLETELY-EMPTY director(y/ies) removed after their files moved out — git tracks no directory, so nothing was lost, and without this each one would show up as a phantom empty feature:\n${prunedDirs.map((d) => '                    ' + d).join('\n')}`]
    : []),
  `  merged/pushed   NOTHING. \`${startBranch}\` is exactly as you left it.`,
  finalDirty
    ? `  working tree    NOT CLEAN — this should not happen, and it is printed rather than hidden:\n${finalDirty.split('\n').map((l) => '                    ' + l).join('\n')}`
    : `  working tree    clean`,
  ``,
  `TO UNDO ALL OF IT:`,
  `  git revert --no-edit ${sha}`,
  `or simply never merge the branch:`,
  `  git checkout ${startBranch} && git branch -D ${BRANCH}`,
  ``,
  `TO CONTINUE (this script did not do either — a push is the one thing nobody local can undo):`,
  `  git push -u origin ${BRANCH}`,
  `  gh pr create --base ${startBranch} --head ${BRANCH} --title "move to conducted-lite" --body-file ${REPORT_REL}`,
  ``,
  `THE REPORT — also saved to ${REPORT_REL}. Paste it back to whoever asked for this.`,
  ``,
  buildReport(sha),
].join('\n'));
