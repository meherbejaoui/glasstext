import test from 'node:test';
import assert from 'node:assert/strict';
import { ttr, mattr, mtld, herdanC, frequencies, lexical, MTLD_THRESHOLD } from '../src/lexical.js';
import { zipf, heaps, linearFit } from '../src/laws.js';
import { segment } from '../src/tokenize.js';

test('ttr is types over tokens', () => {
  assert.equal(ttr(['a', 'b', 'c']), 1);
  assert.equal(ttr(['a', 'a', 'b', 'b']), 0.5);
  assert.equal(ttr([]), 0);
});

test('mattr equals ttr when the text is shorter than the window', () => {
  const tokens = ['a', 'b', 'c', 'a'];
  const m = mattr(tokens, 50);
  assert.equal(m.value, Number(ttr(tokens).toFixed(3)));
  assert.match(m.note, /shorter than/);
});

test('mattr averages over sliding windows', () => {
  // 6 tokens, window 3 -> 4 windows: abc(1), bca(1), cab(1), abb(2/3)
  const tokens = ['a', 'b', 'c', 'a', 'b', 'b'];
  const m = mattr(tokens, 3);
  assert.equal(m.windows, 4);
  const expected = (1 + 1 + 1 + 2 / 3) / 4;
  assert.equal(m.value, Number(expected.toFixed(3)));
});

test('mattr is far less length-sensitive than ttr', () => {
  // The same sentence repeated: TTR must collapse, MATTR must hold steady.
  const unit = 'the quick brown fox jumps over a lazy dog while birds sing loudly nearby'.split(' ');
  const short = Array.from({ length: 4 }, () => unit).flat();
  const long = Array.from({ length: 40 }, () => unit).flat();

  // The text is exactly as varied at both lengths -- only the length differs.
  // TTR nonetheless falls by a factor of ten; MATTR barely moves. That gap is
  // the entire reason MATTR exists.
  const ttrRatio = ttr(long) / ttr(short);
  const mattrDrop = Math.abs(mattr(short, 50).value - mattr(long, 50).value);

  assert.ok(ttrRatio < 0.25, `TTR should collapse; long/short ratio was ${ttrRatio.toFixed(3)}`);
  assert.ok(mattrDrop < 0.05, `MATTR should hold, moved ${mattrDrop.toFixed(3)}`);
});

test('mtld returns null when no factor completes', () => {
  const m = mtld(['a', 'b', 'c']);
  assert.equal(m.value, null);
  assert.match(m.note, /never fell/);
});

test('mtld is higher for varied text than for repetitive text', () => {
  const varied = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whisky xray yankee zulu'.split(' ');
  const repetitive = Array.from({ length: 6 }, () => 'the cat and the dog and the bird'.split(' ')).flat();

  const v = mtld(varied);
  const rep = mtld(repetitive);
  assert.ok(rep.value !== null, 'repetitive text completes factors');
  if (v.value !== null) assert.ok(v.value > rep.value, `${v.value} should exceed ${rep.value}`);
});

test('mtld averages a forward and backward pass', () => {
  const tokens = 'one two three four five one two three four five six seven eight nine ten one two three'.split(' ');
  const m = mtld(tokens);
  if (m.value !== null) {
    assert.equal(m.value, Number(((m.forward + m.backward) / 2).toFixed(1)));
  }
});

test('MTLD threshold is the published 0.720', () => {
  assert.equal(MTLD_THRESHOLD, 0.720);
});

test("herdan's C is defined only with enough distinct words", () => {
  assert.equal(herdanC(['a']), null);
  assert.equal(herdanC(['a', 'a']), null);
  assert.ok(herdanC('a b c d e f'.split(' ')) > 0);
});

test('frequencies rank by count, ties alphabetical', () => {
  const f = frequencies(['b', 'a', 'a', 'c', 'c']);
  assert.equal(f[0].word, 'a');
  assert.equal(f[0].count, 2);
  assert.equal(f[0].rank, 1);
  assert.equal(f[2].word, 'b');
});

test('lexical profile reports hapax legomena', () => {
  const doc = segment('one two two three three three');
  const lex = lexical(doc);
  assert.equal(lex.tokens, 6);
  assert.equal(lex.types, 3);
  assert.equal(lex.hapax.count, 1, 'only "one" occurs once');
});

test('lexical handles empty input', () => {
  const lex = lexical(segment(''));
  assert.equal(lex.tokens, 0);
  assert.equal(lex.ttr, null);
  assert.equal(lex.mtld.value, null);
});

// --- distribution laws ------------------------------------------------------

test('linearFit recovers a known line exactly', () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = xs.map((x) => 3 * x + 7);
  const { slope, intercept, r2 } = linearFit(xs, ys);
  assert.ok(Math.abs(slope - 3) < 1e-9);
  assert.ok(Math.abs(intercept - 7) < 1e-9);
  assert.ok(Math.abs(r2 - 1) < 1e-9);
});

test('zipf recovers the exponent of a synthetic rank-frequency series', () => {
  // Build counts that follow f = 10000 * rank^-1 exactly.
  const freq = Array.from({ length: 200 }, (_, i) => ({
    rank: i + 1,
    count: 10000 / (i + 1),
  }));
  const z = zipf(freq);
  assert.ok(Math.abs(z.alpha - 1) < 0.01, `alpha was ${z.alpha}`);
  assert.ok(z.r2 > 0.999);
});

test('zipf declines to fit too few distinct words', () => {
  const z = zipf([{ rank: 1, count: 3 }, { rank: 2, count: 1 }]);
  assert.equal(z.alpha, null);
});

test('heaps: vocabulary grows sublinearly, which is why TTR falls', () => {
  const unit = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet'.split(' ');
  const tokens = Array.from({ length: 30 }, () => unit).flat();
  const h = heaps(tokens);
  assert.ok(h.beta !== null);
  assert.ok(h.beta < 1, `beta was ${h.beta}; sublinear growth requires beta < 1`);
});

test('heaps declines on very short input', () => {
  assert.equal(heaps(['a', 'b', 'c']).beta, null);
});

test('zipf returns the intercept so the drawn line is the real fit', () => {
  const freq = Array.from({ length: 100 }, (_, i) => ({ rank: i + 1, count: 5000 / (i + 1) }));
  const z = zipf(freq);
  assert.equal(typeof z.intercept, 'number');
  // log10(5000) = 3.699; the fitted line must pass through it at rank 1 (x=0).
  assert.ok(Math.abs(z.intercept - Math.log10(5000)) < 0.01, `intercept was ${z.intercept}`);
});

test('zipf: the once-occurring plateau is left out of the fit, and the difference is real', () => {
  // A clean f = 1000/rank head over 30 ranks, then 170 words that occur once.
  const head = Array.from({ length: 30 }, (_, i) => ({ rank: i + 1, count: Math.round(1000 / (i + 1)) }));
  const tail = Array.from({ length: 170 }, (_, i) => ({ rank: 31 + i, count: 1 }));
  const freq = [...head, ...tail];

  const trimmed = zipf(freq);
  const everything = zipf(freq, 0, 1);

  assert.ok(Math.abs(trimmed.alpha - 1) < 0.1, `fit to the repeated words recovers alpha ~ 1, got ${trimmed.alpha}`);
  // The plateau distorts the slope. Here the head is steep and then drops to 1,
  // which makes alpha too high; on short real texts the same plateau makes it
  // too low. Either way the all-ranks fit is materially wrong and fits worse.
  assert.ok(Math.abs(everything.alpha - trimmed.alpha) > 0.3,
    `the plateau distorts the slope: ${everything.alpha} vs ${trimmed.alpha}`);
  assert.ok(trimmed.r2 > everything.r2, 'and fits worse');

  assert.equal(trimmed.points.length, 200, 'the chart still gets every word');
  assert.equal(trimmed.fitted, 30);
  assert.equal(trimmed.fitMinCount, 2);
  assert.equal(trimmed.fitMaxRank, 30);
  assert.match(trimmed.note, /occurring at least 2 times/);
});

test('zipf: with too few repeated words it fits everything and says alpha is distorted', () => {
  const freq = Array.from({ length: 60 }, (_, i) => ({ rank: i + 1, count: i < 3 ? 5 - i : 1 }));
  const z = zipf(freq);
  assert.equal(z.fitMinCount, 1);
  assert.equal(z.fitted, 60);
  assert.match(z.note, /distorted by the plateau/);
});

test('zipf: maxRank still limits the fit to the head', () => {
  const freq = Array.from({ length: 100 }, (_, i) => ({ rank: i + 1, count: 5000 / (i + 1) }));
  const z = zipf(freq, 20);
  assert.equal(z.fitted, 20);
  assert.equal(z.fitMaxRank, 20);
  assert.equal(z.points.length, 100);
});
