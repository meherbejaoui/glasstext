#!/usr/bin/env node
/**
 * Score the screening pipeline against generated evasions.
 *
 * Evasions are scored inside a sentence, as they would appear in practice, and
 * split into two families (see `evasions()` in src/screening.js):
 *
 *   designed-for  techniques some stage of `normalize()` was written to undo,
 *                 drawn from the same tables that stage reverses. A high catch
 *                 rate here measures the pipeline's consistency with itself.
 *   independent   edit-distance-one typos and lookalike letters absent from the
 *                 folding table. Nothing was written for these, so this is the
 *                 honest robustness figure.
 *
 * Usage: node tools/validate-screening.mjs
 */

import { evasionReport, DEMO_TERMS } from '../src/screening.js';

const tally = {};
for (const term of DEMO_TERMS) {
  for (const e of evasionReport(term)) {
    const t = (tally[e.family] ??= { total: 0, word: 0, normalized: 0, byTechnique: {} });
    t.total++;
    if (e.word) t.word++;
    if (e.normalized) t.normalized++;
    const b = (t.byTechnique[e.technique] ??= { total: 0, word: 0, normalized: 0 });
    b.total++;
    if (e.word) b.word++;
    if (e.normalized) b.normalized++;
  }
}

console.log(`\nEvasions of ${DEMO_TERMS.length} demo terms, scored inside a sentence`);
console.log('='.repeat(60));
for (const [family, t] of Object.entries(tally)) {
  console.log(`\n${family}`);
  console.log(`${'technique'.padEnd(24)} ${'n'.padStart(3)}  ${'whole-word'.padStart(10)}  ${'normalised'.padStart(10)}`);
  console.log('-'.repeat(60));
  for (const [tech, b] of Object.entries(t.byTechnique)) {
    console.log(`${tech.padEnd(24)} ${String(b.total).padStart(3)}  ${`${b.word}/${b.total}`.padStart(10)}  ${`${b.normalized}/${b.total}`.padStart(10)}`);
  }
  console.log(`${'ALL'.padEnd(24)} ${String(t.total).padStart(3)}  ${`${t.word}/${t.total}`.padStart(10)}  ${`${t.normalized}/${t.total}`.padStart(10)}`);
}
console.log();
