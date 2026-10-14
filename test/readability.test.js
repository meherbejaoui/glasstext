import test from 'node:test';
import assert from 'node:assert/strict';
import { segment } from '../src/tokenize.js';
import { readability, gradeConsensus } from '../src/readability.js';

/**
 * Verify each formula's arithmetic directly, using counts we control, rather
 * than trusting that the implementation and the docstring agree.
 */
test('formulas reproduce hand-computed values', () => {
  // A text engineered to have exact, checkable counts:
  // 2 sentences, 10 words, all monosyllabic, 30 letters.
  const text = 'The cat sat on the mat. The dog ran fast.';
  const doc = segment(text);
  assert.equal(doc.wordCount, 10);
  assert.equal(doc.sentenceCount, 2);

  const { metrics, basis } = readability(doc);
  assert.equal(basis.syllables, 10, 'all ten words are monosyllabic');

  const wps = 10 / 2; // 5
  const spw = 10 / 10; // 1

  const fre = metrics.find((m) => m.id === 'flesch-reading-ease');
  assert.equal(fre.value, Number((206.835 - 1.015 * wps - 84.6 * spw).toFixed(1)));

  const fkg = metrics.find((m) => m.id === 'flesch-kincaid-grade');
  assert.equal(fkg.value, Number((0.39 * wps + 11.8 * spw - 15.59).toFixed(1)));

  const fog = metrics.find((m) => m.id === 'gunning-fog');
  assert.equal(fog.value, Number((0.4 * (wps + 0)).toFixed(1)), 'no polysyllabic words');

  const cli = metrics.find((m) => m.id === 'coleman-liau');
  const L = (doc.letters / 10) * 100;
  const S = (2 / 10) * 100;
  assert.equal(cli.value, Number((0.0588 * L - 0.296 * S - 15.8).toFixed(1)));
});

test('every metric exposes checkable arithmetic', () => {
  const doc = segment('The quick brown fox jumps over the lazy dog. It was remarkable.');
  const { metrics } = readability(doc);

  assert.ok(metrics.length === 6, 'six formulas');
  for (const m of metrics) {
    assert.ok(m.expression.length > 0, `${m.id} has an expression`);
    assert.ok(m.substituted.length > 0, `${m.id} shows substituted values`);
    assert.ok(m.terms.length > 0, `${m.id} lists its input terms`);
    assert.ok(m.citationId, `${m.id} names a source`);
    assert.ok(m.interpretation.length > 0, `${m.id} explains itself`);
    assert.equal(typeof m.value, 'number');
    assert.ok(Number.isFinite(m.value), `${m.id} is finite`);
  }
});

test('empty and whitespace input produce no metrics rather than NaN', () => {
  for (const input of ['', '   ', '\n\n']) {
    const { metrics, basis } = readability(segment(input));
    assert.deepEqual(metrics, []);
    assert.ok(basis.empty);
  }
});

test('a single word does not divide by zero', () => {
  const { metrics } = readability(segment('Hello.'));
  for (const m of metrics) assert.ok(Number.isFinite(m.value), `${m.id} = ${m.value}`);
});

test('SMOG warns below its 30-sentence design point', () => {
  const short = readability(segment('One sentence here. Another one.'));
  const smog = short.metrics.find((m) => m.id === 'smog');
  assert.match(smog.warning, /30-sentence/);
});

test('short texts are flagged as outside the fitted range', () => {
  const { metrics } = readability(segment('Short text. Very short.'));
  assert.ok(metrics.every((m) => m.warning), 'all six carry a warning');
});

test('harder prose scores harder than plain prose', () => {
  const plain = segment('The cat sat. The dog ran. She went home. It was warm.');
  const hard = segment(
    'Notwithstanding the aforementioned considerations, the implementation of ' +
    'substantially equivalent methodological frameworks necessitates comprehensive ' +
    'reconsideration of the underlying epistemological assumptions.',
  );

  const plainFkg = readability(plain).metrics.find((m) => m.id === 'flesch-kincaid-grade').value;
  const hardFkg = readability(hard).metrics.find((m) => m.id === 'flesch-kincaid-grade').value;
  assert.ok(hardFkg > plainFkg + 5, `${hardFkg} should far exceed ${plainFkg}`);

  const plainFre = readability(plain).metrics.find((m) => m.id === 'flesch-reading-ease').value;
  const hardFre = readability(hard).metrics.find((m) => m.id === 'flesch-reading-ease').value;
  assert.ok(hardFre < plainFre, 'reading ease runs the other way');
});

test('gradeConsensus reports a range and flags disagreement', () => {
  const { metrics } = readability(segment(
    'The cat sat on the mat and then proceeded to undertake a comprehensive ' +
    'reconsideration of its extraordinarily uncomfortable circumstances. It slept.',
  ));
  const c = gradeConsensus(metrics);
  assert.ok(c.low <= c.median && c.median <= c.high);
  assert.equal(typeof c.note, 'string');
  assert.equal(gradeConsensus([]), null);
});

/**
 * The central educational claim of the readability panel: these formulas
 * cannot see word order. If shuffling a sentence's words leaves the score
 * unchanged, the score is not measuring comprehensibility.
 */
test('scores are invariant to word order -- the formulas are blind to syntax', () => {
  const original = 'The committee approved the revised budget proposal yesterday afternoon.';
  const shuffled = 'Yesterday budget the revised committee proposal approved the afternoon.';

  const a = readability(segment(original)).metrics;
  const b = readability(segment(shuffled)).metrics;

  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].value, b[i].value, `${a[i].id} changed under shuffling`);
  }
});

/**
 * Numerals have no syllables and no letters. Scoring one as a word with zero of
 * each used to drag the per-word averages down, so a sentence stuffed with
 * numbers read *easier* on Flesch and Flesch-Kincaid even though it got longer.
 * A missing measurement is missing, not zero.
 */
test('numerals lengthen sentences but leave the per-word terms alone', () => {
  const plain = 'The committee reviewed the proposal carefully. The members discussed the budget and the schedule.';
  const withNumbers =
    'The committee reviewed the proposal carefully 2026. The 12 members discussed the budget 4500 and the schedule 2027.';

  const a = readability(segment(plain));
  const b = readability(segment(withNumbers));
  const val = (r, id) => r.metrics.find((m) => m.id === id).value;

  assert.equal(b.basis.numerals, 4);
  assert.equal(b.basis.alphabeticWords, a.basis.words, 'the alphabetic words are exactly the original ones');
  assert.equal(b.basis.syllablesPerWord, a.basis.syllablesPerWord, 'syllables per word is over words with syllables');
  assert.equal(b.basis.lettersPerWord, a.basis.lettersPerWord);
  assert.equal(b.basis.percentPolysyllabic, a.basis.percentPolysyllabic);
  assert.ok(b.basis.wordsPerSentence > a.basis.wordsPerSentence, 'numerals still count towards sentence length');

  // Longer sentences, same words: every formula must say "harder", never "easier".
  assert.ok(val(b, 'flesch-reading-ease') < val(a, 'flesch-reading-ease'), 'Flesch Reading Ease must fall');
  assert.ok(val(b, 'flesch-kincaid-grade') > val(a, 'flesch-kincaid-grade'), 'Flesch-Kincaid grade must rise');
  assert.ok(val(b, 'gunning-fog') > val(a, 'gunning-fog'), 'Fog must rise');
  assert.ok(val(b, 'coleman-liau') > val(a, 'coleman-liau'), 'Coleman-Liau must rise');
  assert.equal(val(b, 'smog'), val(a, 'smog'), 'SMOG counts polysyllables and sentences, neither of which changed');
});

test('numerals: hand-checked arithmetic', () => {
  // 12 tokens, 2 of them numerals; 10 alphabetic monosyllables; 2 sentences.
  const doc = segment('The cat sat on the mat 2026. The dog ran fast 12.');
  assert.equal(doc.wordCount, 12);
  assert.equal(doc.numerals, 2);
  const { metrics, basis } = readability(doc);

  assert.equal(basis.alphabeticWords, 10);
  assert.equal(basis.syllablesPerWord, 1, '10 syllables / 10 alphabetic words, not / 12');

  const fre = metrics.find((m) => m.id === 'flesch-reading-ease');
  assert.equal(fre.value, Number((206.835 - 1.015 * (12 / 2) - 84.6 * 1).toFixed(1)));

  const cli = metrics.find((m) => m.id === 'coleman-liau');
  const L = (doc.letters / 10) * 100;
  const S = (2 / 12) * 100;
  assert.equal(cli.value, Number((0.0588 * L - 0.296 * S - 15.8).toFixed(1)));
});

test('numerals: the formulas that left them out say so, the others do not', () => {
  const { metrics } = readability(segment('We paid 4500 for 12 chairs in 2026. They were worth it, we think.'));
  const has = (id) => /numeric token/.test(metrics.find((m) => m.id === id).warning ?? '');

  for (const id of ['flesch-reading-ease', 'flesch-kincaid-grade', 'gunning-fog', 'coleman-liau']) {
    assert.ok(has(id), `${id} should disclose that numerals were left out of its per-word term`);
  }
  // SMOG has no per-word denominator; ARI counts digits as characters, so
  // numerals are measured there, not missing.
  assert.ok(!has('smog'));
  assert.ok(!has('automated-readability-index'));
});

test('numerals: a text of nothing but numbers produces no scores rather than NaN', () => {
  const { metrics, basis } = readability(segment('2026 4500 12.'));
  assert.deepEqual(metrics, []);
  assert.equal(basis.numeralsOnly, true);
  assert.equal(basis.numerals, 3);
});

test('numerals: text without any is scored exactly as before', () => {
  const { basis, metrics } = readability(segment('The cat sat on the mat. The dog ran fast.'));
  assert.equal(basis.numerals, 0);
  assert.equal(basis.alphabeticWords, basis.words);
  assert.ok(metrics.every((m) => !/numeric token/.test(m.warning ?? '')));
});

/**
 * Gunning's complex words exclude verb forms made three syllables only by an
 * -ed/-es/-ing inflection. SMOG has no such exclusion and counts them all.
 */
test('Fog excludes inflected forms; SMOG counts every polysyllable', () => {
  // "following", "reviewing", "requested" are 3 syllables only because of the suffix.
  const text = 'We were following the plan. They kept reviewing it. She requested more.';
  const doc = segment(text);
  const { basis, metrics } = readability(doc);

  assert.equal(basis.polysyllables, 3, 'all three are 3-syllable words');
  assert.equal(basis.complexWords, 0, 'none is complex in Gunning\'s sense');

  const fog = metrics.find((m) => m.id === 'gunning-fog');
  assert.equal(fog.value, Number((0.4 * (doc.wordCount / doc.sentenceCount + 0)).toFixed(1)));
  assert.equal(basis.percentComplex, 0);
});

test('Fog still counts genuinely complex words', () => {
  const { basis } = readability(segment('The committee considered the implementation of comprehensive epistemological frameworks.'));
  assert.ok(basis.complexWords >= 5, `expected the long words to stay complex, got ${basis.complexWords}`);
  assert.equal(basis.complexWords, basis.polysyllables, 'no inflected forms here, so the two counts agree');
});
