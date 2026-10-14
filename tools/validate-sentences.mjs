#!/usr/bin/env node
/**
 * Score the sentence splitter against gold sentence boundaries.
 *
 * Every readability formula here divides by the sentence count, so the
 * splitter's error propagates into all six. docs/validation.md already
 * measures the syllable counter, the smaller error source; this tool measures
 * the larger one in the same format.
 *
 * Ground truth is the Universal Dependencies English Web Treebank (EWT):
 * human-annotated sentence boundaries over blogs, e-mail, reviews, answers and
 * newsgroup posts. That is deliberately hostile to a heuristic splitter, which
 * makes the figure pessimistic for edited prose in the same way CMUdict is
 * pessimistic for the syllable counter.
 *
 * Method: consecutive gold sentences inside one `# newpar` (or `# newdoc`)
 * unit are joined with a single space, handed to `sentences()`, and the
 * predicted boundaries are compared with the gold ones. Boundaries are
 * compared by their offset in non-whitespace characters, so the whitespace
 * used to join sentences cannot affect the score. The final boundary of each
 * unit is trivially correct and is excluded.
 *
 * Usage:
 *   node tools/validate-sentences.mjs                  # held-out test split
 *   node tools/validate-sentences.mjs --split dev      # development split
 *   node tools/validate-sentences.mjs --split all
 *   node tools/validate-sentences.mjs --errors 40      # show worst offenders
 *   node tools/validate-sentences.mjs --module ./old.js  # score another implementation
 *
 * The dev split is what heuristics are tuned against; the test split is read
 * only to report the final number. The treebank is downloaded on first use
 * and cached under tools/.cache; it is CC BY-SA 4.0 and is not vendored.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'tools', '.cache');
const BASE = 'https://raw.githubusercontent.com/UniversalDependencies/UD_English-EWT/master';

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const split = flag('--split') ?? 'test';
const showErrors = Number(flag('--errors') ?? 0);
const modulePath = flag('--module');

const splits = split === 'all' ? ['dev', 'test'] : [split];
if (!splits.every((s) => ['dev', 'test', 'train'].includes(s))) {
  throw new Error(`unknown split "${split}" (use dev, test, train or all)`);
}

const { sentences } = modulePath
  ? await import(pathToFileURL(path.resolve(modulePath)).href)
  : await import('../src/tokenize.js');

/**
 * Load one CoNLL-U split, downloading and caching it on first use.
 * @param {string} name dev | test | train
 * @returns {Promise<string>}
 */
async function load(name) {
  const file = path.join(CACHE_DIR, `en_ewt-ud-${name}.conllu`);
  if (existsSync(file)) return readFile(file, 'utf8');

  const url = `${BASE}/en_ewt-ud-${name}.conllu`;
  process.stderr.write(`Downloading ${url} ...\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, text);
  return text;
}

/**
 * Group gold sentences into units that start at each `# newdoc` or `# newpar`.
 * @param {string} raw CoNLL-U text
 * @returns {string[][]} each unit is a list of gold sentences
 */
function units(raw) {
  const out = [];
  let cur = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('# newdoc') || line.startsWith('# newpar')) {
      cur = [];
      out.push(cur);
    } else if (line.startsWith('# text = ')) {
      if (!cur) {
        cur = [];
        out.push(cur);
      }
      cur.push(line.slice('# text = '.length).trim());
    }
  }
  return out.filter((u) => u.length > 0);
}

/** Cumulative non-whitespace offsets at which each piece ends (last omitted). */
function boundaries(pieces) {
  const ends = [];
  let n = 0;
  for (const p of pieces) {
    n += p.replace(/\s/g, '').length;
    ends.push(n);
  }
  ends.pop();
  return ends;
}

let tp = 0;
let fp = 0;
let fn = 0;
let goldSentences = 0;
let predSentences = 0;
let exactUnits = 0;
let totalUnits = 0;
const errors = [];

for (const name of splits) {
  for (const gold of units(await load(name))) {
    const text = gold.join(' ');
    const pred = sentences(text);

    const g = new Set(boundaries(gold));
    const p = new Set(boundaries(pred));
    let hit = 0;
    for (const b of p) if (g.has(b)) hit++;

    tp += hit;
    fp += p.size - hit;
    fn += g.size - hit;
    goldSentences += gold.length;
    predSentences += pred.length;
    totalUnits++;

    const exact = g.size === p.size && hit === g.size;
    if (exact) exactUnits++;
    else errors.push({ gold, pred, missed: g.size - hit, extra: p.size - hit });
  }
}

const precision = tp / (tp + fp);
const recall = tp / (tp + fn);
const f1 = (2 * precision * recall) / (precision + recall);
const pct = (x) => (x * 100).toFixed(2);

console.log(`\nSentence splitter vs UD English EWT (${splits.join(' + ')})`);
console.log('='.repeat(52));
console.log(`units (paragraphs)     ${totalUnits.toLocaleString()}`);
console.log(`gold sentences         ${goldSentences.toLocaleString()}`);
console.log(`predicted sentences    ${predSentences.toLocaleString()}  (${(predSentences / goldSentences).toFixed(4)} x gold)`);
console.log(`boundary precision     ${pct(precision)}%   (split where gold does not)`);
console.log(`boundary recall        ${pct(recall)}%   (missed a gold boundary)`);
console.log(`boundary F1            ${pct(f1)}%`);
console.log(`units split exactly    ${pct(exactUnits / totalUnits)}%`);

if (showErrors) {
  console.log(`\nWorst units (most boundary errors first)`);
  console.log('-'.repeat(52));
  errors
    .sort((a, b) => b.missed + b.extra - (a.missed + a.extra))
    .slice(0, showErrors)
    .forEach((e) => {
      console.log(`  missed ${e.missed}, extra ${e.extra}`);
      console.log(`    gold: ${JSON.stringify(e.gold).slice(0, 400)}`);
      console.log(`    pred: ${JSON.stringify(e.pred).slice(0, 400)}`);
    });
}
console.log();
