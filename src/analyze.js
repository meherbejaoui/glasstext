/**
 * Top-level entry point: text in, complete profile out.
 *
 * Everything is computed synchronously and locally. There is no network call
 * anywhere in this codebase, which is both a privacy property and the reason
 * the whole analysis finishes in a few milliseconds.
 */

import { segment, words as wordsOf, normalizeWord } from './tokenize.js';
import { readability, gradeConsensus } from './readability.js';
import { lexical } from './lexical.js';
import { zipf, heaps } from './laws.js';
import { style } from './style.js';
import { compareModes, DEMO_TERMS } from './screening.js';

/** @see READING_WPM, ALOUD_WPM below for provenance. */

/**
 * Analyse a document.
 *
 * @param {string} text
 * @param {{screeningTerms?: string[], mattrWindow?: number, screening?: boolean}} [opts]
 * @returns {object} full profile; every section is independently useful
 */
export function analyze(text, opts = {}) {
  const doc = segment(text);
  const tokens = doc.words.map(normalizeWord).filter(Boolean);

  const { metrics, basis } = readability(doc);
  const lex = lexical(doc, { mattrWindow: opts.mattrWindow });

  return {
    empty: doc.wordCount === 0,
    counts: {
      characters: doc.graphemes,
      charactersNoSpaces: doc.graphemes - (doc.text.match(/\s/g) ?? []).length,
      letters: doc.letters,
      words: doc.wordCount,
      sentences: doc.sentenceCount,
      paragraphs: doc.paragraphs.length,
      types: lex.types,
      readingTimeMinutes: Number((doc.wordCount / READING_WPM).toFixed(1)),
      aloudTimeMinutes: Number((doc.wordCount / ALOUD_WPM).toFixed(1)),
    },
    readability: { metrics, basis, consensus: gradeConsensus(metrics) },
    lexical: lex,
    laws: {
      zipf: zipf(lex.frequencies),
      heaps: heaps(tokens),
    },
    style: style(doc, wordsOf),
    screening: opts.screening === false
      ? null
      : compareModes(text, opts.screeningTerms ?? DEMO_TERMS),
    doc,
  };
}

/**
 * Silent reading speed, words per minute.
 *
 * 238 wpm is the mean for English non-fiction from Brysbaert's (2019)
 * meta-analysis of 190 studies (18,573 participants). Fiction is faster at
 * 260 wpm, which the paper attributes to shorter words. These are population
 * means with a wide spread -- individual readers range roughly 175-300 wpm --
 * so the estimate is a guide, not a promise.
 */
export const READING_WPM = 238;

/**
 * Reading-aloud speed, words per minute.
 *
 * 183 wpm, from the same meta-analysis (77 studies, 5,965 participants). Note
 * this is *reading aloud*, which is faster than extemporaneous speech; do not
 * use it to time a talk.
 */
export const ALOUD_WPM = 183;
