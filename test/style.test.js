import test from 'node:test';
import assert from 'node:assert/strict';
import { passiveCandidates, rhythm, style } from '../src/style.js';
import { segment, words } from '../src/tokenize.js';

test('passive: catches regular and irregular participles', () => {
  assert.equal(passiveCandidates(words('The bill was passed by the senate')).length, 1);
  assert.equal(passiveCandidates(words('The window was broken')).length, 1);
  assert.equal(passiveCandidates(words('The report has been written')).length, 1);
});

test('passive: tolerates intervening adverbs', () => {
  assert.equal(passiveCandidates(words('It was widely reported')).length, 1);
  assert.equal(passiveCandidates(words('It was not clearly stated')).length, 1);
});

test('passive: active voice is not flagged', () => {
  assert.equal(passiveCandidates(words('The senate passed the bill')).length, 0);
  assert.equal(passiveCandidates(words('She writes every morning')).length, 0);
});

test('passive: known false positives are pinned, not hidden', () => {
  // Predicate adjectives look exactly like passives at the surface. Pinning
  // these documents the limit that docs/limits.md describes.
  assert.equal(
    passiveCandidates(words('The results were mixed')).length, 1,
    'predicate adjective misread as passive -- a documented limitation',
  );
});

test('passive: known false negatives are pinned', () => {
  assert.equal(
    passiveCandidates(words('The window got broken')).length, 0,
    '"get" passives are not detected -- a documented limitation',
  );
});

test('rhythm: reports spread, not just mean', () => {
  const sentences = ['One two three.', 'One two three four five six seven eight nine ten.'];
  const r = rhythm(sentences, words);
  assert.equal(r.count, 2);
  assert.equal(r.min, 3);
  assert.equal(r.max, 10);
  assert.ok(r.sd > 0);
});

test('rhythm: uniform sentence length is called out', () => {
  const s = Array.from({ length: 6 }, () => 'One two three four five.');
  const r = rhythm(s, words);
  assert.equal(r.sd, 0);
  assert.match(r.note, /uniform/i);
});

test('rhythm: empty input is safe', () => {
  assert.equal(rhythm([], words).count, 0);
});

test('style: nominalisations found, common nouns excluded', () => {
  const s = style(segment('The implementation of the investigation required authorization.'), words);
  const found = s.nominalisations.top.map((t) => t.word);
  assert.ok(found.includes('implementation'));
  assert.ok(found.includes('investigation'));

  const s2 = style(segment('The nation asked a question about the moment.'), words);
  const found2 = s2.nominalisations.top.map((t) => t.word);
  assert.ok(!found2.includes('nation'), 'plain nouns are not nominalisations');
  assert.ok(!found2.includes('question'));
  assert.ok(!found2.includes('moment'));
});

test('style: hedges counted', () => {
  const s = style(segment('This is very really quite obviously true.'), words);
  assert.ok(s.hedges.count >= 4);
});

test('style: every panel carries its caveat', () => {
  const s = style(segment('The report was written. It was quite good.'), words);
  for (const key of ['passive', 'nominalisations', 'hedges', 'adverbs']) {
    assert.ok(s[key].note && s[key].note.length > 20, `${key} needs a caveat`);
  }
  assert.match(s.passive.note, /not errors|Candidates/i);
});

test('style: empty input is safe', () => {
  const s = style(segment(''), words);
  assert.equal(s.passive.sentences, 0);
  assert.equal(s.nominalisations.count, 0);
  assert.equal(s.rhythm.count, 0);
});
