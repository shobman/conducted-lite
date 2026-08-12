// Mine a Claude Code JSONL transcript for the patterns that hand the owner work each turn.
// Usage: node mine.mjs <transcript.jsonl> [--samples]
// Only main-thread records (isSidechain !== true). "Turn-final" = the assistant text message the
// owner actually reads: the last assistant message before a real (non-tool-result) user message.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const showSamples = process.argv.includes('--samples');
const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);

const PATTERNS = {
  owner_decisions: /worth your (coffee|time|attention|eye|call)|your call\b|your ruling|needs? (your|an owner'?s?) (ruling|judgement|judgment|decision|approval)|deferred for (you|the owner)|left for (you|your|review)|judgement calls?|judgment calls?|rulings? (from|for) (you|the owner)|owner (rules|ruling|scope call)|scope calls?/i,
  confession: /\bI was wrong\b|\bmy (error|mistake|fault)\b|\bI should have\b|the honest part|worth saying plainly|\bI misread\b|\bI misreported\b|that was luck|\bcorrects? (me|myself|an earlier)|and it corrects me|my own (probes?|reconstruction|brief) (was|were) wrong/i,
  more_work: /\bone more thing\b|worth (a|another) (look|pass|fix|feature)|follow-?up work|next steps?\b|still (open|outstanding|to do)|not yet (done|fixed|closed|run)|remains? open|left (unfixed|failing|for later)|should be (a|its own) (feature|standard|rule)|worth (opening|filing)/i,
  hedge_caveat: /\bcaveat\b|worth noting\b|note that\b|keep in mind|to be clear|one thing to watch|be aware/i,
  unverified_flag: /\bunverified\b|\bI (have not|haven't|did not|didn't|could not|couldn't) (verify|confirm|reproduce)|cannot confirm|not (been )?verified/i,
};

let realUserTurns = 0, asstMsgs = 0;
const turnFinals = [];          // { text, len }
let lastAsstText = null;

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(b => b && b.type === 'text').map(b => b.text).join('\n');
}
function isToolResultMsg(content) {
  return Array.isArray(content) && content.some(b => b && b.type === 'tool_result');
}

for (const line of lines) {
  let r; try { r = JSON.parse(line); } catch { continue; }
  if (r.isSidechain === true) continue;
  const m = r.message;
  if (!m) continue;
  if (r.type === 'assistant') {
    const t = textOf(m.content);
    if (t.trim()) { asstMsgs++; lastAsstText = t; }
  } else if (r.type === 'user') {
    if (isToolResultMsg(m.content)) continue;
    const t = textOf(m.content);
    if (!t.trim()) continue;
    if (t.includes('local-command-stdout') || t.includes('command-name')) continue;
    realUserTurns++;
    if (lastAsstText) { turnFinals.push({ text: lastAsstText, len: lastAsstText.length }); lastAsstText = null; }
  }
}
if (lastAsstText) turnFinals.push({ text: lastAsstText, len: lastAsstText.length });

const lens = turnFinals.map(t => t.len).sort((a, b) => a - b);
const median = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
const avg = lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : 0;

console.log(`file: ${file.split(/[\\/]/).pop()}`);
console.log(`real user turns: ${realUserTurns} · assistant text msgs: ${asstMsgs} · turn-final msgs: ${turnFinals.length}`);
console.log(`turn-final length: avg ${avg} chars · median ${median} · max ${lens[lens.length - 1] || 0}`);

for (const [name, re] of Object.entries(PATTERNS)) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let totalHits = 0, msgsWith = 0;
  const samples = [];
  for (const tf of turnFinals) {
    const hits = [...tf.text.matchAll(g)];
    if (hits.length) {
      msgsWith++;
      totalHits += hits.length;
      if (samples.length < 6) {
        const i = hits[0].index;
        samples.push(tf.text.slice(Math.max(0, i - 70), i + 90).replace(/\s+/g, ' ').trim());
      }
    }
  }
  const pct = turnFinals.length ? Math.round(100 * msgsWith / turnFinals.length) : 0;
  console.log(`\n${name}: ${totalHits} hits · in ${msgsWith}/${turnFinals.length} turn-final msgs (${pct}%)`);
  if (showSamples) for (const s of samples) console.log(`   … ${s}`);
}

// Closing-section asks: how often the FINAL 25% of a turn-final message contains a bullet list
// addressed at the owner (the "here's what needs you" tail).
let tailAsks = 0;
for (const tf of turnFinals) {
  const tail = tf.text.slice(Math.floor(tf.text.length * 0.75));
  if (/^[-*•]|\n[-*•] /m.test(tail) && /\byou(r)?\b/i.test(tail)) tailAsks++;
}
console.log(`\nclosing-tail bullet lists addressed at the owner: ${tailAsks}/${turnFinals.length}`);
