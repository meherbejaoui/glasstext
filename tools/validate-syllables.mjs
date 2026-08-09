#!/usr/bin/env node
/**
 * Score the syllable heuristic against the CMU Pronouncing Dictionary.
 *
 * CMUdict gives a phoneme sequence per word; vowel phonemes carry a stress
 * digit (0/1/2), so the syllable count is the number of digit-bearing
 * phonemes. That is a genuine ground truth for pronunciation, which is what
 * the readability formulas actually want.
 *
 * Usage:
 *   node tools/validate-syllables.mjs                 # downloads and caches
 *   node tools/validate-syllables.mjs path/to/dict    # uses a local copy
 *   node tools/validate-syllables.mjs --errors 40     # show worst offenders
 *
 * Writes a machine-readable summary to tools/.cache/syllable-report.json and
 * prints a table suitable for pasting into docs/validation.md.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syllables } from '../src/syllables.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'tools', '.cache');
const DICT_PATH = path.join(CACHE_DIR, 'cmudict.dict');
const DICT_URL = 'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict';

const args = process.argv.slice(2);
const errorsFlag = args.indexOf('--errors');
const showErrors = errorsFlag >= 0 ? Number(args[errorsFlag + 1] ?? 25) : 0;
const localPath = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));

/**
 * Load CMUdict, downloading and caching it on first run.
 * @returns {Promise<string>}
 */
async function loadDict() {
  if (localPath) return readFile(localPath, 'utf8');
  if (existsSync(DICT_PATH)) return readFile(DICT_PATH, 'utf8');

  process.stderr.write(`Downloading CMUdict from ${DICT_URL} ...\n`);
  const res = await fetch(DICT_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(DICT_PATH, text);
  return text;
}

/**
 * Parse CMUdict into word -> ground-truth syllable count.
 *
 * Entries like "read(2)" are alternate pronunciations. A word with several
 * pronunciations of differing length (e.g. "fire" as 1 or 2) is genuinely
 * ambiguous; we keep every distinct count and score a prediction correct if it
 * matches any of them, because no speller-based heuristic could do better.
 *
 * @param {string} raw
 * @returns {Map<string, Set<number>>}
 */
function parseDict(raw) {
  const out = new Map();
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(';;;')) continue;
    const hashIdx = line.indexOf(' #');
    const clean = hashIdx >= 0 ? line.slice(0, hashIdx) : line;
    const parts = clean.trim().split(/\s+/);
    if (parts.length < 2) continue;

    const word = parts[0].replace(/\(\d+\)$/, '').toLowerCase();
    // Skip punctuation entries and anything with non-letters.
    if (!/^[a-z]+$/.test(word)) continue;

    let n = 0;
    for (let i = 1; i < parts.length; i++) if (/\d/.test(parts[i])) n++;
    if (n === 0) continue;

    if (!out.has(word)) out.set(word, new Set());
    out.get(word).add(n);
  }
  return out;
}

const dict = parseDict(await loadDict());

let total = 0;
let exact = 0;
let within1 = 0;
let signedError = 0;
let absError = 0;
const byLength = new Map();
const confusion = new Map();
const errors = [];

for (const [word, counts] of dict) {
  const predicted = syllables(word);
  const best = [...counts].reduce((a, b) =>
    Math.abs(b - predicted) < Math.abs(a - predicted) ? b : a,
  );
  const diff = predicted - best;

  total++;
  if (diff === 0) exact++;
  if (Math.abs(diff) <= 1) within1++;
  signedError += diff;
  absError += Math.abs(diff);

  const bucket = byLength.get(best) ?? { n: 0, ok: 0 };
  bucket.n++;
  if (diff === 0) bucket.ok++;
  byLength.set(best, bucket);

  if (diff !== 0) {
    confusion.set(diff, (confusion.get(diff) ?? 0) + 1);
    errors.push({ word, predicted, actual: best, diff });
  }
}

const pct = (n) => ((n / total) * 100).toFixed(2);
const report = {
  generated: new Date().toISOString().slice(0, 10),
  source: 'CMU Pronouncing Dictionary (cmudict.dict)',
  words: total,
  exactMatch: Number(pct(exact)),
  withinOne: Number(pct(within1)),
  meanSignedError: Number((signedError / total).toFixed(4)),
  meanAbsoluteError: Number((absError / total).toFixed(4)),
  byActualSyllables: Object.fromEntries(
    [...byLength.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([syl, b]) => [syl, { words: b.n, exactPct: Number(((b.ok / b.n) * 100).toFixed(2)) }]),
  ),
  errorDistribution: Object.fromEntries([...confusion.entries()].sort((a, b) => a[0] - b[0])),
};

await mkdir(CACHE_DIR, { recursive: true });
await writeFile(path.join(CACHE_DIR, 'syllable-report.json'), JSON.stringify(report, null, 2));

console.log(`\nSyllable heuristic vs CMUdict`);
console.log(`${'='.repeat(52)}`);
console.log(`words scored           ${total.toLocaleString()}`);
console.log(`exact match            ${pct(exact)}%`);
console.log(`within +/-1 syllable   ${pct(within1)}%`);
console.log(`mean signed error      ${(signedError / total).toFixed(4)}  (negative = undercounts)`);
console.log(`mean absolute error    ${(absError / total).toFixed(4)}`);

console.log(`\nAccuracy by true syllable count`);
console.log(`${'-'.repeat(52)}`);
for (const [syl, b] of [...byLength.entries()].sort((a, b) => a[0] - b[0])) {
  if (b.n < 50) continue;
  const bar = '#'.repeat(Math.round((b.ok / b.n) * 30));
  console.log(
    `${String(syl).padStart(2)}  ${String(b.n).padStart(7)} words  ${((b.ok / b.n) * 100).toFixed(1).padStart(5)}%  ${bar}`,
  );
}

console.log(`\nError distribution (predicted - actual)`);
console.log(`${'-'.repeat(52)}`);
for (const [diff, n] of [...confusion.entries()].sort((a, b) => a[0] - b[0])) {
  if (n < 20) continue;
  console.log(`${diff > 0 ? '+' : ''}${diff}  ${String(n).padStart(7)}  ${pct(n)}%`);
}

if (showErrors) {
  console.log(`\nWorst offenders (largest |error|, then alphabetical)`);
  console.log(`${'-'.repeat(52)}`);
  errors
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.word.localeCompare(b.word))
    .slice(0, showErrors)
    .forEach((e) => console.log(`  ${e.word.padEnd(24)} got ${e.predicted}  want ${e.actual}`));
}

console.log(`\nreport written to tools/.cache/syllable-report.json\n`);
