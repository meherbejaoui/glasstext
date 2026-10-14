import test from 'node:test';
import assert from 'node:assert/strict';
import { sentences, words, paragraphs, normalizeWord, letterCount, segment, graphemeCount, isNumeral } from '../src/tokenize.js';

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

test('sentences: ordinary words that double as abbreviations still end sentences', () => {
  // Each of these words was once in the abbreviation list, which silently
  // merged the sentence it ended with the next one.
  const cases = [
    'I said no. Then he left.',
    'He came on sat. We left.',
    'The max. Value was high.',
    'We met in Mar. Then we left.',
    'I like Sun. Moon is fine.',
    'Say hi to Al. Then go.',
    'I love you, hon. Really.',
    'She runs a co. Then she rests.',
    'Hi, Ed. Then we left.',
    'We bought apples, pears, etc. Then we left.',
  ];
  for (const text of cases) {
    assert.equal(sentences(text).length, 2, `should split: ${text}`);
  }
});

test('sentences: those words are still abbreviations in the contexts that mark them', () => {
  const cases = [
    'See no. 5 for details.',
    'See fig. 3 for details.',
    'The meeting is on Dec. 25 at noon.',
    'It opens Tue. Oct. 3 at noon.',
    'Allow min. 10 minutes.',
    'Ask Rev. Smith about it.',
    'Ask the Hon. Justice Smith.',
    'The paper by Smith et al. Nature 2020 was cited.',
    'The 2nd ed. Oxford edition sold well.',
  ];
  for (const text of cases) {
    const got = sentences(text);
    assert.equal(got.length, 1, `should not split: ${JSON.stringify(got)}`);
  }
});

test('sentences: a sentence-final letter is not an initial, a real initial still is', () => {
  assert.equal(sentences('Get vitamin C. It helps.').length, 2);
  assert.equal(sentences('So do I. We left.').length, 2);
  assert.equal(sentences('It was I. We left.').length, 2);
  assert.equal(sentences('Plan B. Then go.').length, 2);
  assert.equal(sentences('F. Scott Fitzgerald wrote it.').length, 1);
  assert.equal(sentences('Written by J. K. Rowling. Good.').length, 2);
  assert.equal(sentences('I. M. Pei designed it.').length, 1, '"I" counts as an initial before another initial');
  assert.equal(sentences('J.M. Barrie wrote it.').length, 1, 'dotted initial clusters are initials too');
  assert.equal(sentences('P.S. I miss you.').length, 2, 'but a sentence opener after one ends the sentence');
});

test('sentences: ? and ! before a lowercase word split, unless a quote intervened', () => {
  assert.equal(sentences('Where did you go? home.').length, 2);
  assert.equal(sentences('Stop! now.').length, 2);
  // Dialogue tags must stay attached to the quotation they belong to.
  assert.deepEqual(sentences('"Stop!" he said. Then he left.'), ['"Stop!" he said.', 'Then he left.']);
  assert.equal(sentences('"Where are you going?" she asked.').length, 1);
  // A period is different: "etc. were" and "approx. five" are not boundaries.
  assert.equal(sentences('Cats, dogs, etc. were present.').length, 1);
});

test('sentences: documented failure modes are pinned', () => {
  // These are WRONG, and pinned deliberately so a future fix is visible as a
  // test change rather than a silent behaviour shift. See docs/limits.md.
  assert.equal(sentences('Meet me at 9 a.m. We can talk then.').length, 1,
    'a sentence ending in an abbreviation does not split');
  assert.equal(sentences('It rained; we stayed in.').length, 1,
    'semicolons do not split');
  assert.equal(sentences('See Section A. Results follow.').length, 1,
    'a sentence-final capital letter followed by a non-opener reads as an initial');
  assert.equal(sentences('i went home. it was late.').length, 1,
    'a period followed by a lowercase word never splits, so lowercase text is not segmented');
  assert.equal(sentences('Ask Messrs. Smith and Jones.').length, 2,
    'an abbreviation absent from the list splits early');
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

test('isNumeral: digits with separators, nothing with letters', () => {
  for (const t of ['2026', '3.14', '1,000', '4,500.25', '٣']) assert.ok(isNumeral(t), t);
  for (const t of ['mp3', 'B2B', 'abc', '', '3.', '-5', '1st']) assert.ok(!isNumeral(t), t);
  assert.equal(segment('In 2026 the 12 members paid 4,500 and 3.14.').numerals, 4);
  assert.equal(segment('No numbers here.').numerals, 0);
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
