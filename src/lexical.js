/**
 * Lexical diversity: how much of the vocabulary is repeated.
 *
 * The naive measure is the type-token ratio (distinct words / total words),
 * and it is badly broken: TTR falls as text gets longer, because common words
 * recur no matter how varied the writing is. A 100-word note and a 10,000-word
 * essay by the same author will have wildly different TTRs. Comparing two
 * texts by TTR therefore mostly compares their lengths.
 *
 * MATTR and MTLD both exist to fix exactly that, in two different ways:
 *   - MATTR holds the window length constant and averages.
 *   - MTLD measures how many words it takes for TTR to fall to a fixed point,
 *     and averages that run length.
 *
 * Both are reported, along with plain TTR, precisely so the length artefact is
 * visible rather than hidden.
 */

import { normalizeWord } from './tokenize.js';

/** Round to `p` decimal places. */
const r = (n, p = 3) => Number(n.toFixed(p));

/**
 * The TTR threshold at which MTLD closes a "factor". McCarthy & Jarvis derived
 * 0.720 empirically as the point where TTR curves flatten out.
 */
export const MTLD_THRESHOLD = 0.720;

/** Default MATTR window, in tokens. Covington & McFall use 50 and 100. */
export const MATTR_WINDOW = 50;

/**
 * Type-token ratio.
 * @param {string[]} tokens normalized word list
 * @returns {number} distinct tokens / total tokens, in (0, 1]
 */
export function ttr(tokens) {
  if (tokens.length === 0) return 0;
  return new Set(tokens).size / tokens.length;
}

/**
 * Moving-average type-token ratio (Covington & McFall 2010).
 *
 * Averages TTR over every window of `window` consecutive tokens. Because every
 * window is the same length, the length artefact cancels: MATTR of a long text
 * is directly comparable to MATTR of a short one, provided both are at least
 * `window` tokens long.
 *
 * Implemented with a rolling frequency map, so this is O(n) rather than the
 * O(n·w) of the naive definition.
 *
 * @param {string[]} tokens normalized word list
 * @param {number} [window]
 * @returns {{value: number|null, windows: number, window: number, note?: string}}
 */
export function mattr(tokens, window = MATTR_WINDOW) {
  const n = tokens.length;
  if (n === 0) return { value: null, windows: 0, window, note: 'No words.' };
  if (n <= window) {
    return {
      value: r(ttr(tokens)),
      windows: 1,
      window: n,
      note:
        `Text is ${n} words, shorter than the ${window}-word window, so this ` +
        'is plain TTR and carries the length artefact MATTR exists to remove.',
    };
  }

  const counts = new Map();
  let types = 0;
  const add = (w) => {
    const c = counts.get(w) ?? 0;
    counts.set(w, c + 1);
    if (c === 0) types++;
  };
  const remove = (w) => {
    const c = counts.get(w);
    if (c === 1) { counts.delete(w); types--; } else { counts.set(w, c - 1); }
  };

  for (let i = 0; i < window; i++) add(tokens[i]);
  let sum = types / window;
  let windows = 1;

  for (let i = window; i < n; i++) {
    add(tokens[i]);
    remove(tokens[i - window]);
    sum += types / window;
    windows++;
  }

  return { value: r(sum / windows), windows, window };
}

/**
 * One directional MTLD pass.
 * @param {string[]} tokens
 * @param {number} threshold
 * @returns {number|null} tokens per factor, or null if no factor completed
 */
function mtldPass(tokens, threshold) {
  let factors = 0;
  let types = new Set();
  let count = 0;
  let currentTtr = 1;

  for (const t of tokens) {
    count++;
    types.add(t);
    currentTtr = types.size / count;
    if (currentTtr <= threshold) {
      factors++;
      types = new Set();
      count = 0;
      currentTtr = 1;
    }
  }

  // The trailing run is a partial factor: how far it got toward the threshold.
  if (count > 0) {
    const partial = (1 - currentTtr) / (1 - threshold);
    factors += partial;
  }

  if (factors === 0) return null;
  return tokens.length / factors;
}

/**
 * Measure of Textual Lexical Diversity (McCarthy & Jarvis 2010).
 *
 * Reads the text word by word until TTR drops to 0.720, counts that run as one
 * "factor", resets, and repeats. MTLD is the mean number of words per factor,
 * averaged over a forward and a backward pass. A higher value means the text
 * sustains new vocabulary for longer.
 *
 * Typical English prose lands roughly in the 50-120 range; the measure is
 * unstable below about 100 tokens, which is reported rather than hidden.
 *
 * @param {string[]} tokens normalized word list
 * @param {number} [threshold]
 * @returns {{value: number|null, forward: number|null, backward: number|null, note?: string}}
 */
export function mtld(tokens, threshold = MTLD_THRESHOLD) {
  if (tokens.length === 0) return { value: null, forward: null, backward: null, note: 'No words.' };

  const forward = mtldPass(tokens, threshold);
  const backward = mtldPass([...tokens].reverse(), threshold);

  if (forward === null || backward === null) {
    return {
      value: null,
      forward,
      backward,
      note:
        'TTR never fell to 0.720, so no factor completed. The text is too ' +
        'short or too varied for MTLD to be defined.',
    };
  }

  const note = tokens.length < 100
    ? `Only ${tokens.length} words. MTLD is unreliable below about 100 tokens; McCarthy & Jarvis recommend at least that.`
    : undefined;

  return { value: r((forward + backward) / 2, 1), forward: r(forward, 1), backward: r(backward, 1), note };
}

/**
 * Herdan's C, the logarithmic type-token ratio: log V / log N.
 *
 * Far less length-sensitive than raw TTR, though not fully length-invariant.
 * @param {string[]} tokens
 * @returns {number|null}
 */
export function herdanC(tokens) {
  const n = tokens.length;
  if (n < 2) return null;
  const v = new Set(tokens).size;
  if (v < 2) return null;
  return r(Math.log(v) / Math.log(n));
}

/**
 * Word frequency table, most frequent first.
 * @param {string[]} tokens
 * @returns {Array<{word: string, count: number, rank: number}>}
 */
export function frequencies(tokens) {
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word, count], i) => ({ word, count, rank: i + 1 }));
}

/**
 * Full lexical profile of a document.
 *
 * @param {{words: string[]}} doc output of `segment()`
 * @param {{mattrWindow?: number}} [opts]
 * @returns {object}
 */
export function lexical(doc, opts = {}) {
  const tokens = doc.words.map(normalizeWord).filter(Boolean);
  const freq = frequencies(tokens);
  const types = freq.length;
  const hapax = freq.filter((f) => f.count === 1).length;
  const dis = freq.filter((f) => f.count === 2).length;

  return {
    tokens: tokens.length,
    types,
    ttr: tokens.length ? r(types / tokens.length) : null,
    mattr: mattr(tokens, opts.mattrWindow ?? MATTR_WINDOW),
    mtld: mtld(tokens),
    herdanC: herdanC(tokens),
    hapax: {
      count: hapax,
      ratio: types ? r(hapax / types) : null,
      note:
        'Hapax legomena: words used exactly once. In running English text ' +
        'this is usually 40-60% of the vocabulary, a consequence of the ' +
        'frequency distribution rather than a sign of rich writing.',
    },
    disLegomena: dis,
    frequencies: freq,
  };
}
