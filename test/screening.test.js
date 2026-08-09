import test from 'node:test';
import assert from 'node:assert/strict';
import { screen, normalize, compareModes, evasions, DEMO_TERMS, COLLATERAL } from '../src/screening.js';

/**
 * The Scunthorpe problem, as an executable claim rather than an anecdote.
 */
test('substring matching flags innocent words', () => {
  const text = 'The class analysis document was assessed in Sussex.';
  const res = screen(text, { mode: 'substring' });

  assert.ok(res.matches.length > 0, 'substring mode fires');
  assert.ok(
    res.matches.every((m) => !m.wholeWord),
    'every hit here is inside a larger word -- all false positives',
  );

  const matchedTerms = new Set(res.matches.map((m) => m.term));
  assert.ok(matchedTerms.has('ass'), '"class"/"assessed" trip the "ass" entry');
  assert.ok(matchedTerms.has('anal'), '"analysis" trips the "anal" entry');
  assert.ok(matchedTerms.has('cum'), '"document" trips the "cum" entry');
  assert.ok(matchedTerms.has('sex'), '"Sussex" trips the "sex" entry');
});

test('whole-word matching eliminates those false positives', () => {
  const text = 'The class analysis document was assessed in Sussex.';
  const res = screen(text, { mode: 'word' });
  assert.equal(res.matches.length, 0, 'no whole-word hits in innocent text');
});

test('every documented collateral word really does contain its term', () => {
  for (const [term, victims] of Object.entries(COLLATERAL)) {
    for (const word of victims) {
      assert.ok(
        word.toLowerCase().includes(term),
        `${word} is listed under "${term}" but does not contain it`,
      );
    }
  }
});

test('whole-word matching loses to trivial evasion', () => {
  for (const { technique, text } of evasions('hell')) {
    const res = screen(`you are ${text} today`, { mode: 'word', terms: ['hell'] });
    assert.equal(res.matches.length, 0, `${technique} should slip past whole-word matching`);
  }
});

test('normalisation catches most of those evasions', () => {
  const caught = [];
  const missed = [];
  for (const { technique, text } of evasions('hell')) {
    const res = screen(`you are ${text} today`, { mode: 'normalized', terms: ['hell'] });
    (res.matches.length > 0 ? caught : missed).push(technique);
  }
  assert.ok(caught.length >= 5, `expected most techniques caught, got ${caught.join(', ')}`);
});

test('normalize records every stage so the pipeline is inspectable', () => {
  const { output, steps } = normalize('Ｈéllo　wörld');
  assert.ok(steps.length >= 5);
  assert.ok(steps.every((s) => typeof s.name === 'string' && typeof s.output === 'string'));
  assert.ok(!/[éöＨ]/.test(output), `diacritics and fullwidth forms should be gone: ${output}`);
});

test('normalize folds Cyrillic homoglyphs to ASCII', () => {
  // "асс" here is Cyrillic а, с, с -- visually identical, different code points.
  const { output } = normalize('асс');
  assert.equal(output, 'acc');
});

test('normalize strips zero-width characters', () => {
  const { output } = normalize('h​e​l​l​o');
  assert.equal(output, 'hello');
});

test('normalize undoes leetspeak', () => {
  const { output } = normalize('h3ll0 w0rld');
  assert.equal(output, 'hello world');
});

test('normalize collapses repeated letters', () => {
  const { output } = normalize('heeeellllo');
  assert.equal(output, 'helo', 'collapsing is lossy -- that is the point');
});

test('compareModes quantifies the precision/recall trade-off', () => {
  const text = 'The class analysis was documented. What the h3ll happened in Sussex?';
  const c = compareModes(text);

  assert.ok(c.substring.collateral > 0, 'substring mode produces collateral damage');
  assert.equal(c.word.collateral, 0, 'whole-word mode produces none');
  assert.ok(c.normalized.total >= c.word.total, 'normalising can only find more');
  assert.match(c.summary, /Scunthorpe/);
});

test('screening never returns a verdict', () => {
  const c = compareModes('anything at all');
  assert.ok(!('clean' in c) && !('safe' in c) && !('verdict' in c));
});

test('a custom term list replaces the demo list', () => {
  const res = screen('the wombat sat', { terms: ['wombat'], mode: 'word' });
  assert.equal(res.matches.length, 1);
  assert.equal(res.matches[0].term, 'wombat');
});

test('regex metacharacters in terms are escaped, not executed', () => {
  const res = screen('a.b and axb', { terms: ['a.b'], mode: 'substring' });
  assert.equal(res.matches.length, 1, 'the dot must be literal');
  assert.equal(res.matches[0].matched, 'a.b');
});

test('empty and degenerate input is safe', () => {
  assert.equal(screen('', {}).matches.length, 0);
  assert.equal(screen('text', { terms: [] }).matches.length, 0);
  assert.equal(screen('text', { terms: ['', null] }).matches.length, 0);
});

test('demo terms are all ordinary dictionary fragments', () => {
  for (const t of DEMO_TERMS) {
    assert.ok(COLLATERAL[t], `${t} must document the innocent words it breaks`);
  }
});
