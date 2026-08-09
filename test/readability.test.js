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
