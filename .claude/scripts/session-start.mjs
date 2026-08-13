#!/usr/bin/env node
// conducted-lite session-start — REGENERATE the roadmap from reality, then FACT-CHECK what the
// files claim against what is actually there.
//
//   node .claude/scripts/session-start.mjs [--no-tidy] [--offline] [--rescaffold]
//
// IT IS ALSO THE SAFETY NET, AND THAT IS A LOAD-BEARING PROPERTY RATHER THAN A NICE ONE. Nothing
// else in this machinery is guaranteed to run. The per-turn Stop glance refreshes what it can, but
// only best-effort and only what it can derive without a network call.
// The SessionEnd run is BEST-EFFORT: its documented reasons are prompt_input_exit, logout, clear,
// resume, bypass_permissions_disabled and other — a closed terminal, a SIGKILL and a crash are not
// among them and produce no record at all. So THIS is the one moment a conductor is guaranteed to be
// told what state the repo is in, and everything it reports is DERIVED FROM GIT AND THE FILESYSTEM:
// uncommitted work, local-only commits, worktrees nothing accounts for, and every claim a state.md
// makes. `.conducted/last-session.md` is a CONVENIENCE. Its absence is normal and proves nothing;
// when it is missing, stale or truncated this script says so plainly and carries on, because it
// never needed it. A safety net that depends on the thing it is catching is not a safety net.
//
// THE ONE RULE THIS FILE IS BUILT AROUND: **the machine informs, it never decides.** It will move a
// row from `refined` to `development` because a branch exists — that is not a judgement, it is
// reading. It will NEVER move a row to `complete`, never tick an acceptance criterion, and never
// treat a merged PR as an ending. When the evidence outruns its authority it says so in a sentence
// and stops: "this reads as complete; the roadmap says development." The human moves it or does not.
//
// Three things it is allowed to TIDY, and the line between them and everything else is drawn at
// REVERSIBILITY plus a HUMAN TRIGGER:
//   1  sweep `## complete` into archive.md — the human already made the call by moving the row; the
//      sweep is bookkeeping after the fact, and archive.md keeps every byte.
//   2  remove a worktree whose branch is provably merged into origin's default branch AND whose
//      checkout is completely clean — every byte of it is in origin, so nothing can be lost. When
//      containment cannot be VERIFIED (origin's objects are not in this clone), it reports and does
//      nothing: an unfetched clone must never be read as "merged".
//   3  delete a LOCAL branch provably contained in origin's default branch — OWNER RULING,
//      2026-08-13: "the branch itself should be clean up - the remote branch dies on merge, the
//      local one needs to die too." The SAME containment proof as 2, made by the same function, so
//      the two can never drift apart. Never the branch checked out anywhere, never the default
//      branch, and never on an unverified answer.
// Everything else is reported. Moving anything toward `complete`, writing a document, ticking a
// box: all judgement, none of it here.
//
// See lite-core.mjs for the properties every file in this machinery inherits (argv-only children,
// byte-splice ownership of human regions, content-hash freshness, named E_* errors).
import {
  fail, posix, gitq, gitRaw, gitOut, runOut, parseArgs, rejectUnknownFlags, checkouts,
  readSplit, writeSplit, noMarkers, rescaffoldSplit, scanContext, listFeatures, featureFacts, readFactsCarrier,
  prDeclaration, parseLedger, renderLedger, placeFeatureRows, archivedNames, mergedIntoDefault, onlyBadJson, outOfConvention,
  globToRe, trackingSnapshot, missing, shipContext, shipEvidence, worktreeGlobScan, collapsedMachineDir,
  STATUSES, CONDUCTED, WORK_REL, ROADMAP_REL, ARCHIVE_REL, CONDUCTOR_REL, END_REL, START_REL, ALLOW_REL,
  LEDGER_START, LEDGER_END, ARCHIVE_START, ARCHIVE_END, FACTS_START, FACTS_END,
  ROADMAP_HEAD, ARCHIVE_HEAD, bytesOf,
  existsSync, readFileSync, join,
} from './lite-core.mjs';

const HELP = `conducted-lite session-start — regenerate ${ROADMAP_REL} from what exists, then
fact-check every claim in ${WORK_REL}/<feature>/state.md against reality.

  node ${START_REL} [--no-tidy] [--offline] [--rescaffold]

THE ONE RULE IT IS BUILT AROUND: IT INFORMS, IT NEVER DECIDES. Moving a row from 'refined' to
'development' because a branch exists is reading, not judgement, so it does that. It will NEVER move
a row to 'complete', never read a merged PR as an ending, and never tick an acceptance criterion.
When the evidence outruns its authority it says so in one sentence and stops — "this reads as
complete; the roadmap says development" — and you move the row, or you do not.

WHAT IT DERIVES — THE HEADINGS ARE THE STATUS. Nobody maintains a status field, so no status field
can drift. FOUR of the six rungs are derived; the other two are yours alone:
  ${WORK_REL}/<feature>/ + git reality  ->  the heading the row sits under.
    idea         NOT DERIVED, ever. An idea is a hand-written line with no folder, kept verbatim, in
                 your order, under the heading you wrote it beneath. (Only blank lines around a
                 section are normalised, so two runs produce identical bytes; no non-blank line of
                 yours is altered, reordered or dropped.)
    new          the folder exists (problem.md is what it is FOR, but the folder alone is enough)
    accepted     solution.md exists
    refined      tech-design.md exists
    development  a branch or a worktree exists for it
      branch   = any local or origin branch whose last '/'-segment is the feature name
      worktree = any linked worktree whose directory name is the feature name. The convention is
                 'worktrees/<feature>/' inside the repo; one beside it as '<repo>_<feature>' is
                 still read (the prefix is stripped) and is REPORTED as out of convention.
    complete     NEVER DERIVED, and the rung this script will never assign under any evidence. Only
                 a human writes it, by moving the row under '## complete'.

  IT NEVER MOVES A ROW DOWN THE LADDER. A merged branch that was deleted would otherwise demote
  'development' back to 'refined', which reads as the machine undoing your work. Placement is the
  HIGHER of what the roadmap already says and what the evidence shows.
  THAT GUARD PROTECTS AGAINST REGRESSION, NOT AGAINST BEING BORN WRONG: a repo that adopts lite
  AFTER its features merged derives them as 'refined' the FIRST time, with nothing to hold on to.
  So a feature with no branch and no worktree is asked about instead — see 'did it ship?' below.

WHAT IT REPORTS WITH NO RECORD AT ALL — this is the safety net, and it is the reason nothing else
in this machinery has to be guaranteed. Each of these is derived from git and the filesystem now:
  · uncommitted            work in the MAIN checkout that nothing accounts for. Files this
                           machinery wrote, and anything matched by ${ALLOW_REL},
                           are subtracted and counted rather than listed.
  · local-only             commits ahead of their upstream, read from \`refs/remotes/\` — the tracking
                           refs cached at your LAST FETCH. No network call, so it is labelled "vs
                           last fetch" everywhere and never "vs origin"; branches with no upstream
                           at all, and upstreams that are gone, are named too.
  · orphan-worktree        a linked worktree with no ${WORK_REL}/<name>/ folder, so nothing on the
                           roadmap accounts for whatever is in it.
  · record                 whether ${CONDUCTED}/last-session.md is absent, stale (older than the
                           newest commit) or truncated. It is reported ON, never relied ON: its
                           absence is normal, because the SessionEnd hook that writes it is
                           best-effort and a closed terminal writes nothing.

  · did-this-ship          a feature with NO branch and NO worktree, where something local says its
                           code landed anyway: a commit on the default branch naming it, another ref
                           containing it, this clone's reflog, or a branch its own state.md recorded
                           that now exists nowhere. A branch that merged and was deleted is
                           INDISTINGUISHABLE from one that never existed, so the row can read as
                           unbuilt while the code is live. A QUESTION WITH ITS EVIDENCE, never a
                           move. No network: local refs only, so it is as of your LAST FETCH.
  · glob-config            tracked config that walks the tree by glob — vite/vitest/jest, tsconfig
                           include, eslint, c8/nyc — with no mention of \`worktrees\`, while worktrees
                           sit inside the repo. Gitignored hides them from git and from nothing else.
                           REPORTED, NEVER EDITED, and it is a text search, not an evaluation.

WHAT IT REPORTS AND WILL NOT DO:
  · reads-as-complete       every branch merged, nothing dirty, PR merged — reported against the
                            heading the roadmap actually has it under. NOT MOVED. Completion is a
                            judgement about whether the thing is DONE, not about whether code landed.
  · under complete but not  a row the human marked complete whose branch is unmerged or whose
                            worktree is dirty. Reported. Not moved back: the human's word stands.
  · claim vs reality        state.md's facts block recorded a branch / worktree / PR last session.
                            Each one is looked up now, and any that vanished or changed is named.
                            A PR is DECLARED by a line whose whole content is 'PR: #<n>' or the
                            pull-request URL (a leading '-' bullet aside) below the facts markers.
                            The colon is required and a mention inside a sentence declares nothing:
                            the human region is prose, and prose must not put a fact in a facts
                            block. Whatever is found is QUOTED wherever it is reported.
  · acceptance criteria     counted, never ticked. No script in this repo ticks a box.

WHAT IT TIDIES — everything else it only reports. The line is drawn at REVERSIBLE plus a HUMAN
TRIGGER, and '--no-tidy' turns all of it off:
  1 sweep '## complete' into ${ARCHIVE_REL} — you already made the call by moving
    the row there; the sweep is bookkeeping after the fact and the archive keeps every byte. An
    archived name is never regenerated onto the roadmap: delete its archive row to bring it back.
  2 remove a worktree whose branch is PROVABLY contained in origin's default branch AND whose
    'git status --porcelain' is empty — every byte of it is in origin, so nothing can be lost. The
    BRANCH is not the worktree's to keep: it is item 3's business, by the owner's ruling of
    2026-08-13. When containment cannot be VERIFIED (origin's objects are not in this clone), it
    reports and does nothing: an unfetched clone is never read as "merged". Merged but dirty is also
    reported and never removed — it holds bytes that exist nowhere else.
  3 delete a LOCAL branch that is PROVABLY contained in origin's default branch. OWNER RULING,
    2026-08-13: "the branch itself should be clean up - the remote branch dies on merge, the local
    one needs to die too." The proof is item 2's proof, made by the same function, so the two can
    never disagree about the same branch. WHAT MAKES IT REVERSIBLE IS THE PROOF, NOT THE FLAG: every
    commit on the branch is contained in origin's default branch, so nothing on it exists only here
    and 'git branch <name> <sha>' puts the ref back — this clone's reflog holds the tip besides.
    NEVER DELETED: the branch you have checked out; a branch checked out in ANY worktree, read AFTER
    item 2's removals so a branch freed this run counts and one still held does not; the default
    branch itself, under whatever name origin gives it. Containment UNVERIFIED deletes nothing and
    is reported with its reason — an unfetched clone is never read as "merged".
  4 'git worktree prune' — removes the REGISTRATION of a worktree whose directory is already gone.
    By git's own definition it touches nothing on disk.
Moving anything toward 'complete', writing a document, ticking a box: all judgement, and none of it
happens here.

WHAT IT PRINTS FIRST — an INSTRUCTION, then the orientation. A SessionStart hook's stdout reaches the
MODEL and never the transcript, so no hook mechanism can put any of this on a human's screen. The
handoff is therefore behavioural: the block opens by asking the reading session to say where things
stand out loud, and the orientation under it is written to be relayed nearly verbatim — what is in
development and WHERE it lives, what is ready to pick up, the thinner rungs as counts, and how the
last session ended. **IT STATES AND NEVER ASKS**: no queue, no dispatch board, no counts against a
budget, nothing expecting a response. A column the owner is meant to action means it has drifted.

FLAGS:
  --no-tidy     report only. Nothing is swept, nothing is pruned, nothing is removed.
  --offline     skip the one 'gh pr list' call. Declared PRs are then reported UNVERIFIED, which is
                also what happens when gh is absent — an unchecked claim is never printed as checked.
  --rescaffold  insert the ledger markers into ${ROADMAP_REL} — AFTER a leading '# ' title
                if the file has one, above everything otherwise. Nothing else is moved or rewritten.
  --help        this text.

EXIT: always 0 unless a NAMED E_* error made it refuse to write. This script informs; it never
blocks. The SessionStart hook that runs it fails open on everything, including this exiting nonzero.

KNOWN LIMITS — said plainly rather than implied away:
  · THE LEDGER IS NO LONGER REGENERATED ONLY WHEN THIS SCRIPT RUNS (rewritten 2026-08-13; the
    sentence that stood here said it was, and named the cost: a feature folder or worktree created
    MID-SESSION had no row until this ran again, and the in-flight allowance in
    'node ${END_REL}' and in the per-turn stop glance is keyed to a row under
    '## development', so a live builder's uncommitted work read as unaccounted-for until then. The
    field hit that three times in one session and it looked like a fault each time.)
    THE PER-TURN GLANCE NOW REGENERATES THE SAME GENERATED ROWS, through the SAME placement ratchet
    (\`placeFeatureRows\`), writing only when they differ. WHAT IS STILL ONLY THIS SCRIPT'S: the sweep
    into ${ARCHIVE_REL}, the worktree and branch tidies, the prune, the 'did it ship?'
    question, every fact-check below, and the one optional network call. The glance refreshes; it
    never tidies and never asks. It is also best-effort, so a stale ledger is still possible and
    re-running this is still the answer — it is safe to run at any time.
  · Everything it says about origin comes from refs THIS CLONE ALREADY HOLDS — local-only commits,
    'did it ship?' and every merge-containment answer are as of your LAST FETCH. The only network
    call in the whole run is the optional 'gh pr list', and '--offline' removes that one.
  · It reads the human region but never interprets it: an acceptance criterion is counted, a PR is
    read only from a line whose whole content is the declaration, and prose is never a fact.`;

const { positional, flags } = parseArgs(process.argv.slice(2));
if (flags.help) { process.stdout.write(HELP + '\n'); process.exit(0); }
rejectUnknownFlags(flags, ['no-tidy', 'offline', 'rescaffold'], 'session-start');
if (positional.length) fail('E_USAGE', `session-start takes no positional arguments (got: ${positional.join(' ')}) — flags only; see --help`);

const TIDY = !flags['no-tidy'];
const now = new Date().toISOString();
const today = now.slice(0, 10);

const cos = checkouts();
const MAIN = cos.main;
if (!existsSync(join(MAIN, CONDUCTOR_REL))) {
  process.stdout.write(`conducted-lite session-start: no ${CONDUCTOR_REL} in ${posix(MAIN)} — this is not a conducted-lite repo. Nothing done.\n`);
  process.exit(0);
}

const findings = [];   // reported, never acted on
const tidied = [];     // done, each with its evidence
const report = (kind, text) => findings.push({ kind, text });

let ctx = scanContext(MAIN);

// ---------------------------------------------------------------------------- tidy: worktrees

// This runs BEFORE the roadmap is generated, deliberately: a row that names a worktree this run is
// about to remove is a row that was wrong the moment it was written.
//
// `git worktree prune` only ever removes the REGISTRATION of a worktree whose directory is already
// gone. Nothing on disk is touched by it, by git's own definition — which is why it is on this side
// of the line and 'git worktree remove' needs the whole conjunction below.
if (TIDY) {
  const dry = gitq(['worktree', 'prune', '--dry-run', '-v'], MAIN);
  if (dry) { gitq(['worktree', 'prune'], MAIN); tidied.push(`git worktree prune — removed registrations for directories already gone:\n      ${dry.split('\n').join('\n      ')}`); }
}

for (const w of ctx.worktrees) {
  // The convention is `worktrees/<feature>/` INSIDE the repo: one place, already covered by
  // .gitignore, and the directory name IS the feature name. A worktree somewhere else is parsed and
  // reconciled normally — a check that can never pass is one people learn to ignore — and then said
  // out loud with the command that moves it. Informs, never blocks: this is a finding, not a failure.
  if (w.layout !== 'in-repo') report('worktree-layout', outOfConvention(w, MAIN));
  const head = gitq(['rev-parse', 'HEAD'], w.path);
  const branch = gitq(['rev-parse', '--abbrev-ref', 'HEAD'], w.path);
  const porcelain = gitRaw(['status', '--porcelain'], w.path).replace(/\s+$/, '');
  const m = head ? mergedIntoDefault(head, ctx.def) : { state: 'unverified', why: 'no HEAD' };
  const clean = porcelain === '';
  if (m.state === 'merged' && clean) {
    if (!TIDY) { report('would-remove', `worktree \`${w.label}\` is merged and clean and would be removed — not done (--no-tidy)`); continue; }
    const r = gitOut(['worktree', 'remove', w.path], { cwd: MAIN });
    if (r.ok) tidied.push(`removed worktree \`${w.label}\` — branch \`${branch}\` @ ${head.slice(0, 8)} contained in \`origin/${ctx.def}\`, 'git status --porcelain' empty.`);
    else report('remove-failed', `worktree \`${w.label}\` is merged and clean and 'git worktree remove' failed: ${r.err.split('\n')[0]}`);
    continue;
  }
  if (m.state === 'unverified') report('unverified', `worktree \`${w.label}\`: merged status UNKNOWN — ${m.why}. Not removed.`);
  else if (m.state === 'merged' && !clean) report('merged-dirty', `worktree \`${w.label}\` is merged into \`origin/${ctx.def}\` and NOT clean; it holds bytes that exist nowhere else. Not removed:\n      ${porcelain.split('\n').join('\n      ')}`);
}

// ---------------------------------------------------------------------------- tidy: merged branches
//
// OWNER RULING, 2026-08-13: "the branch itself should be clean up - the remote branch dies on merge,
// the local one needs to die too." Until then this file removed the worktree and said in as many
// words that THE BRANCH IS NOT DELETED; that refusal is overruled and the sentence is gone from the
// help. What replaced it is not a lower bar, it is THE SAME BAR: containment is answered by
// `mergedIntoDefault` — the one function the worktree removal above and the fact-check below both
// ask — so there is exactly one copy of "is this in origin's default branch?" in the machinery and
// no way for two answers to drift apart.
//
// WHY THIS IS REVERSIBLE, WHICH IS THE ONLY REASON IT IS ALLOWED HERE AT ALL: the proof says every
// commit reachable from the branch tip is reachable from `origin/<default>`. Nothing on it exists
// only on this machine, so `git branch -D` after that proof destroys no bytes — it drops a NAME, and
// the name comes back with `git branch <name> <sha>` (the sha is printed with every deletion, and
// HEAD's reflog holds it besides). `-D` rather than `-d` is correct precisely BECAUSE the proof was
// already made and made against origin's default branch: `-d` would consult the branch's upstream,
// which is a different and weaker question.
//
// NO NETWORK, like everything else here: containment is measured against `refs/remotes/origin/<def>`
// as this clone last cached it. That is SAFE IN THIS DIRECTION and only this one — origin's default
// branch only ever gains commits, so contained-in-the-cached-tip implies contained-in-the-real-tip,
// and a stale clone can only ever refuse to delete something it could have deleted.
//
// It runs AFTER the worktree removals on purpose and re-reads `git worktree list` rather than
// reusing the snapshot above: a branch whose worktree was just removed is now free to delete, and a
// branch whose worktree is still standing must not be.
if (ctx.locals.length) {
  const BRANCH_PREFIX = 'branch refs/heads/';
  const checkedOut = new Set(gitq(['worktree', 'list', '--porcelain'], MAIN).split('\n')
    .filter((l) => l.startsWith(BRANCH_PREFIX)).map((l) => l.slice(BRANCH_PREFIX.length).trim()));
  const unverified = new Map();          // reason -> the branches it applies to
  for (const b of ctx.locals) {
    // The three protections, in the order they are cheapest to answer. The first two are also
    // enforced by git itself ('cannot delete branch used by worktree'), which is belt and braces
    // rather than duplication: a guard whose failure mode is a caught error is not a guard.
    if (checkedOut.has(b.name)) continue;                  // yours, or some worktree's, right now
    if (ctx.def && b.name === ctx.def) continue;           // the default branch, under ITS OWN name
    const m = mergedIntoDefault(b.sha, ctx.def);
    if (m.state === 'unverified') { if (!unverified.has(m.why)) unverified.set(m.why, []); unverified.get(m.why).push(b.name); continue; }
    if (m.state !== 'merged') continue;                    // unmerged is the ordinary case and is silent
    if (!TIDY) { report('would-remove', `local branch \`${b.name}\` @ ${b.sha.slice(0, 8)} is contained in \`origin/${ctx.def}\` and would be DELETED — not done (--no-tidy)`); continue; }
    const r = gitOut(['branch', '-D', b.name], { cwd: MAIN });
    if (r.ok) tidied.push(`deleted local branch \`${b.name}\` @ ${b.sha.slice(0, 8)} — every commit on it is contained in \`origin/${ctx.def}\`. Undo: git branch ${b.name} ${b.sha.slice(0, 8)}`);
    else report('remove-failed', `local branch \`${b.name}\` is contained in \`origin/${ctx.def}\` but 'git branch -D' failed: ${r.err.split('\n')[0]}`);
  }
  // Grouped by REASON rather than one line per branch: when a clone cannot verify containment the
  // cause is almost always repo-wide (no origin/HEAD, no cached origin/<def>), and the same sentence
  // repeated once per branch is a finding people learn to skip past.
  for (const [why, names] of unverified) {
    const shown = names.slice(0, 12).map((n) => '`' + n + '`').join(', ') + (names.length > 12 ? ` … and ${names.length - 12} more` : '');
    report('unverified', `${names.length} local branch(es): containment in the default branch UNKNOWN — ${why}. None deleted: ${shown}.`);
  }
}

// Re-read reality after the tidy: everything below derives from it, and deriving from a
// pre-tidy snapshot is the same class of error as reading a status field.
ctx = scanContext(MAIN);

const { ok: names, rejected } = listFeatures(MAIN);
const features = names.map((n) => featureFacts(MAIN, n, ctx));

// ---------------------------------------------------------------------------- per-feature reality

// A feature "reads as complete" when every branch it has is provably contained in origin's default
// branch, nothing of its is dirty, and any declared PR is merged. That is a statement about CODE
// LANDING. It is never a statement about the work being finished — which is why it is only ever
// printed, and why the sentence it prints names the disagreement rather than resolving it.
for (const f of features) {
  const human = f.hasState ? readSplit(f.statePath, FACTS_START, FACTS_END) : null;
  f.split = human;
  f.humanText = human && human.markers ? human.head + human.tail : (human && human.exists ? human.text : '');
  f.prev = human && human.markers ? readFactsCarrier(human.body) : null;
  // The declaration and the LINE that made it: a PR is the one claim with no evidence behind it, so
  // wherever it is reported the source is quoted with it.
  f.prDecl = prDeclaration(f.humanText);
  f.pr = f.prDecl ? f.prDecl.number : '';
  f.merge = f.branches.map((b) => ({ branch: b.name, ...mergedIntoDefault(b.sha, ctx.def) }));
  f.dirty = f.worktrees.map((w) => ({ w, out: gitRaw(['status', '--porcelain'], w.path).replace(/\s+$/, '') })).filter((x) => x.out !== '');
  f.criteria = countCriteria(f.humanText);
}

// Acceptance criteria are COUNTED and never touched. The count exists so the report can say "3 of 7"
// and stop talking; the ticking is the human's and there is no flag that changes that.
function countCriteria(text) {
  const lines = String(text).split(/\r?\n/);
  let total = 0, done = 0, inSection = false;
  for (const l of lines) {
    const t = l.trim();
    if (/^##\s/.test(t)) { inSection = /^##\s+acceptance/i.test(t); continue; }
    if (!inSection) continue;
    const m = t.match(/^-\s+\[([ xX])\]/);
    if (m) { total++; if (m[1] !== ' ') done++; }
  }
  return { total, done, inSection: total > 0 };
}

// ---- the one optional network call, flat cost: every PR in one request or none at all.
let prs = null, prWhy = 'not needed — no feature declares a PR';
const declaredPRs = features.filter((f) => f.pr);
if (declaredPRs.length) {
  if (flags.offline) prWhy = 'skipped by --offline';
  else {
    const r = runOut('gh', ['pr', 'list', '--state', 'all', '--limit', '100', '--json', 'number,state,headRefName,title'], { timeout: 20_000 });
    if (!r.ok) prWhy = `'gh pr list' unavailable (${r.err.split('\n')[0].slice(0, 120)}) — declared PRs are reported UNVERIFIED, never guessed`;
    else {
      // NARROW, and the try wraps the PARSE and nothing else: gh's output is data we did not write,
      // so a SyntaxError there is news about gh. Wrapping the Map building too would let a mistake in
      // THIS line be reported as "gh returned something unparseable" — a lie about another program.
      let parsed = null;
      try { parsed = JSON.parse(r.out); } catch (e) { onlyBadJson(e); parsed = null; }
      if (Array.isArray(parsed)) { prs = new Map(parsed.map((p) => [String(p.number), p])); prWhy = `gh pr list --state all (${prs.size} PR(s) seen)`; }
      else prWhy = "'gh pr list' returned something this script could not parse — declared PRs reported UNVERIFIED";
    }
  }
}
for (const f of features) {
  if (!f.pr) { f.prState = null; continue; }
  if (!prs) { f.prState = { state: 'UNVERIFIED', why: prWhy }; continue; }
  const p = prs.get(f.pr);
  f.prState = p ? { state: String(p.state).toUpperCase(), title: p.title } : { state: 'NOT FOUND', why: 'no PR with that number in this repo' };
}

const readsComplete = (f) =>
  (f.branches.length > 0 || !!f.pr) &&
  f.merge.every((m) => m.state === 'merged') &&
  f.dirty.length === 0 &&
  (!f.pr || (f.prState && f.prState.state === 'MERGED'));

// ---------------------------------------------------------------------------- the roadmap ledger

const roadmapPath = join(MAIN, ROADMAP_REL);
let rm = readSplit(roadmapPath, LEDGER_START, LEDGER_END);
if (!rm.exists) rm = { exists: false, markers: true, raw: Buffer.alloc(0), text: '', head: bytesOf(ROADMAP_HEAD), body: '', bodyBin: '', tail: '\n' };
else if (!rm.markers) {
  if (flags.rescaffold) { const r = rescaffoldSplit(rm.raw); rm = { exists: true, markers: true, raw: rm.raw, text: rm.text, head: r.head, body: '', bodyBin: '', tail: r.tail }; }
  else if (rm.blocked) fail('E_LITE_NO_MARKERS', `${ROADMAP_REL}: ${rm.blocked} NOTHING WAS WRITTEN.`);
  else noMarkers(roadmapPath, LEDGER_START, LEDGER_END, `or have them inserted above your existing content:  node ${START_REL} --rescaffold`);
}

// THE BYTE-EXACT FORM, because this body is re-rendered and its human lines are HAND-WRITTEN.
// `rm.body` is decoded UTF-8 and is for READING; `rm.bodyBin` is the bytes, and everything written
// back has to come from it or a hand-written line loses whichever bytes UTF-8 could not represent —
// which is exactly what a Latin-1 idea line lost before. See the splice note in lite-derive.mjs.
const ledger = parseLedger(rm.bodyBin);

// ---- the sweep. ONLY from complete, and only ever in that direction.
const archived = archivedNames(MAIN);
const sweep = ledger.sections.get('complete').rows.filter((r) => !archived.has(r.name));
if (TIDY && sweep.length) {
  const ap = join(MAIN, ARCHIVE_REL);
  let ar = readSplit(ap, ARCHIVE_START, ARCHIVE_END);
  if (!ar.exists) ar = { exists: false, markers: true, raw: Buffer.alloc(0), head: bytesOf(ARCHIVE_HEAD), body: '\n', bodyBin: '\n', tail: '\n' };
  else if (!ar.markers) noMarkers(ap, ARCHIVE_START, ARCHIVE_END, 'add them and re-run; nothing was swept.');
  // APPEND, and it is the one place this machinery does. Named as an exception in lite-core.mjs:
  // an archive is a log by definition, and it is what lets roadmap.md stay bounded and forward-looking.
  const body = ar.bodyBin.replace(/\s+$/, '') + '\n\n' + [`## ${today}`, '', ...sweep.map((r) => r.line), ''].join('\n');
  writeSplit(ap, ar, ARCHIVE_START, ARCHIVE_END, body + '\n');
  ledger.sections.get('complete').rows = [];
  for (const r of sweep) { archived.add(r.name); tidied.push(`swept '${r.name}' from '## complete' into ${ARCHIVE_REL} under '## ${today}', row kept verbatim`); }
} else if (sweep.length) {
  for (const r of sweep) report('would-sweep', `'${r.name}' is under '## complete' and would be swept into ${ARCHIVE_REL} — not done (--no-tidy)`);
}

// ---- regenerate the rows. Placement is the HIGHER of declared and derived; complete is neither
// entered nor left here. THE RATCHET ITSELF IS `placeFeatureRows` IN lite-derive.mjs — one copy,
// because the per-turn Stop glance now regenerates these same rows mid-session and two
// implementations of "the higher of declared and derived, complete is sticky, never move a row DOWN"
// would spend the session undoing each other. It returns EVENTS and no sentences; the words below
// are this script's and are unchanged.
for (const ev of placeFeatureRows(ledger, features, archived)) {
  const f = ev.feature;
  if (ev.kind === 'orphan-row') {
    report('orphan-row', `${ROADMAP_REL} has a row for '${ev.name}' under '## ${ev.status}' and ${WORK_REL}/${ev.name}/ does not exist. Row preserved verbatim. mkdir ${WORK_REL}/${ev.name}, or delete the row.`);
  } else if (ev.kind === 'archived') {
    if (f.branches.length || f.worktrees.length) report('archived-but-live', `'${f.name}' is in ${ARCHIVE_REL} and still has ${[f.branches.length ? `branch ${f.branches.map((b) => '`' + b.name + '`').join(', ')}` : '', f.worktrees.length ? `worktree \`${f.worktrees[0].label}\`` : ''].filter(Boolean).join(' and ')}. Not regenerated onto the roadmap; delete its archive row to bring it back.`);
  } else if (ev.kind === 'moved') {
    report('moved', `'${ev.name}' moved '${ev.from}' -> '${ev.to}' — derived from what exists in ${f.rel}/ and in git`);
  } else if (ev.kind === 'held') {
    report('held', `'${ev.name}' derives '${ev.derived}' from what exists now; the roadmap says '${ev.at}'. HELD at '${ev.at}' — rows never move down. Move it yourself if the work stopped.`);
  } else if (ev.kind === 'added') {
    report('added', `'${ev.name}' is new to the roadmap; placed under '## ${ev.to}' from what exists in ${f.rel}/`);
  }
}

writeSplit(roadmapPath, rm, LEDGER_START, LEDGER_END, renderLedger(ledger));

// ---------------------------------------------------------------------------- the fact-check

// The ship question's four sources are gathered ONCE and only if some feature is eligible to be asked
// about — four local git calls for the whole repo, no network, and none at all in the ordinary case
// where every feature has a branch or a worktree.
let SHIP = null;
const shipCtx = () => (SHIP || (SHIP = shipContext(ctx.def)));

for (const n of rejected) report('bad-name', `${WORK_REL}/${n}/ is skipped: a feature name must match [A-Za-z0-9][A-Za-z0-9._-]* so it survives being written into a markdown link and read back out of one. Rename it.`);

for (const f of features) {
  if (archived.has(f.name)) continue;

  // --- claim vs reality: what the last session-end RECORDED, looked up now.
  if (f.prev) {
    for (const b of f.prev.claimed.branches) {
      if (!ctx.locals.some((x) => x.name === b) && !ctx.remotes.some((x) => x.name === b)) {
        report('drift', `'${f.name}': state.md records branch \`${b}\` (as of ${f.prev.claimed.at || 'an earlier run'}); it exists neither locally nor on origin now.`);
      }
    }
    for (const w of f.prev.claimed.worktrees) {
      if (!ctx.worktrees.some((x) => x.label === w || x.path === w)) {
        report('drift', `'${f.name}': state.md records worktree \`${w}\`; 'git worktree list' does not show it now.`);
      }
    }
    if (f.prev.claimed.pr && f.pr && f.prev.claimed.pr !== f.pr) {
      report('drift', `'${f.name}': state.md recorded PR #${f.prev.claimed.pr}; its human region now declares PR #${f.pr}, by the line "${f.prDecl.line}".`);
    }
  } else if (f.hasState && f.split && f.split.truncated) {
    // One marker present and the other missing is a file CUT IN HALF, which is a different thing
    // from one nobody scaffolded, and worth saying differently: every write here is atomic, so this
    // machinery cannot have produced it. An editor, a merge conflict or a hand-edit did.
    report('truncated', `'${f.name}': ${f.rel}/state.md is TRUNCATED — one facts marker present, the other missing, so nothing in it can be fact-checked. Repair the pair by hand, or: node ${END_REL} --rescaffold`);
  } else if (f.hasState) {
    report('no-markers', f.split && f.split.blocked
      ? `'${f.name}': ${f.rel}/state.md — ${f.split.blocked} Nothing in it can be fact-checked until then, and nothing here touched it.`
      : `'${f.name}': ${f.rel}/state.md has no facts markers, so nothing in it can be fact-checked. node ${END_REL} --rescaffold`);
  } else if (f.branches.length || f.worktrees.length) {
    // Only worth saying once there is something to be wrong ABOUT. A feature that has never been
    // worked on has no claims to check, and reporting its missing state.md every session start is
    // the nagging this reshape exists to remove.
    report('no-state', `'${f.name}': work has started (${f.branches.length ? 'a branch exists' : 'a worktree exists'}) and ${f.rel}/state.md does not exist. node ${END_REL}`);
  }

  // --- DID IT SHIP? The one question the derivation cannot answer for itself.
  //
  // `development` is derived from a branch or a worktree EXISTING. Merging destroys both, so a
  // shipped feature falls back down the ladder and reads as unbuilt — and never-demote does not save
  // it, because never-demote holds a row that is ALREADY at 'development' and a repo that adopted
  // lite after its features merged never had one. The field cost was three merged features written
  // up in their own state.md as needing builders.
  //
  // This is a REPORT AND ONLY A REPORT: no rung was added, no row was moved, and nothing was written
  // into any human region. Asked only when the folder has no branch and no worktree, and only when
  // something local actually points at a landing — a feature that simply has not started produces no
  // evidence and hears nothing.
  if (!f.branches.length && !f.worktrees.length && f.place !== 'complete') {
    const sc = shipCtx();
    const ev = shipEvidence(f, ctx.def, sc, ctx);
    if (ev.length) {
      report('did-this-ship',
        `'${f.name}' DID IT SHIP? No branch, no worktree, so it derives '${f.derived}' and sits under '## ${f.place}'. Evidence it landed anyway, from refs this clone holds (as of your last fetch):\n` +
        ev.map((e) => `      · ${e}`).join('\n') + '\n' +
        `      · no row in ${ARCHIVE_REL}.\n` +
        `      Nothing moved. If it shipped, move the row under '## complete' in ${ROADMAP_REL}.`);
    }
  }

  // --- the disagreement the owner asked for, in the sentence he asked for.
  if (readsComplete(f) && f.place !== 'complete') {
    const ev = [
      ...f.merge.map((m) => `branch \`${m.branch}\` is contained in \`origin/${ctx.def}\``),
      ...(f.prState && f.prState.state === 'MERGED' ? [`PR #${f.pr} is merged`] : []),
      ...(f.worktrees.length ? [`its worktree is clean`] : []),
    ];
    report('reads-complete',
      `'${f.name}' READS AS COMPLETE; the roadmap says '${f.place}'. Evidence: ${ev.join('; ')}. Nothing moved. Move the row under '## complete' in ${ROADMAP_REL} if it is done.`);
  }
  if (f.place === 'complete') {
    const un = f.merge.filter((m) => m.state === 'unmerged');
    if (un.length) report('complete-but-open', `'${f.name}' is marked complete and ${un.map((m) => `branch \`${m.branch}\` is NOT contained in \`origin/${ctx.def}\``).join('; ')}. Left alone.`);
    if (f.dirty.length) report('complete-but-dirty', `'${f.name}' is marked complete and its worktree \`${f.dirty[0].w.label}\` has uncommitted changes. Left alone.`);
  }

  // --- everything else that is worth saying and is not a decision.
  for (const m of f.merge) if (m.state === 'unverified') report('unverified', `'${f.name}': branch \`${m.branch}\` merged status UNKNOWN — ${m.why}. git fetch origin`);
  if (f.prState && (f.prState.state === 'UNVERIFIED' || f.prState.state === 'NOT FOUND')) report('unverified', `'${f.name}': PR #${f.pr}, declared by the line "${f.prDecl.line}", is ${f.prState.state} — ${f.prState.why}.`);
  if (f.criteria.total) report('criteria', `'${f.name}': acceptance criteria ${f.criteria.done}/${f.criteria.total} ticked.`);
  if (!f.hasProblem && f.docs.length === 0 && !f.branches.length && !f.worktrees.length) report('empty', `'${f.name}': folder exists with no documents, no branch and no worktree.`);
}

// ---------------------------------------------------------------------------- the safety net
//
// EVERY FINDING IN THIS SECTION IS DERIVED FROM GIT AND THE FILESYSTEM AND READS NO RECORD. That is
// the whole point of it: the checks that used to run only on the way out now may never run, so the
// facts a session most needs — work only this clone holds, commits only this clone holds, a worktree
// nothing accounts for — have to be re-derivable on the way IN, from nothing but the repo. The one
// paragraph that touches `last-session.md` is the one that reports on `last-session.md` itself.

const LAST_REL = `${CONDUCTED}/last-session.md`;
const CAP = 12;      // a report names a handful and counts the rest
const capped = (arr) => arr.slice(0, CAP).join(', ') + (arr.length > CAP ? ` … and ${arr.length - CAP} more` : '');

// Paths THIS machinery writes, subtracted from its own evidence — the same discipline session-end
// applies, one script over. This run rewrote roadmap.md (and possibly archive.md) seconds ago, so
// counting them as stranded work would be a check reporting its own writing back to itself.
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const STATE_WRITE_RE = new RegExp(`^${esc(WORK_REL)}/[^/]+/state\\.md$`);
// A feature folder git has NEVER seen is reported COLLAPSED — one '?? .conducted/work/<name>/' entry
// for the whole directory rather than a line for the file inside it. `collapsedMachineDir` is the one
// copy of that rule (lite-core), shared with session-end's check 1, so the two readers of the same
// porcelain line can never disagree about whether it is accounted for.
const selfWritten = (p) => p === LAST_REL || p === ROADMAP_REL || p === ARCHIVE_REL
  || STATE_WRITE_RE.test(p) || /\.conducted-lite-tmp\.\d+$/.test(p) || collapsedMachineDir(MAIN, p);

// The same TRACKED declaration session-end honours, read the same way, so the two never disagree
// about what is accounted for. NARROW: absent is the normal case; anything else is NAMED rather than
// read as "nothing was declared", which would quietly widen the allowance.
const allowSpecs = [];
{
  const allowPath = join(MAIN, ALLOW_REL);
  let raw = null;
  try { raw = readFileSync(allowPath, 'utf8'); }
  catch (e) { if (!missing(e)) report('unverified', `${ALLOW_REL} exists but could not be read (${e.message}). This run does NOT know what was declared in flight, and refuses to read that as "nothing was declared" — the uncommitted-work finding below may therefore name files you have already accounted for.`); }
  if (raw !== null) for (const line of raw.split('\n')) { const g = line.replace(/#.*$/, '').trim(); if (g) allowSpecs.push({ g, re: globToRe(g) }); }
}

// --- work that exists on this machine and nowhere else. The MAIN checkout is never in flight.
{
  const fields = gitRaw(['status', '--porcelain', '-z'], MAIN).split('\0').filter((f) => f !== '');
  const dirty = [];
  let accounted = 0;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const xy = f.slice(0, 2);
    const p = posix(f.slice(3));
    if (xy[0] === 'R' || xy[0] === 'C') i++;                       // the rename/copy source field
    if (selfWritten(p) || allowSpecs.some((a) => a.re.test(p))) { accounted++; continue; }
    dirty.push(`\`${xy} ${p}\``);
  }
  if (dirty.length) {
    report('uncommitted', `${dirty.length} uncommitted file(s) in the MAIN checkout that nothing accounts for, on this machine only: ${capped(dirty)}.${accounted ? ` (${accounted} more accounted for by ${ALLOW_REL} or written by this machinery.)` : ''} git add -A && git commit`);
  }
}

// --- commits that exist on this machine and nowhere else, WITHOUT a network call. Read from
// refs/remotes/, which is what this clone cached at its LAST FETCH, so the wording is "vs last
// fetch" and never "vs origin". session-end pays for a real ls-remote; this does not, and says so.
{
  const snap = trackingSnapshot(MAIN);
  const ahead = snap.branches.filter((b) => b.ahead > 0);
  const noUp = snap.branches.filter((b) => !b.upstream);
  const gone = snap.branches.filter((b) => b.gone);
  if (ahead.length) {
    report('local-only', `local-only commits, vs last fetch: ${capped(ahead.map((b) => `\`${b.name}\` is ${b.ahead} ahead of \`${b.upstream}\``))}. git push`);
  }
  if (noUp.length && snap.remoteRefs > 0) {
    report('local-only', `no upstream in this clone, so nothing on them has reached origin: ${capped(noUp.map((b) => '`' + b.name + '`'))}. git push -u origin <branch>`);
  }
  if (gone.length) {
    // These are the leftovers of the branch tidy above, which has ALREADY deleted every local branch
    // it could prove is contained in origin's default branch. So a branch that reaches this line has
    // a gone upstream and NO such proof: it is unmerged, or containment could not be verified. That
    // is the one case left where deleting it would destroy something, and it stays a judgement.
    const why = TIDY
      ? `none is provably contained in ${ctx.def ? '`origin/' + ctx.def + '`' : "origin's default branch"}: each is unmerged, unverifiable, or checked out somewhere, so the branch tidy left it`
      : `this run was '--no-tidy', so containment was not tested`;
    report('local-only', `upstream GONE as of the last fetch: ${capped(gone.map((b) => '`' + b.name + '`'))} — ${why}.`);
  }
  if (!snap.remoteRefs) {
    report('local-only', `this clone holds NO remote-tracking refs, so nothing in it exists anywhere else. git remote add origin <url> && git push -u origin <branch>`);
  }
}

// --- a worktree nothing accounts for. session-end's check 3, re-derived on the way in, because on
// the way out it may never have run.
{
  const featureNames = new Set(features.map((f) => f.name));
  for (const w of ctx.worktrees) {
    if (featureNames.has(w.name)) continue;
    report('orphan-worktree', `worktree \`${w.label}\` has no ${WORK_REL}/${w.name}/ folder, so nothing on the roadmap accounts for it. mkdir ${WORK_REL}/${w.name}   or   git worktree remove ${w.path} && git worktree prune`);
  }
}

// --- configs that GLOB THE TREE and will therefore walk straight into the worktrees.
//
// Gitignored hides a worktree from git and from NOTHING ELSE. Reported only once this repo actually
// has worktrees on disk — before that the hazard is not live, and the migrator says it at adoption,
// which is the moment that creates it. REPORT, NEVER EDIT: a build config is the maintainer's.
{
  const wtDir = join(MAIN, 'worktrees');
  const live = ctx.worktrees.length > 0 || existsSync(wtDir);
  if (live) {
    const scan = worktreeGlobScan(MAIN);
    if (scan.missing.length) {
      const why = ctx.worktrees.length
        ? `${ctx.worktrees.length} linked worktree(s) are on disk right now`
        : `this repo has a \`worktrees/\` directory, which is where the convention puts them`;
      report('glob-config', `${scan.missing.length} tracked config file(s) glob this tree and do not mention \`worktrees\`, and ${why}. Exclude \`worktrees/**\` in each:\n` +
        scan.missing.map((m) => `      · \`${m.rel}\` — ${m.what}`).join('\n') + '\n' +
        `      Nothing was edited. Text search only; it does not evaluate a build config and cannot see an untracked one.`);
    }
    for (const u of scan.unreadable) {
      report('glob-config', `\`${u.rel}\` ${u.why}.`);
    }
  }
}

// --- and finally, the record itself: reported ON, never relied ON. Everything above was already
// derived without it, so this paragraph is the only place its state matters at all.
// A record that is present and current is a one-line header note, because it changes nothing: it
// was not consulted. A record that is MISSING, STALE or TRUNCATED is a finding, because a session
// that assumes the record is authoritative would then be reading a lie.
let recordLine;
let lastInfo = null;   // what the orientation says about the last session, or null for "no record"
{
  const lastPath = join(MAIN, LAST_REL);
  let text = null;
  let unreadable = '';
  try { text = readFileSync(lastPath, 'utf8'); }
  catch (e) { if (!missing(e)) unreadable = e.message; }
  // Read out of the record ONLY the two facts the orientation quotes back — how the last run ended and
  // which features it touched. Both are lines session-end wrote; neither is trusted for anything else,
  // and everything above this point was derived without opening this file at all.
  if (text !== null) {
    const how = text.match(/^- \*\*how this run came about: ([^*]+)\*\*/m);
    const touched = text.match(/^- features: \d+ total, (\d+) touched this session(?: — (.*))?$/m);
    lastInfo = {
      how: how ? how[1].trim() : '',
      touched: touched && touched[2] ? touched[2].trim() : '',
      touchedCount: touched ? Number(touched[1]) : null,
      at: '', condition: 'ok',
    };
  }
  // The newest commit anywhere in this repo: the cheapest honest "is the record older than the
  // evidence" comparator, and one this script can always answer.
  const newest = gitq(['log', '-1', '--format=%cI', '--all'], MAIN);
  const nt = Date.parse(newest);
  if (unreadable) {
    lastInfo = null;
    recordLine = `${LAST_REL}: PRESENT BUT UNREADABLE (${unreadable})`;
    report('record', `${LAST_REL} exists and could not be read (${unreadable}). Nothing above used it.`);
  } else if (text === null) {
    recordLine = `${LAST_REL}: ABSENT — nothing above needed it`;
    report('record', `${LAST_REL} is absent. Normal: the SessionEnd hook that writes it is best-effort. Nothing above used it.`);
  } else {
    const m = text.match(/\*\*Verified ([0-9T:.\-Z]+)\*\*/);
    const t = m ? Date.parse(m[1]) : NaN;
    if (lastInfo) { lastInfo.at = m ? m[1] : ''; lastInfo.condition = 'ok'; }
    if (!Number.isFinite(t)) {
      if (lastInfo) lastInfo.condition = 'undateable';
      recordLine = `${LAST_REL}: PRESENT BUT UNDATEABLE — treat as truncated`;
      report('record', `${LAST_REL} carries no readable '**Verified <timestamp>**' line, so it cannot be dated. Treat it as truncated or hand-edited.`);
    } else if (Number.isFinite(nt) && nt > t) {
      if (lastInfo) lastInfo.condition = 'stale';
      recordLine = `${LAST_REL}: STALE — written ${m[1]}, newest commit ${newest}`;
      report('record', `${LAST_REL} is STALE: written ${m[1]}, and this repo holds a commit dated ${newest}. Work happened after it was written.`);
    } else {
      recordLine = `${LAST_REL}: written ${m[1]} (${((Date.now() - t) / 3600000).toFixed(1)}h ago), nothing in git is newer`;
    }
  }
}

// ---------------------------------------------------------------------------- the report

const counts = STATUSES.map((s) => {
  const sec = ledger.sections.get(s);
  const n = sec.rows.length + (s === 'idea' ? sec.human.filter((l) => l.trim().startsWith('- ')).length : 0);
  return `${s} ${n}`;
}).join(' · ');

// The safety-net facts come FIRST — work and commits only this clone holds, and a worktree nothing
// accounts for. They are the ones nothing else is guaranteed to say, so they must not be read after
// twenty lines of bookkeeping.
const order = ['uncommitted', 'local-only', 'orphan-worktree', 'did-this-ship', 'glob-config',
  'reads-complete', 'held', 'complete-but-open', 'complete-but-dirty', 'drift', 'orphan-row', 'archived-but-live',
  'bad-name', 'truncated', 'no-markers', 'no-state', 'record', 'unverified', 'merged-dirty', 'remove-failed',
  'worktree-layout', 'would-sweep', 'would-remove', 'moved', 'added', 'criteria', 'empty'];
findings.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));

// ------------------------------------------------------------------------------ WHERE THINGS STAND
//
// THIS BLOCK REACHES A HUMAN OR IT REACHES NOBODY. A SessionStart hook's stdout is handed to the model
// as context and is NOT shown in the transcript — verified against the docs — so there is no mechanism
// that can put it on the owner's screen. The handoff is therefore BEHAVIOURAL: the injected text opens
// by asking the session to say this out loud, and the orientation below is written to be relayed
// nearly verbatim. Everything under it is unchanged and still the machine's own reading.
//
// THE HARD RULE: **THIS ORIENTATION STATES, IT NEVER ASKS.** No "ready for dispatch", no queue, no
// counts against a budget, no column the owner is supposed to action, nothing expecting a response.
// The old framework's dispatch board was a demand surface and this must never drift back into one.
// IF IT EVER GROWS A COLUMN THE OWNER IS MEANT TO ACT ON, IT HAS DRIFTED — delete the column.
// It is also SHORT by rule: a handful of lines. Findings are below, where they already were, and
// anything that wants to be a table belongs there and not here.

const live = features.filter((f) => !archived.has(f.name));
const at = (s) => live.filter((f) => f.place === s);

// Where a feature LIVES — the answer to "what am I in the middle of, and where is it". Names only
// what exists right now; a row held at 'development' by the never-demote rule has nothing to name and
// says so, rather than implying a branch that is gone.
const whereItLives = (f) => {
  const bits = [];
  for (const b of f.branches) bits.push(`branch \`${b.name}\``);
  for (const w of f.worktrees) bits.push(`worktree \`${w.label}\``);
  if (f.pr) bits.push(`PR #${f.pr} (${f.prState ? f.prState.state.toLowerCase() : 'unverified'})`);
  return bits.length ? bits.join(' · ') : 'no branch and no worktree exist for it now';
};

const count = (s) => {
  const sec = ledger.sections.get(s);
  return sec.rows.length + (s === 'idea' ? sec.human.filter((l) => l.trim().startsWith('- ')).length : 0);
};

const lastLine = () => {
  if (!lastInfo) {
    return `  Last session: no record (normal — the record is written on the way out and is best-effort).`;
  }
  const what = lastInfo.touchedCount ? `touched ${lastInfo.touched}` : 'touched no feature';
  const when = lastInfo.at ? `ended ${lastInfo.at}` : 'end time unreadable';
  const how = lastInfo.how ? ` (${lastInfo.how})` : '';
  const caveat = lastInfo.condition === 'stale' ? ' That record is STALE: a commit is newer than it.'
    : lastInfo.condition === 'undateable' ? ' That record cannot be dated; treat it as truncated.' : '';
  return `  Last session: ${when}${how}, ${what}.${caveat}`;
};

const dev = at('development');
const ready = at('refined');

const orientation = [
  `WHERE THINGS STAND — ${today}`,
  '',
  dev.length
    ? '  In development:\n' + dev.map((f) => `    · ${f.name} — ${whereItLives(f)}`).join('\n')
    : '  In development: nothing. No feature has a branch or a worktree.',
  ready.length
    ? `  Ready to pick up (a tech design exists, nothing started): ${ready.map((f) => f.name).join(', ')}`
    : '  Ready to pick up: nothing — no feature has a tech design waiting.',
  `  Earlier rungs and ideas: ${['idea', 'new', 'accepted'].map((s) => `${count(s)} ${s}`).join(' · ')}.`,
  lastLine(),
].join('\n');

// THE INSTRUCTION STAYS — it is functional, and a SessionStart hook's stdout reaches the model and
// never the transcript, so nothing else can put this on the owner's screen. Its FRAMING is trimmed to
// what the instruction needs. Everything below it is a fact or a command; the derivation preamble,
// the reassurance essays and the closing statement of law are gone from every run and live in --help
// and in ${CONDUCTOR_REL}, which is where law belongs. OWNER RULING, 2026-08-13.
process.stdout.write(
  `INSTRUCTION, before anything else: open your first message by telling the owner where things stand,\n` +
  `in your own words, in a few plain lines — what is in development and where it lives, what is ready\n` +
  `to pick up, how the last session ended. Say it even when nothing is wrong; none of this is on his\n` +
  `screen. State it, do not turn it into a menu or a question, then wait for him.\n\n` +
  orientation + '\n\n' +
  `conducted-lite ${now}\n` +
  `repo ${posix(MAIN)}   default branch ${ctx.def ? '`origin/' + ctx.def + '`' : '(UNKNOWN — no origin/HEAD; merged-checks below are UNVERIFIED)'}\n` +
  `${ROADMAP_REL} regenerated from ${features.length} feature folder(s): ${counts}\n` +
  `PRs: ${prWhy}\n` +
  `record: ${recordLine}\n\n` +
  (tidied.length
    ? `TIDIED:\n` + tidied.map((t) => `  · ${t}`).join('\n') + '\n\n'
    : `TIDIED: nothing${TIDY ? '' : ' (--no-tidy)'}.\n\n`) +
  (findings.length
    ? `REPORTED:\n` + findings.map((f) => `  [${f.kind}] ${f.text}`).join('\n') + '\n'
    : `REPORTED: nothing.\n`)
);
