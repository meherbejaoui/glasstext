/**
 * glasstext -- a glass box for text.
 *
 * Public surface. Every export is a pure function: same input, same output,
 * no I/O, no network, no global state. That is what makes the results
 * reproducible and the library embeddable anywhere ES modules run.
 *
 * @example
 * import { analyze } from './src/index.js';
 * const profile = analyze('Some prose to measure.');
 * console.log(profile.readability.metrics[0].substituted);
 */

export { analyze, READING_WPM } from './analyze.js';
export {
  segment, sentences, words, paragraphs, normalizeWord, letterCount, graphemeCount, ABBREVIATIONS,
} from './tokenize.js';
export {
  syllables, totalSyllables, polysyllableCount, monosyllableCount, EXCEPTIONS,
} from './syllables.js';
export { readability, gradeConsensus } from './readability.js';
export {
  lexical, ttr, mattr, mtld, herdanC, frequencies, MTLD_THRESHOLD, MATTR_WINDOW,
} from './lexical.js';
export { zipf, heaps, linearFit } from './laws.js';
export { style, passiveCandidates, rhythm } from './style.js';
export {
  screen, normalize, compareModes, evasions, DEMO_TERMS, COLLATERAL, CONFUSABLES, LEET,
} from './screening.js';
export { CITATIONS, formatCitation, cite } from './citations.js';
