# Turn-tax baseline — what reached the owner per turn, before the rule existed

Measured 2026-08-13, grounding the CONDUCTOR.md section "What reaches Simon each turn". The owner
runs ~20 concurrent conducted sessions; the cost being measured is his reading and adjudication
load per turn, which had grown to the point of fatigue-driven bad calls (his words: "if you're
fatigued you end up agreeing, and opening a whole can of worms").

## Method

`2026-08-13-turn-tax-miner.mjs` parses a Claude Code JSONL transcript, main thread only, and scores
**turn-final assistant messages** — the last message before real user input, i.e. the ones the owner
actually reads — against conservative regex classes. Conservative means these numbers are floors.

## Baseline

| session | turns read | median length | soliciting a decision | confessing | ending in a bullet list at the owner |
|---|---|---|---|---|---|
| mukfork `307243ed` | 197 | 1,450 chars | 15% | 4% | 25% |
| miq `ef16dcb7` | 56 | 1,881 chars | 16% | 4% | 25% |
| conducted-lite `83358833` | 16 | 2,073 chars | **38%** | **19%** | 6% |

The conducted-lite session — the conductor role at its purest — was the worst on decisions and
confessions per turn. In the mukfork session the owner read roughly 60,000 words of turn-final
reporting; its "ten judgement calls" incident audited down to **three real decisions** when
challenged, the model itself concluding "thought isn't the same as a decision you could reverse."

## Why the model amplifies it

Opus 5's documented defaults (Anthropic, "Prompting Claude Opus 5", read 2026-08-13):

- verifies its own work unprompted; explicit verification instructions **cause over-verification**
- narrates readily; effort controls thinking, **not** visible verbosity — length must be prompted
- narrates corrections more than prior models; mitigation is to limit corrections to those that
  would "change the user's code, conclusions, or decisions"
- expands scope; ships a scope-constraint prompt

Community reporting (explainx.ai 2026-08-06, MindStudio 2026-08-01) matches: task inflation,
corrections wrapped in justification, "it takes real effort just to read through a response and
extract the useful part."

Doctrine lines that stacked on those defaults until the 2026-08-13 edit: "bring him options",
verification mandates read as narration mandates, the observation rule read as a confession mandate,
and no stopping rule at review time — an adversarial evaluator always returns findings, and without
"the acceptance criteria are the stopping rule" each finding became scope.

## Re-measuring

Run the miner over any session transcript and compare to the table:

    node research/2026-08-13-turn-tax-miner.mjs "<path-to-session>.jsonl" --samples

Success looks like: decision-solicitation near zero except genuine lane calls, confessions only
where they change the owner's decisions, closing bullet-lists-at-the-owner rare. The rule has
failed if the numbers hold steady a week after adoption — then the fix belongs in the harness
prompt, not the law, and this file is the evidence to reopen with.
