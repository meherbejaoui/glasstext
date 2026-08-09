import test from 'node:test';
import assert from 'node:assert/strict';
import { syllables, polysyllableCount, totalSyllables } from '../src/syllables.js';

/**
 * Hand-checked syllable counts. Each group targets one rule in the counter, so
 * a failure names the rule that broke rather than just "syllables are wrong".
 */
const CASES = {
  'basic vowel groups': { cat: 1, table: 2, computer: 3, elephant: 3, university: 5 },
  'silent terminal e': { make: 1, whale: 1, mile: 1, hole: 1, figure: 2, code: 1 },
  'syllabic l and r': { table: 2, little: 2, acre: 2, centre: 2, apple: 2, bottle: 2 },
  'doubled l takes silent e': { belle: 1, gazelle: 2, michelle: 2 },
  'plural -es': { makes: 1, codes: 1, watches: 2, abolishes: 4, tables: 2, acres: 2 },
  'past tense -ed': { walked: 1, wanted: 2, needed: 2, addled: 2, played: 1 },
  'silent e before suffix': { lovely: 2, abatement: 3, movement: 2, absolutely: 4 },
  // stadium is 3 (S T EY D IY AH M), not 4 -- checked against CMUdict.
  'hiatus': { accordion: 4, radio: 3, video: 3, stadium: 3, accrual: 3, actuary: 4 },
  'y before -ed/-es is a consonant': { played: 1, eyes: 1, died: 1, denied: 2, enjoyed: 2 },
  'the -tion family is not hiatus': { nation: 2, station: 2, special: 2, precious: 2, gorgeous: 2 },
  'syllabic consonants': { prism: 2, rhythm: 2, algorithm: 4, activism: 4 },
  'y as vowel': { happy: 2, rhythm: 2, yellow: 2, myth: 1, why: 1 },
  'exceptions': { people: 2, business: 2, every: 2, science: 2, area: 3, idea: 3 },
};

for (const [group, cases] of Object.entries(CASES)) {
  test(`syllables: ${group}`, () => {
    for (const [word, expected] of Object.entries(cases)) {
      assert.equal(syllables(word), expected, `${word} should be ${expected}, got ${syllables(word)}`);
    }
  });
}

test('syllables: degenerate input', () => {
  assert.equal(syllables(''), 0);
  assert.equal(syllables('   '), 0);
  assert.equal(syllables('123'), 0);
  assert.equal(syllables('a'), 1);
  assert.equal(syllables('I'), 1);
  // Punctuation is stripped, not counted.
  assert.equal(syllables("don't"), syllables('dont'));
});

test('syllables: every word gets at least one', () => {
  for (const w of ['x', 'nth', 'tsk', 'brr', 'hmm', 'strengths']) {
    assert.ok(syllables(w) >= 1, `${w} returned ${syllables(w)}`);
  }
});

test('polysyllableCount uses a 3+ threshold', () => {
  const ws = ['cat', 'table', 'computer', 'elephant', 'a'];
  assert.equal(polysyllableCount(ws), 2, 'computer and elephant only');
});

test('totalSyllables sums the list', () => {
  assert.equal(totalSyllables(['cat', 'table', 'computer']), 1 + 2 + 3);
  assert.equal(totalSyllables([]), 0);
});

/**
 * Regression guard on the measured CMUdict accuracy.
 *
 * The full scoring run lives in tools/validate-syllables.mjs and its result is
 * recorded in docs/validation.md. Here we re-score a committed sample of that
 * dictionary so CI enforces the number without downloading 3.6 MB.
 *
 * The floor is set a little below the measured value: this asserts "we did not
 * regress", not "this exact number is sacred".
 */
test('syllables: accuracy against the committed CMUdict sample', async () => {
  const { readFile } = await import('node:fs/promises');
  const url = new URL('./fixtures/cmudict-sample.json', import.meta.url);
  /** @type {Array<[string, number[]]>} */
  const sample = JSON.parse(await readFile(url, 'utf8'));

  let exact = 0;
  let within1 = 0;
  for (const [word, counts] of sample) {
    const predicted = syllables(word);
    const best = counts.reduce((a, b) => (Math.abs(b - predicted) < Math.abs(a - predicted) ? b : a));
    if (predicted === best) exact++;
    if (Math.abs(predicted - best) <= 1) within1++;
  }

  const exactPct = (exact / sample.length) * 100;
  const within1Pct = (within1 / sample.length) * 100;

  assert.ok(
    exactPct >= 90,
    `exact-match accuracy fell to ${exactPct.toFixed(2)}% on ${sample.length} words (floor 90%)`,
  );
  assert.ok(
    within1Pct >= 99,
    `within-1 accuracy fell to ${within1Pct.toFixed(2)}% (floor 99%)`,
  );
});
