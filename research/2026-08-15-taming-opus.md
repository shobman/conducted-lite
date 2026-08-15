# Taming Opus — what widens scope, what damps it (2026-08-15)

The problem under study: Claude Opus 4.x/5 in agentic coding sessions natively widens scope —
"one more thing", unsolicited ideas, decisions handed back to the owner, long reads forced on him.
The owner's frame: finishing beats starting (kanban — the most important work is the almost-done
work). This note collects what is documented, what we measured, and what demonstrably damps it.

## 1. The behavior — as measured here, as reported elsewhere

**Measured in-house** (`research/2026-08-13-turn-tax-baseline.md`): across three sessions, 15–38%
of turn-final messages solicited a decision from the owner, 4–19% confessed mistakes, and up to a
quarter ended in a bullet list addressed at him; one "ten judgement calls" incident audited down to
three real decisions. The conducted-lite session — the conductor role at its purest — was worst.

**Documented by Anthropic** ([Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5), read 2026-08-15):

- "Claude Opus 5 can also expand the scope of a task, adding steps that weren't requested or
  applying its own judgment about what the task should be."
- "Claude Opus 5 verifies its own work without being told to" — explicit verification
  instructions now "cause over-verification … removing them reduces wasted tokens with no loss in quality."
- "Claude Opus 5 narrates readily during agentic work … its per-message output in agentic sessions
  is often longer than prior models'." Effort "controls how much the model thinks rather than how
  much it says" — visible verbosity must be prompted down, not dialed down.
- "The model also narrates corrections to its earlier statements more than prior models do."
- "Claude Opus 5 delegates to subagents more readily than prior models" — the opposite of Opus 4.8.

The [migration guide](https://platform.claude.com/docs/en/about-claude/models/migration-guide.md)
documents the decision-offloading half on Opus 4.8: "more deliberate — asks more often … on minor
decisions it would previously just make … it often closes a completed task with 'Want me to
also…?'"; an autonomy instruction cut ask-rate ~12 percentage points in Claude Code testing.

**Community** ([explainx.ai, 2026-08-06 r/ClaudeAI reaction](https://explainx.ai/blog/opus-5-over-engineering-reddit-reaction-august-2026)):
scope expansion via self-generated "expanded briefs", task inflation ("fix-my-sitemap request
turned into a full site rebuild — new color palette, new copy, replaced images"), "while I was in
there" edits, self-debate mid-session. Thread consensus: "scope discipline and version control
matter more than model selection."

## 2. Why it happens — what sources actually say

- Anthropic frames the model as "built for complex agentic coding … long-horizon agentic tasks"
  that "performs best when given the complete task specification up front and left to run" — the
  defaults (self-verification, narration, delegation, completion drive) are tuned for autonomy on
  hard work, and land as scope-widening on small work. ([Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5))
- Instructions stack rather than override: prompts written to push older models toward
  verification/narration now *compound* with the native behavior — the documented fix is deletion,
  not counter-instruction. (same source; also `research/2026-08-13-turn-tax-baseline.md` — our
  doctrine "stacked on those defaults until the 2026-08-13 edit".)
- HYPOTHESIS: long-horizon RL post-training rewards thoroughness-to-completion, so the model's
  prior on "done" exceeds the user's ask; no primary source states the training mechanism.

## 3. What works against it — mechanical above prompt-wording

**Mechanical / harness (ranked first — the machine enforces them):**
1. Deterministic delegation caps: `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`,
   `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, SDK `max_budget_usd` ([Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5); [Agent SDK subagents](https://code.claude.com/docs/en/agent-sdk/subagents)).
2. Effort sweep down: `low`/`medium` "produce strong quality at a fraction of the tokens" — the
   primary token/latency lever (same source); community corroborates "med-high outperformed xhigh".
3. Git as the safety net, frequent commits; permission gates pre-granted for trivial edits;
   `/clear` to stop drift; separate planning pass in a lighter model, Opus for narrow
   implementation ([explainx.ai](https://explainx.ai/blog/opus-5-over-engineering-reddit-reaction-august-2026)).
4. WIP limits applied to agent workflows: limit agent-side and human-review columns separately —
   the human-attention column is the bottleneck when code generation is frictionless
   ([MindStudio iterative kanban pattern](https://www.mindstudio.ai/blog/iterative-kanban-pattern-ai-agents-feedback-loop));
   classic WIP-limit rationale: finish before starting ([Atlassian](https://www.atlassian.com/agile/kanban/wip-limits)).
   No source yet documents a hard WIP limit *inside* an LLM harness — searched
   "WIP limit kanban finish-first LLM coding agent"; only board-level patterns returned.

**Prompt-wording (documented, tested by Anthropic — second rank):**
- Scope discipline: "Deliver what was asked, at the scope intended … check in only when different
  readings … would lead to materially different work … Finish the whole task, and stop short of
  actions that are clearly beyond what was asked" — reduced scope changes "to nearly zero".
- **Delete** verification and double-check instructions (a removal, not a rewrite).
- Corrections scoped: "Only correct an earlier statement when the error would change the user's
  code, conclusions, or decisions."
- Narration cadence: one sentence before first tool call; lead with the outcome.
- Autonomy on minor decisions ("pick a reasonable option and note it rather than asking") — the
  ~12pp ask-rate cut. All: [Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5) / [migration guide](https://platform.claude.com/docs/en/about-claude/models/migration-guide.md).

## 4. conducted-lite — already covered vs missing

**Already in the law** (`.conducted/CONDUCTOR.md`, "What reaches Simon each turn" + "The loop"):
decisions gated to the owner's lane with zero-per-turn as the expected number; corrections gated to
ones that change his decisions (matches Anthropic's snippet nearly verbatim); "a review closes; it
does not open" with acceptance criteria as the stopping rule; "bring him things to look at, not
essays and not menus"; briefs carry files in/out of bounds and what NOT to do; the write-guard hook
is mechanical, not prose. The law already prefers deletion over counter-instruction (2026-08-13 edit).

**Field sample — the behavior leaking into the rulebook** (`C:\code\repos\mukfork\.conducted\standards.md`):
1,394 lines, 42 numbered rules, median 21.5 lines per rule, largest 159 lines, grown over 14 days
(50 commits, 2026-08-01 → 2026-08-15). Provenance is disciplined — rules carry dates, owner quotes,
evidence — but the *form* is the documented deliverable-length behavior: rule 1.10 runs 159 lines
including an inline amendment log ("⚠ AMENDED 2026-08-12 — THE GREY SQUARE IS A WIREFRAME ARTEFACT
AND NEVER SHIPS"); rule 3.2 wraps one check in a war story ("Confirmed the hard way 2026-08-01…").
CONDUCTOR.md asks for "a link or a sentence of evidence" per rule; mukfork's rules average a page.

**Gaps — three candidate rules, one sentence each, for the owner to accept or bin:**
1. Nothing enters `development` while another feature sits nearer to done — the almost-finished
   item is dispatched first, every session, and the ledger enforces it by refusing a second
   in-flight row.
2. A ruling in standards.md is one breath long — the rule in bold, the evidence a link or a single
   sentence — and a ruling that needs more is a document the rule links to, not a longer rule.
3. Delegation limits live in the harness, not the prose: set the subagent spawn/concurrency env
   caps and a per-session budget on every conducted session, because a cap the machine enforces
   never has to be remembered.

Source count: 4 primary (Anthropic docs), 3 community, 3 in-house.
