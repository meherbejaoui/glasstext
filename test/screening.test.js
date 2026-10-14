import test from 'node:test';
import assert from 'node:assert/strict';
import {
  screen, normalize, compareModes, evasions, evasionReport,
  DEMO_TERMS, COLLATERAL, CONFUSABLES, UNLISTED_LOOKALIKES, SCREEN_NORMALIZE,
} from '../src/screening.js';

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

test('every evasion really changes the term it evades', () => {
  for (const term of DEMO_TERMS) {
    for (const e of evasions(term)) {
      assert.notEqual(e.text, term, `${e.technique} of "${term}" must not be the plain term`);
    }
  }
});

/**
 * Evasions are scored inside a sentence. Scored standalone, spaced and dotted
 * evasions look caught; embedded, the pipeline used to weld them to their
 * neighbours ("you arehelltoday") and miss them. The previous version of this
 * test asserted only `caught.length >= 5` and hid exactly that.
 */
test('normalisation catches every evasion its stages were written for, in context', () => {
  for (const term of DEMO_TERMS) {
    for (const e of evasionReport(term).filter((x) => x.family === 'designed-for')) {
      assert.equal(e.normalized, true, `"${e.text}" (${e.technique}) should be caught for "${term}"`);
      assert.equal(e.word, false, `"${e.text}" (${e.technique}) should slip past whole-word matching`);
    }
  }
});

/**
 * The honest half of the demo. Nothing in the pipeline was written for these,
 * and neither mode catches them. Pinned so that adding fuzzy matching, or
 * extending the lookalike table, shows up here as a deliberate change.
 */
test('normalisation does not catch independent evasions: typos and unlisted lookalikes', () => {
  for (const term of DEMO_TERMS) {
    const independent = evasionReport(term).filter((x) => x.family === 'independent');
    assert.ok(independent.length >= 3, `${term} should have the three independent techniques`);
    for (const e of independent) {
      assert.equal(e.word, false, `${e.technique} "${e.text}" vs whole-word`);
      assert.equal(e.normalized, false, `${e.technique} "${e.text}" is not caught by normalising`);
    }
  }
});

test('the unlisted lookalikes really are absent from the folding table', () => {
  for (const [letter, glyph] of Object.entries(UNLISTED_LOOKALIKES)) {
    assert.ok(!(glyph in CONFUSABLES), `${glyph} (for "${letter}") is in CONFUSABLES`);
    assert.equal(glyph.normalize('NFKC'), glyph, `${glyph} is folded by NFKC`);
    assert.equal(glyph.toLowerCase(), glyph);
  }
});

test('a symbol at the edge of a word is punctuation, not a letter', () => {
  // "hell!" used to become "helli", hiding the boundary the "!" provides.
  for (const text of ['hell!', '(hell)', 'hell+', 'what the hell!', 'oh hell+ yes', '"hell,"']) {
    const word = screen(text, { mode: 'word', terms: ['hell'] }).matches.length;
    const norm = screen(text, { mode: 'normalized', terms: ['hell'] }).matches.length;
    assert.equal(word, 1, `whole-word finds it in ${JSON.stringify(text)}`);
    assert.equal(norm, 1, `normalising must not lose it in ${JSON.stringify(text)}`);
  }
});

test('a symbol at the edge of a word can still stand for a letter', () => {
  const find = (text, term) => screen(text, { mode: 'normalized', terms: [term] }).matches.length;
  assert.equal(find('what an a$$ you are', 'ass'), 1, 'trailing $$');
  assert.equal(find('what an @ss you are', 'ass'), 1, 'leading @');
  assert.equal(find('what a $hot', 'shot'), 1, 'leading $');
  assert.equal(find('what a sh!t', 'shit'), 1, 'inner !');
  assert.equal(find('a sh0t', 'shot'), 1, 'inner digit');
});

test('normalised matching can only find more than whole-word matching', () => {
  const battery = [
    'hell!', '(hell)', 'hell+', 'hell, said the shell', 'Hello there, Michelle.',
    'class analysis document Sussex', 'what the h3ll', 'a$$ and ass', 'SHOT! shot? shot.',
    'hell hell hell', 'say "hell" now', 'ass-kicking', 'the hellish asses',
  ];
  for (const text of battery) {
    const w = screen(text, { mode: 'word' }).matches.length;
    const n = screen(text, { mode: 'normalized' }).matches.length;
    assert.ok(n >= w, `normalised ${n} < whole-word ${w} for ${JSON.stringify(text)}`);
  }
});

test('repeated letters match without collapsing the haystack', () => {
  const find = (text, term) => screen(text, { mode: 'normalized', terms: [term] }).matches.length;
  assert.equal(find('hellll', 'hell'), 1, 'collapsing used to turn this into "hel"');
  assert.equal(find('asssss', 'ass'), 1, 'collapsing used to turn this into "as"');
  assert.equal(find('shooot', 'shot'), 1);
  assert.equal(find('what the heeeellll', 'hell'), 1);
  // ...but "or more" never means "fewer": these are different words.
  assert.equal(find('as', 'ass'), 0);
  assert.equal(find('hel', 'hell'), 0);
  assert.equal(find('a hello', 'hell'), 0, 'still whole-word, so no Scunthorpe');
});

test('spaced-out letters are joined without welding neighbouring words', () => {
  assert.equal(normalize('you are h e l l today').output, 'you are hell today');
  assert.equal(normalize('the h.e.l.l.').output, 'the hell.');
  // Ordinary text with single-letter words must come through untouched.
  for (const text of ['plan b or c will work.', 'take vitamin d and e daily.', 'see part a or b below.', 'i am a b student.']) {
    assert.equal(normalize(text).output, text, 'single-letter words must not be welded to their neighbours');
  }
});

test('screening normalisation keeps boundaries; canonical normalisation does not', () => {
  // The two modes differ on purpose: screening needs word boundaries,
  // canonicalisation (deduplication, usernames) needs one stable string.
  assert.equal(normalize('hell!').output, 'helli');
  assert.equal(normalize('hell!', SCREEN_NORMALIZE).output, 'hell!');
  assert.equal(normalize('hellll').output, 'hel');
  assert.equal(normalize('hellll', SCREEN_NORMALIZE).output, 'hellll');
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
