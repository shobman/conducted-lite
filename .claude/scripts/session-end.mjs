#!/usr/bin/env node
// conducted-lite session-end — the guard rails, RUN rather than asserted.
//
//   node .claude/scripts/session-end.mjs [--allow-dirty "<globs>"] [--effort "<note>"] [--rescaffold]
//   node .claude/scripts/session-end.mjs --abandon --reason "<why>" [--session-id <id>]
//
// The endemic failure it answers is asserted-not-verified — a session that says "all pushed" while
// commits sit local-only — so EVERY claim printed here is printed with the command's real output
// beside it, and anything a machine cannot check is printed as a NAMED reminder that is never
// counted as verified.
//
// TWO CALLERS, AND IT IS THE SAME RUN EITHER WAY:
//   BY HAND        the deliberate wrap-up. Prints the assurance block, or the UNMANAGED list with
//                  the exact command that fixes each finding. This is the path that means something.
//   SessionEnd     the hook, once, when the context terminates — passing `--end-reason <reason>`.
//                  BEST-EFFORT: a closed terminal, a crash or a kill fires nothing at all, and
//                  `clear`/`resume` fire while the work CONTINUES. So the record this writes says
//                  which of those happened and never claims the work finished, and nothing
//                  downstream is allowed to depend on it having run — `session-start.mjs` derives
//                  what it reports from git and treats this record as a convenience.
// It is NOT run from `Stop`. `Stop` fires once per TURN, and wiring a network round trip and two
// file rewrites to it made this machinery a per-turn cost and a perpetual source of dirt in the tree
// it audits. `.claude/hooks/stop-glance.mjs` is what runs per turn now, and it is local and silent.
//
// It can be KILLED MID-WRITE, because a terminating session is exactly when that happens. Every
// write goes through lite-core's `writeAtomic` — temp file, then rename — so a kill leaves the whole
// old file or the whole new one and never half of either.
//
// Lifted from the proven V13 M1 engine (`session-end`) and reshaped for the .conducted/ layout.
// What changed when the global STATE.md died: freshness is now PER FEATURE. Only a feature this
// session actually touched — its branch got commits, or its folder changed — has to have a fresh
// state.md. A feature nobody looked at is not nagged about, and its file is not even rewritten.
//
// The load-bearing properties live in lite-core.mjs and must survive every edit: argv-only children
// (no shell, ever), byte-splice ownership so human regions are preserved by construction, freshness
// from a content hash and never an mtime, one `ls-remote` for the whole repo, named E_* errors.
import {
  fail, posix, gitq, gitRaw, gitOut, gitOk, refExists, parseArgs, rejectUnknownFlags, checkouts,
  readSplit, writeSplit, writeAtomic, rescaffoldSplit, scanContext, listFeatures, featureFacts, readFactsCarrier, prDeclaration,
  declaredStatuses, inFlightState, globToRe, sanitize, b64, unb64, judgmentHash, quoted, missing, onlyBadJson, outOfConvention,
  newFeatureState, renderFactsBody, declaredLabel, toBinary, bytesOf, NAME_RE, mkdirSync, collapsedMachineDir,
  WINDOW_H, WINDOW_MS, SESSION_LOG_KEEP,
  CONDUCTED, WORK_REL, ROADMAP_REL, ARCHIVE_REL, CONDUCTOR_REL, END_REL, START_REL, ALLOW_REL,
  FACTS_START, FACTS_END, LEDGER_START, LEDGER_END, STATE_HUMAN_SCAFFOLD, stateHead,
  existsSync, readFileSync, join,
} from './lite-core.mjs';

// The one file in .conducted/ with NO human region at all: wholly machine-written, rewritten whole
// every run. It is not the old STATE.md wearing a new name — STATE.md died because it held judgment
// (Now / Next / Parked) that now lives per feature. This holds only what a command returned, plus
// the one thing that has no per-feature home: the record of a dirty stop.
const LAST_REL = `${CONDUCTED}/last-session.md`;

const HELP = `conducted-lite session-end — THE VERIFIER. It RUNS the guard-rail checks, CONFIRMS what
is already true, and writes the record. Nothing here is asserted; every line is a command's real
output. It writes exactly two things — each touched feature's state.md and ${LAST_REL} —
and NEVER the roadmap. See WHAT IT NEVER WRITES below.

  node ${END_REL} [--allow-dirty "<globs>"] [--effort "<note>"] [--rescaffold]
  node ${END_REL} --abandon --reason "<why>" [--session-id <id>]

IT IS NO LONGER THE FIRST WRITER OF A FACT, AND THAT CHANGES WHAT IT IS FOR (2026-08-13). Until now
a feature's facts block and the roadmap's rows became true only at a session BOUNDARY — which is to
say they were false for the whole middle of every session, and the field reported that three times
in one sitting. The per-turn glance (.claude/hooks/stop-glance.mjs) now RE-DERIVES the ledger rows
and each feature's facts block at the end of every turn and rewrites only the ones whose derived
content actually differs. So by the time this script runs, state should ALREADY BE TRUE.
  THIS SCRIPT'S JOB IS TO PROVE IT, and to add the two things a per-turn hook must not: the ONE real
'git ls-remote' against origin, and the written record of how the session ended. Where it finds a
fact that is not current it still rewrites it — being the backstop is part of being the verifier, and
the glance is best-effort like everything else here — but that is now the exception and not the
mechanism. Nothing downstream may assume this run happened.
  NOTHING HERE IS WEAKER FOR IT. Every check below runs exactly as it did, on the same evidence, and
every guarantee under WHAT IT NEVER WRITES is unchanged.

WHEN IT RUNS. By hand, which is the deliberate wrap-up and the path that means something; and once
from the SessionEnd hook when the context terminates, with --end-reason. NOT from Stop: Stop fires
once per TURN, and this run costs a NETWORK ROUND TRIP, which is the thing a per-turn event can never
afford. The per-turn hook is .claude/hooks/stop-glance.mjs: local only, no network call of any kind,
silent unless a fact CHANGED, and it cannot block. It writes only when derived content differs from
the bytes on disk, so it is not a per-turn source of dirt the way the original Stop wiring was.
NOTHING IN THIS REPO BLOCKS A SESSION ANY MORE. The SessionEnd hook is notification-only by the
harness's own definition, and it is BEST-EFFORT besides: a closed terminal, a crash or a kill fires
nothing. The real safety net is 'node ${START_REL}', which derives everything it
reports from git and needs no record at all.

CHECKS — FOUR, and these are all of them. Each is printed with the command that verified it:
  1 nothing stranded      'git status --porcelain' is empty in this checkout and in every worktree.
                          Every accounted-for file is NAMED with the SOURCE that accounted for it —
                          never silently suppressed. Hiding a file is the failure this check exists
                          to catch, so an allowed file is louder, not quieter.
                          IN FLIGHT, DERIVED — a linked worktree whose feature folder exists AND
                          whose row sits under '## development' in ${ROADMAP_REL} is a
                          DECLARED in-flight claim. Its uncommitted work is named as in flight, with
                          the warning that it exists on this machine only, and does NOT fail. That is
                          what lets a conductor running parallel builders end a session honestly
                          instead of reaching for --abandon, which would record an abandonment that
                          did not happen. It is not a rubber stamp — these still FAIL:
                            · the MAIN checkout, always. Dirt there is real stranding.
                            · a dirty worktree whose name maps to no feature folder.
                            · a dirty worktree whose feature is declared anywhere but 'development'.
                          THE DECLARED ALLOWANCES, both NAMED on every line they account for:
                            --allow-dirty "<globs>"   comma-separated, repo-relative ('*' = one
                                          segment, '**' = any depth; a bare directory matches
                                          everything under it). Manual runs only.
                            ${ALLOW_REL}   a TRACKED file, one glob per line, '#'
                                          comments. A hook run can read this; it cannot read a flag,
                                          because a hook is a fresh process and nothing from the
                                          conductor's shell reaches it. Committed, so the allowance
                                          appears in review and can never be set invisibly.
                          A glob that matched NOTHING is REPORTED (it does not fail): a line left
                          behind after its builder landed is a silent hole in this check.
                          THE IMPLICIT ALLOWANCES, named every time: ${LAST_REL} and every
                          feature's state.md — the ones this run wrote AND any an earlier run wrote
                          that was never committed (this script writes them, so failing on them makes
                          the check unpassable by construction), plus
                          ${ROADMAP_REL} and ${ARCHIVE_REL} (the SessionStart
                          fact-check wrote those earlier in this same session).
  2 nothing unpushed      ONE 'git ls-remote --heads origin' for the whole repo — not one call per
                          branch; flat cost is the property this inherits from the M1 engine —
                          compared against every local branch tip. THREE outcomes per branch, never
                          two, because containment is a question about objects this clone may not
                          hold:
                            pushed        same tip, or local tip provably contained in origin's.
                            local-only    origin's commit IS present here and containment genuinely
                                          fails — NAMED, with the real ahead-count and 'git push'.
                            UNVERIFIED    origin's commit is NOT present here (origin moved ahead and
                                          this clone has not fetched — the normal state minutes after
                                          a PR merges). Containment is UNKNOWN, not false. It is
                                          NAMED as its own finding and FAILS the check — an
                                          unverified claim never passes silently — but it is never
                                          reported as "not contained", and the fix is
                                          'git fetch origin' then re-run, not a push that git would
                                          reject non-fast-forward. This script does NOT fetch for
                                          you: a check that changes the repo to make itself pass is
                                          not a check.
                          A branch absent from origin is NAMED as existing only in this clone.
  3 worktrees reconciled  'git worktree list', reconciled against the FEATURE FOLDERS rather than
                          against a prose file. Every linked worktree must have a matching
                          ${WORK_REL}/<name>/. The convention is \`worktrees/<feature>/\` INSIDE the
                          repo, and the directory name IS the feature name — the same name that
                          derives 'development' on the roadmap. A worktree beside the repo as
                          \`<repo>_<feature>\` is still parsed (the prefix is stripped) and still
                          reconciles; it is REPORTED as out of convention, never failed. The reverse
                          direction (a state.md recording a worktree that is gone) is checked only
                          for features this session TOUCHED, because nagging about a feature nobody
                          opened is the noise this reshape exists to remove.
  4 touched state.md      Every feature this session TOUCHED has a state.md whose HUMAN region
                          changed within ${WINDOW_H}h. Touched means one of: a commit on its branch
                          inside the window, a commit touching ${WORK_REL}/<name>/ inside the
                          window, or an uncommitted change under that folder right now.
                          THIS SCRIPT'S OWN WRITES ARE SUBTRACTED FROM ITS OWN EVIDENCE. state.md
                          never makes a feature touched (nor do last-session.md, roadmap.md and
                          archive.md), and a commit of nothing but those files never does either —
                          this script rewrites state.md every run, so without the subtraction one run
                          makes its own next run true and there is no third option: don't commit and
                          state.md is dirty; commit, as the closing advice says to, and the commit is
                          inside the window. ANY OTHER path under the folder still counts — a new
                          tech-design.md, an edited problem.md, a builder's note.
                          Freshness is a content hash recorded in the facts block, NOT the file's
                          mtime — same reason, one level down. Untouched features are not checked and
                          not rewritten.
                          THE GLANCE RECORDS THE SAME HASH, by the same function, which is why this
                          check is unaffected by it: the hash is of YOUR region, and no machine in
                          this repo writes there. The dating is if anything more honest than it was —
                          the timestamp beside the hash is now when your region ACTUALLY changed
                          rather than when this script first noticed.

THEN IT WRITES — two kinds of file and no others. EVERY WRITE IS ATOMIC: temp file, then rename, so
a kill mid-write leaves the whole old file or the whole new one and never half of either. That
matters because the SessionEnd path runs while the session is terminating and can be killed between
any two bytes.
  ${WORK_REL}/<name>/state.md   for every TOUCHED feature. Two regions: this script owns only
  the bytes between
    ${FACTS_START}
    ${FACTS_END}
  and REWRITES that block in place on every run — never appends. Everything OUTSIDE the markers
  ('## Decisions', '## Issues', '## Acceptance criteria') is yours. The script splices by byte index
  and never touches it, never reorders it, never reads it as an instruction, and NEVER ticks an
  acceptance criterion. The session log inside the block is bounded to the last ${SESSION_LOG_KEEP}
  entries, so a log inside a rewritten block cannot grow without limit.
  THE PER-TURN GLANCE REFRESHES THIS SAME BLOCK, through the SAME renderer (renderFactsBody in
  lite-derive.mjs), with the same markers and the same shape — so nothing it wrote is foreign here and
  this run sees a block it could have written itself. The one line that differs is the provenance
  line, which names whichever of the two last had a reason to write, and it is held constant by the
  comparison so neither program rewrites the other's block for the sake of a name. The glance never
  adds a session-log entry: a turn is not a session.
  ${LAST_REL}   wholly machine-written, rewritten whole. No human region, so nothing to protect.
                          NOTHING ELSE WRITES THIS FILE. The glance does not, and must not: how a
                          session ended is not a per-turn fact.
  state.md missing        -> created from the template, facts filled, human sections left with their
                             guidance comments (and check 4 reports the finding).
  markers missing         -> E_LITE_NO_MARKERS naming the file. It is NOT modified. Silently
                             rewriting someone else's file is the failure this refuses; add the
                             markers by hand, or run --rescaffold.

WHAT IT NEVER WRITES — the guarantee to check before you run this at close-out:
  ${ROADMAP_REL}   NEVER. Not a row, not a heading, not a byte. This script READS the
                          roadmap, to learn which features are DECLARED in flight (check 1), and
                          that is the whole of its relationship with the file. Hand-written rows,
                          ideas and anything else you put there cannot be clobbered by running this.
                          Regenerating the ledger belongs to 'node ${START_REL}'
                          and, since 2026-08-13, to the per-turn glance — which regenerates the SAME
                          generated rows, through the same placement ratchet, and writes only when
                          they differ. Neither of those is this script, and this script still never
                          touches the file. (That sentence used to end "and to nothing else"; the
                          glance made it false, so it is rewritten rather than left standing.)
  ${ARCHIVE_REL}   NEVER, for the same reason. Sweeping is also session-start's, and the
                          glance never sweeps either — a sweep is a tidy with a human trigger.
  your human regions      NEVER. Outside the facts markers is yours, spliced around by byte index.
                          NO SCRIPT IN THIS REPO TICKS AN ACCEPTANCE CRITERION, including this one,
                          and none unticks one either.

FLAGS:
  --allow-dirty "<globs>"  comma-separated, repo-relative. Matched files are NAMED as accounted for,
                           with this flag as the source. A hook run cannot receive a flag, so for
                           that path use ${ALLOW_REL} instead.
  --effort "<note>"        record an effort ESTIMATE. Per ${CONDUCTOR_REL} effort is
                           "information, never a budget". A script cannot know your subagents' token
                           counts — those arrive in this session's tool results, not in git — so the
                           conductor passes the number in and this records it verbatim and
                           unverified. Carried forward until re-passed. Nothing caps or acts on it.
  --abandon --reason "<why>" [--session-id <id>]
                           the deliberate dirty stop: "I am leaving this unfinished and here is
                           why". Records it HONESTLY into ${LAST_REL} — naming every
                           failed check, the reason, an ISO timestamp and the session id — and exits
                           0. The reason is MANDATORY: an unexplained dirty stop is the failure, not
                           the fix. It releases nothing, because nothing blocks any more; it is a
                           record, and its whole value is that the next session and the human read
                           it. Pass --session-id to key the record to THIS session.
  --end-reason <reason>    passed by the SessionEnd hook, which is the only caller that has one.
                           It decides what the record SAYS THIS WAS, and the distinction is the
                           point:
                             prompt_input_exit, logout    a genuine ending — the work stopped here.
                             clear, resume                a CONTEXT BOUNDARY. The context ended and
                                                          the work did not. The record says so and
                                                          claims nothing about the work finishing.
                             bypass_permissions_disabled, other, anything unrecognised
                                                          recorded verbatim, classified as neither.
                           Omitted on a run by hand, which is recorded as exactly that.
  --rescaffold             insert the facts markers into any touched feature's state.md that lacks
                           them — AFTER a leading '# ' title if it has one, above everything
                           otherwise. Nothing else in the file is moved or rewritten.
  --new-feature "<name>"   CREATE ${WORK_REL}/<name>/ and a correctly-shaped state.md, then STOP.
                           No checks run, no other flag is accepted, and nothing is overwritten: an
                           existing folder is a refusal, and so is a name outside
                           [A-Za-z0-9][A-Za-z0-9._-]*. It writes NO roadmap row — the next
                           'node ${START_REL}' derives one from the folder, which is
                           what "you change a status by making it true" means. It lives on THIS
                           script because this script owns state.md's shape; a generator anywhere
                           else would be a second copy of that shape waiting to drift.
  --help                   this text.

NOT CHECKED BY ANYTHING HERE — the six lines every run prints under that heading, and what each one
means. They are printed as bare items because a reminder that argues with you is one people skip;
the reasoning is here, once. (Runtime output was cut to facts by owner ruling, 2026-08-13.)
  state.md's human region changed, and that is ALL the freshness check knows. Whether what it says
    is TRUE is not a machine question and this script does not pretend otherwise.
  what a cold successor cannot re-derive: judgment calls, near-misses, warnings, half-formed
    suspicions. "Nothing to record" is a legal answer ONLY after a real attempt at that list.
  acceptance criteria are counted and never ticked. No script in this repo ticks one, and none
    unticks one either.
  a stale '## Issues' entry is worse than no note at all — the next reader believes it.
  stray processes: kill by PID, never by pattern. This script will not guess which PIDs were this
    session's, and a pattern kill in a repo with parallel builders takes out the wrong one.
  the --effort figure is an estimate the conductor passed in. Information, never a budget, and
    nothing verified it.

EXIT: 0 with the assurance block (every check VERIFIED, output quoted). 1 with the UNMANAGED list —
each finding, why, and the exact command that fixes it. NEITHER EXIT BLOCKS ANYTHING. On the
SessionEnd path the exit code is ignored by the harness itself; the findings live in
${LAST_REL} and in the next SessionStart's report, which is where a human reads them.
ON FAILURE THE FILES ARE WRITTEN ANYWAY. state.md and ${LAST_REL} are rewritten before
either verdict prints, so a failed check RECORDS the unmanaged state and lands in the files a
successor reads instead of scrolling past in one terminal. Writing is not the reward for passing.

HONEST LIMITS — said plainly rather than implied away:
  · NOTHING HERE STOPS A SESSION. A session can end with work stranded and no machinery will
    prevent it. What is guaranteed is that the fact is DERIVABLE and gets said — per turn by
    stop-glance, at the start of the next session by ${START_REL}, and here on
    demand. That is strictly weaker than the block it replaces, and it is the honest strength.
  · THE SessionEnd RUN MAY NEVER HAPPEN. The documented reasons are prompt_input_exit, logout,
    clear, resume, bypass_permissions_disabled and other; a closed terminal, a SIGKILL and a crash
    are not among them and write nothing. So ${LAST_REL} may be missing or older
    than the repo. ${START_REL} is built for that and says so out loud.
  · Check 2 verifies containment only when this clone HOLDS origin's commits; when it does not, it
    says so and fails rather than guessing either way.
  · The in-flight allowance is per WORKTREE, not per file: every uncommitted file in a declared
    'development' worktree is accounted for, so a builder can also leave junk there and it is named
    rather than caught. What is guaranteed is that the work is NAMED and that nothing pretends it is
    durable — not that a builder's worktree contains only what it should.
  · ${ALLOW_REL} globs are NOT scoped to a checkout: a glob matches that path in
    every checkout, including the main one, so keep them narrow. The in-flight derivation is the
    reason that matters less than it did — a live builder needs no glob at all.
  · Check 4 is silent when this session touched no feature folder at all. That is deliberate — see
    the note it prints — but it means a session spent entirely outside ${WORK_REL}/ leaves no
    written trace, and nothing mechanical can tell you whether it should have.
  · THE ROADMAP IS NO LONGER REGENERATED ONLY AT SESSION START (rewritten 2026-08-13; the sentence
    that stood here said it was). Check 1's in-flight allowance is keyed to a row under
    '## development', so a feature created mid-session used to read here as work nobody declared and
    fail check 1 though nothing was wrong. The per-turn glance now regenerates the rows at the end of
    every turn, so an ordinary mid-session feature has its row before this ever runs. WHAT IS STILL
    TRUE: the glance is best-effort like everything else — if it did not run, or could not write, the
    ledger is stale and check 1 fails on a live builder for that reason. That is a stale ledger and
    not a finding: 'node ${START_REL}' regenerates it, it is safe to run at any
    time, and then re-run this.
  · A FEATURE FOLDER THAT IS ONLY ON ITS BRANCH IS STILL NOT DECLARED. A feature committed on its
    branch and not yet merged has no row on main's roadmap and cannot have one until it lands, so
    check 1 still fails on that worktree's dirt — correctly, because the declaration genuinely is not
    on main. The glance names that state honestly ("declared on its branch, not yet on main") rather
    than calling the worktree an orphan, which is what it used to do while quoting a file from inside
    the very folder it said did not exist.
  · The '--effort' figure is recorded verbatim and never verified.`;

// ---------------------------------------------------------------------------- args

const { positional, flags } = parseArgs(process.argv.slice(2));
if (flags.help) { process.stdout.write(HELP + '\n'); process.exit(0); }
rejectUnknownFlags(flags, ['allow-dirty', 'abandon', 'reason', 'effort', 'session-id', 'rescaffold', 'end-reason', 'new-feature'], 'session-end');
if (positional.length) fail('E_USAGE', `session-end takes no positional arguments (got: ${positional.join(' ')}) — flags only; see --help`);
if (flags['allow-dirty'] === true) fail('E_USAGE', '--allow-dirty needs a value: --allow-dirty "<glob>[,<glob>…]"');
if (flags['end-reason'] === true) fail('E_USAGE', '--end-reason needs a value: --end-reason <reason>. It is the SessionEnd payload\'s own `reason` field.');
if (flags.effort === true) fail('E_USAGE', '--effort needs a value: --effort "<note>". It is an ESTIMATE for information, never a budget — see --help.');
if (flags['session-id'] === true) fail('E_USAGE', '--session-id needs a value: --session-id <id>');
if (flags.reason !== undefined && !flags.abandon) fail('E_USAGE', '--reason is only meaningful with --abandon: --abandon --reason "<why>"');
if (flags.abandon && (typeof flags.reason !== 'string' || !flags.reason.trim())) {
  fail('E_REASON_REQUIRED', '--abandon requires a written reason: --abandon --reason "<why>". An unexplained dirty stop IS the failure this script exists to prevent; the written reason is what makes it a handoff instead.');
}

const cos = checkouts();
const MAIN = cos.main;
const now = new Date().toISOString();
const sinceISO = new Date(Date.now() - WINDOW_MS).toISOString();

// ---------------------------------------------------------------------------- --new-feature (a scaffold, and then it stops)

// WHY THIS LIVES ON session-end AND NOT ON session-start. This script is the sole owner and writer of
// state.md's shape: `stateHead`, `STATE_HUMAN_SCAFFOLD`, the marker pair, the facts block it rewrites
// every run, the E_LITE_NO_MARKERS refusal and `--rescaffold` are all its. Until now the ONLY routes
// to a correctly-shaped state.md were copying an existing one or tripping that refusal first, which
// is a generator's job done by an error message. A generator anywhere else would be a SECOND COPY of
// a shape this script rewrites — the same argument that put the shared rules in lite-rules.mjs — so
// the fix and the failure now share one --help. (session-start's job is to DERIVE the roadmap from
// what exists; it is told about this folder the same way it is told about any other: by finding it.)
//
// It writes ONE file, runs NO checks, and exits. It never overwrites: an existing folder is a refusal.
if (flags['new-feature'] !== undefined) {
  const others = Object.keys(flags).filter((k) => k !== 'new-feature' && k !== 'help');
  if (others.length) fail('E_USAGE', `--new-feature is a scaffold and runs none of the checks, so it takes no other flags (got: ${others.map((o) => '--' + o).join(', ')}). Create the feature, then run 'node ${END_REL}' on its own.`);
  const name = typeof flags['new-feature'] === 'string' ? flags['new-feature'].trim() : '';
  if (!name) fail('E_USAGE', `--new-feature needs a value: --new-feature "<name>". The name IS the folder name, the branch's last '/'-segment and the worktree's directory name — one convention, three consumers.`);
  if (!NAME_RE.test(name)) {
    fail('E_BAD_NAME', `'${name}' is not a legal feature name. It must match [A-Za-z0-9][A-Za-z0-9._-]* — a name has to survive being written into a markdown link and read back out of one, and an unrestricted name is a parser bug waiting for a ']'. NOTHING WAS CREATED.`);
  }
  const folder = join(MAIN, WORK_REL, name);
  if (existsSync(folder)) {
    fail('E_FEATURE_EXISTS', `${WORK_REL}/${name}/ already exists. This script never writes over a file it did not write, and a scaffold that clobbered a feature's state.md would destroy exactly the judgment the two-region split exists to protect. NOTHING WAS CREATED. Pick another name, or edit the folder that is already there.`);
  }
  try { mkdirSync(folder, { recursive: true }); } catch (e) { fail('E_WRITE_FAILED', `${posix(folder)}: ${e.message} — nothing was created.`); }
  const statePath = join(folder, 'state.md');
  writeAtomic(statePath, newFeatureState(name, now));      // atomic, like every write in this machinery
  process.stdout.write(
    `FEATURE SCAFFOLDED — ${WORK_REL}/${name}/\n` +
    `  created   ${WORK_REL}/${name}/state.md — facts markers in place, human region empty and yours.\n` +
    `  derived   'new' — the folder exists and nothing else does. NO ROW WAS WRITTEN: the next\n` +
    `            'node ${START_REL}' derives the row from this folder, which is what\n` +
    `            "you change a status by making it true" means.\n\n` +
    `WHAT TO DO NEXT — none of it is required, and choosing fewer documents is a judgement you make\n` +
    `out loud (the altitude law in ${CONDUCTOR_REL}):\n` +
    `  1  write only the documents this work warrants, in ${WORK_REL}/${name}/:\n` +
    `       problem.md      -> the row derives '## new'\n` +
    `       solution.md     -> '## accepted'\n` +
    `       tech-design.md  -> '## refined'\n` +
    `  2  fill in '## Decisions' / '## Issues' / '## Acceptance criteria' in state.md, OUTSIDE the\n` +
    `     facts markers. Nothing in this repo will ever tick a criterion for you.\n` +
    `  3  when a builder starts, give it a branch or a worktree named '${name}' and the row derives\n` +
    `     '## development' by itself:\n` +
    `       git worktree add worktrees/${name} -b ${name}\n` +
    `  4  commit it — a feature only this clone can see is not state that lives in files:\n` +
    `       git add ${WORK_REL}/${name} && git commit -m "conducted: new feature ${name}"\n`,
  );
  process.exit(0);
}

// HOW THIS RUN CAME ABOUT, and the one thing the record must never get wrong. `SessionEnd` means
// "this CONTEXT is ending". For `clear` and `resume` that is emphatically not "the work is done" —
// the conductor is still sitting there and the job continues in a fresh context — so a record
// saying the session ended would be a plain falsehood in the file whose whole promise is that every
// line is something a command returned. Three classes, and the unrecognised case is recorded as
// unrecognised rather than mapped onto a guess.
const END_KINDS = new Map([
  ['prompt_input_exit', { kind: 'ENDED', text: 'a genuine ending — the session was exited at the prompt. The work stopped here.' }],
  ['logout', { kind: 'ENDED', text: 'a genuine ending — logout. The work stopped here.' }],
  ['clear', { kind: 'BOUNDARY', text: 'a CONTEXT BOUNDARY, not an ending — the context was cleared and the work continues in a fresh one. NOTHING in this record says the work finished.' }],
  ['resume', { kind: 'BOUNDARY', text: 'a CONTEXT BOUNDARY, not an ending — the context was resumed elsewhere and the work continues. NOTHING in this record says the work finished.' }],
]);
const endReason = typeof flags['end-reason'] === 'string' ? flags['end-reason'].replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64) : '';
const ending = !endReason
  ? { kind: 'BY HAND', reason: '(none)', text: `run by hand (\`node ${END_REL}\`) — a deliberate wrap-up, not a termination event. Nothing terminated; someone asked.` }
  : (END_KINDS.has(endReason)
    ? { kind: END_KINDS.get(endReason).kind, reason: endReason, text: END_KINDS.get(endReason).text }
    : { kind: 'UNCLASSIFIED', reason: endReason, text: `the SessionEnd hook reported reason \`${endReason}\`, which this script does not classify as either an ending or a context boundary. Recorded verbatim rather than guessed at: this record claims NOTHING about whether the work finished.` });

// ---------------------------------------------------------------------------- which features were touched

const ctx = scanContext(MAIN);
const { ok: names, rejected } = listFeatures(MAIN);
const features = names.map((n) => featureFacts(MAIN, n, ctx));

// THE SCRIPT SUBTRACTS ITS OWN WRITES FROM ITS OWN EVIDENCE. This is the same discipline as
// "freshness is a content hash, never an mtime, because this script writes the file every run",
// applied one level up — and the field found the hole it fills. `state.md` lives under the feature
// folder and this script REWRITES it for every touched feature, so one run made its own next run
// true, by either path and with no third option: don't commit and state.md is dirty under the folder
// (reason 3); commit — which this script's own closing advice tells you to do, verbatim — and a
// commit inside the window touched the folder (reason 2). A session that opened no feature was told
// four untouched features needed fresh human regions.
//
// So a path THIS MACHINERY writes is never evidence that a human or a builder was here. Every other
// path under the folder still is: a new tech-design.md, an edited problem.md, a builder's note.
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const STATE_WRITE_RE = new RegExp(`^${esc(WORK_REL)}/[^/]+/state\\.md$`);
const wroteItself = (p) => p === LAST_REL || p === ROADMAP_REL || p === ARCHIVE_REL || STATE_WRITE_RE.test(p);

// ONE `git log` for the whole repo, across all refs, listing the paths every recent commit touched.
// N features cost the same as one — the same flat-cost discipline as the single ls-remote. The
// record separator carries the commit boundary so each path can be attributed to the commit that
// carried it, which is what lets a commit made entirely of this machinery's own writes be
// recognised as one. \x1e cannot occur in a path git prints.
const commitPaths = new Map();      // full sha -> [paths]
const touchedPaths = new Set();
for (const rec of gitq(['log', '--all', `--since=${sinceISO}`, '--name-only', '--pretty=format:%x1e%H'], MAIN).split('\x1e')) {
  const lines = rec.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!lines.length) continue;
  const paths = lines.slice(1);
  commitPaths.set(lines[0], paths);
  for (const p of paths) touchedPaths.add(p);
}
// ONE for-each-ref for every branch tip's date.
const tipDates = new Map(
  gitq(['for-each-ref', '--format=%(refname:short)%09%(committerdate:iso-strict)', 'refs/heads'], MAIN)
    .split('\n').filter(Boolean).map((l) => { const [n, d] = l.split('\t'); return [n, d]; }),
);
// The main checkout's uncommitted paths, parsed with -z so an odd filename is not quoted or split.
const dirtyPaths = gitRaw(['status', '--porcelain', '-z'], MAIN).split('\0').filter(Boolean)
  .map((f) => posix(f.slice(3)));

for (const f of features) {
  const why = [];
  const mine = (p) => p.startsWith(`${f.rel}/`) && !wroteItself(p);
  for (const b of f.branches) {
    const d = tipDates.get(b.name);
    if (!(d && Date.parse(d) >= Date.now() - WINDOW_MS)) continue;
    // A tip whose commit is NOTHING BUT this machinery's own files is this script's previous run
    // being handed back to it as evidence — the exact loop the subtraction above exists to break. An
    // empty list (a merge commit shows no paths) is not that, and still counts.
    const tip = commitPaths.get(b.sha);
    if (tip && tip.length && tip.every(wroteItself)) continue;
    why.push(`branch \`${b.name}\` has a commit inside the ${WINDOW_H}h window (tip dated ${d})`);
  }
  for (const p of touchedPaths) if (mine(p)) { why.push(`a commit inside the window touched \`${p}\``); break; }
  for (const p of dirtyPaths) if (mine(p)) { why.push(`uncommitted change under \`${f.rel}/\` right now (\`${p}\`)`); break; }
  f.touched = why.length > 0;
  f.touchedWhy = why;
}
const touched = features.filter((f) => f.touched);

// The roadmap's DECLARED status, read only. session-end never writes the roadmap — regenerating it
// is the SessionStart fact-check's job, and two writers of one file is how a ledger starts drifting.
const rmSplit = readSplit(join(MAIN, ROADMAP_REL), LEDGER_START, LEDGER_END);
const declaredStatus = rmSplit.markers ? declaredStatuses(rmSplit.body) : new Map();

// Read each touched feature's state.md up front: the checks need its human region, and the write
// needs the exact head/tail byte slices.
for (const f of features) {
  const sp = f.statePath;
  const split = readSplit(sp, FACTS_START, FACTS_END);
  f.split = split;
  if (split.exists && !split.markers) {
    // The block lands AFTER a leading '# ' title where the file has one — every other state.md in a
    // repo opens with its title, and the field's rescaffold left the document opening with a machine
    // block and the title stranded below it. One rule, in lite-core, shared with session-start.
    if (f.touched && flags.rescaffold) { const r = rescaffoldSplit(split.raw); f.split = { exists: true, markers: true, raw: split.raw, text: split.text, head: r.head, body: '', bodyBin: '', tail: r.tail }; }
    else if (f.touched) {
      // `blocked` is the UNCLOSED-FENCE case and it gets its own sentence, because "add the markers"
      // is the wrong instruction for a file whose markers are already there and merely unreadable.
      fail('E_LITE_NO_MARKERS', split.blocked
        ? `${posix(sp)}: ${split.blocked} NOTHING WAS WRITTEN, and nothing outside the markers was touched.`
        : `${posix(sp)} exists but carries no facts markers, so this script cannot tell which region it owns — and it will not guess. NOTHING WAS WRITTEN.\n` +
          `  Add these two lines where the machine facts should live (the script owns everything between them, and rewrites it every run):\n` +
          `    ${FACTS_START}\n    ${FACTS_END}\n` +
          `  or have them inserted above your existing content:  node ${END_REL} --rescaffold`);
    }
  }
  if (!f.split.exists) f.split = { exists: false, markers: true, raw: Buffer.alloc(0), head: bytesOf(stateHead(f.name)), body: '', bodyBin: '', tail: bytesOf(STATE_HUMAN_SCAFFOLD) };
  f.humanText = f.split.head + f.split.tail;
  f.prev = readFactsCarrier(f.split.body || '');
  // The declaration AND its source line: what goes into the facts block is quoted beside the number,
  // so a PR that was never opened cannot sit there looking like something a command returned.
  f.prDecl = prDeclaration(f.humanText);
  f.pr = f.prDecl ? f.prDecl.number : '';
}

// ---------------------------------------------------------------------------- check 1: stranded

// TWO SOURCES, both NAMED on every line they account for, because a HOOK RUN cannot receive a flag —
// a hook is a fresh process and nothing from the conductor's shell survives to reach it:
//   --allow-dirty "<globs>"   the manual run's form
//   .conducted/allow-dirty    a TRACKED file, one glob per line, '#' comments — the hook can read it,
//                             it is committed so the allowance appears in review, and it cannot be
//                             set invisibly the way an env var can.
const allowSpecs = [];
for (const g of (typeof flags['allow-dirty'] === 'string' ? flags['allow-dirty'] : '').split(',').map((s) => s.trim()).filter(Boolean)) {
  allowSpecs.push({ g, src: '--allow-dirty' });
}
{
  // NARROW: the file being absent is the normal case and means "no declaration". Anything else is
  // real and is NAMED. A bare catch here is precisely how the field's own version of this feature
  // shipped dead — an undefined identifier threw, the catch ate it, and the allowance silently did
  // nothing while being reported as working. The join() is outside the try for the same reason.
  const allowPath = join(MAIN, ALLOW_REL);
  let raw = null;
  try { raw = readFileSync(allowPath, 'utf8'); }
  catch (e) { if (!missing(e)) fail('E_UNREADABLE', `${ALLOW_REL}: ${e.message} — it exists but could not be read, so this run cannot know what was declared in flight. Refusing to treat that as "nothing was declared".`); }
  if (raw !== null) for (const line of raw.split('\n')) {
    const g = line.replace(/#.*$/, '').trim();
    if (g) allowSpecs.push({ g, src: ALLOW_REL });
  }
}
// Files THIS machinery writes. Failing on them would make the check unpassable by construction, and
// a guard rail that can never go green trains everyone to ignore it. None of them is hidden: each is
// printed as accounted-for with the exact commit command, because an uncommitted state file is still
// work only this clone can see.
const machineWritten = new Map([
  [LAST_REL, 'WRITTEN BY THIS SCRIPT just now'],
  [ROADMAP_REL, `WRITTEN BY \`node ${START_REL}\` earlier in this session`],
  [ARCHIVE_REL, `WRITTEN BY \`node ${START_REL}\` earlier in this session`],
]);
// EVERY feature's state.md, not only this run's — because a state.md this machinery wrote on an
// EARLIER run and nobody committed is still a file the human never typed, and now that the touch
// derivation subtracts this script's own writes (see above), that feature is correctly untouched. If
// check 1 then called it stranded, the script would be unpassable by construction all over again,
// with the loop merely moved from check 4 to check 1. Named with WHICH run wrote it, never hidden.
for (const f of features) {
  if (!f.hasState && !f.touched) continue;
  machineWritten.set(`${f.rel}/state.md`, f.touched
    ? 'WRITTEN BY THIS SCRIPT just now (this feature was touched this session)'
    : 'WRITTEN BY THIS SCRIPT on an EARLIER run and never committed (this feature is untouched, so this run did not rewrite it)');
}

// A FEATURE FOLDER GIT HAS NEVER SEEN IS REPORTED COLLAPSED — one '?? .conducted/work/<name>/' entry
// for the whole directory, not a line for the file inside it. So the state.md this machinery writes
// is invisible to a lookup by path, and `--new-feature` would hand a conductor a folder that failed
// check 1 the second it was created: unpassable by construction, which is the one thing this check
// must never be. The rule itself is `collapsedMachineDir` in lite-core — one copy, shared with the
// SessionStart safety net, because two readers of the same porcelain line must not disagree. It is
// narrow: one other file under there and it is stranded work again, which it is.
const collapsedFeatureDir = (path) => (collapsedMachineDir(MAIN, path)
  ? `WRITTEN BY THIS SCRIPT and never committed — git reports a directory it has never seen as ONE '??' entry, and the only file(s) under \`${path}\` are feature state.md files this machinery writes`
  : null);

// IN FLIGHT, DERIVED — and this is the fix for the failure the first field adoption hit. The first
// non-negotiable is "you dispatch, you review, you never build … parallel when the work is
// independent", and a live builder holds uncommitted work BY DESIGN. Check 1 failed on that every
// time; a hook run cannot receive --allow-dirty; so the only exit left was `--abandon`, which writes
// into the permanent record that work was abandoned when none was — the asserted-not-verified
// failure this script exists to prevent, pointed the other way. It forced a dishonest record twice in
// one session. (The block is gone now, so the pressure toward a false `--abandon` is gone with it —
// but the derivation stays, because the RECORD would still have been wrong, and the same rule is
// what keeps the per-turn stop-glance quiet while a builder is live.)
//
// So the allowance is DERIVED from state that is already declared and machine-visible, which is what
// stops it going stale the way a hand-written line does. THE CONJUNCTION ITSELF IS `inFlightState` IN
// lite-rules.mjs — one copy, because the per-turn Stop hook derives the same thing about the same
// worktrees and two copies is how it and this script end up disagreeing about one repo. The words
// below are this script's; the rule is not.
//
// Its uncommitted work is then a declared, in-flight claim: NAMED, never hidden, and carrying the one
// warning that matters — those bytes are on this machine and nowhere else. It is not a rubber stamp,
// and the three ways it still FAILS are the proof:
//   · the MAIN checkout is never in flight. Dirt there is real stranding and still fails.
//   · a dirty worktree whose name maps to NO feature folder still fails (check 3 names it too).
//   · a dirty worktree whose feature is declared anywhere OTHER than '## development' — 'complete'
//     above all — still fails. The roadmap row is the declaration; no row is no declaration.
const featureByName = new Map(features.map((f) => [f.name, f]));
const inFlight = new Map();      // checkout path -> { name }
const notInFlight = new Map();   // checkout path -> why not, printed only if that worktree is dirty
for (const co of cos.all.slice(1)) {
  const d = declaredStatus.get(co.name);
  switch (inFlightState(featureByName.has(co.name), d)) {
    case 'in-flight': inFlight.set(co.path, { name: co.name }); break;
    case 'no-folder': notInFlight.set(co.path, `no ${WORK_REL}/${co.name}/ folder exists, so nothing declares this worktree at all`); break;
    default: notInFlight.set(co.path, `${ROADMAP_REL} has '${co.name}' under '## ${d || '(no row at all)'}', not '## development' — only a DECLARED in-flight feature may hold uncommitted work`);
  }
}

function checkPorcelain() {
  const res = { n: 1, name: 'nothing stranded', outputs: [], ok: true, why: [], fix: [], accounted: [], dirty: [], machineOnly: [], stale: [] };
  const allow = allowSpecs.map(({ g, src }) => ({ g, src, re: globToRe(g), used: false }));
  for (const [idx, co] of cos.all.entries()) {
    const flight = idx === 0 ? null : inFlight.get(co.path);
    const shown = gitRaw(['status', '--porcelain'], co.path).replace(/\s+$/, '');
    res.outputs.push({ where: `git status --porcelain    # in ${co.label} ${co.path}${flight ? `   [IN FLIGHT: feature '${flight.name}', declared under '## development']` : ''}`, text: shown });
    const fields = gitRaw(['status', '--porcelain', '-z'], co.path).split('\0').filter((f) => f !== '');
    const dirty = [];
    const flying = [];
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const xy = f.slice(0, 2);
      const path = posix(f.slice(3));
      if (xy[0] === 'R' || xy[0] === 'C') i++;                       // the rename/copy source field
      // Mark EVERY glob that matched, whatever ends up accounting for the file. `used` has to be an
      // honest statement about MATCHING, or the stale report below tells a lie of its own: a glob
      // shadowed by the in-flight derivation is used, not forgotten.
      const hits = allow.filter((a) => a.re.test(path));
      for (const h of hits) h.used = true;
      const mw = idx === 0 ? (machineWritten.get(path) || collapsedFeatureDir(path)) : null;
      if (mw) { res.accounted.push(`${co.label}: ${xy} ${path}  (${mw}) — git add ${path} && git commit -m "conducted: state"`); continue; }
      if (flight) {
        flying.push(path);
        res.accounted.push(`${co.label}: ${xy} ${path}  (in-flight '${flight.name}': declared under '## development', ${WORK_REL}/${flight.name}/ exists)`);
        continue;
      }
      if (hits.length) { res.accounted.push(`${co.label}: ${xy} ${path}  (accounted for by ${hits[0].src} '${hits[0].g}')`); continue; }
      dirty.push({ xy, path, where: co.label });
    }
    if (flying.length) {
      res.machineOnly.push(
        `feature '${flight.name}': ${flying.length} uncommitted file(s) in ${co.path}, on this machine only. ` +
        `cd ${co.path} && git add -A && git commit && git push`);
    }
    if (dirty.length) {
      res.ok = false;
      res.dirty.push(...dirty);
      const why = idx === 0
        ? 'the MAIN checkout is never in flight'
        : (notInFlight.get(co.path) || 'this worktree is not a declared in-flight feature');
      for (const d of dirty) res.why.push(`${co.label}: ${d.xy} ${d.path} — uncommitted, unaccounted for (${why})`);
      res.fix.push(`cd ${co.path} && git add -A && git commit   (or git stash; or account for it: --allow-dirty "<glob>", or a line in ${ALLOW_REL}${idx === 0 ? '' : `; or, if a builder is live there, give '${co.name}' a ${WORK_REL}/${co.name}/ folder and a row under '## development' in ${ROADMAP_REL}`})`);
      if (idx === 0 && dirty.some((d) => d.path === ALLOW_REL)) {
        res.fix.push(`${ALLOW_REL} is itself uncommitted (it is tracked by design): git add ${ALLOW_REL} && git commit -m "conducted: declare what is in flight"`);
      }
    }
  }
  // THE LIMITATION THE FIELD REPORT NAMED AS "the first thing to add". A glob that matched nothing is
  // REPORTED, so a line left behind after its builder landed cannot sit there quietly weakening this
  // check. It does not FAIL: a declaration that has outlived its use is untidiness, not stranding,
  // and a check that fails on untidiness is a check people learn to ignore.
  for (const a of allow) if (!a.used) res.stale.push(`${a.src} '${a.g}' matched nothing in any checkout. Delete it${a.src === ALLOW_REL ? `: edit ${ALLOW_REL}` : ''}.`);
  if (res.accounted.length) res.note = ['accounted for:', ...res.accounted];
  if (res.machineOnly.length) res.note = [...(res.note || []), 'in flight, on this machine only:', ...res.machineOnly];
  if (res.stale.length) res.note = [...(res.note || []), 'stale declarations:', ...res.stale];
  return res;
}

// ---------------------------------------------------------------------------- check 2: unpushed

// ONE ls-remote for the whole repo. The per-branch form asks the same authority; asking once keeps
// this O(1) network calls per RUN instead of O(branches). Flat cost is why this is affordable once a
// session; it was never affordable once a turn, which is the whole reason `Stop` no longer runs it.
// The per-turn hook gets its push position from `refs/remotes/` instead and says "vs last fetch".
function checkPushed() {
  const res = { n: 2, name: 'nothing unpushed', outputs: [], ok: true, why: [], fix: [], stragglers: [], unverified: [] };
  const locals = ctx.locals;
  if (!gitq(['remote'], MAIN)) {
    res.ok = false;
    res.why.push(`no 'origin' remote in this clone; ${locals.length} local branch(es) exist only here.`);
    res.fix.push('git remote add origin <url> && git push -u origin <branch>');
    return res;
  }
  const ls = gitOut(['ls-remote', '--heads', 'origin'], { cwd: MAIN });
  if (!ls.ok) {
    res.ok = false;
    res.outputs.push({ where: 'git ls-remote --heads origin', text: ls.err });
    res.why.push(`'git ls-remote --heads origin' FAILED, so "everything is pushed" cannot be verified.`);
    res.fix.push(`fix the remote/auth, then re-run: node ${END_REL}`);
    return res;
  }
  const remote = new Map();
  for (const line of ls.out.split('\n').filter(Boolean)) {
    const [sha, ref] = line.split('\t');
    if (ref && ref.startsWith('refs/heads/')) remote.set(ref.slice(11), sha);
  }
  res.outputs.push({ where: 'git ls-remote --heads origin', text: ls.out || '(no branches on origin)' });
  res.outputs.push({ where: 'git for-each-ref --format="%(refname:short) %(objectname)" refs/heads', text: locals.map((b) => `${b.sha} ${b.name}`).join('\n') || '(no local branches)' });

  // THREE STATES, never two. Containment is a question about OBJECTS, and this clone may not hold
  // origin's. Collapsing "cannot verify" into "not contained" prints a verdict nothing checked, and
  // prescribes a `git push` that git would REJECT non-fast-forward.
  for (const b of locals) {
    const rsha = remote.get(b.name);
    if (!rsha) { res.stragglers.push({ name: b.name, why: 'ABSENT from origin — this branch exists only in this clone' }); continue; }
    if (rsha === b.sha) continue;
    if (!refExists(rsha)) {
      res.unverified.push({ name: b.name, why: `origin is at ${rsha.slice(0, 8)}, not an object in this clone. Containment of local tip ${b.sha.slice(0, 8)} is UNKNOWN.` });
      continue;
    }
    if (!gitOk(['merge-base', '--is-ancestor', b.sha, rsha], MAIN)) {
      const ahead = gitq(['rev-list', '--count', `${rsha}..${b.sha}`], MAIN);
      const count = /^[0-9]+$/.test(ahead) ? `; ${ahead} local-only commit(s)` : '';
      res.stragglers.push({ name: b.name, why: `local tip ${b.sha.slice(0, 8)} is NOT contained in origin's (origin is at ${rsha.slice(0, 8)}${count})` });
    }
  }
  if (res.stragglers.length) {
    res.ok = false;
    for (const s of res.stragglers) res.why.push(`branch '${s.name}' — ${s.why}`);
    for (const s of res.stragglers) res.fix.push(`git push -u origin ${s.name}   (then confirm: git ls-remote --heads origin ${s.name})`);
  }
  if (res.unverified.length) {
    res.ok = false;
    for (const s of res.unverified) res.why.push(`branch '${s.name}' — CANNOT VERIFY against origin: ${s.why}`);
    res.fix.push(`git fetch origin && node ${END_REL}   (do not push to clear this: if origin moved ahead the push is rejected non-fast-forward)`);
  }
  return res;
}

// ---------------------------------------------------------------------------- check 3: worktrees

// Reconciled against the FEATURE FOLDERS, not against prose. The feature name is minted in ONE place
// (lite-core's `checkouts`), and it is the same name that derives 'development' on the roadmap — one
// convention, two consumers. A worktree outside `worktrees/<feature>/` reconciles normally and is
// REPORTED as out of convention: it is a finding, never a failure, because the damage the field
// reported was a check that could never pass.
function checkWorktrees() {
  const res = { n: 3, name: `worktrees reconciled against ${WORK_REL}/`, outputs: [], ok: true, why: [], fix: [], live: [], offConvention: [] };
  res.outputs.push({ where: 'git worktree list', text: gitq(['worktree', 'list'], MAIN) });
  const featureNames = new Set(features.map((f) => f.name));
  res.live = ctx.worktrees.map((w) => ({ path: w.path, name: w.name, label: w.label, layout: w.layout }));

  for (const w of ctx.worktrees) {
    if (w.layout !== 'in-repo') res.offConvention.push(outOfConvention(w, MAIN));
    if (featureNames.has(w.name)) continue;
    res.ok = false;
    res.why.push(`worktree '${w.path}' has no ${WORK_REL}/${w.name}/ folder, so nothing on the roadmap accounts for it.`);
    res.fix.push(`mkdir -p ${WORK_REL}/${w.name}   or   git worktree remove ${w.path} && git worktree prune`);
  }
  // The reverse direction, and it is deliberately narrow: only a TOUCHED feature is checked. Nagging
  // about a feature nobody opened this session is exactly the noise the per-feature reshape removes.
  for (const f of touched) {
    for (const claim of f.prev.claimed.worktrees) {
      if (ctx.worktrees.some((w) => w.label === claim || w.path === claim)) continue;
      res.ok = false;
      res.why.push(`${f.rel}/state.md records worktree '${claim}' (touched this session) and 'git worktree list' does not show it.`);
      res.fix.push(`node ${END_REL}   (rewrites the facts block from reality)   or   git worktree add worktrees/${f.name} <branch>`);
    }
  }
  res.outputs.push({
    where: `${WORK_REL}/ folders`,
    text: features.length ? features.map((f) => `${f.name}   ${f.touched ? 'TOUCHED this session' : 'untouched'}   derived: ${f.derived}`).join('\n') : '(no feature folders)',
  });
  if (res.offConvention.length) res.note = ['out of convention (reconciled, not failed):', ...res.offConvention];
  return res;
}

// ---------------------------------------------------------------------------- check 4: freshness

// Per feature, and ONLY for the ones this session touched — where TOUCHED has this script's own
// writes subtracted from it, so no run can make its own next run true. Measured on the HUMAN
// region's content hash: this script writes state.md, so an mtime check would be verifying its own
// writing. Same discipline, twice.
function checkFresh() {
  const res = { n: 4, name: `every TOUCHED feature has a fresh state.md`, outputs: [], ok: true, why: [], fix: [] };
  if (!touched.length) {
    res.outputs.push({
      where: `features touched this session (commit on its branch, commit under ${WORK_REL}/<name>/, or an uncommitted change there — ${WINDOW_H}h window; this script's own writes do not count)`,
      text: `(none — nothing under ${WORK_REL}/ was touched this session)\nSILENT, not satisfied: a session spent entirely outside ${WORK_REL}/ leaves no written trace.`,
    });
    return res;
  }
  const rows = [];
  for (const f of touched) {
    const sha = judgmentHash(f.humanText);
    const changed = f.prev.judgmentSha !== sha;
    const at = changed || !f.prev.judgmentAt ? now : f.prev.judgmentAt;
    f.freshSha = sha; f.freshAt = at;
    const t = Date.parse(at);
    const age = Number.isFinite(t) ? Date.now() - t : Infinity;
    rows.push(`${f.name}\n  touched because: ${f.touchedWhy.join('; ')}\n  state.md ${f.split.exists ? 'exists' : 'DID NOT EXIST — created from the template by this run'}\n  human-region sha ${sha}${changed ? '   (CHANGED since the last run — fresh)' : '   (unchanged since the last run)'}\n  last change ${at}${Number.isFinite(t) ? `   (${(age / 3600000).toFixed(1)}h ago; window ${WINDOW_H}h)` : ''}`);
    if (!f.split.exists) {
      res.ok = false;
      res.why.push(`'${f.name}' was touched this session and ${f.rel}/state.md did not exist. Created from the template; the human sections are empty.`);
      res.fix.push(`edit ${f.rel}/state.md, then: node ${END_REL}`);
    } else if (age > WINDOW_MS) {
      res.ok = false;
      res.why.push(`'${f.name}' was touched this session (${f.touchedWhy[0]}) and ${f.rel}/state.md's human region has not changed in ${Number.isFinite(t) ? (age / 3600000).toFixed(1) + 'h' : 'a knowable time'} (window ${WINDOW_H}h).`);
      res.fix.push(`edit ${f.rel}/state.md outside the facts markers, then: node ${END_REL}`);
    }
  }
  const untouched = features.filter((f) => !f.touched);
  res.outputs.push({ where: `features TOUCHED this session (${touched.length} of ${features.length})`, text: rows.join('\n\n') });
  if (untouched.length) res.outputs.push({ where: 'features NOT touched this session (not checked, not rewritten)', text: untouched.map((f) => f.name).join('\n') });
  return res;
}

// ---------------------------------------------------------------------------- run the checks

const porcelain = checkPorcelain();
const pushed = checkPushed();
const worktrees = checkWorktrees();
const fresh = checkFresh();
const items = [porcelain, pushed, worktrees, fresh];
const failed = items.filter((i) => !i.ok);

// ---------------------------------------------------------------------------- last-session.md

const prevLast = existsSync(join(MAIN, LAST_REL)) ? readFileSync(join(MAIN, LAST_REL), 'utf8') : '';
const prevEffort = prevLast.match(/conducted-lite:effort at=([0-9T:.\-Z]+) text=([A-Za-z0-9+/=]*)/);
const prevAbandon = prevLast.match(/conducted-lite:abandon at=([0-9T:.\-Z]+) session=([A-Za-z0-9._-]+) data=([A-Za-z0-9+/=]*)/);

const effort = typeof flags.effort === 'string' && flags.effort.trim()
  ? { at: now, text: flags.effort }
  : (prevEffort ? { at: prevEffort[1], text: unb64(prevEffort[2]) } : null);

// The abandon record survives the sitting so the human and the next session can see the dirty stop
// was recorded. The 30-minute window governs the hook's RELEASE only.
let abandon = null;
if (flags.abandon) {
  abandon = { at: now, session: typeof flags['session-id'] === 'string' ? (flags['session-id'].replace(/[^A-Za-z0-9._-]/g, '_') || '-') : '-', reason: flags.reason, failed: failed.map((i) => `${i.n} ${i.name}`) };
} else if (prevAbandon) {
  const t = Date.parse(prevAbandon[1]);
  if (Number.isFinite(t) && Date.now() - t <= WINDOW_MS) {
    // NARROW: a corrupt record is a SyntaxError. Anything else is this file's own mistake and must
    // not be read as "the previous abandon said nothing" — that would quietly drop a dirty stop.
    let d = {}; try { d = JSON.parse(unb64(prevAbandon[3])) || {}; } catch (e) { onlyBadJson(e); d = {}; }
    abandon = { at: prevAbandon[1], session: prevAbandon[2], reason: String(d.reason || ''), failed: Array.isArray(d.failed) ? d.failed : [] };
  }
}

const branch = gitq(['rev-parse', '--abbrev-ref', 'HEAD'], MAIN) || '(unknown)';
const head = gitq(['rev-parse', '--short', 'HEAD'], MAIN) || '(no commit)';
const commits = gitq(['log', '--max-count=3', '--oneline', '--no-decorate'], MAIN).split('\n').filter(Boolean);

// ---------------------------------------------------------------------------- write state.md (touched only)

for (const f of touched) {
  // ONE COPY of this string, shared with the per-turn glance — including the case the roadmap has no
  // ledger markers, where the declared status is UNKNOWABLE and not absent. See declaredLabel.
  const declared = declaredLabel(rmSplit.exists, rmSplit.markers, declaredStatus.get(f.name));
  const sessions = [
    { at: now, id: typeof flags['session-id'] === 'string' ? flags['session-id'].replace(/[^A-Za-z0-9._-]/g, '_') : '-', note: sanitize(f.touchedWhy.join('; ')) },
    ...f.prev.sessions,
  ].slice(0, SESSION_LOG_KEEP);

  const carrier = {
    at: now,
    status: f.derived,
    branches: f.branches.map((b) => b.name),
    worktrees: f.worktrees.map((w) => w.label),
    pr: f.pr,
  };

  // THE SHAPE IS NO LONGER MINTED HERE, and the reason is worth the one line: the per-turn Stop
  // glance now REFRESHES this same block mid-session, so that a feature's facts are true in the
  // middle of a session and not only at its edges. Two renderers of one block would rewrite each
  // other every turn, in the file whose human region this machinery most exists to protect. So the
  // renderer is `renderFactsBody` in lite-derive.mjs and this call is the ONLY thing that changed:
  // every byte it emits is the byte this script emitted before, with the volatile four —
  // verifiedAt / verifiedBy / judgmentSha / judgmentAt — passed in rather than closed over.
  const body = renderFactsBody({
    name: f.name, rel: f.rel, docs: f.docs, extra: f.extra, derived: f.derived, declared,
    branches: f.branches, worktrees: f.worktrees,
    pr: f.pr, prLine: f.pr ? f.prDecl.line : '',
    sessions, carrier,
    verifiedAt: now, verifiedBy: END_REL,
    judgmentSha: f.freshSha, judgmentAt: f.freshAt,
  });

  // toBinary: the facts body is UTF-8 TEXT and writeSplit assembles BYTES, so that the human region
  // it is spliced between can be carried through as the bytes it actually is. See lite-derive.
  writeSplit(f.statePath, f.split, FACTS_START, FACTS_END, toBinary(body));
}

// ---------------------------------------------------------------------------- write last-session.md

const dirtyLines = porcelain.dirty.length
  ? [`- dirty: **${porcelain.dirty.length} file(s) NOT accounted for**`, ...porcelain.dirty.map((d) => `  - \`${d.xy} ${d.path}\` in ${d.where}`)]
  : ['- dirty: none'];
const accountedLines = porcelain.accounted.length
  ? ['- accounted-for (named, not hidden):', ...porcelain.accounted.map((a) => `  - ${a}`)]
  : [];
// The in-flight files and the stale declarations go into the RECORD, not only into the terminal. A
// successor reading this file has to be able to see that a check passed with work still on one
// machine, and that a declaration is sitting there matching nothing.
const machineOnlyLines = porcelain.machineOnly.length
  ? ['- **in flight, ON THIS MACHINE ONLY** (accounted for by a declared `development` feature, never counted as durable):', ...porcelain.machineOnly.map((m) => `  - ${m}`)]
  : [];
const staleLines = porcelain.stale.length
  ? [`- **stale allow-dirty declaration(s): ${porcelain.stale.length}** — matched nothing, reported so a forgotten line cannot silently weaken check 1:`, ...porcelain.stale.map((s) => `  - ${s}`)]
  : [];
const offConventionLines = worktrees.offConvention.length
  ? ['- worktrees OUT OF CONVENTION (reconciled and reported, not failed):', ...worktrees.offConvention.map((o) => `  - ${o}`)]
  : [];
const unpushedLines = [];
if (pushed.stragglers.length) unpushedLines.push(`- unpushed: **${pushed.stragglers.length} branch(es)**`, ...pushed.stragglers.map((s) => `  - \`${s.name}\` — ${s.why}`));
if (pushed.unverified.length) {
  unpushedLines.push(`- **UNVERIFIED against origin: ${pushed.unverified.length} branch(es)** — origin holds commits this clone has not fetched, so containment is UNKNOWN, not false. Run \`git fetch origin\` and re-run.`);
  unpushedLines.push(...pushed.unverified.map((s) => `  - \`${s.name}\` — ${s.why}`));
}
if (!unpushedLines.length) unpushedLines.push('- unpushed: none — every local branch matches its tip on origin');

const lastText = [
  '# last session — MACHINE-WRITTEN, whole file, every run',
  '',
  '<!-- There is no human region in this file and nothing to protect: it is rewritten entirely by',
  `     \`node ${END_REL}\`. Judgment does not live here — decisions, issues and`,
  `     acceptance criteria live in ${WORK_REL}/<feature>/state.md, one file per feature.`,
  '     This holds only what a command returned, plus the record of a dirty stop, which is the one',
  '     fact that has no per-feature home. It is written by temp-file-and-rename, so a kill leaves',
  '     the whole previous file rather than half of this one. -->',
  '',
  `**Verified ${now}** by \`node ${END_REL}\`. Every line below is a command's output.`,
  '',
  // FIRST, because it governs how everything under it should be read. A successor that mistakes a
  // /clear for a finished session draws exactly the wrong conclusion from an identical set of checks.
  `- **how this run came about: ${ending.kind}**${ending.reason !== '(none)' ? ` (\`${ending.reason}\`)` : ''} — ${ending.text}`,
  ...(ending.kind === 'BY HAND' ? [] : ['  _SessionEnd is BEST-EFFORT: a closed terminal, a crash or a kill fires nothing at all, so the ABSENCE of a record proves nothing. Everything in it is re-derivable from git by `node ' + START_REL + '`._']),
  '',
  `- branch: \`${branch}\` @ \`${head}\``,
  ...(commits.length ? ['- recent commits:', ...commits.map((c) => `  - \`${c}\``)] : ['- recent commits: (none — no commit on this branch yet)']),
  ...dirtyLines,
  ...accountedLines,
  ...machineOnlyLines,
  ...staleLines,
  ...unpushedLines,
  ...(worktrees.live.length ? ['- worktrees (live, beyond the main checkout):', ...worktrees.live.map((w) => `  - \`${w.path}\`   (${w.layout === 'in-repo' ? 'in-repo, the convention' : w.layout + ' — outside the repo'})`)] : ['- worktrees: main checkout only']),
  ...offConventionLines,
  `- features: ${features.length} total, ${touched.length} touched this session${touched.length ? ' — ' + touched.map((f) => '`' + f.name + '`').join(', ') : ''}`,
  ...(rejected.length ? [`- SKIPPED folders (illegal feature name): ${rejected.map((r) => '`' + r + '`').join(', ')}`] : []),
  ...(effort
    ? [`- effort (ESTIMATE, passed in by the conductor — information, never a budget; unverified): ${sanitize(effort.text)}   _(recorded ${effort.at})_`,
       `<!-- conducted-lite:effort at=${effort.at} text=${b64(sanitize(effort.text))} -->`]
    : ['- effort: not reported this session (pass `--effort "<note>"`; it is an estimate, never a budget)']),
  `- checks: ${items.map((i) => `${i.n} ${i.name} ${i.ok ? 'VERIFIED' : 'FAILED'}`).join(' · ')}`,
  ...(abandon
    ? ['',
       `- **ABANDONED — dirty stop, recorded not hidden (${abandon.at})**`,
       `  - reason: ${sanitize(abandon.reason)}`,
       `  - session: ${abandon.session === '-' ? '(not given — pass --session-id so the release is keyed to this session)' : '`' + abandon.session + '`'}`,
       `  - failed checks: ${abandon.failed.length ? abandon.failed.join(' · ') : "(none mechanical — recorded on the session's own judgment)"}`,
       `<!-- conducted-lite:abandon at=${abandon.at} session=${abandon.session} data=${b64(JSON.stringify({ reason: sanitize(abandon.reason), failed: abandon.failed }))} -->`]
    : []),
  '',
].join('\n');

// Atomic, like every other write in this machinery: on the SessionEnd path this runs while the
// session is terminating and can be killed between any two bytes. Temp file, then rename.
writeAtomic(join(MAIN, LAST_REL), lastText);

// ---------------------------------------------------------------------------- output

// The items no machine can honestly verify. PRINTED as named reminders, NEVER claimed as verified —
// that split is the doctrine this script enforces, applied to the script itself.
// NOT trimmed away, and not philosophy: each line is an item nothing here checked, which is the
// whole reason it is printed. Trimmed to the item. The reasoning behind each lives in --help.
const BEHAVIORAL = [
  `state.md's human region changed — whether what it says is TRUE was not checked.`,
  `what a cold successor cannot re-derive from the repo: judgment calls, near-misses, warnings.`,
  `acceptance criteria are counted, never ticked. Tick them yourself.`,
  `anything under '## Issues' that is actually gone.`,
  `stray processes — kill by PID, never by pattern.`,
  `the --effort figure is an estimate you passed in; nothing here verified it.`,
];

const wrote = [LAST_REL, ...touched.map((f) => `${f.rel}/state.md`)];

if (flags.abandon) {
  process.stdout.write(
    `SESSION ABANDONED — recorded @ ${now}\n` +
    `  reason      ${sanitize(flags.reason)}\n` +
    `  session     ${abandon.session === '-' ? '(not given — pass --session-id)' : abandon.session}\n` +
    `  artifact    ${LAST_REL}\n` +
    `  unmanaged   ${abandon.failed.length ? abandon.failed.join(' · ') : '(no check failed; recorded on judgment)'}\n` +
    (failed.length ? failed.map((i) => [`  · ${i.n} ${i.name}`, ...i.why.map((w) => `      why: ${w}`), ...i.fix.map((f) => `      fix: ${f}`)].join('\n')).join('\n') + '\n' : '') +
    `  NOT CHECKED BY ANYTHING HERE:\n` +
    BEHAVIORAL.map((b) => `      · ${b}`).join('\n') + '\n' +
    `  next        git add ${wrote.join(' ')} && git commit -m "conducted: state" && git push\n`,
  );
  process.exit(0);
}

if (!failed.length) {
  process.stdout.write(
    `STATE FULLY MANAGED — ${posix(MAIN)} @ ${now}\n\n` +
    items.map((i) => [`  ${i.n}  ${i.name}  — VERIFIED`, ...quoted(i.outputs), ...(i.note ? i.note.map((l) => `      ${l}`) : [])].join('\n')).join('\n\n') +
    `\n\n  written:\n` +
    wrote.map((w) => `    ${w}`).join('\n') +
    `\n\n  NOT CHECKED BY ANYTHING HERE:\n` +
    BEHAVIORAL.map((b) => `    · ${b}`).join('\n') +
    // The files above were rewritten seconds ago (the Verified timestamp alone changes bytes), so the
    // state a successor reads exists only in this clone until it is committed. Unconditional by
    // design: there is nothing to detect, because the write always happened.
    `\n\n  git add ${wrote.join(' ')} && git commit -m "conducted: state" && git push\n`,
  );
  process.exit(0);
}

process.stdout.write(
  `UNMANAGED — this session cannot end clean: ${failed.length} of ${items.length} check(s) FAILED @ ${now}\n` +
  `repo: ${posix(MAIN)}\n\n` +
  failed.map((i) => [
    `  ${i.n}  ${i.name}  — FAILED`,
    ...i.why.map((w) => `      why: ${w}`),
    ...i.fix.map((f) => `      fix: ${f}`),
    ...quoted(i.outputs),
  ].join('\n')).join('\n\n') +
  // Every NAMED item — accounted-for files, in-flight work that lives only on this machine, stale
  // declarations, worktrees out of convention — prints here too. A failing run is exactly when a
  // conductor most needs to see what was silently allowed; dropping the notes on failure would hide
  // them at the only moment they matter.
  (items.some((i) => i.note)
    ? `\n\n  NAMED:\n` +
      items.filter((i) => i.note).map((i) => [`    ${i.n} ${i.name}:`, ...i.note.map((l) => `      ${l}`)].join('\n')).join('\n')
    : '') +
  `\n\n  passed: ${items.filter((i) => i.ok).map((i) => `${i.n} ${i.name}`).join(' · ') || '(none)'}\n` +
  `  written anyway, recording the state above:\n` +
  wrote.map((w) => `    ${w}`).join('\n') +
  `\n\n  NOT CHECKED BY ANYTHING HERE:\n` +
  BEHAVIORAL.map((b) => `    · ${b}`).join('\n') +
  `\n\n  fix each item above, then:  node ${END_REL}\n` +
  `  or record the stop:         node ${END_REL} --abandon --reason "<why>"\n`,
);
process.stderr.write(`E_SESSION_UNMANAGED: ${failed.length} check(s) failed — the UNMANAGED list is on stdout.\n`);
process.exit(1);
