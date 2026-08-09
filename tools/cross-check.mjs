#!/usr/bin/env node
/**
 * Cross-check our readability output against `textstat`, an independent and
 * widely used Python implementation of the same formulas.
 *
 * What this can and cannot prove:
 *   - It CAN catch a mistyped coefficient or a transposed term. If we had
 *     written 84.7 instead of 84.6, the Flesch column would diverge on every
 *     sample at once.
 *   - It CANNOT establish that either implementation is "correct". Both are
 *     applying the same published formulas to their own tokenizations, so a
 *     residual gap of a grade or so is expected and is a statement about
 *     sentence splitting and syllable counting, not about the formulas.
 *
 * Requires: python3 with `pip install textstat`.
 * Usage: node tools/cross-check.mjs
 */

import { execFileSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { segment } from '../src/tokenize.js';
import { readability } from '../src/readability.js';
import { SAMPLES } from '../assets/samples.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PY = `
import json, sys, textstat
data = json.loads(sys.stdin.read())
out = {}
for name, text in data.items():
    out[name] = {
        "flesch-reading-ease": textstat.flesch_reading_ease(text),
        "flesch-kincaid-grade": textstat.flesch_kincaid_grade(text),
        "gunning-fog": textstat.gunning_fog(text),
        "smog": textstat.smog_index(text),
        "coleman-liau": textstat.coleman_liau_index(text),
        "automated-readability-index": textstat.automated_readability_index(text),
        "_counts": {
            "words": textstat.lexicon_count(text),
            "sentences": textstat.sentence_count(text),
            "syllables": textstat.syllable_count(text),
        },
    }
print(json.dumps(out))
`;

/** @type {Record<string,string>} */
const samples = Object.fromEntries(
  Object.entries(SAMPLES).map(([key, { text }]) => [key, text]),
);
const files = Object.keys(samples);

const theirs = JSON.parse(
  execFileSync('python3', ['-c', PY], { input: JSON.stringify(samples), encoding: 'utf8' }),
);

const rows = [];
const deltasByMetric = new Map();

for (const [name, text] of Object.entries(samples)) {
  const doc = segment(text);
  const { metrics } = readability(doc);
  const t = theirs[name];

  console.log(`\n${name}`);
  console.log('='.repeat(72));
  console.log(
    `counts   ours: ${doc.wordCount}w ${doc.sentenceCount}s   ` +
    `textstat: ${t._counts.words}w ${t._counts.sentences}s ${t._counts.syllables}syl`,
  );
  console.log(`${'metric'.padEnd(32)} ${'ours'.padStart(8)} ${'textstat'.padStart(9)} ${'delta'.padStart(7)}`);
  console.log('-'.repeat(72));

  for (const m of metrics) {
    const mine = m.value;
    const other = t[m.id];
    const delta = Number((mine - other).toFixed(2));
    if (!deltasByMetric.has(m.id)) deltasByMetric.set(m.id, []);
    deltasByMetric.get(m.id).push(Math.abs(delta));
    rows.push({ sample: name, metric: m.id, ours: mine, textstat: other, delta });
    console.log(
      `${m.name.padEnd(32)} ${String(mine).padStart(8)} ${String(other).padStart(9)} ${String(delta).padStart(7)}`,
    );
  }
}

console.log(`\n\nMean absolute difference by metric (across ${files.length} samples)`);
console.log('='.repeat(72));
const summary = {};
for (const [id, ds] of deltasByMetric) {
  const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
  const max = Math.max(...ds);
  summary[id] = { meanAbsDiff: Number(mean.toFixed(3)), maxAbsDiff: Number(max.toFixed(3)) };
  console.log(`${id.padEnd(32)} mean ${mean.toFixed(3).padStart(7)}   max ${max.toFixed(3).padStart(7)}`);
}

await mkdir(path.join(ROOT, 'tools', '.cache'), { recursive: true });
await writeFile(
  path.join(ROOT, 'tools', '.cache', 'cross-check.json'),
  JSON.stringify({ generated: new Date().toISOString().slice(0, 10), summary, rows }, null, 2),
);
console.log('\nreport written to tools/.cache/cross-check.json\n');
