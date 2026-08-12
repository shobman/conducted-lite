// The corpus for .claude/hooks/conductor-guard.mjs — the CASES, kept apart from the runner.
//
// WHY THE COMMAND STRINGS LIVE IN fixtures/*.txt AND NOT IN THIS FILE: the guard is armed while
// anyone works on it, and a source file containing `writeFileSync("src/app.ts")` trips it on the
// maintainer's own tool calls. That happened while these defects were being reproduced. It is also
// the only way to hold a transcript's bytes: three of these commands are copied out of a field note
// rather than retyped, because a retyping of one of them already hit a different branch of the guard
// than the real command did and produced a wrong diagnosis. See fixtures/PROVENANCE.md.
//
// EVERY EXPECTATION HERE IS WHAT THE GUARD SHOULD DO, never what it does today. Group A therefore
// FAILS today, on purpose: each group-A case is a known defect from
// .conducted/work/guard-false-positives/state.md, and it turns green when that defect is fixed, with
// no edit to the assertion. Group B passes today and must keep passing.
//
// Expectation fields:
//   decision      'allow' | 'deny'
//   named         on a deny: the repo-relative path the message must name, or null for "the message
//                 must not name any path". Required on every deny.
//   reason        optional short RegExp the message must match. Kept short on purpose: the wording
//                 belongs to the guard's author and will be rewritten.
//   notMentions   substrings the message must not contain anywhere. This is the wording-independent
//                 half of defect 4 — a deny that names a file the command does not write.

import { readFileSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..', '..');

// A SYNTHETIC TWO-LEVEL LITE TREE, for the cases where the cwd and the target sit in DIFFERENT
// trees. CONDUCTOR.md mandates worktrees at `worktrees/<feature>/` inside the repo, and a linked
// worktree has `.conducted/CONDUCTOR.md` checked out, so a lite repo routinely contains a second
// lite root beneath it. Built in tmpdir rather than pointed at this checkout's own
// `worktrees/guard-false-positives/`, because that directory stops existing the day this branch
// merges and a corpus that depends on it would rot. Fixed names, never a timestamp: a run must be
// reproducible. Assumes tmpdir has no spaces in it, which is what the redirect shapes below can
// carry.
const NEST = join(tmpdir(), 'conducted-lite-guard-corpus-nested');
export const NESTED_MAIN = join(NEST, 'main');
export const NESTED_WT = join(NESTED_MAIN, 'worktrees', 'feat');
for (const r of [NESTED_MAIN, NESTED_WT]) {
  mkdirSync(join(r, '.conducted'), { recursive: true });
  writeFileSync(join(r, '.conducted', 'CONDUCTOR.md'), '# corpus fixture root, not real doctrine\n');
}
const posix = (p) => p.replace(/\\/g, '/');

// A fixture is bytes. \r\n is normalised (git may have rewritten it on checkout) and exactly one
// trailing newline is dropped, so a one-line fixture is a one-line command. `{{MAIN}}` and `{{WT}}`
// are the only substitution: an absolute path into the synthetic tree above cannot be committed as
// bytes, since tmpdir differs per machine. No fixture copied from a transcript contains either.
const fx = (name) =>
  readFileSync(join(HERE, 'fixtures', `${name}.txt`), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\n$/, '')
    .replace(/\{\{MAIN\}\}/g, posix(NESTED_MAIN))
    .replace(/\{\{WT\}\}/g, posix(NESTED_WT));

const bash = (fixture, over = {}) => ({
  session_id: 'corpus',
  transcript_path: '/dev/null',
  hook_event_name: 'PreToolUse',
  cwd: REPO_ROOT,
  tool_name: 'Bash',
  tool_input: { command: fx(fixture) },
  ...over,
});

// DOES THIS VOLUME EVEN HAVE 8.3 SHORT NAMES? NTFS generates them per-volume and the setting can be
// off, so `CONDUC~1` is a real second name for `.conducted` on one machine and nothing at all on the
// next. That is a fact about the disk, not about the guard, and a corpus that asserted one of them
// would fail for the wrong reason on the other. So it is MEASURED here, once, the same way the guard
// measures it, and the one expectation that genuinely forks on it says so in its own line. The
// ALLOW half does not fork: a short name that folds to an owned file allows because it IS that file,
// and a short name that folds to nothing allows because it is an unknown — both are allows.
const SHORT_NAMES_EXIST = (() => {
  if (process.platform !== 'win32') return false;
  try { return /[/\\]\.conducted$/.test(realpathSync.native(join(REPO_ROOT, 'CONDUC~1'))); }
  catch { return false; }
})();

const write = (file_path, over = {}) => ({
  session_id: 'corpus',
  transcript_path: '/dev/null',
  hook_event_name: 'PreToolUse',
  cwd: REPO_ROOT,
  tool_name: 'Write',
  tool_input: { file_path, content: 'x' },
  ...over,
});

export const cases = [
  // ===========================================================================================
  // GROUP A — the known defects. These FAIL today. That is the point of the corpus.
  // ===========================================================================================
  {
    id: 'A1-cp-into-directory',
    group: 'A',
    defect: [1, 4],
    what: 'cp of a product file into a DIRECTORY outside the repo',
    why: 'The destination is a position — the last argument — and it is outside the repo, which the ' +
      "deny's own sentence calls exempt. Today the cp/mv branch takes the last file-SHAPED token, " +
      'a directory has no extension, so it falls back to the source and denies naming it.',
    payload: bash('a1-cp-into-directory'),
    expect: { decision: 'allow', notMentions: ['docs/assets/row-1.jpg'] },
  },
  {
    id: 'A2-mukfork-4399-cp-glob',
    group: 'A',
    defect: [2, 4],
    what: 'a glob in the source manufactures a phantom target (mukfork main transcript line 4399)',
    why: 'rawTokens excludes `*`, so `row-*.jpg` splits and the fragment `.jpg` survives as an ' +
      'extension with no stem, is resolved against the repo root, and is announced as the file ' +
      'written. A bare extension was never a path candidate. Every source and the destination are ' +
      'outside this repo.',
    payload: bash('a2-mukfork-4399-cp-glob'),
    expect: { decision: 'allow', notMentions: ['.jpg'] },
  },
  {
    id: 'A3-payload-string-veto',
    group: 'A',
    defect: [3, 4],
    what: 'a path inside the CONTENT being written vetoes a write to a path the conductor owns',
    why: 'The write target is the argument of the write call and it is `.conducted/roadmap.md`, ' +
      'which is the first entry in the allow-set. `src/app.ts` is prose inside the bytes being ' +
      'written. The `strays` scan counts any separator-carrying token anywhere on the line.',
    payload: bash('a3-payload-string-veto'),
    expect: { decision: 'allow', notMentions: ['src/app.ts'] },
  },
  {
    id: 'A3b-payload-escape-veto',
    group: 'A',
    defect: [3, 4],
    what: 'a \\n escape inside the CONTENT vetoes a heredoc write to .conducted/roadmap.md',
    why: 'FOUND BY THIS CORPUS, not by the field, while writing the group-B case for the header ' +
      'promise that a heredoc may write .conducted/**. Same mechanism as A3 and it goes with it: ' +
      'the content string `"## development\\n"` tokenises as `development\\n`, the backslash reads ' +
      'as a path separator, and the stray veto denies the whole command. A heredoc writing prose ' +
      'that contains one escape is the ordinary case, not an exotic one.',
    payload: bash('a3b-payload-escape-veto'),
    expect: { decision: 'allow' },
  },
  {
    id: 'A4-mukfork-3904-argv-target',
    group: 'A',
    defect: [4],
    what: 'an unresolvable interpreter target, with a filename inside the HTML being written ' +
      '(mukfork main transcript line 3904)',
    why: 'DENY IS THE RIGHT VERDICT HERE and stays: the target is `process.argv[1]`, which does not ' +
      'resolve. What is wrong is only the name. `ramen.jpg` occurs four times as `<img src=...>` ' +
      'inside the HTML string being written and nowhere else. This is the single place in the guard ' +
      'where a failure to know is converted into a confident claim.',
    payload: bash('a4-mukfork-3904-argv-target'),
    expect: {
      decision: 'deny',
      named: null,
      reason: /could not be determined/i,
      notMentions: ['ramen.jpg'],
    },
  },
  {
    id: 'A5-mukfork-2054-heredoc',
    group: 'A',
    defect: [5, 4],
    what: 'a python heredoc editing .conducted/standards.md, denied for a filename in a SEARCH ' +
      'string (mukfork main transcript line 2054)',
    why: 'The write target is `p`, a literal three lines above, and `.conducted/**` is the FIRST ' +
      'entry in the allow-set the deny message itself prints. `creator.html` occurs once, inside ' +
      'the old text being replaced. Nobody noticed this denial at the time; it was worked around ' +
      'by re-attempting the same path with the Edit tool.',
    payload: bash('a5-mukfork-2054-heredoc'),
    expect: { decision: 'allow', notMentions: ['creator.html', 'profile.html'] },
  },
  {
    id: 'A5c1-control-no-filename-in-search',
    group: 'A',
    defect: [5],
    what: 'CONTROL for A5 — the same heredoc with the filenames removed from the search string',
    why: 'ALLOWS TODAY. Isolates the cause to the payload: nothing about the write expression ' +
      'changed. It must still allow after the fix, so it is a control in both directions.',
    payload: bash('a5-control-no-filename-in-search'),
    expect: { decision: 'allow' },
  },
  {
    id: 'A5c2-control-bare-literal-target',
    group: 'A',
    defect: [5],
    what: 'CONTROL for A5 — the same heredoc with the target as a bare literal instead of via `p`',
    why: 'DENIES TODAY, still naming creator.html. So this is not a variable-resolution failure: ' +
      'even with the owned target sitting in plain sight as the argument of the write call, a ' +
      'filename in the content overrides it.',
    payload: bash('a5-control-bare-literal-target'),
    expect: { decision: 'allow', notMentions: ['creator.html', 'profile.html'] },
  },
  {
    id: 'A6c-control-no-inner-quote',
    group: 'A',
    defect: [6],
    what: 'CONTROL for A6 — python -c rewriting an owned state.md, no double quote inside a string',
    why: 'ALLOWS TODAY. The other half of the pair. Byte-for-byte identical to A6 except for the ' +
      'two characters noted there.',
    payload: bash('a6-control-no-inner-quote'),
    expect: { decision: 'allow' },
  },
  {
    id: 'A6-one-inner-quote',
    group: 'A',
    defect: [6],
    what: 'one double quote inside a string empties the target extraction on an owned path',
    why: "QUOTED_LITERAL's content class excludes every quote character, so one `\\\"` in a script " +
      'body re-pairs every quote after it: the path literal is swallowed as the tail of a different ' +
      'match, targets comes back empty, and empty is reported as "the target could not be ' +
      'determined". Measured: this fixture differs from A6c by exactly the two characters `\\"` ' +
      'inserted into the replacement string, and nothing else. A find-and-replace is the reason to ' +
      'reach for an interpreter at all, and it contains quoted strings by definition.',
    payload: bash('a6-one-inner-quote'),
    expect: { decision: 'allow' },
  },

  // ===========================================================================================
  // GROUP B — correct behaviour. These PASS today and must keep passing.
  // ===========================================================================================

  // ---- Edit/Write, which the guard's header calls the real guarantee --------------------------
  {
    id: 'B-write-legal-readme',
    group: 'B',
    what: 'Write of legal/README.md — a real denial in the field, and correct',
    why: 'Only the top-level README.md is owned. legal/ is deliberately not conductor-owned.',
    payload: write('legal/README.md'),
    expect: { decision: 'deny', named: 'legal/README.md', reason: /Non-negotiable 1/ },
  },
  {
    id: 'B-write-docs-product-html',
    group: 'B',
    what: 'Write of docs/product/x.html — a real denial in the field, and correct',
    why: 'docs/**.md is maintainer prose and owned; docs/**.html is product.',
    payload: write('docs/product/x.html'),
    expect: { decision: 'deny', named: 'docs/product/x.html', reason: /Non-negotiable 1/ },
  },
  {
    id: 'B-write-docs-config-ts',
    group: 'B',
    what: 'Write of docs/site/config.ts — a docs/ folder holds build config, which is product code',
    payload: write('docs/site/config.ts'),
    expect: { decision: 'deny', named: 'docs/site/config.ts' },
  },
  {
    id: 'B-write-src-app-ts',
    group: 'B',
    what: 'Write of src/app.ts — the case the whole guard exists for',
    payload: write('src/app.ts'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'B-write-the-guard-itself',
    group: 'B',
    what: 'Write of .claude/hooks/conductor-guard.mjs — the olchat case, not carved out',
    why: 'A guard the conductor can rewrite unreviewed is the same failure the guard was built for.',
    payload: write('.claude/hooks/conductor-guard.mjs'),
    expect: { decision: 'deny', named: '.claude/hooks/conductor-guard.mjs' },
  },
  {
    id: 'B-write-notebook-product',
    group: 'B',
    what: 'NotebookEdit of a product notebook, whose target arrives as notebook_path',
    payload: {
      session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: REPO_ROOT,
      tool_name: 'NotebookEdit', tool_input: { notebook_path: 'src/explore.ipynb' },
    },
    expect: { decision: 'deny', named: 'src/explore.ipynb' },
  },
  {
    id: 'B-write-absolute-product-path',
    group: 'B',
    what: 'Write of an ABSOLUTE path into product code',
    payload: write(join(REPO_ROOT, 'src', 'app.ts').replace(/\\/g, '/')),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  { id: 'B-write-docs-md', group: 'B', what: 'Write of docs/x.md — owned', payload: write('docs/x.md'), expect: { decision: 'allow' } },
  { id: 'B-write-roadmap', group: 'B', what: 'Write of .conducted/roadmap.md — owned', payload: write('.conducted/roadmap.md'), expect: { decision: 'allow' } },
  { id: 'B-write-readme', group: 'B', what: 'Write of README.md — owned', payload: write('README.md'), expect: { decision: 'allow' } },
  { id: 'B-write-claude-md', group: 'B', what: 'Write of CLAUDE.md — owned', payload: write('CLAUDE.md'), expect: { decision: 'allow' } },
  { id: 'B-write-research', group: 'B', what: 'Write of research/notes.md — owned', payload: write('research/2026-08-13-notes.md'), expect: { decision: 'allow' } },
  {
    id: 'B-edit-feature-state',
    group: 'B',
    what: 'Edit of a feature state.md — owned',
    payload: {
      session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: REPO_ROOT, tool_name: 'Edit',
      tool_input: { file_path: '.conducted/work/guard-false-positives/state.md', old_string: 'a', new_string: 'b' },
    },
    expect: { decision: 'allow' },
  },

  // ---- cwd resolution: the guard finds the repo root from the payload's cwd -------------------
  {
    id: 'B-cwd-subdir-relative-product',
    group: 'B',
    what: 'a relative Write from a SUBDIRECTORY resolves against that subdirectory',
    why: 'The corpus is run from the worktree root and from a subdirectory; the guard resolves the ' +
      'root from cwd, so cwd handling is under test rather than assumed.',
    payload: write('helper.mjs', { cwd: join(REPO_ROOT, '.claude', 'hooks').replace(/\\/g, '/') }),
    expect: { decision: 'deny', named: '.claude/hooks/helper.mjs' },
  },
  {
    id: 'B-cwd-subdir-relative-owned',
    group: 'B',
    what: 'the same, resolving into the allow-set',
    payload: write('state.md', { cwd: join(REPO_ROOT, '.conducted', 'work', 'guard-false-positives').replace(/\\/g, '/') }),
    expect: { decision: 'allow' },
  },
  {
    id: 'B-cwd-git-bash-style',
    group: 'B',
    what: 'a Git-Bash /c/-style cwd is understood',
    payload: write('src/app.ts', { cwd: '/' + REPO_ROOT.replace(/\\/g, '/').replace(/^([A-Za-z]):\//, (_, d) => d.toLowerCase() + '/') }),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },

  // ---- which TREE a path is measured against, when the cwd is in a different one ---------------
  //
  // Found live on 2026-08-13 by a conductor being subject to it: from the main checkout, an Edit of
  // `worktrees/<feature>/.conducted/work/<feature>/state.md` was DENIED, in a message whose last
  // line grants `.conducted/**`. Same shape as defects 3, 5 and 6 — a deny of a path the same
  // sentence owns — on the Edit/Write path instead of the Bash path. CONDUCTOR.md mandates
  // worktrees INSIDE the repo, so every conductor keeping a feature's state.md current while a
  // builder works in its worktree hits this every time. The other direction is a hole rather than a
  // false positive: from inside a worktree, the main checkout's product code relativises to
  // `../../src/app.ts`, reads as outside the repo, and is silently allowed.
  //
  // These are group B because they are promises the guard's header already makes: "a conductor
  // working inside worktrees/<feature> is measured against that worktree's own tree, which is what
  // it should be." They fail against the guard as it stood before this feature's fix.
  {
    id: 'B-tree-worktree-owned-from-main-cwd',
    group: 'B',
    what: 'Edit of a worktree\'s own state.md, from a cwd in the MAIN checkout — the field case',
    why: 'The nearest lite root above the TARGET is the worktree, so the path is `.conducted/...` ' +
      'and owned. Measured from the cwd it is `worktrees/feat/.conducted/...` and owned by nothing.',
    payload: {
      session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: posix(NESTED_MAIN), tool_name: 'Edit',
      tool_input: { file_path: 'worktrees/feat/.conducted/work/feat/state.md', old_string: 'a', new_string: 'b' },
    },
    expect: { decision: 'allow' },
  },
  {
    id: 'B-tree-worktree-product-from-main-cwd',
    group: 'B',
    what: 'Write of product code INSIDE a worktree, from a cwd in the main checkout',
    why: 'THE CASE THAT PROVES THE FIX IS THE RIGHT ONE. Resolving the root from the target must ' +
      "not buy a worktree's src/app.ts an allow; it is denied exactly as the main checkout's is.",
    payload: write('worktrees/feat/src/app.ts', { cwd: posix(NESTED_MAIN) }),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'B-tree-main-product-from-worktree-cwd',
    group: 'B',
    what: 'Write of the MAIN checkout\'s product code, from a cwd inside a worktree',
    why: 'The other direction of the same mismatch, and a hole rather than a false positive: ' +
      'relative to the worktree this path is `../../src/app.ts`, which reads as outside the repo.',
    payload: write(posix(join(NESTED_MAIN, 'src', 'app.ts')), { cwd: posix(NESTED_WT) }),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'B-tree-main-owned-from-worktree-cwd',
    group: 'B',
    what: 'Write of the main checkout\'s roadmap, from a cwd inside a worktree — owned',
    payload: write(posix(join(NESTED_MAIN, '.conducted', 'roadmap.md')), { cwd: posix(NESTED_WT) }),
    expect: { decision: 'allow' },
  },
  {
    id: 'B-tree-worktree-owned-bash-from-main-cwd',
    group: 'B',
    what: 'redirection into a worktree\'s research/, from a cwd in the main checkout — owned',
    why: 'research/** is owned and .json is not scratch-exempt, so this measures the tree and ' +
      'nothing else.',
    payload: bash('w-worktree-owned-redirect', { cwd: posix(NESTED_MAIN) }),
    expect: { decision: 'allow' },
  },
  {
    id: 'B-tree-worktree-owned-heredoc-from-main-cwd',
    group: 'B',
    what: 'the same through the interpreter branch — a heredoc writing a worktree\'s research/',
    payload: bash('w-worktree-owned-heredoc', { cwd: posix(NESTED_MAIN) }),
    expect: { decision: 'allow' },
  },
  {
    id: 'B-tree-worktree-product-bash-from-main-cwd',
    group: 'B',
    what: 'cp onto product code inside a worktree, from a cwd in the main checkout',
    payload: bash('w-worktree-product-cp', { cwd: posix(NESTED_MAIN) }),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /copying or moving/i },
  },
  {
    id: 'B-tree-main-product-bash-from-worktree-cwd',
    group: 'B',
    what: 'redirection into the main checkout\'s product code, from a cwd inside a worktree',
    payload: bash('w-main-product-redirect', { cwd: posix(NESTED_WT) }),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },

  // ---- agent_id: the core discriminator -------------------------------------------------------
  {
    id: 'B-agentid-write-product',
    group: 'B',
    what: 'a dispatched builder writing product code — allowed, and this is the point',
    why: 'miq: 113 subagent transcripts, zero denials. A dispatched builder is exactly who is ' +
      'supposed to be writing code, and the check runs before any other work.',
    payload: write('src/app.ts', { agent_id: 'agent_01ABC', agent_type: 'general-purpose' }),
    expect: { decision: 'allow' },
  },
  {
    id: 'B-agentid-write-docs-html',
    group: 'B',
    what: 'a dispatched builder writing a product page under docs/',
    payload: write('docs/product/x.html', { agent_id: 'agent_01ABC' }),
    expect: { decision: 'allow' },
  },
  {
    id: 'B-agentid-bash-cp-product',
    group: 'B',
    what: 'a dispatched builder copying onto product code',
    payload: bash('b-cp-onto-product', { agent_id: 'agent_01ABC' }),
    expect: { decision: 'allow' },
  },
  {
    id: 'B-agentid-bash-guard-itself',
    group: 'B',
    what: 'a dispatched builder editing the guard — allowed; it is the builder who is reviewed',
    payload: write('.claude/hooks/conductor-guard.mjs', { agent_id: 'agent_01ABC' }),
    expect: { decision: 'allow' },
  },

  // ---- Bash: the deny shapes the header promises ----------------------------------------------
  {
    id: 'B-echo-local-properties',
    group: 'B',
    what: "redirection into local.properties — miq's one genuine catch across nine denials",
    why: 'An Android build-config write. Extension-less siblings are missed by declaration; this ' +
      'one is caught and must stay caught.',
    payload: bash('b-echo-local-properties'),
    expect: { decision: 'deny', named: 'local.properties', reason: /redirection/i },
  },
  {
    id: 'B-git-show-redirect',
    group: 'B',
    what: 'git show HEAD:x > src/app.ts — named in the header as still denied',
    why: 'The git exemption is a list of where PROSE appears on a git command line, not a list of ' +
      'safe git verbs. A blanket git exemption swallowed exactly this.',
    payload: bash('b-git-show-redirect'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'B-tee-product',
    group: 'B',
    what: 'tee into product code',
    payload: bash('b-tee-product'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /tee/i },
  },
  {
    id: 'B-sed-inplace-product',
    group: 'B',
    what: 'sed -i on product code',
    payload: bash('b-sed-inplace-product'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /in-place/i },
  },
  {
    id: 'B-cp-onto-product',
    group: 'B',
    what: 'cp onto a product file INSIDE the repo — the shape defect 1 must not be widened into',
    why: 'The fix for A1 reads the destination positionally. It must still deny when that position ' +
      'is product code.',
    payload: bash('b-cp-onto-product'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /copying or moving/i },
  },
  {
    id: 'B-heredoc-redirect-product',
    group: 'B',
    what: 'a heredoc REDIRECTED into product code — the interpreter branch does not cover for it',
    why: 'The header is explicit: allowing in the interpreter branch skips that branch only, and ' +
      'the segment loop still sees the redirect.',
    payload: bash('b-heredoc-redirect-product'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'B-interpreter-unresolvable',
    group: 'B',
    what: 'an interpreter write to a target that genuinely cannot be resolved',
    why: 'CORRECT, AND IT STAYS. Conservative where it cannot tell. The message must not name a ' +
      'candidate — that is the whole of defect 4, and this case is the honest exit it should have.',
    payload: bash('b-interpreter-unresolvable'),
    expect: { decision: 'deny', named: null, reason: /could not be determined/i },
  },

  // ---- Bash: git always works, reads are never blocked ----------------------------------------
  {
    id: 'B-git-commit-message',
    group: 'B',
    what: 'a commit message containing <repo>_<feature> — the field case that denied a commit',
    why: '`>_<` read as a redirect into `_`, denying a git commit under a header that promises git ' +
      'always works.',
    payload: bash('b-git-commit-message'),
    expect: { decision: 'allow' },
  },
  { id: 'B-git-push', group: 'B', what: 'git push', payload: bash('b-git-push'), expect: { decision: 'allow' } },
  { id: 'B-git-branch', group: 'B', what: 'git branch', payload: bash('b-git-branch'), expect: { decision: 'allow' } },
  { id: 'B-git-worktree', group: 'B', what: 'git worktree add', payload: bash('b-git-worktree'), expect: { decision: 'allow' } },
  { id: 'B-read-cat', group: 'B', what: 'reading product code', payload: bash('b-read-cat'), expect: { decision: 'allow' } },
  { id: 'B-read-git-show', group: 'B', what: 'git show of product code with no redirect', payload: bash('b-read-git-show'), expect: { decision: 'allow' } },
  { id: 'B-build-npm', group: 'B', what: 'a build', payload: bash('b-build-npm'), expect: { decision: 'allow' } },
  { id: 'B-test-npm', group: 'B', what: 'a test run', payload: bash('b-test-npm'), expect: { decision: 'allow' } },
  { id: 'B-install-npm', group: 'B', what: 'an install — note `install` is also a cp-family verb', payload: bash('b-install-npm'), expect: { decision: 'allow' } },
  {
    id: 'B-grep-two-files',
    group: 'B',
    what: 'grep with two file arguments — path-shaped arguments with no write verb',
    why: "miq's first suggested test case. Arguments that look like paths are not a write.",
    payload: bash('b-grep-two-files'),
    expect: { decision: 'allow' },
  },
  {
    id: 'B-scratch-redirect',
    group: 'B',
    what: 'redirection into scratch output — exempt on the Bash path by declaration',
    why: 'Asymmetric with Edit/Write on purpose: a Bash deny kills a whole chained command ' +
      'including the reads after it.',
    payload: bash('b-scratch-redirect'),
    expect: { decision: 'allow' },
  },
  {
    id: 'B-heredoc-owned',
    group: 'B',
    what: 'a heredoc writing .conducted/** — the header promises this works',
    why: 'This branch used to deny on the shape alone, which denied a conductor rewriting his own ' +
      'state.md with a message that ended by listing .conducted/** as his.',
    payload: bash('b-heredoc-owned'),
    expect: { decision: 'allow' },
  },

  // ---- `>` IN PROSE IS NOT A REDIRECTION, and `>` in code always is ---------------------------
  //
  // Defect 8, and it is group B rather than group A because the guard's own header already promises
  // it: "reads, builds, tests and installs are never touched", and a `gh pr create` is a read of the
  // diff plus a piece of prose. Two independent field incidents, both denied with
  // "shell redirection into it" against a command containing no redirection: miq, a filename inside
  // a fenced block in a PR body, worked around with --body-file; then the conductor opening this
  // branch's own pull request. A guard that gets routed around by switching tools has taught the
  // opposite of the rule.
  //
  // THE PAIR THAT DECIDES THE MECHANISM is B-pr-body-arrow and B-arrow-unquoted-is-a-real-redirect,
  // and they must be read together. The obvious reading of the first — "`->` is an arrow, so a `>`
  // preceded by `-` is not an operator" — is measurably false, and the second is the measurement:
  //
  //     $ echo hello->out.txt ; cat out.txt      ->  hello-      (out.txt was created)
  //     $ echo a-->b.txt      ; cat b.txt        ->  a--
  //     $ echo x=>c.txt       ; cat c.txt        ->  x=
  //     $ echo "a -> d.txt"   ; ls d.txt         ->  no such file
  //
  // `>` is a metacharacter and delimits the word before it wherever it appears in CODE, so
  // `echo hello->src/app.ts` genuinely writes product code and must stay denied. The fourth line is
  // the real discriminator and it is QUOTING. Any fix that keeps the first four cases green by
  // reading `-` and turns B-arrow-unquoted-is-a-real-redirect red has swapped a false deny for a
  // false allow.
  {
    id: 'B-pr-body-arrow',
    group: 'B',
    what: 'a `->` in a PR body, in a heredoc inside a quoted argument — the field case, twice',
    why: 'No redirection exists anywhere in this command. The arrow sits in a `<<\'EOF\'` body ' +
      'inside a `"…"` argument, so the shell never reads that `>` as code.',
    payload: bash('b-pr-body-arrow'),
    expect: { decision: 'allow', notMentions: ['server__miq-server__appsettings.json'] },
  },
  {
    id: 'B-pr-body-fat-arrow',
    group: 'B',
    what: 'the same with `=>`',
    payload: bash('b-pr-body-fat-arrow'),
    expect: { decision: 'allow' },
  },
  {
    id: 'B-pr-body-long-arrow',
    group: 'B',
    what: 'the same with `-->`',
    payload: bash('b-pr-body-long-arrow'),
    expect: { decision: 'allow' },
  },
  {
    id: 'B-pr-body-arrow-plain-quote',
    group: 'B',
    what: 'an arrow in a plainly double-quoted --body, with no heredoc',
    why: 'The quoting alone is the reason, and it must hold without the heredoc carrying it.',
    payload: bash('b-pr-body-arrow-plain-quote'),
    expect: { decision: 'allow' },
  },
  {
    id: 'B-arrow-unquoted-is-a-real-redirect',
    group: 'B',
    what: 'the SAME arrow unquoted — a genuine redirect into product code, and still denied',
    why: 'Measured in bash: `echo hello->out.txt` creates out.txt containing `hello-`. This is the ' +
      'case that fails if the fix reads the `-` instead of the quoting, and it is the whole reason ' +
      'the narrow reading is wrong.',
    payload: bash('b-arrow-unquoted-is-a-real-redirect'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'B-redirect-product',
    group: 'B',
    what: '`echo x > src/app.ts` — the plain redirect, still denied',
    payload: bash('b-redirect-product'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'B-append-product',
    group: 'B',
    what: '`echo x >> src/app.ts` — append is a write',
    payload: bash('b-append-product'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'B-redirect-glued-product',
    group: 'B',
    what: '`echo x >src/app.ts` — no space between the operator and its target',
    payload: bash('b-redirect-glued-product'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'B-redirect-fd-product',
    group: 'B',
    what: '`npm run build 2> src/app.ts` — a file descriptor in front of the operator',
    why: 'The fd is PART of the redirection operator, not a reason to look away from it: this ' +
      'writes product code exactly as a bare `>` does.',
    payload: bash('b-redirect-fd-product'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'B-redirect-quoted-target',
    group: 'B',
    what: '`echo x > "src/app.ts"` — the OPERATOR is code even though the target is quoted',
    why: 'Only the operator\'s position decides whether there is a redirection. A quoted target is ' +
      'still a target, and a fix that blanks quoted text wholesale would lose this one.',
    payload: bash('b-redirect-quoted-target'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'B-redirect-segment-start',
    group: 'B',
    what: 'a redirect at the very start of a segment, with no command before it',
    payload: bash('b-redirect-segment-start'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'B-fd-dup-stderr',
    group: 'B',
    what: '`npm test 2>&1` — a descriptor duplication, not a file',
    payload: bash('b-fd-dup-stderr'),
    expect: { decision: 'allow' },
  },
  {
    id: 'B-fd-devnull',
    group: 'B',
    what: '`grep -rn TODO src 2>/dev/null` — a read, and /dev/null is outside every lite root',
    payload: bash('b-fd-devnull'),
    expect: { decision: 'allow' },
  },

  // ---- fail-open: silence, always, and never a wedged session ---------------------------------
  {
    id: 'B-failopen-malformed-stdin',
    group: 'B',
    what: 'stdin that is not JSON',
    rawStdin: 'this is not json {',
    expect: { decision: 'allow' },
  },
  {
    id: 'B-failopen-empty-stdin',
    group: 'B',
    what: 'empty stdin',
    rawStdin: '',
    expect: { decision: 'allow' },
  },
  {
    id: 'B-failopen-json-not-object',
    group: 'B',
    what: 'valid JSON that is not an object',
    rawStdin: '"PreToolUse"',
    expect: { decision: 'allow' },
  },
  {
    id: 'B-failopen-json-array',
    group: 'B',
    what: 'valid JSON that is an array',
    rawStdin: '[{"tool_name":"Write","tool_input":{"file_path":"src/app.ts"}}]',
    expect: { decision: 'allow' },
  },
  {
    id: 'B-failopen-no-tool-input',
    group: 'B',
    what: 'a Write payload with no tool_input',
    payload: { session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: REPO_ROOT, tool_name: 'Write' },
    expect: { decision: 'allow' },
  },
  {
    id: 'B-failopen-tool-input-not-object',
    group: 'B',
    what: 'tool_input that is a string',
    payload: { session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: REPO_ROOT, tool_name: 'Write', tool_input: 'src/app.ts' },
    expect: { decision: 'allow' },
  },
  {
    id: 'B-failopen-no-target-path',
    group: 'B',
    what: 'a Write payload carrying no target path',
    payload: { session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: REPO_ROOT, tool_name: 'Write', tool_input: { content: 'x' } },
    expect: { decision: 'allow' },
  },
  {
    id: 'B-failopen-unrecognised-tool',
    group: 'B',
    what: 'a tool the guard does not judge',
    payload: { session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: REPO_ROOT, tool_name: 'Read', tool_input: { file_path: 'src/app.ts' } },
    expect: { decision: 'allow' },
  },
  {
    id: 'B-failopen-no-tool-name',
    group: 'B',
    what: 'a payload with no tool_name',
    payload: { session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: REPO_ROOT, tool_input: { file_path: 'src/app.ts' } },
    expect: { decision: 'allow' },
  },
  {
    id: 'B-failopen-bash-no-command',
    group: 'B',
    what: 'a Bash payload with no command',
    payload: { session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: REPO_ROOT, tool_name: 'Bash', tool_input: { description: 'run it' } },
    expect: { decision: 'allow' },
  },
  {
    id: 'B-failopen-bash-command-not-string',
    group: 'B',
    what: 'a Bash command that is an array',
    payload: { session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: REPO_ROOT, tool_name: 'Bash', tool_input: { command: ['cp', 'a', 'src/app.ts'] } },
    expect: { decision: 'allow' },
  },
  {
    id: 'B-failopen-hostile-shapes',
    group: 'B',
    what: 'objects and numbers in the payload fields around a benign write',
    why: 'The nearest a black-box corpus can get to the header\'s "any unexpected throw fails open". ' +
      'See the note in guard.test.mjs: a throw cannot be forced from outside the process. `cwd: []` ' +
      'also exercises the fall back to the process cwd.',
    payload: { session_id: 42, hook_event_name: {}, cwd: [], transcript_path: 7, tool_name: 'Write', tool_input: { file_path: 'docs/x.md', content: 12 } },
    expect: { decision: 'allow' },
  },
  {
    id: 'B-failopen-not-a-lite-repo',
    group: 'B',
    what: 'a cwd with no .conducted/CONDUCTOR.md at or above it',
    why: 'This law is not in force outside a lite repo, and the guard ships in a shared harness.',
    outsideRepo: true,
    payload: { session_id: 'corpus', hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: 'src/app.ts' } },
    expect: { decision: 'allow' },
  },
  {
    id: 'B-failopen-not-a-lite-repo-bash',
    group: 'B',
    what: 'the same, on the Bash path',
    outsideRepo: true,
    payload: { session_id: 'corpus', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo x > app.ts' } },
    expect: { decision: 'allow' },
  },

  // ===========================================================================================
  // GROUP B (continued) — THE FRESH EVALUATOR'S SEVEN, 2026-08-13.
  //
  // A black-box evaluator that never saw the build drove ~290 payloads at the guard, working only
  // from its stated contract, and got product code past it in nine shapes. Seven were scoped for
  // repair (N1–N4, G1–G3); G4, G5 and G6 are deliberately deferred for an owner scope call and are
  // NOT represented here as passing cases.
  //
  // These are group B, not group A, for the same reason the tree cases are: every one of them is a
  // promise the guard's header already made and did not keep. Each was reproduced against the real
  // hook out-of-process before it was fixed, and the before-reading is quoted in each `why`.
  // ===========================================================================================

  // ---- N1: a path has more than one spelling, and they are the same file ----------------------
  //
  // The Edit/Write path is what the header calls "the real guarantee", so this was the worst of the
  // seven. Every spelling below was proved WRITABLE first — node writeFileSync through each one
  // created a real file — and each was then measured against the guard: `\\?\C:\…\src\app.ts` and
  // `//localhost/c$/…/src/app.ts` ALLOWED while `src/app.ts`, `C:/…/src/app.ts`, `C:\…\src\app.ts`
  // and `/c/…/src/app.ts` all denied. The mechanism is not a missing branch: `\\?\` carries a `?`
  // and `c$` carries a `$`, and classify()'s glob/variable test reads either as unknowable.
  //
  // THE PAIR THAT BOUNDS THE FIX is C-n1-unc-remote-host and C-n1-unc-non-admin-share. Folding a
  // spelling is only legitimate where the mapping is certain. `\\build07\c$\…` is another machine's
  // C: drive and `\\localhost\projects\…` is a share that may point anywhere; both stay unmapped and
  // therefore allowed, which is this file's "unknown is always an allow" and not an oversight.
  {
    id: 'C-n1-extended-length',
    group: 'B',
    what: 'Write of `\\\\?\\C:\\…\\src\\app.ts` — the extended-length spelling of product code',
    why: 'ALLOWED before the fix, while every other spelling of the same file denied. Proved '
      + 'writable: writeFileSync through this spelling creates the file.',
    payload: write('\\\\?\\' + join(REPO_ROOT, 'src', 'app.ts')),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'C-n1-device-namespace',
    group: 'B',
    what: 'Write of `\\\\.\\C:\\…\\src\\app.ts` — the device-namespace spelling',
    why: 'The sibling of the above and equally writable. Folded by the same rule.',
    payload: write('\\\\.\\' + join(REPO_ROOT, 'src', 'app.ts')),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'C-n1-extended-length-unc',
    group: 'B',
    what: 'Write of `\\\\?\\UNC\\localhost\\c$\\…\\src\\app.ts` — both spellings at once',
    why: 'The extended-length prefix wearing a UNC. Proved writable.',
    payload: write('\\\\?\\UNC\\localhost\\c$' + join(REPO_ROOT, 'src', 'app.ts').slice(2)),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'C-n1-admin-share',
    group: 'B',
    what: 'Write of `//localhost/c$/…/src/app.ts` — the administrative share',
    why: 'The evaluator\'s second allowed spelling, and proved writable. An admin share on THIS '
      + 'machine is the local drive, spelled differently.',
    payload: write('//localhost/c$' + posix(join(REPO_ROOT, 'src', 'app.ts')).slice(2)),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'C-n1-admin-share-backslash',
    group: 'B',
    what: 'the same as `\\\\localhost\\c$\\…` — backslashes, as a person actually types it',
    payload: write('\\\\localhost\\c$' + join(REPO_ROOT, 'src', 'app.ts').slice(2)),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'C-n1-admin-share-loopback-ip',
    group: 'B',
    what: 'the same via the loopback address, `//127.0.0.1/c$/…`',
    why: 'A local host is a local host however it is named. Proved writable.',
    payload: write('//127.0.0.1/c$' + posix(join(REPO_ROOT, 'src', 'app.ts')).slice(2)),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'C-n1-admin-share-owned-still-allows',
    group: 'B',
    what: 'an owned path through the same spelling — folding must not deny the roadmap',
    why: 'THE CONTROL. Normalising a spelling has to reach the allow-set as readily as the '
      + 'deny-set, or the fix would have traded a hole for a false positive.',
    payload: write('\\\\?\\' + join(REPO_ROOT, '.conducted', 'roadmap.md')),
    expect: { decision: 'allow' },
  },
  {
    id: 'C-n1-unc-remote-host',
    group: 'B',
    what: 'a REMOTE host\'s admin share with the same tail — must stay allowed',
    why: 'ONE HALF OF THE PAIR THAT BOUNDS THE FIX. `\\\\build07\\c$\\…` is another machine\'s C: '
      + 'drive. Folding it to this machine\'s would judge a path nobody named, which is the '
      + 'invented-filename defect wearing a new hat. Unmapped, therefore unknown, therefore allowed.',
    payload: write('//build07/c$' + posix(join(REPO_ROOT, 'src', 'app.ts')).slice(2)),
    expect: { decision: 'allow' },
  },
  {
    id: 'C-n1-unc-non-admin-share',
    group: 'B',
    what: 'a non-admin share name on localhost — must stay allowed',
    why: 'THE OTHER HALF. `\\\\localhost\\projects\\…` is a share that may be rooted anywhere on '
      + 'the disk; the guard cannot resolve it without asking the OS, so it does not guess.',
    payload: write('//localhost/projects' + posix(join(REPO_ROOT, 'src', 'app.ts')).slice(2)),
    expect: { decision: 'allow' },
  },
  {
    id: 'C-n1-redirect-extended-length',
    group: 'B',
    what: 'the same spelling on the Bash path — `echo x > \\\\?\\C:\\…\\src\\app.ts`',
    why: 'norm() is shared, so the fold reaches every branch. Held here so a future change to the '
      + 'Edit/Write path alone cannot quietly reopen the Bash half.',
    payload: bash('c-redirect-extended-length'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },

  // ---- N2: the cwd gate asked the wrong question ----------------------------------------------
  //
  // Measured before the fix: with `cwd` set to `C:/code/repos`, or `C:/`, or absent, a `Write` of an
  // ABSOLUTE in-repo product path was ALLOWED, and so was `echo hi > <absolute in-repo path>`. The
  // header declared BOTH "which tree a path is measured against is decided by the path, not by the
  // cwd" AND "no .conducted/CONDUCTOR.md at or above the cwd -> instant silence", and no mechanism
  // can honour both — the cwd gate ran first and short-circuited, so the tree rule never ran.
  // THE RULING, dated in the guard's own header: the gate is about whether this law is in force for
  // the TARGET, so it asks the target first, and falls silent only when NEITHER the target NOR the
  // cwd sits under a lite repo. B-failopen-not-a-lite-repo and its Bash twin are the other side of
  // that ruling and still pass unchanged: their targets are RELATIVE, so they resolve under the
  // outside cwd and belong to no tree at all.
  {
    id: 'C-n2-outside-cwd-absolute-product',
    group: 'B',
    what: 'Write of an absolute in-repo product path, from a cwd outside every lite repo',
    why: 'ALLOWED before the fix. Any conductor whose shell had wandered one directory up was '
      + 'working unguarded and nothing announced it.',
    outsideRepo: true,
    payload: write(posix(join(NESTED_MAIN, 'src', 'app.ts'))),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'C-n2-no-cwd-at-all-absolute-product',
    group: 'B',
    what: 'the same with NO cwd in the payload',
    why: 'resolveCwd() falls back to the process cwd, which the runner puts outside too. The target '
      + 'still carries its own tree.',
    outsideRepo: true,
    payload: {
      session_id: 'corpus', hook_event_name: 'PreToolUse', tool_name: 'Write',
      tool_input: { file_path: posix(join(NESTED_MAIN, 'src', 'app.ts')), content: 'x' },
    },
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'C-n2-outside-cwd-absolute-redirect',
    group: 'B',
    what: 'the Bash half — `echo hi > <absolute in-repo path>` from an outside cwd',
    outsideRepo: true,
    payload: bash('c-redirect-abs-from-outside'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'C-n2-outside-cwd-absolute-owned',
    group: 'B',
    what: 'an OWNED absolute path from an outside cwd — allowed, and for the right reason',
    why: 'The target is asked, found to sit under a lite root, and matched against the allow-set. '
      + 'It must not be allowed merely because the cwd was elsewhere.',
    outsideRepo: true,
    payload: write(posix(join(NESTED_MAIN, '.conducted', 'roadmap.md'))),
    expect: { decision: 'allow' },
  },
  {
    id: 'C-n2-outside-cwd-relative-stays-allowed',
    group: 'B',
    what: 'a RELATIVE product path from an outside cwd — still silent, and that is unchanged',
    why: 'THE CASE THAT PROVES THE RULING WAS NARROW. A relative path resolves against the cwd, the '
      + 'cwd is under no lite root, so the path is in no tree and this law is not in force for it. '
      + 'The "not a lite repo" silence survives intact; it only moved one layer down.',
    outsideRepo: true,
    payload: write('src/app.ts'),
    expect: { decision: 'allow' },
  },

  // ---- N3: a non-string target is not a path --------------------------------------------------
  //
  // `"file_path": 42` denied with "This Write of 42 is denied"; `{"a":1}` denied naming
  // `[object Object]`. Two promises broken at once — "a payload shape we do not recognise ->
  // nothing to judge", which fails OPEN, and "A DENY NEVER INVENTS THE FILE IT IS DENYING". It is
  // the same family as the `.jpg` the glob scan manufactured: a thing that cannot be a path was
  // never a candidate. O-write-file-path-not-a-string above holds the object form and predates
  // this block; these are the counted cases.
  {
    id: 'C-n3-file-path-number',
    group: 'B',
    what: 'a Write whose file_path is the number 42',
    why: 'DENIED before the fix, naming `42`.',
    payload: { session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: REPO_ROOT, tool_name: 'Write', tool_input: { file_path: 42 } },
    expect: { decision: 'allow' },
  },
  {
    id: 'C-n3-file-path-object',
    group: 'B',
    what: 'a Write whose file_path is an object',
    why: 'DENIED before the fix, naming `[object Object]` — a filename no filesystem has.',
    payload: { session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: REPO_ROOT, tool_name: 'Write', tool_input: { file_path: { a: 1 } } },
    expect: { decision: 'allow' },
  },
  {
    id: 'C-n3-file-path-array',
    group: 'B',
    what: 'a Write whose file_path is an array of one path',
    why: 'DENIED before the fix, naming `src/app.ts` — a right answer reached by String()-coercing '
      + 'a shape the guard does not recognise, which is luck rather than a mechanism.',
    payload: { session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: REPO_ROOT, tool_name: 'Write', tool_input: { file_path: ['src/app.ts'] } },
    expect: { decision: 'allow' },
  },
  {
    id: 'C-n3-file-path-boolean',
    group: 'B',
    what: 'a Write whose file_path is `true`',
    payload: { session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: REPO_ROOT, tool_name: 'Write', tool_input: { file_path: true } },
    expect: { decision: 'allow' },
  },

  // ---- N4: the allow-set matched case-sensitively on a case-insensitive filesystem -------------
  //
  // `Write readme.md` and `Write .CONDUCTED/roadmap.md` both DENIED. Both are literally the
  // conductor's own files, so this is a residual false positive of exactly the class this feature
  // exists to kill. NOT A WIDENING OF THE ALLOW-SET: on win32 `readme.md` and `README.md` are one
  // file, so this is the same entry reached by the same file's other name. The fix is win32-only —
  // on a case-sensitive filesystem those really are two files and the old behaviour is correct
  // there, which is why these cases assert nothing about non-win32.
  {
    id: 'C-n4-lowercase-readme',
    group: 'B',
    what: 'Write of readme.md — the conductor\'s own README under its other name',
    why: 'DENIED before the fix. B-write-readme holds the canonical spelling; this is the same file.',
    payload: write('readme.md'),
    expect: { decision: process.platform === 'win32' ? 'allow' : 'deny', named: 'readme.md' },
  },
  {
    id: 'C-n4-uppercase-conducted',
    group: 'B',
    what: 'Write of .CONDUCTED/roadmap.md — the first entry in the allow-set, shouted',
    why: 'DENIED before the fix, by a message whose last line grants `.conducted/**`. Denying a '
      + 'write to a path the same sentence grants is how a guard loses its authority.',
    payload: write('.CONDUCTED/roadmap.md'),
    expect: { decision: process.platform === 'win32' ? 'allow' : 'deny', named: '.CONDUCTED/roadmap.md' },
  },
  {
    id: 'C-n4-mixed-case-claude-md',
    group: 'B',
    what: 'Write of claude.md — the harness\'s own briefing page, lowercased',
    payload: write('claude.md'),
    expect: { decision: process.platform === 'win32' ? 'allow' : 'deny', named: 'claude.md' },
  },
  {
    id: 'C-n4-capitalised-research',
    group: 'B',
    what: 'Write of Research/notes.md',
    payload: write('Research/2026-08-13-notes.md'),
    expect: { decision: process.platform === 'win32' ? 'allow' : 'deny', named: 'Research/2026-08-13-notes.md' },
  },
  {
    id: 'C-n4-case-fold-does-not-widen',
    group: 'B',
    what: 'Write of Legal/Readme.md — folding case must not buy a NEW entry',
    why: 'THE CONTROL. Only the top-level README.md is owned; a README in a subdirectory is not, '
      + 'in any casing. B-write-legal-readme holds the canonical spelling of the same denial.',
    payload: write('Legal/Readme.md'),
    expect: { decision: 'deny', named: 'Legal/Readme.md' },
  },
  {
    id: 'C-n4-case-fold-does-not-widen-src',
    group: 'B',
    what: 'Write of SRC/App.ts — product code is product code in any casing',
    payload: write('SRC/App.ts'),
    expect: { decision: 'deny', named: 'SRC/App.ts' },
  },

  // ---- G1: the redirection operators the scan did not know -------------------------------------
  //
  // A previous pass taught this branch that a file descriptor is PART of the operator. It stopped
  // there. Every operator below was ALLOWED against product code before this fix, and every one of
  // them was RUN IN BASH 5.2 FIRST rather than argued about:
  //
  //     $ echo hi &> a.txt ; ls a.txt   -> a.txt      $ echo hi >| c.txt  -> c.txt
  //     $ echo hi &>> b.txt ; ls b.txt  -> b.txt      $ echo hi >|d.txt   -> d.txt
  //     $ echo hi >& e.txt ; ls e.txt   -> e.txt      $ echo dup >&1      -> no file (a dup)
  //
  // `>|` needed one more thing than a wider operator class: the segment splitter was cutting the
  // command AT ITS `|`, into `echo hi >` and ` src/app.ts` — an operator with no target and a target
  // with no operator. Verified in bash that `>|` is one operator and not `>` followed by a pipe.
  {
    id: 'C-g1-amp-redirect',
    group: 'B',
    what: '`npm run build &> src/app.ts` — stdout and stderr onto product code',
    payload: bash('c-redirect-amp'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'C-g1-amp-append',
    group: 'B',
    what: '`npm run build &>> src/app.ts` — its append form',
    payload: bash('c-redirect-amp-append'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'C-g1-amp-glued',
    group: 'B',
    what: '`npm run build &>src/app.ts` — no space after the operator',
    payload: bash('c-redirect-amp-glued'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'C-g1-noclobber',
    group: 'B',
    what: '`echo hi >| src/app.ts` — the noclobber override',
    why: 'The one that also needed the segment splitter to stop reading its `|` as a pipe.',
    payload: bash('c-redirect-noclobber'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'C-g1-noclobber-glued',
    group: 'B',
    what: '`echo hi >|src/app.ts` — the same with no space',
    payload: bash('c-redirect-noclobber-glued'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'C-g1-gt-amp',
    group: 'B',
    what: '`npm run build >& src/app.ts` — the csh-style spelling of `&>`',
    why: 'bash: `>&word` is equivalent to `&>word` when word is a filename, and a descriptor '
      + 'duplication when it is a digit. `echo hi >& e.txt` created e.txt; `echo dup >&1` did not.',
    payload: bash('c-redirect-gt-amp'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'C-g1-fd1-append',
    group: 'B',
    what: '`npm run build 1>> src/app.ts` — an explicit descriptor on the append form',
    payload: bash('c-redirect-fd1-append'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'C-g1-fd1-local-properties',
    group: 'B',
    what: '`echo sdk.dir=/x 1> local.properties` — the guard\'s one genuine field catch, with an fd',
    why: 'THE EVALUATOR\'S HEADLINE, and it turned out to be ALREADY FIXED: the earlier `\\d*` pass '
      + 'covers it, measured DENY before this change as well as after. Pinned here anyway, because '
      + 'B-echo-local-properties only holds the bare-`>` spelling and this is the shape the report '
      + 'named. A negative result is a complete result.',
    payload: bash('c-redirect-fd1-local-properties'),
    expect: { decision: 'deny', named: 'local.properties', reason: /redirection/i },
  },
  {
    id: 'C-g1-amp-scratch-allows',
    group: 'B',
    what: '`npm test &> build.log` — the new operators inherit the scratch exemption',
    why: 'A wider operator class must not widen what counts as building. Scratch output is exempt '
      + 'on the Bash path by declaration.',
    payload: bash('c-redirect-amp-scratch'),
    expect: { decision: 'allow' },
  },
  {
    id: 'C-g1-amp-devnull-allows',
    group: 'B',
    what: '`npm test &>/dev/null` — a discard, not a write',
    payload: bash('c-redirect-amp-devnull'),
    expect: { decision: 'allow' },
  },

  // ---- G2: a quoted redirect target containing a space ------------------------------------------
  //
  // `echo hi > "src/my app.ts"` ALLOWED while `echo hi > "src/myapp.ts"` denied — one space between
  // a catch and a miss, and cp, tee, sed -i, the interpreter shape and Write all handled a spaced
  // path already. The old target class `[^\s;&|<>'"]+` stopped at the quote AND at the space.
  //
  // READ THESE WITH B-pr-body-arrow AND B-arrow-unquoted-is-a-real-redirect. A quoted redirect
  // TARGET is quoted-as-a-word; a `>` inside quoted PROSE is a different thing entirely, and only
  // the OPERATOR's offset is tested against codeMask(). Both of those cases are unchanged and still
  // pass, which is what says this fix touched the target and not the quoting rule.
  {
    id: 'C-g2-quoted-spaced-target',
    group: 'B',
    what: '`echo hi > "src/my app.ts"` — a double-quoted target with a space in it',
    payload: bash('c-redirect-quoted-spaced'),
    expect: { decision: 'deny', named: 'src/my app.ts', reason: /redirection/i },
  },
  {
    id: 'C-g2-single-quoted-spaced-target',
    group: 'B',
    what: 'the same single-quoted',
    payload: bash('c-redirect-single-quoted-spaced'),
    expect: { decision: 'deny', named: 'src/my app.ts', reason: /redirection/i },
  },
  {
    id: 'C-g2-quoted-spaced-owned-allows',
    group: 'B',
    what: '`echo hi > "docs/my notes.md"` — a spaced target that is the conductor\'s own',
    why: 'THE CONTROL. Reading a spaced target must reach the allow-set as readily as the deny-set.',
    payload: bash('c-redirect-quoted-spaced-owned'),
    expect: { decision: 'allow' },
  },

  // ---- G3: in-place edit flag spellings ---------------------------------------------------------
  //
  // The gate was `\s-i(\.\w+)?\b` against the raw segment, which required the `i` to sit
  // immediately after the dash. Caught: `sed -i`, `sed -i.bak`, `perl -i -pe`. ALLOWED against
  // product code, all measured: `perl -pi -e 's/a/b/' src/app.ts` — THE CANONICAL IDIOM —
  // `perl -pi.bak -e`, `perl -ni -e`, `ruby -pi -e`, `sed --in-place`, `gsed -i`. Each was run
  // against a real file first and each rewrote it in place; `perl -ni -e 'print'` was verified to
  // rewrite too. The flag is now read as a WORD, and the shape test lives in inPlaceTargets() with
  // the targets rather than in a second regex that could drift from it.
  {
    id: 'C-g3-perl-pi-e',
    group: 'B',
    what: "`perl -pi -e 's/a/b/' src/app.ts` — the canonical perl in-place idiom",
    payload: bash('c-perl-pi-e'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /in-place/i },
  },
  {
    id: 'C-g3-perl-pi-suffix',
    group: 'B',
    what: "`perl -pi.bak -e …` — the bundled flag carrying a backup suffix",
    payload: bash('c-perl-pi-suffix'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /in-place/i },
  },
  {
    id: 'C-g3-perl-ni-e',
    group: 'B',
    what: "`perl -ni -e 'print' src/app.ts`",
    payload: bash('c-perl-ni-e'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /in-place/i },
  },
  {
    id: 'C-g3-ruby-pi-e',
    group: 'B',
    what: '`ruby -pi -e … src/app.ts`',
    payload: bash('c-ruby-pi-e'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /in-place/i },
  },
  {
    id: 'C-g3-sed-long-in-place',
    group: 'B',
    what: "`sed --in-place 's/a/b/' src/app.ts` — the long spelling",
    payload: bash('c-sed-long-in-place'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /in-place/i },
  },
  {
    id: 'C-g3-gsed-i',
    group: 'B',
    what: "`gsed -i 's/a/b/' src/app.ts` — GNU sed under the name Homebrew installs it as",
    why: '`\\bsed\\b` finds no word boundary inside `gsed`. It is the same program.',
    payload: bash('c-gsed-i'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /in-place/i },
  },
  {
    id: 'C-g3-perl-pi-e-owned-allows',
    group: 'B',
    what: "`perl -pi -e 's/a/b/' .conducted/roadmap.md` — an in-place edit of the conductor's own",
    why: 'THE CONTROL. A wider shape test must still end at the allow-set, not at the shape. This '
      + 'is the same lesson as the interpreter branch: a shape decides WHETHER to look at a path, '
      + 'never stands in for looking at one.',
    payload: bash('c-perl-pi-e-owned'),
    expect: { decision: 'allow' },
  },
  {
    id: 'C-g3-perl-module-with-i-allows',
    group: 'B',
    what: "`perl -MList::Util -e 'print 1' src/app.ts` — a READ whose option contains a lowercase i",
    why: 'THE CASE THAT FORCED THE FLAG TO BE A WHOLE WORD. A "cluster containing an i" rule reads '
      + '`-MList::Util` as an in-place edit and denies a read — a false positive manufactured by '
      + 'the fix for a miss, which is moving the error rather than removing it.',
    payload: bash('c-perl-module-with-i'),
    expect: { decision: 'allow' },
  },

  // ===========================================================================================
  // GROUP B (continued) — THE SHELL-WRAPPER BYPASS, 2026-08-13.
  //
  // A ONE-WORD PREFIX DEFEATED EVERY SHAPE THE BASH SCAN KNOWS. Measured against the guard as it
  // stood, out of process, with no agent_id — each wrapper ALLOWED, each bare twin DENIED:
  //
  //     DENY   echo x > src/app.ts                  <- control
  //     ALLOW  bash -c "echo x > src/app.ts"        ALLOW  eval "echo x > src/app.ts"
  //     ALLOW  sh -c 'echo x > src/app.ts'          ALLOW  bash -c "cp /c/temp/a.ts src/app.ts"
  //     DENY   cp /c/temp/a.ts src/app.ts           <- control
  //
  // READ THE HISTORY BEFORE THE CASES. A fresh evaluator reported these same wrappers as DENYING and
  // called the guard "confirmed clean"; that was wrong and was believed for a while. Every case
  // below was reproduced against the real hook before it was written, and re-measured after.
  //
  // The cause was two documented narrowings working exactly as written: a `-c` argument is ONE
  // QUOTED WORD, so the word split hands back the whole script as a single datum containing no `cp`
  // verb, and codeMask() marks its interior as not-code, so the `>` inside it is not an operator.
  // Both readings are right about a quoted word and wrong about this one, because the shell is about
  // to execute it. The fix RE-ENTERS the script through the same scan rather than adding a second
  // copy of any rule, which is why the sed/tee/cp cases below need no new machinery to be caught
  // inside a wrapper.
  //
  // THE THREE GROUPS THAT BOUND IT, and none of these is decoration:
  //   · the OWNED half — a blanket deny of anything containing `bash -c` would pass a deny-only
  //     corpus. D-wrapper-owned-* and D-wrapper-nested-two-deep-owned are the half that fails if the
  //     fix ever stops asking the allow-set.
  //   · a shell handed a FILE — `bash script.sh` runs a file this guard cannot see, the same class
  //     as `node scripts/gen.js`, and stays an ALLOW by declaration.
  //   · PROSE THAT MENTIONS A WRAPPER — this file has two `gh pr create` denials in its history,
  //     both worked around by switching tools. D-wrapper-prose-in-pr-body is the one that would have
  //     been the third: MEASURED, with the mask check on the verb removed from a scratch copy of the
  //     guard, it DENIES `src/app.ts` from a PR body describing this very fix. The other two prose
  //     cases allow for a second reason as well (the wrapper sits inside one quoted word, so it is
  //     never a verb token) and are belt-and-braces rather than load-bearing — said plainly so a
  //     future reader does not over-read them.

  // ---- the wrapper shapes, onto product code ---------------------------------------------------
  {
    id: 'D-wrapper-bash-c-redirect',
    group: 'B',
    what: '`bash -c "echo x > src/app.ts"` — the headline bypass',
    why: 'ALLOWED before the fix, while its bare twin B-redirect-product denied. One word of prefix.',
    payload: bash('d-wrapper-bash-c-redirect'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'D-wrapper-sh-c-redirect',
    group: 'B',
    what: "`sh -c 'echo x > src/app.ts'` — single-quoted, and a different shell",
    payload: bash('d-wrapper-sh-c-redirect'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'D-wrapper-eval-redirect',
    group: 'B',
    what: '`eval "echo x > src/app.ts"` — eval executes its arguments joined',
    payload: bash('d-wrapper-eval-redirect'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'D-wrapper-bash-c-cp',
    group: 'B',
    what: '`bash -c "cp /c/temp/a.ts src/app.ts"` — a different shape inside the same wrapper',
    why: 'THE CASE THAT SAYS THE FIX IS RECURSION AND NOT A REDIRECT PATCH. Nothing was added for '
      + 'cp inside a wrapper; the nested string goes through the same scan, so cp arrives already '
      + 'covered. Its bare twin is B-cp-onto-product.',
    payload: bash('d-wrapper-bash-c-cp'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /copying or moving/i },
  },
  {
    id: 'D-wrapper-bash-lc',
    group: 'B',
    what: '`bash -lc "…"` — the `c` as the last letter of a cluster',
    why: 'The shell parses the cluster and `-c` still takes the next argument. Matched by ending '
      + 'the word at the `c`, which is the discipline IN_PLACE_FLAG documents in its other '
      + 'direction: a letter matched ANYWHERE in a cluster reads innocent options as the flag.',
    payload: bash('d-wrapper-bash-lc'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'D-wrapper-bash-ec',
    group: 'B',
    what: '`bash -ec "…"` — the same cluster shape, and the spelling scripts actually use',
    payload: bash('d-wrapper-bash-ec'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'D-wrapper-zsh-c',
    group: 'B',
    what: '`zsh -c "…"`',
    payload: bash('d-wrapper-zsh-c'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'D-wrapper-dash-c',
    group: 'B',
    what: '`dash -c "…"`',
    payload: bash('d-wrapper-dash-c'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'D-wrapper-ksh-c',
    group: 'B',
    what: '`ksh -c "…"`',
    payload: bash('d-wrapper-ksh-c'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'D-wrapper-bin-bash-c',
    group: 'B',
    what: '`/bin/bash -c "…"` — path-qualified, the way a script spells it',
    why: 'The same lesson as `gsed`: a verb is a verb under every name the shell will find it by.',
    payload: bash('d-wrapper-bin-bash-c'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'D-wrapper-bash-exe-c',
    group: 'B',
    what: '`bash.exe -c "…"` — the win32 spelling, and this hook runs on win32',
    payload: bash('d-wrapper-bash-exe-c'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'D-wrapper-sudo-bash-c',
    group: 'B',
    what: '`sudo bash -c "…"` — the shell is not the first word',
    why: 'The verb is looked for ANYWHERE in the segment, which reaches sudo, env, nohup, time, '
      + '`xargs -I{} bash -c` and `find -exec sh -c` without knowing anything about any of them.',
    payload: bash('d-wrapper-sudo-bash-c'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'D-wrapper-env-bash-c',
    group: 'B',
    what: '`env FOO=1 bash -c "…"` — the same, with an assignment in front',
    payload: bash('d-wrapper-env-bash-c'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'D-wrapper-sed-inplace',
    group: 'B',
    what: "`bash -c \"sed -i 's/a/b/' src/app.ts\"` — the in-place shape inside a wrapper",
    payload: bash('d-wrapper-sed-inplace'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /in-place/i },
  },
  {
    id: 'D-wrapper-tee',
    group: 'B',
    what: '`bash -c "npm run build | tee src/app.ts"` — tee inside a wrapper, past a pipe',
    why: 'The nested string is segmented like any other command, so the pipe splits inside the '
      + 'wrapper exactly as it does outside one.',
    payload: bash('d-wrapper-tee'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /tee/i },
  },
  {
    id: 'D-wrapper-nested-two-deep',
    group: 'B',
    what: "`bash -c \"bash -c 'echo x > src/app.ts'\"` — a wrapper inside a wrapper",
    why: 'Two layers are scanned in full, so the real target is still NAMED rather than lost to the '
      + 'depth cap. A cap that fired at one layer would answer this with "could not be determined", '
      + 'which is a worse answer than the true one.',
    payload: bash('d-wrapper-nested-two-deep'),
    expect: { decision: 'deny', named: 'src/app.ts', reason: /redirection/i },
  },
  {
    id: 'D-wrapper-nested-at-the-limit',
    group: 'B',
    what: 'three wrappers deep — the depth cap, denying and NAMING NOTHING',
    why: 'THE CAP IS AT TWO. Nesting is unbounded and a crafted string must not become this hook\'s '
      + 'runtime, so the third layer is refused rather than unwrapped. It is treated as an '
      + 'unresolved write-shaped command and it names nothing, which is the same honest exit '
      + 'B-interpreter-unresolvable holds for the interpreter branch — a failure to know is never '
      + 'converted into a confident claim. The innermost script here is a placeholder word on '
      + 'purpose: the cap must fire on the SHAPE, before anything is read out of it.',
    payload: bash('d-wrapper-nested-at-the-limit'),
    expect: { decision: 'deny', named: null, reason: /nests shell interpreters/i },
  },

  // ---- the half that proves this is not a blanket deny of wrappers ------------------------------
  {
    id: 'D-wrapper-owned-redirect',
    group: 'B',
    what: '`bash -c "echo x > .conducted/roadmap.md"` — the conductor\'s own file, through a wrapper',
    why: 'THE HALF THAT MATTERS. A fix that denied wrappers outright would pass every deny case '
      + 'above and be exactly the failure this whole feature exists to kill: a deny of a path the '
      + 'same message ends by granting.',
    payload: bash('d-wrapper-owned-redirect'),
    expect: { decision: 'allow' },
  },
  {
    id: 'D-wrapper-owned-research-json',
    group: 'B',
    what: 'the same onto `research/…json` — allowed by the ALLOW-SET, not by the scratch exemption',
    why: 'THE CONTROL FOR THE CONTROL. `.conducted/roadmap.md` is `.md`, which is scratch-exempt on '
      + 'the Bash path, so on its own it cannot tell "the allow-set was reached" from "the '
      + 'extension was exempt". research/** is owned and .json is not scratch, so this one can.',
    payload: bash('d-wrapper-owned-research-json'),
    expect: { decision: 'allow' },
  },
  {
    id: 'D-wrapper-sh-c-owned',
    group: 'B',
    what: "`sh -c 'echo x > README.md'` — owned, through the other shell",
    payload: bash('d-wrapper-sh-c-owned'),
    expect: { decision: 'allow' },
  },
  {
    id: 'D-wrapper-eval-owned',
    group: 'B',
    what: '`eval "echo x > research/…json"` — owned, through eval',
    payload: bash('d-wrapper-eval-owned'),
    expect: { decision: 'allow' },
  },
  {
    id: 'D-wrapper-owned-cp',
    group: 'B',
    what: '`bash -c "cp /c/temp/a.json research/…json"` — the cp shape reaching the allow-set',
    payload: bash('d-wrapper-owned-cp'),
    expect: { decision: 'allow' },
  },
  {
    id: 'D-wrapper-nested-two-deep-owned',
    group: 'B',
    what: 'a wrapper inside a wrapper, onto an owned path',
    why: 'The recursion must reach the allow-set as readily as the deny-set at every depth, or the '
      + 'cap would be a slow blanket deny. This is the case that catches an over-correction.',
    payload: bash('d-wrapper-nested-two-deep-owned'),
    expect: { decision: 'allow' },
  },
  {
    id: 'D-wrapper-read-grep',
    group: 'B',
    what: '`bash -c "grep -n foo src/app.ts"` — a READ inside a wrapper',
    why: 'A wrapper is not a write. Reads are never denied, wrapped or not.',
    payload: bash('d-wrapper-read-grep'),
    expect: { decision: 'allow' },
  },
  {
    id: 'D-wrapper-read-npm-test',
    group: 'B',
    what: '`bash -c "npm test"` — the ordinary reason anyone types a wrapper at all',
    payload: bash('d-wrapper-read-npm-test'),
    expect: { decision: 'allow' },
  },
  {
    id: 'D-wrapper-scratch-redirect',
    group: 'B',
    what: '`bash -c "npm test > build.log"` — the scratch exemption is inherited, not re-stated',
    payload: bash('d-wrapper-scratch-redirect'),
    expect: { decision: 'allow' },
  },
  {
    id: 'D-wrapper-outside-the-repo',
    group: 'B',
    what: '`bash -c "echo x > /c/temp/out.ts"` — outside every lite root',
    why: 'The nested scan resolves paths against the same trees the outer one does, so "anything '
      + 'outside the repo is exempt" survives the wrapper.',
    payload: bash('d-wrapper-outside-the-repo'),
    expect: { decision: 'allow' },
  },

  // ---- a shell handed a FILE runs a file this guard cannot see ----------------------------------
  {
    id: 'D-wrapper-script-file',
    group: 'B',
    what: '`bash script.sh` — a shell running a FILE, and that is an allow by declaration',
    why: 'The same class as `node scripts/gen.js`, which the guard\'s header already accepts: the '
      + 'contents are not on the command line and this hook cannot see them. The option walk stops '
      + 'at the first non-option word and re-enters nothing.',
    payload: bash('d-wrapper-script-file'),
    expect: { decision: 'allow' },
  },
  {
    id: 'D-wrapper-option-then-script-file',
    group: 'B',
    what: '`bash -x scripts/build.sh` — an option that is not `-c`, then a file',
    payload: bash('d-wrapper-option-then-script-file'),
    expect: { decision: 'allow' },
  },
  {
    id: 'D-wrapper-rcfile-then-script-file',
    group: 'B',
    what: '`bash --rcfile scripts/dev.bashrc scripts/build.sh` — an option that TAKES A VALUE',
    why: 'THE CASE THAT KEEPS THE FLAG TEST HONEST. A looser reading — any option containing a `c` '
      + '— takes `--rcfile` for the inline-script flag and re-enters its VALUE as a command. Same '
      + 'family as `perl -MList::Util` in C-g3-perl-module-with-i: a false positive manufactured by '
      + 'the fix for a miss is moving the error, not removing it.',
    payload: bash('d-wrapper-rcfile-then-script-file'),
    expect: { decision: 'allow' },
  },

  // ---- prose that MENTIONS a wrapper is not a wrapper -------------------------------------------
  {
    id: 'D-wrapper-prose-in-pr-body',
    group: 'B',
    what: 'a `bash -c "echo x > src/app.ts"` inside a `gh pr create` body — the third field case, '
      + 'caught before it happened',
    why: 'LOAD-BEARING, AND MEASURED. A heredoc body is split into segments on its newlines, so that '
      + 'line really does present `bash`, `-c` and a script as three separate words. Only the '
      + 'codeMask() test on the VERB\'s offset stops it: with that one line removed from a scratch '
      + 'copy of the guard, this fixture DENIES src/app.ts. That is the same denial this file '
      + 'records twice from the field, both worked around with --body-file — and the PR body for '
      + 'this very change quotes the bypass table, so it would have denied itself.',
    payload: bash('d-wrapper-prose-in-pr-body'),
    expect: { decision: 'allow', notMentions: ['src/app.ts'] },
  },
  {
    id: 'D-wrapper-prose-in-commit-message',
    group: 'B',
    what: 'a commit message quoting the bypass — git always works',
    why: 'BELT-AND-BRACES, said plainly rather than over-read: this one also allows because the '
      + 'whole quoted message is a SINGLE WORD to the splitter, so no `bash` verb token exists. '
      + 'Removing the mask check does not turn it red. It is here because a commit message '
      + 'describing this fix is what a conductor will type next.',
    payload: bash('d-wrapper-prose-in-commit-message'),
    expect: { decision: 'allow' },
  },
  {
    id: 'D-wrapper-prose-redirected-into-owned',
    group: 'B',
    what: 'prose quoting a wrapper, redirected into the conductor\'s own roadmap',
    why: 'Both halves at once: the mention is data, and the real write target is owned. Also '
      + 'belt-and-braces — the quoted prose is one word.',
    payload: bash('d-wrapper-prose-redirected-into-owned'),
    expect: { decision: 'allow' },
  },

  // ===========================================================================================
  // E — THE SEGMENT SPLITTER READS QUOTING NOW, plus five smaller shapes found beside it.
  //
  // A second fresh evaluator got product code past the guard in twenty-one shapes and ONE cause was
  // under most of them: segments() split the command on `|`, `;`, `&&`, `||` and newline with a bare
  // regex, so a separator INSIDE QUOTES broke a command into fragments and the cp/mv, in-place-edit
  // and shell-wrapper branches — which read WORDS out of a segment — never saw a whole invocation.
  // The redirect, tee and interpreter branches were immune because they already asked codeMask().
  // Every command below was run in bash 5.2 in a scratch tree first and each one really wrote the
  // file; the guard allowed each one. They are group B because that is what they must stay: a
  // failure here is a regression, and each denying shape is paired with the ALLOW that proves the
  // fix did not become a blanket deny.
  // ===========================================================================================

  // ---- the canonical idioms a quoted separator used to hide -------------------------------------
  {
    id: 'E-split-sed-pipe-delim',
    group: 'B',
    what: "`sed -i 's|SRC|DST|' src/app.ts` — THE CANONICAL SED IDIOM, one character from a control",
    why: 'The whole root cause in one line. `sed -i \'s/a/b/\' src/app.ts` denied and this allowed, '
      + 'because the `|` inside the script split the segment into `sed -i \'s` and `SRC` and '
      + '`SEDPIPE` and `\' src/app.ts`, and no fragment holds both the verb and the operand. A `|` '
      + 'inside quotes is a character, not a pipe.',
    payload: bash('e-split-sed-pipe-delim'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'E-split-sed-pipe-delim-owned',
    group: 'B',
    what: 'the same idiom rewriting a file under research/ — THE ALLOW HALF',
    why: 'Proves the splitter fix restored a whole command rather than manufacturing a deny out of '
      + 'one: the segment is now intact, the target resolves, and research/** is the conductor\'s '
      + 'own. A `.json` on purpose — a `.md` would allow through SCRATCH_EXT and prove nothing.',
    payload: bash('e-split-sed-pipe-delim-owned'),
    expect: { decision: 'allow' },
  },
  {
    id: 'E-split-sed-semicolon-delim',
    group: 'B',
    what: "`sed -i 's;a;b;' src/app.ts` — a `;` as the sed delimiter",
    payload: bash('e-split-sed-semicolon-delim'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'E-split-sed-amp-delim',
    group: 'B',
    what: "`sed -i 's&&a&&b&&' src/app.ts` — `&&` inside the script",
    why: 'A bare `&` was never a separator here and still is not, which is why `s&a&b&` always '
      + 'denied. `&&` was one, so doubling the delimiter walked straight through. Both are quoted '
      + 'and neither is a separator now.',
    payload: bash('e-split-sed-amp-delim'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'E-split-sed-newline-script',
    group: 'B',
    what: 'a sed script with LITERAL NEWLINES inside its quotes',
    why: 'The newline is the separator this file splits on for a multi-line command, and quoting it '
      + 'hid the operand on another line entirely. Same rule, same mask, no special case.',
    payload: bash('e-split-sed-newline-script'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'E-split-perl-pi-pipe',
    group: 'B',
    what: "`perl -pi -e 's|a|b|' src/app.ts` — the canonical perl idiom with a `|` delimiter",
    why: 'C-perl-pi-e already holds the flag-reading half of this shape. This is the other half: the '
      + 'flag was read correctly and the segment it was read out of had already been cut in two.',
    payload: bash('e-split-perl-pi-pipe'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'E-split-cp-quoted-semicolon',
    group: 'B',
    what: 'a `;` inside a QUOTED SOURCE PATH of a cp onto product code',
    why: 'The destination is the last argument — a position — and the quoted source dragged the `;` '
      + 'through the splitter, leaving `cp "/c/temp/a` in one segment and the destination in another.',
    payload: bash('e-split-cp-quoted-semicolon'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'E-split-wrapper-quoted-pipe',
    group: 'B',
    what: '`bash -c "echo \'a|b\' > src/app.ts"` — a quoted `|` inside a wrapper\'s script',
    why: 'The wrapper branch reads words too, so it fell to the same cause: `bash -c "echo \'a` was '
      + 'the whole of the segment the verb sat in. `bash -c "echo x > src/app.ts"` was the control '
      + 'and it denied.',
    payload: bash('e-split-wrapper-quoted-pipe'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },

  // ---- a `#` at a code offset ends the segment --------------------------------------------------
  {
    id: 'E-split-comment-after-cp',
    group: 'B',
    what: '`cp /c/temp/a.ts src/app.ts # x|y` — a `|` inside a trailing COMMENT',
    why: 'The shell never runs a comment, so a separator in one is not a separator. Reading it as '
      + 'one cut the cp in half and hid the destination.',
    payload: bash('e-split-comment-after-cp'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'E-comment-is-not-a-command',
    group: 'B',
    what: '`echo hi # then write > src/app.ts` — a redirect INSIDE a comment — THE ALLOW HALF',
    why: 'The other direction of the same rule, and it was a live false positive before the fix: '
      + 'the `>` sits at a code offset by codeMask\'s reckoning, so the redirect branch read a '
      + 'comment as a write and denied a command that writes nothing at all. Same family as the two '
      + '`gh pr create` denials — prose read as code.',
    payload: bash('e-comment-is-not-a-command'),
    expect: { decision: 'allow', notMentions: ['src/app.ts'] },
  },
  {
    id: 'E-hash-in-quotes-is-not-a-comment',
    group: 'B',
    what: '`echo "# heading" > src/app.ts` — a `#` inside quotes does not start a comment',
    why: 'THE CASE THAT KEEPS THE COMMENT RULE HONEST. A looser reading — any `#` ends the segment '
      + '— throws away the real redirect that follows a quoted hash, which is a miss manufactured '
      + 'by the fix for a miss. The mask says this `#` is data.',
    payload: bash('e-hash-in-quotes-is-not-a-comment'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'E-hash-midword-is-not-a-comment',
    group: 'B',
    what: 'a URL fragment `…/p#frag` before a real redirect',
    why: 'The second half of the same guard: bash starts a comment only where `#` STARTS A WORD, so '
      + '`http://example.com/p#frag` is one word and the `>` after it is a real write. Measured '
      + 'against bash rather than assumed.',
    payload: bash('e-hash-midword-is-not-a-comment'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },

  // ---- escaped inner quotes, and the depth cap they walked past ---------------------------------
  {
    id: 'E-wrapper-three-deep-escaped-quotes',
    group: 'B',
    what: 'three shells deep with ESCAPED inner quotes — the cap must fire and name nothing',
    why: 'D-wrapper-nested-at-the-limit holds this shape with plain nesting. Written the way a '
      + 'person actually types a third level — `\\"` inside `"…"` — words() closed the quote on the '
      + 'escaped `"` and shredded the script into `bash -c \\bash`, a segment with no write in it, '
      + 'so the cap was never reached and the file was written (verified in bash 5.2). words() now '
      + 'reads a double-quoted backslash the way codeMask() always has.',
    payload: bash('e-wrapper-three-deep-escaped-quotes'),
    expect: { decision: 'deny', named: null, reason: /nests shell interpreters/ },
  },
  {
    id: 'E-wrapper-two-deep-escaped-quotes-owned',
    group: 'B',
    what: 'TWO deep with escaped inner quotes, writing the conductor\'s own roadmap — THE ALLOW HALF',
    why: 'Proves the escape fix did not turn every escaped quote into a depth-cap deny: two wrappers '
      + 'are scanned in full, the innermost target resolves, and it is owned.',
    payload: bash('e-wrapper-two-deep-escaped-quotes-owned'),
    expect: { decision: 'allow' },
  },

  // ---- a command substitution is CODE, and its `)` is not part of the target ---------------------
  {
    id: 'E-cmdsub-redirect',
    group: 'B',
    what: '`echo $(echo x > src/app.ts)` — the header promised this was caught, and it was not',
    why: 'The header\'s reasoning was right and its conclusion was false: the `>` really does sit at '
      + 'a code offset. The target class swallowed the closing `)`, so the target read as '
      + '`src/app.ts)`, which fails the candidacy test — the write vanished one step after the '
      + 'sentence stops. `)` cannot appear in an unquoted filename, so nothing that was a target '
      + 'before stops being one.',
    payload: bash('e-cmdsub-redirect'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'E-cmdsub-redirect-quoted',
    group: 'B',
    what: 'the same substitution inside `"…"`',
    why: 'codeMask() re-enters a `$( )` from inside a double-quoted word, which is the rule that '
      + 'keeps `"$(git show HEAD:x > src/app.ts)"` caught. Only the target class was ever wrong.',
    payload: bash('e-cmdsub-redirect-quoted'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'E-cmdsub-assign',
    group: 'B',
    what: '`x=$(echo x > src/app.ts)` — a substitution on the right of an assignment',
    payload: bash('e-cmdsub-assign'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'E-backtick-redirect',
    group: 'B',
    what: 'the backtick spelling of the same substitution',
    why: 'The closing backtick was swallowed into the target exactly as the `)` was.',
    payload: bash('e-backtick-redirect'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'E-cmdsub-read',
    group: 'B',
    what: '`echo $(cat src/app.ts)` — a READ inside a substitution — THE ALLOW HALF',
    why: 'Reads are never denied, inside a substitution as anywhere else. Proves the target-class '
      + 'change did not make every `$( )` suspicious.',
    payload: bash('e-cmdsub-read'),
    expect: { decision: 'allow', notMentions: ['src/app.ts'] },
  },

  // ---- `-c` does not swallow the option after it -------------------------------------------------
  {
    id: 'E-wrapper-c-then-option',
    group: 'B',
    what: '`bash -c -x "…"` — `-c` as its own word followed by ANOTHER OPTION',
    why: 'One word\'s order between a catch and a miss: `bash -x -c "…"` denied and this allowed, '
      + 'because the branch read the very next word as the script and re-entered `-x`. MEASURED in '
      + 'bash 5.2 before it was believed — `bash -c -x "echo written > src/app.ts"` exits 0 and '
      + 'creates the file, so bash keeps reading options and takes the first NON-option word. This '
      + 'is NOT the `-cx` cluster, which stays a declared miss and has its own case below.',
    payload: bash('e-wrapper-c-then-option'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'E-wrapper-c-then-option-owned',
    group: 'B',
    what: 'the same shape writing the conductor\'s own roadmap — THE ALLOW HALF',
    payload: bash('e-wrapper-c-then-option-owned'),
    expect: { decision: 'allow' },
  },

  // ---- eval sees the escapes already consumed ---------------------------------------------------
  {
    id: 'E-eval-escaped-redirect',
    group: 'B',
    what: '`eval echo x \\> src/app.ts` — a BACKSLASH-ESCAPED redirect through eval',
    why: 'The outer shell eats the backslash, so eval executes a live `>`. Measured: '
      + '`eval echo written \\> src/app.ts` creates the file. The guard allowed it because words() '
      + 'leaves a backslash alone — deliberately, so an unquoted `C:\\temp\\x.ts` survives — and '
      + 'codeMask() then read `\\>` as literal. The eval branch, and only it, undoes an escape of a '
      + 'shell metacharacter, because that is the one place a string is about to be re-parsed. '
      + '`eval "echo x > src/app.ts"` was the control and it denied.',
    payload: bash('e-eval-escaped-redirect'),
    expect: { decision: 'deny', named: 'src/app.ts' },
  },
  {
    id: 'E-eval-windows-path-owned',
    group: 'B',
    what: 'eval of a cp from an unquoted `C:\\temp\\a.ts` into research/ — THE ALLOW HALF',
    why: 'THE CASE THAT KEEPS THE UNESCAPE HONEST. A wider class — any backslash — turns `\\t` into '
      + 'a tab and judges a path nobody named, which is the mangling the words() note refuses. Only '
      + 'the shell metacharacters are undone, so a Windows source path arrives intact and the '
      + 'destination classifies as the conductor\'s own.',
    payload: bash('e-eval-windows-path-owned'),
    expect: { decision: 'allow' },
  },

  // ---- every spelling of a path is the same path: two more spellings ------------------------------
  {
    id: 'E-write-ads-default-stream',
    group: 'B',
    what: '`src/app.ts::$DATA` on the Edit/Write path — the NTFS default data stream IS the file',
    why: 'The last surviving breach of "every spelling of a path is the same path" on the path this '
      + 'guard\'s header calls the real guarantee. Measured with fs.writeFileSync before it was '
      + 'believed: writing `src/a1.ts::$DATA` leaves `src/a1.ts` on disk at size 1. classify() read '
      + 'the `$` as a variable and allowed. Folded in norm(), win32-only for the same reason '
      + 'FOLD_CASE is: on a POSIX volume that is a different, legitimate filename.',
    payload: write('src/app.ts::$DATA'),
    expect: process.platform === 'win32'
      ? { decision: 'deny', named: 'src/app.ts' }
      : { decision: 'allow' },
  },
  {
    id: 'E-write-ads-default-stream-owned',
    group: 'B',
    what: 'the same spelling of the conductor\'s own roadmap — THE ALLOW HALF',
    why: 'Folding is not a widening and it is not a narrowing either: the same entry reached by the '
      + 'same file\'s other name. Allows on every platform — folded on win32 because it IS the '
      + 'roadmap, unresolvable elsewhere because of the `$`.',
    payload: write('.conducted/roadmap.md::$DATA'),
    expect: { decision: 'allow' },
  },
  {
    id: 'E-write-short-name-owned',
    group: 'B',
    what: '`CONDUC~1/roadmap.md` — an 8.3 SHORT NAME for the conductor\'s own folder',
    why: 'A FALSE POSITIVE, and the class this whole feature exists to kill: it DENIED, naming '
      + '`CONDUC~1/roadmap.md`, while the guard\'s header claimed short names "stay allowed". '
      + 'Nothing was allowing them — the short name simply matched no OWNED pattern, so the ordinary '
      + 'deny fired on the conductor\'s own roadmap. It is folded by realpathSync.native now. The '
      + 'expectation forks on SHORT_NAMES_EXIST because the fold is the filesystem\'s answer, not a '
      + 'rule\'s: where 8.3 names exist this IS `.conducted/roadmap.md` and is owned, and where they '
      + 'do not it is a directory that does not exist and is judged as written. No short-circuit '
      + 'papers over the second case — see E-write-tilde-is-an-ordinary-name for why not.',
    payload: write('CONDUC~1/roadmap.md'),
    expect: SHORT_NAMES_EXIST
      ? { decision: 'allow' }
      : { decision: 'deny', named: 'CONDUC~1/roadmap.md' },
  },
  {
    id: 'E-write-tilde-is-an-ordinary-name',
    group: 'B',
    what: '`src/app~1.ts` — a `~<digit>` that is just part of an ordinary filename',
    why: 'THE CASE THAT KEEPS THE 8.3 FOLD FROM BEING A WIDENING, and it caught a hole this change '
      + 'briefly opened: the first draft treated any path still carrying a `~<digit>` after the fold '
      + 'as an unmapped spelling and returned unknown, which allows. Measured, `src/app~1.ts` and '
      + '`packages/x~2.ts` went from denied to ALLOWED — plain product paths with no 8.3 anywhere in '
      + 'them. A fix for a false positive that manufactures a miss has moved the error, not removed '
      + 'it. What the filesystem can fold is folded; what it cannot is judged as written.',
    payload: write('src/app~1.ts'),
    expect: { decision: 'deny', named: 'src/app~1.ts' },
  },
  {
    id: 'E-write-short-name-product',
    group: 'B',
    what: '`CLAUDE~1/hooks/conductor-guard.mjs` — a short name for PRODUCT code',
    why: 'THE CASE THAT KEEPS THE FOLD FROM BEING A BLANKET ALLOW. Treating any `~<digit>` as an '
      + 'unknown would have cured the false positive above by opening a hole — `PACKAG~1/app.ts` is '
      + 'product code — so the short name is resolved rather than waved through, and the deny names '
      + 'the LONG path. The expectation forks on SHORT_NAMES_EXIST because 8.3 generation is a '
      + 'per-volume NTFS setting: where the name does not exist there is no file to deny.',
    payload: write('CLAUDE~1/hooks/conductor-guard.mjs'),
    expect: SHORT_NAMES_EXIST
      ? { decision: 'deny', named: '.claude/hooks/conductor-guard.mjs' }
      : { decision: 'allow' },
  },

  // ===========================================================================================
  // OBSERVED — found by this corpus, outside the fix this feature is scoped to. NOT COUNTED.
  //
  // Recorded rather than dropped, and not counted rather than counted, for one reason: the
  // acceptance line for the corpus is that every failure it reports is one of the six known
  // defects. A seventh, real but out of scope, would make the run unreadable as the pass/fail
  // signal for the fix. It fails today and it will still fail after the fix, because the fix is to
  // scanBash and this is on the Edit/Write path. Promote it to group A the day somebody scopes it.
  // ===========================================================================================
  {
    id: 'O-write-file-path-not-a-string',
    group: 'observed',
    what: 'a Write whose file_path is an object, not a string',
    note: 'DENIES TODAY, naming `[object Object]`. classify() coerces the object to a string and ' +
      'resolves it against the repo root, so a payload shape the guard does not recognise produces ' +
      'a confident deny naming a file nothing writes. The header says an unrecognised shape is ' +
      '"nothing to judge" and the tech design says a token that cannot be a path was never a ' +
      'candidate — by both, this should be silence. Same family as issue 2 and issue 4, different ' +
      'branch. Harmless in practice: the platform always sends a string.',
    payload: { session_id: 'corpus', hook_event_name: 'PreToolUse', cwd: REPO_ROOT, tool_name: 'Write', tool_input: { file_path: { a: 1 } } },
    expect: { decision: 'allow' },
  },

  // ===========================================================================================
  // UNVERIFIED — miq's commands. NOT COUNTED. Reported for information only.
  //
  // These are quoted in a field note, not lifted from a transcript, and they have been tidied for
  // the note: fed to this guard they ALLOW, while the note records each as a denial. At least one
  // is provably abridged — the deny names `server__miq-server__appsettings.json` while the quoted
  // body reads `server__miq-server__appsettings.json.txt:14`, and that token cannot produce that
  // deny. Two of the three carry a literal `...` elision in the middle of the command.
  //
  // THE RAW TRANSCRIPT LINES HAVE BEEN REQUESTED. Nothing here is tuned to make it fire, and
  // nothing here counts toward the summary or the exit code. When the bytes arrive, these move
  // into group A or are deleted.
  // ===========================================================================================
  {
    id: 'U-miq-grep-two-files',
    group: 'unverified',
    what: 'grep with two file arguments, reported as "copying or moving over it"',
    note: 'Does not reproduce: allows. No cp/mv/ln/install/rsync verb is present anywhere in the ' +
      'quoted text, so it cannot reach the branch the deny names.',
    payload: bash('u-miq-grep'),
    expect: { decision: 'deny', named: 'image/build/customize-chroot.sh' },
  },
  {
    id: 'U-miq-gh-pr-body',
    group: 'unverified',
    what: 'a filename inside a PR body, reported as "shell redirection into it"',
    note: 'Does not reproduce: allows. Provably abridged — see the header above. The note itself ' +
      'records that no redirection existed anywhere in the command.',
    payload: bash('u-miq-gh-pr-body'),
    expect: { decision: 'deny', named: 'server__miq-server__appsettings.json' },
  },
  {
    id: 'U-miq-python-var-owned',
    group: 'unverified',
    what: 'python -c editing an owned state.md via a variable, reported as unresolvable',
    note: 'Does not reproduce as quoted: allows. The note attributes it to variable binding; the ' +
      'measurement in state.md says otherwise, and A6 above holds the mechanism that does ' +
      'reproduce. Carries a literal `...` elision.',
    payload: bash('u-miq-python-var'),
    expect: { decision: 'allow' },
  },
];
