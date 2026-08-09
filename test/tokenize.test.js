import test from 'node:test';
import assert from 'node:assert/strict';
import { sentences, words, paragraphs, normalizeWord, letterCount, segment, graphemeCount } from '../src/tokenize.js';

test('sentences: basic terminals', () => {
  assert.deepEqual(sentences('One. Two! Three?'), ['One.', 'Two!', 'Three?']);
  assert.deepEqual(sentences('No terminal here'), ['No terminal here']);
  assert.deepEqual(sentences(''), []);
  assert.deepEqual(sentences('   '), []);
});

test('sentences: decimals do not split', () => {
  assert.equal(sentences('Pi is 3.14 exactly.').length, 1);
  assert.equal(sentences('Version 1.2.3 shipped.').length, 1);
});

test('sentences: known abbreviations do not split', () => {
  assert.equal(sentences('Dr. Smith arrived late.').length, 1);
  assert.equal(sentences('We met Mr. and Mrs. Jones.').length, 1);
  assert.equal(sentences('Cats, dogs, etc. were present.').length, 1);
});

test('sentences: initials do not split', () => {
  assert.equal(sentences('J. R. R. Tolkien wrote it.').length, 1);
});

test('sentences: closing punctuation stays attached', () => {
  assert.deepEqual(sentences('He said "Stop!" Then he left.'), ['He said "Stop!"', 'Then he left.']);
  assert.deepEqual(sentences('(Really.) Yes.'), ['(Really.)', 'Yes.']);
});

test('sentences: ellipses and runs collapse into one boundary', () => {
  assert.equal(sentences('Wait... Then go.').length, 2);
  assert.equal(sentences('What?! Really.').length, 2);
});

test('sentences: lowercase after a period does not split', () => {
  // Guards against splitting inside "google.com" style tokens.
  assert.equal(sentences('Visit example.com today.').length, 1);
});

test('sentences: documented failure modes are pinned', () => {
  // These are WRONG, and pinned deliberately so a future fix is visible as a
  // test change rather than a silent behaviour shift. See docs/limits.md.
  assert.equal(sentences('Meet me at 9 a.m. We can talk then.').length, 1,
    'a sentence ending in an abbreviation does not split');
  assert.equal(sentences('It rained; we stayed in.').length, 1,
    'semicolons do not split');
});

test('words: contractions and hyphens are single words', () => {
  assert.deepEqual(words("don't"), ["don't"]);
  assert.deepEqual(words('state-of-the-art'), ['state-of-the-art']);
  assert.deepEqual(words('hello—world'), ['hello', 'world'], 'em dash separates');
  assert.deepEqual(words('it’s'), ['it’s'], 'typographic apostrophe');
});

test('words: unicode letters survive', () => {
  assert.deepEqual(words('café naïve'), ['café', 'naïve']);
  assert.deepEqual(words('Привет мир'), ['Привет', 'мир']);
});

test('words: numbers', () => {
  assert.deepEqual(words('3.14 and 1,000'), ['3.14', 'and', '1,000']);
});

test('normalizeWord folds case and apostrophes', () => {
  assert.equal(normalizeWord('It’s'), "it's");
  assert.equal(normalizeWord('“Hello”'), 'hello');
  assert.equal(normalizeWord('...'), '');
});

test('letterCount excludes digits and punctuation', () => {
  assert.equal(letterCount('abc 123 !?'), 3);
  assert.equal(letterCount('café'), 4);
});

test('paragraphs split on blank lines', () => {
  assert.deepEqual(paragraphs('One\n\nTwo'), ['One', 'Two']);
  assert.deepEqual(paragraphs('One\nstill one'), ['One\nstill one']);
});

test('segment: an unterminated heading does not swallow the next paragraph', () => {
  const doc = segment('A Heading\n\nThis is a sentence. So is this.');
  assert.equal(doc.paragraphs.length, 2);
  assert.equal(doc.sentenceCount, 3, 'heading counts as its own sentence');
});

test('segment: empty input is safe', () => {
  const doc = segment('');
  assert.equal(doc.wordCount, 0);
  assert.equal(doc.sentenceCount, 0);
  assert.deepEqual(doc.types, []);
});

test('segment: grapheme count treats an emoji sequence as one character', () => {
  // Family emoji: several code points joined by ZWJ.
  const doc = segment('👨‍👩‍👧');
  assert.equal(doc.graphemes, 1);
});

test('graphemeCount: the fast path agrees with full segmentation', () => {
  // Plain text takes the length shortcut; everything else must fall back to
  // Intl.Segmenter. Both branches have to produce the same answer, so compare
  // them directly rather than trusting the shortcut.
  const full = (s) => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].length;

  const cases = [
    'plain ascii text',
    '',
    'a',
    'tabs\tand\nnewlines',
    'accented: café naïve',      // precomposed -- still one code unit each
    'combining: café',      // e + combining acute -> one grapheme
    'astral: 𝔘𝔫𝔦𝔠𝔬𝔡𝔢',
    'emoji: 👍',
    'zwj family: 👨‍👩‍👧',
    'flag: 🇬🇧',
    'skin tone: 👋🏽',
    'mixed ascii and 👍 emoji',
  ];

  for (const s of cases) {
    assert.equal(graphemeCount(s), full(s), `mismatch for ${JSON.stringify(s)}`);
  }
});

test('graphemeCount: CRLF is one grapheme, not two', () => {
  // The reason the ASCII fast path excludes carriage return.
  assert.equal(graphemeCount('\r\n'), 1);
  assert.equal(graphemeCount('a\r\nb'), 3);
});
