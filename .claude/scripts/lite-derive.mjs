#!/usr/bin/env node
// conducted-lite derivations — THE MIDDLE LAYER, and it exists for one reason: THE PER-TURN HOOK NOW
// WRITES, so the hook and the scripts must share the code that decides WHAT to write.
//
// There are now three layers, and the split is by WHAT A CALLER CAN AFFORD, not by topic:
//
//   lite-rules.mjs    NO I/O AT ALL. No fs, no child_process, no clock. Constants, regexes, pure
//                     functions. Importing it costs one parse.
//   lite-derive.mjs   THIS FILE. Reads and writes the FILESYSTEM. Spawns NOTHING, does no module-level
//                     work, and NEVER calls process.exit. Importing it costs one parse.
//   lite-core.mjs     git, the network-adjacent reads, `fail()` (which exits nonzero), and a MODULE
//                     SCOPE THAT SPAWNS GIT to fix REPO. Fine for a script a human ran; fatal for a
//                     hook that fires every turn.
//
// WHY THE MIDDLE LAYER HAD TO EXIST. The Stop glance used to promise "NO WRITES. Not one byte." It
// now refreshes the ledger and the facts blocks mid-session, because state that is only true at
// session boundaries is state that is false for the whole middle of a session. The moment it writes,
// it must write EXACTLY what session-start and session-end write — same ledger renderer, same
// placement ratchet, same facts-block shape — or the next scripted run "fixes" the hook's output and
// the two spend the session undoing each other. That is not a hypothetical: this repo's own history
// records three separate drifts caused by a second copy of one derivation.
//
// So the derivations moved DOWN here, and lite-core re-exports every one of them, unchanged, under
// its original name. Nothing that imports lite-core had to change.
//
// THE ONE ACCOMMODATION, AND IT IS NAMED LOUDLY: `FAIL`. lite-core's failure face writes E_* to stderr
// and exits 1, which is right for a script and wrong for a hook — a hook that exits 1 prints an error
// into every turn forever. So this file calls an INDIRECTION. Its default THROWS a named error, which
// a hook catches and answers with silence; lite-core calls `setFail(fail)` at import, so every
// existing script keeps the exact exit-nonzero behaviour it had. One line, one direction, no branch.
//
//   NO PROCESS SPAWNS. Nothing here shells out. Everything git-shaped arrives as an argument (see the
//                      `ctx` that `featureFacts` takes), so a caller with no budget for git can build
//                      one from a call it was already making.
//   NO MODULE-LEVEL WORK. Importing this file runs no code but the declarations.
//   NO EXIT. `FAIL` throws by default. Callers decide what a failure means.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import {
  posix, NAME_RE, ROW_RE, STATUSES, rung, parseLedger,
  CONDUCTED, WORK_REL, ROADMAP_REL, ARCHIVE_REL, CONDUCTOR_REL, END_REL, START_REL,
  FACTS_START, FACTS_END,
} from './lite-rules.mjs';

// ---------------------------------------------------------------------------- the failure face

// THE INDIRECTION, and the whole reason a hook can import this file. Default: a THROW carrying the
// E_* code, which a per-turn hook catches and turns into silence. lite-core replaces it at import
// with its own `fail()` — stderr + exit 1 — so every script behaves exactly as it did before.
// There is no third implementation and there must never be one.
let FAIL = (code, msg) => { const e = new Error(`${code}: ${msg}`); e.liteCode = code; throw e; };
export const setFail = (f) => { FAIL = f; };
export const failWith = (code, msg) => FAIL(code, msg);

// ---------------------------------------------------------------------------- small helpers

// CATCH ONLY WHAT YOU MEAN. A bare `catch {}` around anything larger than one I/O call swallows this
// file's OWN programming errors — a ReferenceError from an identifier that does not exist reads
// exactly like "the file was absent", and the feature silently does nothing while reporting success.
// That is not hypothetical: it is how the field's allow-dirty fix shipped dead (a `join(REPO, …)`
// where REPO was never imported, inside a bare catch). These two are the narrowing, used everywhere:
//   missing()  — an absent/unreadable-as-a-directory path, the one filesystem outcome that is normal
//   onlyBadJson() — a parse failure of data we did not write, and NOTHING else
export const missing = (e) => !!e && (e.code === 'ENOENT' || e.code === 'ENOTDIR');
export const onlyBadJson = (e) => { if (e instanceof SyntaxError || e instanceof TypeError) return; throw e; };

export const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
export const unb64 = (s) => { try { return Buffer.from(String(s), 'base64').toString('utf8'); } catch (e) { onlyBadJson(e); return ''; } };

// Free text from the caller (--reason, --effort, session notes) is written into files this
// machinery PARSES on the next run. Neutralise anything that could forge or truncate a marker.
export function sanitize(s) {
  return String(s)
    .replace(/\r?\n/g, ' ')
    .split('<!--').join('(!--')
    .split('-->').join('--)')
    .split('conducted-lite:').join('conducted-lite․')
    .trim()
    .slice(0, 2000);
}

// Hash of a HUMAN region. Line endings normalised and trailing whitespace trimmed, so an editor's
// newline habits are not mistaken for a change of mind.
export const judgmentHash = (text) => createHash('sha256')
  .update(String(text).replace(/\r\n/g, '\n').replace(/\s+$/, ''), 'utf8').digest('hex').slice(0, 16);

// ---------------------------------------------------------------------------- marker splice I/O

// BYTES, NOT CHARACTERS. Everything below scans with `latin1`, which is the one encoding where ONE
// CHARACTER IS EXACTLY ONE BYTE and the round trip is lossless for every possible input. So a string
// index from a latin1 scan IS a byte offset, and slicing the Buffer by it cannot cut a character in
// half or invent one.
//
// WHY THIS MATTERS AND WHAT IT COST. The promise at the top of lite-core is "MACHINE REGIONS ARE
// REWRITTEN BY BYTE SPLICE" and it was not one: `readFileSync(path, 'utf8')` DECODES, and every byte
// that is not valid UTF-8 becomes U+FFFD, which then re-encodes as three different bytes. A human
// region holding one Latin-1 `café` came back as `caf<EF BF BD>` — silently, in the region whose
// entire reason for existing is that a machine never touches it. It hit hand-written roadmap lines
// the same way. The splice is now genuinely byte-accurate: head and tail are Buffer slices and are
// written back as the bytes they were read as.
//   `text` and `body` are still decoded UTF-8, because every READER of them (the fact-check, the PR
// parser, the carrier) wants text. `bodyBin` is the byte-exact form, and it is what a caller must use
// when the region it is rewriting contains HAND-WRITTEN lines — which is the ledger, and only the
// ledger. See `toBinary`.
export const toBinary = (s) => Buffer.from(String(s), 'utf8').toString('latin1');
// A head/tail for a split that is being SYNTHESISED rather than read (a file that does not exist
// yet). It must be a Buffer, not a byte-string: `writeSplit` passes a Buffer through untouched, and
// every reader of a human region does `split.head + split.tail`, which decodes a Buffer as UTF-8 and
// therefore yields the same text a later read of the same file will. A byte-string here would hash
// differently on the very next run and report a human region as changed when nobody touched it.
export const bytesOf = (s) => Buffer.from(String(s), 'utf8');
const bin = (x) => (Buffer.isBuffer(x) ? x : Buffer.from(String(x), 'latin1'));

// WHAT COUNTS AS A MARKER. This rule is on its THIRD revision and each one was forced by a measured
// destruction of a human region, so the history is kept: it is the clearest statement of why the
// obvious answers are all wrong.
//
//   v1  "the first indexOf(MARKER)".  A human paragraph that merely QUOTED the marker above the real
//       block moved the boundary UP, and the splice swallowed the quotation, the paragraph under it
//       and the real opening marker. A marker quoted BELOW the block only ever looked safe by luck:
//       `indexOf` found the real pair first because the real pair happened to come first.
//   v2  "a whole line, bar surrounding whitespace, outside a CLOSED fence".  Better, and still wrong
//       twice over. "Bar surrounding whitespace" accepts `    <!-- … -->`, which is the OTHER standard
//       Markdown code form — a 4-space indented block — so the entire indented-code family still
//       destroyed the paragraph below it, byte-identically to v1. And ignoring an UNCLOSED fence was
//       justified in a comment that had the failure direction backwards: it claimed the risk was
//       refusing to write, when an unclosed fence ABOVE the block exposes a quoted marker and
//       DESTROYS. The `````-open, ```-close case is the same bug, because a closing fence must be at
//       least as long as its opener, so that pair is unclosed too.
//   v3  what is below. Two rules and one refusal:
//
//   COLUMN 0.     A marker counts only if the line BEGINS with it — no leading whitespace of any
//                 kind, not one space and not a tab. Every marker this machinery has ever written
//                 starts at column 0, by construction, in `renderLedger`, `renderFactsBody`,
//                 `newFeatureState` and `rescaffoldSplit`, so this costs nothing real and it kills
//                 indented code blocks outright rather than one indent width at a time. Trailing
//                 whitespace is still tolerated, because a '\r' is not a quotation.
//   NOT IN A FENCE. A marker inside a fenced code block is a quotation and never a boundary, in both
//                 directions. A fence closes only with the same character, at least as long, and
//                 nothing but whitespace after it — CommonMark's rule, not an approximation of it.
//   AN UNCLOSED FENCE IS A REFUSAL, NOT A SHRUG. It runs to end of file, so every marker after it is
//                 inside a code block and none of them can be used. When that leaves no usable pair,
//                 this does NOT fall back to "no markers here" — it reports `blocked`, and every
//                 caller turns that into a NAMED refusal: the glance skips the file and says so
//                 through its skip-and-name path, session-end refuses with E_LITE_NO_MARKERS naming
//                 the fence. Loud refusal beats silent destruction. An unclosed fence BELOW a usable
//                 pair changes nothing, because it cannot hide anything above itself.
//
// WHAT IS STILL AMBIGUOUS, said rather than implied away: a human-region line that IS a marker, at
// column 0, outside any fence, is indistinguishable from the real thing and is read as the real
// thing. These strings are the machinery's; do not write one at the start of a line.
//
// THE TRAILING '\r' IS STRIPPED BEFORE FENCE MATCHING, and that is not cosmetic. JS treats '\r' as a
// LINE TERMINATOR, so `.` does not match it and `$` does not sit after it: on a CRLF file the CLOSING
// fence line '```\r' failed this regex, the fence never closed, and the "open" state ran on until it
// met some later backtick run — swallowing the real markers inside one enormous phantom fence.
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const noCR = (l) => (l.endsWith('\r') ? l.slice(0, -1) : l);

// Walk the byte-string line by line, handing each one to `fn` with its byte offset.
function eachLine(scan, fn) {
  let i = 0;
  while (i <= scan.length) {
    let j = scan.indexOf('\n', i);
    if (j === -1) j = scan.length;
    fn(noCR(scan.slice(i, j)), i);
    if (j === scan.length) break;
    i = j + 1;
  }
}

// Closed fence ranges, plus where an UNCLOSED one begins (-1 for none). The unclosed one is returned
// separately rather than merged, because it is the difference between "quoted" and "unreadable".
function fencedRanges(scan) {
  const ranges = [];
  let open = null;
  eachLine(scan, (line, i) => {
    const m = FENCE_RE.exec(line);
    if (!m) return;
    if (!open) open = { char: m[1][0], len: m[1].length, from: i };
    else if (m[1][0] === open.char && m[1].length >= open.len && !m[2].trim()) { ranges.push({ from: open.from, to: i + line.length }); open = null; }
  });
  return { ranges, unclosedFrom: open ? open.from : -1 };
}

// Every byte offset at which `marker` is the whole line, STARTING AT COLUMN 0.
function markerLines(scan, marker) {
  const out = [];
  eachLine(scan, (line, i) => { if (line.startsWith(marker) && !line.slice(marker.length).trim()) out.push(i); });
  return out;
}

// Read a file and split it at a marker pair. head and tail are exact BYTE slices, so the human
// region survives a rewrite unchanged by construction: the writer never holds it in a buffer it
// rewrites, and never re-encodes it.
// `truncated` separates the two ways markers can be absent, because they mean different things and
// the SessionStart fact-check has to say which: NO marker at all is a file nobody scaffolded, while
// an OPENING marker with no closing one is a file that was cut in half. Since every write here is
// atomic that can no longer be this machinery's doing, so saying "truncated" points at the real
// cause — an editor, a merge conflict, a hand-edit — instead of at a script that did not do it.
export function readSplit(path, START, END) {
  const none = { exists: false, markers: false, truncated: false, blocked: '', raw: Buffer.alloc(0), text: '', head: '', body: '', bodyBin: '', tail: '' };
  if (!existsSync(path)) return none;
  let raw;
  try { raw = readFileSync(path); } catch (e) { return FAIL('E_UNREADABLE', `${posix(path)}: ${e.message}`); }
  const scan = raw.toString('latin1');             // 1 char == 1 byte: every index below is a byte offset
  const text = raw.toString('utf8');
  const { ranges, unclosedFrom } = fencedRanges(scan);
  const quoted = (off) => ranges.some((f) => off >= f.from && off < f.to) || (unclosedFrom >= 0 && off >= unclosedFrom);
  const starts = markerLines(scan, START);
  const ends = markerLines(scan, END);
  const s = starts.find((o) => !quoted(o));
  const e = s === undefined ? undefined : ends.find((o) => !quoted(o) && o > s + START.length);
  if (s === undefined || e === undefined) {
    // A MARKER THAT EXISTS AND CANNOT BE USED IS NOT "no markers", AND THE DIFFERENCE IS THE WHOLE
    // POINT. "No markers anywhere" is a file nobody scaffolded — a decision, and callers stay quiet
    // about it. "Markers are there but every one of them is quoted" is a file this function refuses
    // to splice, and every caller turns `blocked` into a NAMED refusal. Silence would be the same
    // shrug that let the destruction cases through, one class further along.
    const byUnclosed = unclosedFrom >= 0 && starts.concat(ends).some((o) => o >= unclosedFrom);
    const quotedOnly = 'every occurrence of the machine markers sits inside a fenced code block, so they read as a QUOTATION and none can be used as a boundary. Move the real block outside the fence, and this file reads normally.';
    const blocked = byUnclosed
      ? 'an UNCLOSED code fence sits above the machine markers, so every marker after it is inside a code block and none can be used as a boundary. Close the fence (or delete it) and this file reads normally.'
      : (s === undefined ? (starts.length ? quotedOnly : '') : (ends.length ? quotedOnly : ''));
    return { exists: true, markers: false, truncated: (s !== undefined) !== (e !== undefined), blocked, raw, text, head: '', body: '', bodyBin: '', tail: '' };
  }
  return {
    exists: true, markers: true, truncated: false, blocked: '', raw, text,
    head: raw.subarray(0, s),
    body: raw.subarray(s + START.length, e).toString('utf8'),
    bodyBin: scan.slice(s + START.length, e),
    tail: raw.subarray(e + END.length),
  };
}

// THE ONE WRITE FACE, AND IT IS ATOMIC. A sibling temp file is written in full and then RENAMED over
// the target. rename replaces in a single step — on Windows Node uses MoveFileEx with
// MOVEFILE_REPLACE_EXISTING, which is likewise one step — so any reader, and any kill, sees either
// the whole old file or the whole new one. There is no window in which the target is half a file.
//
// This is not tidiness. The SessionEnd hook runs this machinery while the session is TERMINATING and
// can be killed mid-run, and what it rewrites is a file whose HUMAN region the byte-splice guarantee
// promises to preserve. Truncate-then-write would break that promise at exactly the moment nobody is
// watching: `writeFileSync` truncates first, so a kill between truncate and the last byte leaves a
// state.md with its '## Decisions' gone. Atomic rename makes that unrepresentable.
//
// The per-turn glance writes through this same function, and the argument is now stronger rather than
// weaker: a Stop hook can be killed the instant the turn ends, and it rewrites the same two-region
// files. There is exactly one write face in this machinery and every caller goes through it.
//
// The temp name carries the pid so two runs cannot collide, and `*.conducted-lite-tmp.*` is in
// .gitignore: a rename that never happened leaves debris, and debris must not become a finding in
// the check that reads the tree. If the rename itself fails (a Windows file lock, a full disk) the
// OLD file is still whole and untouched, which is the safe direction to fail in.
export function writeAtomic(path, text) {
  try { mkdirSync(dirname(path), { recursive: true }); } catch (e) { FAIL('E_WRITE_FAILED', `${posix(dirname(path))}: ${e.message}`); }
  const tmp = `${path}.conducted-lite-tmp.${process.pid}`;
  let err = null;
  try { writeFileSync(tmp, text); renameSync(tmp, path); } catch (e) { err = e; }
  if (err) {
    // The temp file is debris and never the record, so removing it is best-effort — and its OWN
    // failure must not replace the real error below, which is the only reason this is allowed to be
    // quiet. It is still not silent: a leftover is named on stderr so nobody has to find it.
    try { unlinkSync(tmp); } catch (e2) { if (!missing(e2)) process.stderr.write(`W_TMP_LEFT: ${posix(tmp)} could not be removed (${e2.message})\n`); }
    FAIL('E_WRITE_FAILED', `${posix(path)}: ${err.message} — the target was NOT modified.`);
  }
}

// ASSEMBLED AS BYTES. `head` and `tail` arrive as Buffers from `readSplit` and go back untouched;
// `body` is a BYTE-STRING (latin1 semantics) or a Buffer, never UTF-8 text — a caller with text runs
// it through `toBinary` first. That asymmetry is load-bearing rather than fussy: the ledger's body
// carries HAND-WRITTEN lines that must survive as the bytes they were, so it can only be handled in
// the byte domain, and a single silent `Buffer.from(x, 'utf8')` anywhere on this path is how the
// U+FFFD corruption got in the first time.
//
// AND IT REFUSES UTF-8 TEXT LOUDLY. Moving to a byte-domain body CHANGED THIS FUNCTION'S CONTRACT,
// and the failure mode of getting it wrong is SILENT MOJIBAKE — a caller that hands over UTF-8 text
// gets its em dashes and middots written as single Latin-1 bytes. That is exactly the class of quiet
// corruption this whole change is fixing, so it must not be possible to reintroduce by forgetting a
// `toBinary`. Any character above U+00FF cannot be in a byte-string, so its presence is proof the
// caller passed text; every body this machinery writes contains an em dash, so the guard bites on the
// first write rather than on some rare one. It matters most for a repo that upgraded these files
// PARTIALLY: an old session-end against a new lite-derive now fails with a named error instead of
// rewriting a facts block into mojibake.
export function writeSplit(path, split, START, END, body) {
  if (!Buffer.isBuffer(body)) {
    const t = String(body);
    for (let i = 0; i < t.length; i++) {
      if (t.charCodeAt(i) > 0xFF) {
        return FAIL('E_BODY_NOT_BYTES', `${posix(path)}: writeSplit was given UTF-8 TEXT where it needs BYTES (found ${JSON.stringify(t[i])} at offset ${i}). ` +
          `Wrap the body in toBinary() — writeSplit assembles the file in the byte domain so the HUMAN region either side of it survives exactly. NOTHING WAS WRITTEN. ` +
          `If this came from a partial upgrade, copy .claude/scripts/*.mjs and .claude/hooks/*.mjs as a set.`);
      }
    }
  }
  writeAtomic(path, Buffer.concat([bin(split.head), Buffer.from(START, 'latin1'), bin(body), Buffer.from(END, 'latin1'), bin(split.tail)]));
}

// --rescaffold's ONE rule about where the machine block goes, shared by both scripts so a roadmap and
// a state.md are scaffolded the same way. It lands AFTER a leading `# ` title when the file has one:
// every other file this machinery writes opens with its title, and the field's rescaffold left the
// document opening with a machine block and the title stranded twenty lines down. A file with no
// leading heading is unchanged from before — the block goes first, then the existing content.
// BYTE-ACCURATE LIKE THE SPLICE, for the same reason: this is the one path that reshapes a file
// nobody scaffolded, so the whole file is somebody's human region. Given a Buffer it scans in latin1
// (1 char == 1 byte) and returns Buffer slices; given a string it behaves exactly as it always did.
export function rescaffoldSplit(text) {
  const buf = Buffer.isBuffer(text) ? text : null;
  const s = buf ? buf.toString('latin1') : String(text);
  const m = s.match(/^\s*#[ \t]+[^\n]*(?:\r?\n|$)/);
  const lead = (t) => (t.startsWith('\n') || (Buffer.isBuffer(t) && t[0] === 0x0a));
  if (!m) {
    if (!buf) return { head: '', tail: s.startsWith('\n') ? s : '\n' + s };
    return { head: Buffer.alloc(0), tail: lead(buf) ? buf : Buffer.concat([Buffer.from('\n'), buf]) };
  }
  const head = m[0].replace(/\s+$/, '') + '\n\n';
  if (!buf) { const rest = s.slice(m[0].length); return { head, tail: rest.startsWith('\n') ? rest : '\n' + rest }; }
  const rest = buf.subarray(m[0].length);
  return { head: Buffer.from(head, 'latin1'), tail: lead(rest) ? rest : Buffer.concat([Buffer.from('\n'), rest]) };
}

export const noMarkers = (path, START, END, howToFix) => FAIL('E_LITE_NO_MARKERS',
  `${posix(path)} exists but carries no machine markers, so this script cannot tell which region it owns — and it will not guess. NOTHING WAS WRITTEN.\n` +
  `  Add these two lines where the machine block should live (the script owns everything between them, and rewrites it every run):\n` +
  `    ${START}\n    ${END}\n` + (howToFix ? `  ${howToFix}\n` : ''));

// ---------------------------------------------------------------------------- features

export const DOCS = ['problem.md', 'solution.md', 'tech-design.md'];
// One line of accommodation for superpowers, not a dependency: if it is used, its plan and spec land
// in the same folder and are LISTED. Nothing here requires them, reads them, or waits for them.
export const EXTRA_DOCS = ['plan.md', 'spec.md', 'research.md'];

export function listFeatures(main) {
  const dir = join(main, WORK_REL);
  let entries = [];
  // NARROW: 'the folder is not there yet' is the normal case and returns nothing. Anything else — a
  // permission error, a bad handle, a mistake in this file — must NOT be read as "this repo has no
  // features", because that answer silently switches off checks 3 and 4.
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch (e) { if (missing(e)) return { ok: [], rejected: [] }; return FAIL('E_UNREADABLE', `${posix(dir)}: ${e.message} — this is not "no features"; nothing was checked against it.`); }
  const names = entries.filter((d) => d.isDirectory()).map((d) => d.name);
  const ok = [], rejected = [];
  for (const n of names.sort()) {
    if (n.startsWith('.') || n.startsWith('_')) continue;
    (NAME_RE.test(n) ? ok : rejected).push(n);
  }
  return { ok, rejected };
}

// A DIRECTORY GIT HAS NEVER SEEN IS REPORTED COLLAPSED. `git status --porcelain` prints ONE entry —
// '?? .conducted/work/' or '?? .conducted/work/<name>/' — at the highest level that is entirely
// untracked, and never a line for the file inside it. So a folder holding nothing but the state.md
// this machinery writes is invisible to a lookup by path, and both readers of a porcelain line would
// call it work nothing accounts for: session-end's check 1 would FAIL the moment `--new-feature`
// created one, which makes the check unpassable by construction — the one thing it must never be.
//
// So the question is not about a path SHAPE, it is: is every FILE under this directory a state.md
// this machinery writes? Walked, and answered. NARROW ON PURPOSE — one other file in there (an
// uncommitted tech-design.md, a builder's note) and it is stranded work again, which it is.
// ONE COPY, imported by both scripts: two readers of the same porcelain line must not disagree.
const COLLAPSE_MAX_DEPTH = 4;
const FEATURE_FOLDER_RE = new RegExp(`^${WORK_REL.replace(/\./g, '\\.')}/[^/]+$`);
export function collapsedMachineDir(main, path) {
  if (!path.endsWith('/')) return false;
  const rel = path.slice(0, -1);
  if (rel !== WORK_REL && !rel.startsWith(`${WORK_REL}/`)) return false;   // never walk anything else
  const walk = (dirRel, depth) => {
    if (depth > COLLAPSE_MAX_DEPTH) return false;
    let entries;
    // NARROW: absent is the normal race (the folder went away between the status call and now).
    // Anything else is NAMED, because "accounted for" is the answer that SUPPRESSES a finding.
    try { entries = readdirSync(join(main, dirRel), { withFileTypes: true }); }
    catch (e) { if (missing(e)) return false; return FAIL('E_UNREADABLE', `${dirRel}: ${e.message} — refusing to read that as "accounted for", which would hide uncommitted work.`); }
    if (!entries.length) return false;
    for (const e of entries) {
      if (e.isDirectory()) { if (!walk(`${dirRel}/${e.name}`, depth + 1)) return false; continue; }
      if (!(e.name === 'state.md' && FEATURE_FOLDER_RE.test(dirRel))) return false;
    }
    return true;
  };
  return walk(rel, 0);
}

// Everything the machine can KNOW about a feature, from files on disk and refs in git. No network,
// no declarations, nothing a human has to maintain. This is the whole basis of the derived status,
// and that is the point: a status derived from evidence cannot drift from the evidence.
//
// NO PROCESS IS SPAWNED HERE. Everything git-shaped arrives in `ctx` — {locals, remotes, worktrees} —
// which is what lets the per-turn hook build a ctx out of ONE `for-each-ref` it was already paying
// for and derive exactly what session-start derives, at zero extra git cost.
//
// The two conventions, deliberately dumb and stated in CONDUCTOR.md so they are predictable:
//   branch   — any local or origin branch whose LAST '/'-segment is the feature name (so
//              'feat/checkout-flow', 'checkout-flow' and 'simon/checkout-flow' all match)
//   worktree — any linked worktree whose DIRECTORY NAME is the feature name
export function featureFacts(main, name, ctx) {
  const folder = join(main, WORK_REL, name);
  const rel = `${WORK_REL}/${name}`;
  const has = (f) => existsSync(join(folder, f));
  const docs = DOCS.filter(has);
  const extra = EXTRA_DOCS.filter(has);
  const leaf = (b) => b.slice(b.lastIndexOf('/') + 1);

  const branches = [];
  for (const b of ctx.locals) if (leaf(b.name) === name) branches.push({ name: b.name, sha: b.sha, where: 'local' });
  for (const b of ctx.remotes) {
    if (leaf(b.name) !== name) continue;
    const hit = branches.find((x) => x.name === b.name);
    if (hit) { hit.where = hit.sha === b.sha ? 'local+origin' : 'local+origin (tips differ)'; hit.originSha = b.sha; }
    else branches.push({ name: b.name, sha: b.sha, where: 'origin only', originSha: b.sha });
  }
  const worktrees = ctx.worktrees.filter((w) => w.name === name);

  // The derived rung, bottom-up. `development` outranks the documents because work having STARTED is
  // a louder fact than which documents exist; `complete` is not reachable from here by design.
  let derived = 'new';
  if (docs.includes('solution.md')) derived = 'accepted';
  if (docs.includes('tech-design.md')) derived = 'refined';
  if (branches.length || worktrees.length) derived = 'development';

  const statePath = join(folder, 'state.md');
  return {
    name, folder: posix(folder), rel, docs, extra, branches, worktrees, derived,
    hasProblem: docs.includes('problem.md'),
    statePath, hasState: existsSync(statePath),
  };
}

// ---------------------------------------------------------------------------- the roadmap ledger

const trimBlanks = (lines) => {
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
};

// Render the ledger. Human lines first, verbatim and in their original order; generated rows after.
// Leading/trailing blank lines per section are normalised so two runs produce identical bytes, and
// no NON-BLANK human line is ever altered, reordered or dropped.
export function renderLedger({ preamble, sections }) {
  const out = [''];
  const pre = trimBlanks(preamble);
  if (pre.length) out.push(...pre);
  out.push('');
  for (const s of STATUSES) {
    const sec = sections.get(s);
    out.push(`## ${s}`, '');
    const human = trimBlanks(sec.human);
    if (human.length) out.push(...human, '');
    if (sec.rows.length) out.push(...sec.rows.map((r) => r.line), '');
  }
  return out.join('\n');
}

// A GENERATED ROW, RETURNED AS BYTES. The ledger it joins is assembled in the byte domain so the
// hand-written lines beside it survive exactly (see `writeSplit`), and this row carries '—' and '·',
// which are multi-byte in UTF-8. `toBinary` puts it in the same domain as its neighbours; skipping it
// would write those two characters as Latin-1 mojibake.
export function rowLine(f, status) {
  const bits = [];
  bits.push(f.docs.length || f.extra.length ? [...f.docs, ...f.extra].join(', ') : 'no documents yet');
  for (const b of f.branches) bits.push(`branch \`${b.name}\` (${b.where})`);
  for (const w of f.worktrees) bits.push(`worktree \`${w.label}\``);
  return toBinary(`- [${f.name}](work/${f.name}/) — ${bits.join(' · ')}`);
}

// WHAT THE ROADMAP SAYS ABOUT THIS FEATURE — including the case where the honest answer is "this
// cannot be known". ONE COPY, because session-end and the per-turn glance both write this string into
// the same facts block and a disagreement makes them rewrite each other forever.
//
// The third case is the one that was wrong. With a roadmap that carries NO ledger markers there is no
// ledger to read, so the declared status is UNKNOWABLE — and both writers said
// '(not on the roadmap yet)', which is an assertion of ABSENCE derived from a lookup that could not
// have returned anything else. Measured: a roadmap plainly listing the feature, and a facts block
// underneath it flatly denying it. Never assert an absence you did not derive.
export const declaredLabel = (exists, hasLedgerMarkers, status) => (!exists
  ? `(UNKNOWN — ${ROADMAP_REL} does not exist, so nothing here can read a declared status. This is not "no row".)`
  : (hasLedgerMarkers
    ? (status || '(not on the roadmap yet)')
    : `(UNKNOWN — ${ROADMAP_REL} carries no ledger markers, so nothing here can read a declared status. This is not "no row".)`));

// THE PLACEMENT RATCHET — ONE COPY, and it had to become one the moment the per-turn glance started
// regenerating rows. session-start and the glance must place the same feature on the same rung from
// the same evidence, and two implementations of "the higher of declared and derived, complete is
// sticky, never move a row DOWN" is precisely the drift this machinery keeps paying for.
//
// It MUTATES `ledger` (rows are replaced in place) and RETURNS EVENTS rather than sentences: the
// caller decides what, if anything, to say. session-start turns them into its `report()` findings;
// the glance turns the ledger's new bytes into a diff and says nothing about the events at all.
// Sorting is by name, per section, so two runs produce identical bytes.
//
// WHAT IT DOES NOT DO: it never sweeps '## complete' into the archive, never touches a human line,
// and never writes anything. Sweeping is a tidy with a human trigger and belongs to session-start.
export function placeFeatureRows(ledger, features, archived) {
  const events = [];
  const declared = new Map();
  for (const s of STATUSES) for (const r of ledger.sections.get(s).rows) declared.set(r.name, s);
  const known = new Set(features.map((f) => f.name));

  for (const s of STATUSES) ledger.sections.get(s).rows = ledger.sections.get(s).rows.filter((r) => {
    if (known.has(r.name)) return false;                       // regenerated below
    if (archived.has(r.name)) return false;                    // the archive is the tombstone
    events.push({ kind: 'orphan-row', name: r.name, status: s });
    return true;                                               // PRESERVED exactly as written
  });

  for (const f of features) {
    if (archived.has(f.name)) { events.push({ kind: 'archived', feature: f }); continue; }
    const d = declared.get(f.name);
    const place = d === 'complete' ? 'complete' : (rung(f.derived) > rung(d || 'idea') ? f.derived : d);
    f.place = place;
    ledger.sections.get(place).rows.push({ name: f.name, line: rowLine(f, place) });
    if (d && d !== place) events.push({ kind: 'moved', name: f.name, from: d, to: place, feature: f });
    // The disagreement the never-demote rule creates, said out loud rather than sat on. A branch that
    // was merged and deleted is the ordinary cause: the evidence for 'development' is gone, but a
    // machine walking the row backwards reads as it undoing your work, so it holds and tells you.
    if (d && d !== 'complete' && rung(f.derived) < rung(d)) events.push({ kind: 'held', name: f.name, derived: f.derived, at: d, feature: f });
    if (!d) events.push({ kind: 'added', name: f.name, to: place, feature: f });
  }
  for (const s of STATUSES) ledger.sections.get(s).rows.sort((a, b) => a.name.localeCompare(b.name));
  return events;
}

// Every archived feature name, read out of archive.md. A feature named here is NOT regenerated into
// the roadmap: the archive is the tombstone, and without that rule the sweep would resurrect
// everything it swept on the very next run. To bring one back, delete its archive row by hand.
export function archivedNames(main) {
  const path = join(main, ARCHIVE_REL);
  if (!existsSync(path)) return new Set();
  let text = '';
  // NARROW: existsSync already said the file is there, so a read failure now is real. An empty set
  // here means "nothing is archived", which RESURRECTS every archived feature into the roadmap — far
  // too consequential to infer from a swallowed error.
  try { text = readFileSync(path, 'utf8'); } catch (e) { if (missing(e)) return new Set(); return FAIL('E_UNREADABLE', `${posix(path)}: ${e.message} — refusing to read that as "nothing is archived", which would regenerate every archived feature back onto the roadmap.`); }
  const out = new Set();
  for (const line of text.split(/\r?\n/)) { const m = line.match(ROW_RE); if (m) out.add(m[1]); }
  return out;
}

export const ROADMAP_HEAD = `# Roadmap — forward-looking. The headings ARE the status.

<!-- The block below is the LEDGER. Two kinds of line live in it:
       generated rows  '- [name](work/name/) ...'  — written by the SessionStart fact-check from
                       what exists on disk and in git. Do not hand-edit one; the next run rewrites it.
       everything else — yours, preserved byte-for-byte under the heading you wrote it beneath.
                       An 'idea' is exactly this: a hand-written line and no folder.
     You change an item's status by making it true, not by editing this file. The ONE exception is
     '## complete': moving a row there is a human judgement, and it is the only rung a machine will
     never assign. The next SessionStart sweeps it into archive.md. -->

`;

export const ARCHIVE_HEAD = `# Archive — what left the roadmap, so the roadmap stays forward-looking

<!-- Swept mechanically at session start, ONLY from '## complete' in roadmap.md, so the human's move
     is always the trigger. This file is the one place the machinery appends rather than rewrites:
     it is a log by definition, and it is what keeps roadmap.md bounded. A feature named here is
     never regenerated into the roadmap — delete its row by hand to bring it back. -->

`;

// ---------------------------------------------------------------------------- state.md

// Read back what the PREVIOUS run recorded into a facts block. These are the CLAIMS the SessionStart
// fact-check tests against reality: the file says a branch/worktree/PR existed, so go and look.
export function readFactsCarrier(body) {
  const m = String(body).match(/conducted-lite:state ([A-Za-z0-9+/=]*)/);
  let rec = {};
  // NARROW: a corrupt carrier is a SyntaxError and nothing else. A wider catch here would turn a
  // mistake in this function into "the file claimed nothing", and a claim that is silently empty is
  // never fact-checked against reality — the fact-check would pass by having nothing to test.
  if (m) { try { rec = JSON.parse(unb64(m[1])) || {}; } catch (e) { onlyBadJson(e); rec = {}; } }
  const j = String(body).match(/conducted-lite:judgment sha=([0-9a-f]+) at=([0-9T:.\-Z]+)/);
  const s = String(body).match(/conducted-lite:sessions ([A-Za-z0-9+/=]*)/);
  let sessions = [];
  if (s) { try { const a = JSON.parse(unb64(s[1])); if (Array.isArray(a)) sessions = a; } catch (e) { onlyBadJson(e); sessions = []; } }
  return {
    claimed: {
      branches: Array.isArray(rec.branches) ? rec.branches : [],
      worktrees: Array.isArray(rec.worktrees) ? rec.worktrees : [],
      pr: typeof rec.pr === 'string' ? rec.pr : '',
      status: typeof rec.status === 'string' ? rec.status : '',
      at: typeof rec.at === 'string' ? rec.at : '',
    },
    judgmentSha: j ? j[1] : null,
    judgmentAt: j ? j[2] : null,
    sessions,
  };
}

// The PROVENANCE LINE of a facts block, read back out of one. It is the ONE line in the block that is
// not a fact about the repo — it says who wrote the block and when — so a caller comparing DERIVED
// facts against WRITTEN facts has to be able to hold it constant. Without this the per-turn glance
// would rewrite every touched state.md the turn after each session-end run, for no reason but a
// different author's name in one sentence.
const VERIFIED_RE = /^\*\*Verified ([^*]+)\*\* by `node ([^`]+)`\. (.*)$/m;
export function readProvenance(body) {
  const m = String(body).match(VERIFIED_RE);
  return m ? { at: m[1], by: m[2], claim: m[3] } : null;
}

export const STATE_HUMAN_SCAFFOLD = `

## Decisions

<!-- What was decided and WHY, with the evidence that would reopen it. Rewrite in place, dated. -->

## Issues

<!-- What is wrong or unresolved right now. Delete an issue when it is gone, never strike it out. -->

## Acceptance criteria

<!-- Binary lines. Only a human ticks these: no script in this repo will ever tick one for you. -->
`;

export const stateHead = (name) => `# ${name} — feature state

<!-- Two regions. The facts block below is MACHINE-WRITTEN and REWRITTEN on every \`session-end\`
     run: branch, PR, worktree, folder, documents, and the session log. Everything under it is
     yours — decisions, issues, acceptance criteria — and no script touches it. -->

`;

// The session log is a LOG inside a REWRITTEN block, which is a contradiction unless it is bounded.
// It is: the block carries the most recent SESSION_LOG_KEEP entries and drops the rest, so two runs
// a year apart still produce the same number of lines.
export const SESSION_LOG_KEEP = 6;

// THE FACTS BLOCK, RENDERED. ONE COPY, and this is the newest of the three extractions and the one
// with the sharpest reason: session-end owns this shape, and the per-turn glance now REFRESHES it
// mid-session. If the glance rendered its own version the two would rewrite each other forever, each
// "correcting" bytes the other just wrote, in the file whose human region is the thing this machinery
// most exists to protect.
//
// EVERYTHING VOLATILE IS AN ARGUMENT. `verifiedAt` / `verifiedBy` / `claim` are the provenance line;
// `judgmentAt` is when the human region last changed. Hold those four constant and this function is
// a PURE FUNCTION OF THE REPO'S FACTS — which is exactly what lets a caller ask "would I write
// different bytes than are already there?" and answer it without a clock in the way.
//
// The default `claim` is session-end's own sentence, verbatim, so session-end's output is unchanged
// to the byte by this extraction.
export const FACTS_CLAIM_VERIFIED = "Every line below is a command's output or a file that exists.";

export function renderFactsBody(f) {
  const sessions = Array.isArray(f.sessions) ? f.sessions : [];
  return [
    '',
    '<!-- MACHINE-WRITTEN. REWRITTEN IN PLACE on every session-end run that touches this feature —',
    '     never appended to. Everything OUTSIDE the two markers is yours; the script never touches,',
    '     reorders or rewrites it, never reads it as an instruction, and NEVER ticks an acceptance',
    '     criterion. Do not hand-edit inside the markers: the next run overwrites it. -->',
    '',
    `**Verified ${f.verifiedAt}** by \`node ${f.verifiedBy}\`. ${f.claim || FACTS_CLAIM_VERIFIED}`,
    '',
    `- feature: \`${f.name}\``,
    `- folder: \`${f.rel}/\``,
    `- documents: ${[...f.docs, ...f.extra].join(' · ') || '(none — legal; see the altitude law in ' + CONDUCTOR_REL + ')'}`,
    `- derived status: \`${f.derived}\`   ·   roadmap says: \`${f.declared}\``,
    ...(f.branches.length ? ['- branches:', ...f.branches.map((b) => `  - \`${b.name}\` @ \`${b.sha.slice(0, 8)}\` (${b.where})`)] : ['- branches: none matching this feature name']),
    ...(f.worktrees.length ? ['- worktrees:', ...f.worktrees.map((w) => `  - \`${w.label}\` -> ${w.path}`)] : ['- worktrees: none']),
    f.pr
      ? `- PR: #${f.pr} — DECLARED by the line "${sanitize(f.prLine)}" in the human region below. Nothing in git knows about a PR; \`node ${START_REL}\` checks it with one \`gh pr list\` call and reports UNVERIFIED when gh is not there.`
      : '- PR: none declared (to declare one, put `PR: #<n>` or the pull-request URL on a LINE OF ITS OWN below the markers — a mention inside a sentence is not a declaration)',
    '- session log (most recent, bounded):',
    ...sessions.map((s) => `  - \`${s.at}\` session \`${s.id}\` — ${s.note || 'touched'}`),
    `<!-- conducted-lite:state ${b64(JSON.stringify(f.carrier))} -->`,
    `<!-- conducted-lite:sessions ${b64(JSON.stringify(sessions))} -->`,
    ...(f.judgmentSha ? [`<!-- conducted-lite:judgment sha=${f.judgmentSha} at=${f.judgmentAt} -->`] : []),
    '',
  ].join('\n');
}

// A WELL-FORMED, EMPTY state.md — the whole file, markers and all. It lives here beside `stateHead`
// and `STATE_HUMAN_SCAFFOLD` because those two ARE the shape session-end owns, and a generator that
// minted the shape somewhere else would be a second copy of it waiting to drift out of step with the
// script that rewrites it. Every fact in the block is a fact about a folder that was just created, so
// it asserts nothing: the first `session-end` run that touches this feature rewrites the block from
// git and the filesystem.
export function newFeatureState(name, at) {
  const carrier = { at, status: 'new', branches: [], worktrees: [], pr: '' };
  const sessions = [{ at, id: 'scaffold', note: `folder and state.md created by ${END_REL} --new-feature` }];
  const body = [
    '',
    '<!-- MACHINE-WRITTEN. REWRITTEN IN PLACE on every session-end run that touches this feature —',
    '     never appended to. Everything OUTSIDE the two markers is yours; the script never touches,',
    '     reorders or rewrites it, never reads it as an instruction, and NEVER ticks an acceptance',
    '     criterion. Do not hand-edit inside the markers: the next run overwrites it. -->',
    '',
    `**Scaffolded ${at}** by \`node ${END_REL} --new-feature ${name}\`. NOTHING IS VERIFIED HERE YET:`,
    'the folder exists and that is the only fact in this block. The first session-end run that touches',
    'this feature replaces every line of it with what git and the filesystem actually show.',
    '',
    `- feature: \`${name}\``,
    `- folder: \`${WORK_REL}/${name}/\``,
    `- documents: (none yet — legal; see the altitude law in ${CONDUCTOR_REL})`,
    '- derived status: `new` — the folder exists and nothing else does yet',
    '- branches: none matching this feature name',
    '- worktrees: none',
    '- PR: none declared (to declare one, put `PR: #<n>` or the pull-request URL on a LINE OF ITS OWN below the markers — a mention inside a sentence is not a declaration)',
    '- session log (most recent, bounded):',
    ...sessions.map((s) => `  - \`${s.at}\` session \`${s.id}\` — ${s.note}`),
    `<!-- conducted-lite:state ${b64(JSON.stringify(carrier))} -->`,
    `<!-- conducted-lite:sessions ${b64(JSON.stringify(sessions))} -->`,
    '',
  ].join('\n');
  return stateHead(name) + FACTS_START + body + FACTS_END + STATE_HUMAN_SCAFFOLD;
}

// ---------------------------------------------------------------------------- the PR declaration

// The PR is the one fact a human must DECLARE, because nothing in git knows about it. THAT MAKES
// THIS THE ONE PLACE THE HUMAN REGION IS INPUT TO SOMETHING THE MACHINE WRITES, so the form is exact
// rather than generous — the opposite register from the worktree check, and deliberately so.
//
// It used to be a loose scan (`/\bPR[:\s]*#?(\d+)/i`) and the field proved what that costs. One
// honest sentence — "The repo adopted conducted-lite from PR #40 head" — was written into four
// features' state.md, and on the next run all four facts blocks asserted `PR: #40`: four features
// with no branch, no worktree and no pull request anywhere, asserting one in the region whose entire
// promise is that every line is a command's output or a file that exists. Then session-start spent a
// real `gh` API call chasing it. Nothing structural broke: the byte-splice guarantee held, and the
// parser went AROUND it, because its input is prose and its output is written into the facts.
//
// So: DECLARING A PR IS A DELIBERATE ACT, never a side effect of writing a sentence. The line is
// anchored at BOTH ends, the colon is MANDATORY, and nothing else may sit on the line — a leading
// markdown bullet aside, because a list is how people write and `- PR: #40` is still a whole line
// that says one thing. `PR 40`, `pr40`, and any mid-sentence mention declare NOTHING. The URL branch
// is anchored the same way for one form, not two.
//
// And the declaration is QUOTED back by every caller that prints it, the way check 1 names the
// source of every allowance: a quoted source makes a false declaration obvious on sight, which is
// the thing that makes machine-written output trustworthy.
//
// (matchAll does not mutate the regex it is given — it clones with the source lastIndex, which is
// never advanced here — so this shared /g literal is safe to keep at module scope.)
const PR_LINE_RE = /^[ \t]*(?:[-*+][ \t]+)?PR:[ \t]*(#?\d+|https?:\/\/\S+)[ \t]*$/gim;

// The declaration itself: { number, line } for the first legal line, or null. ONE parser, so the
// number written into the facts block and the source quoted beside it can never disagree.
export function prDeclaration(humanText) {
  for (const m of String(humanText).matchAll(PR_LINE_RE)) {
    const v = m[1];
    if (/^#?\d+$/.test(v)) return { number: v.replace(/^#/, ''), line: m[0].trim() };
    const u = v.match(/\/pull\/(\d+)/);   // a URL declares only if it names a pull request
    if (u) return { number: u[1], line: m[0].trim() };
  }
  return null;
}

export function declaredPR(humanText) {
  const d = prDeclaration(humanText);
  return d ? d.number : '';
}

export { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, join };
