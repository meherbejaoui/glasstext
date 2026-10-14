/**
 * Classic readability formulas.
 *
 * All six are linear (or near-linear) regressions fitted in the mid-20th
 * century against comprehension-test scores. Every one of them takes exactly
 * two kinds of input: a sentence-length term and a word-difficulty term. That
 * shared shape is the reason they usually agree, and the reason they share a
 * blind spot -- none of them can see word order, cohesion, ambiguity, or
 * whether the reader knows the vocabulary.
 *
 * The consequence, which the UI states plainly and which docs/limits.md
 * expands on: these scores describe surface form, not comprehensibility. They
 * are useful as a *rewrite signal* ("this sentence is 60 words long") and
 * misleading as a *target* (shortening words to hit a grade level can make
 * prose worse -- see Bailin & Grafstein 2016, DuBay 2004).
 *
 * Numerals. A token like "2026" is a word for the purpose of sentence length
 * but has no syllables and no letters. Scoring it as a word with zero of each
 * lets an average be dragged down by tokens the instrument cannot measure:
 * adding numbers to a sentence made Flesch Reading Ease rise (read easier) and
 * Coleman-Liau fall, while the sentence got longer. The rule used here is that
 * a missing measurement is missing, not zero: every per-word ratio is taken
 * over the words that have the property (numerator and denominator over the
 * same tokens), and every per-sentence ratio over all tokens. ARI is the
 * exception that follows the same rule, because digits *are* characters and
 * ARI counts characters. The alternative, counting numerals by how they are
 * spoken, needs a reading ("2026" is five syllables as a year and six as a
 * cardinal) that the text does not contain. See docs/limits.md.
 */

import { totalSyllables, polysyllableCount, complexWordCount } from './syllables.js';
import { isNumeral } from './tokenize.js';

/**
 * @typedef {object} Term
 * @property {string} label human-readable name of the quantity
 * @property {number} value its computed value
 * @property {string} [detail] the counts it came from, e.g. "1420 / 82"
 *
 * @typedef {object} Metric
 * @property {string} id
 * @property {string} name
 * @property {number|null} value      null when the text is too small to score
 * @property {'score'|'grade'} unit
 * @property {string} expression      the formula in symbols
 * @property {string} substituted     the formula with numbers filled in
 * @property {Term[]} terms           every input, so the arithmetic is checkable
 * @property {string} citationId      key into CITATIONS
 * @property {string} interpretation  what this value means in words
 * @property {string} [warning]       set when the text violates the formula's assumptions
 */

/** Round to `p` decimal places, returning a number. */
const r = (n, p = 2) => Number(n.toFixed(p));

/**
 * US school grade levels above which "grade" is a misleading label.
 * Grades beyond ~16 (college graduate) are extrapolation: the formulas were
 * never fitted on readers at those levels.
 */
const GRADE_CEILING = 16;

/**
 * Describe a grade-level score in plain language.
 * @param {number} g
 * @returns {string}
 */
function gradeText(g) {
  if (g < 1) return 'Below first-grade reading level on this scale.';
  if (g <= 6) return `Around US grade ${Math.round(g)} -- plain, widely accessible prose.`;
  if (g <= 9) return `Around US grade ${Math.round(g)} -- typical of newspapers and general non-fiction.`;
  if (g <= 12) return `Around US grade ${Math.round(g)} -- high-school level; demanding for a general audience.`;
  if (g <= GRADE_CEILING) return `Around US grade ${Math.round(g)} -- undergraduate level.`;
  return `Beyond grade ${GRADE_CEILING}; the formula is extrapolating past the range it was fitted on.`;
}

/**
 * Flesch's own interpretation bands for Reading Ease.
 * @param {number} s
 * @returns {string}
 */
function easeText(s) {
  if (s >= 90) return 'Very easy: short sentences, short words. Comparable to writing for young children.';
  if (s >= 80) return 'Easy: conversational English.';
  if (s >= 70) return 'Fairly easy.';
  if (s >= 60) return 'Plain English, readable by most adults. Flesch\'s recommended target for general audiences.';
  if (s >= 50) return 'Fairly difficult.';
  if (s >= 30) return 'Difficult: typical of academic and professional writing.';
  if (s >= 0) return 'Very difficult: dense sentences, long words.';
  return 'Off the bottom of the scale. The scale is unbounded below, so extreme values mean "very long sentences", not much more.';
}

/**
 * Compute all readability metrics for a segmented document.
 *
 * @param {import('./tokenize.js').segment extends (t: any) => infer R ? R : never} doc
 *   output of `segment()`
 * @returns {{metrics: Metric[], basis: object}}
 */
export function readability(doc) {
  const W = doc.wordCount;
  const S = doc.sentenceCount;
  const L = doc.letters;
  const N = doc.numerals ?? 0;
  // Words that have letters, and so syllables: the denominator of every
  // per-word property. W still measures sentence length.
  const Wa = W - N;

  if (W === 0 || S === 0) {
    return { metrics: [], basis: { words: W, sentences: S, empty: true } };
  }

  if (Wa === 0) {
    // Nothing but numerals: no formula that measures words has anything to say.
    return {
      metrics: [],
      basis: {
        words: W, sentences: S, numerals: N, alphabeticWords: 0, syllables: 0, letters: L,
        polysyllables: 0, wordsPerSentence: r(W / S), syllablesPerWord: 0, lettersPerWord: 0,
        percentPolysyllabic: 0, empty: false, numeralsOnly: true,
      },
    };
  }

  const alphabetic = N === 0 ? doc.words : doc.words.filter((w) => !isNumeral(w));
  const syl = totalSyllables(alphabetic);
  const poly = polysyllableCount(alphabetic);
  const complex = complexWordCount(alphabetic);

  const wordsPerSentence = W / S;
  const syllablesPerWord = syl / Wa;
  const lettersPerWord = L / Wa;
  const pctPoly = (poly / Wa) * 100;
  const pctComplex = (complex / Wa) * 100;

  // Formulas fitted on passages of a few hundred words behave erratically on
  // fragments. This is a statement about sample size, not about the text.
  const shortText = W < 100
    ? 'Fewer than 100 words. These formulas were fitted on passages of several hundred words; treat this score as indicative only.'
    : undefined;

  // Said once, on the formulas whose per-word terms had to leave numerals out.
  const numeralNote = N > 0
    ? `${N} numeric token${N === 1 ? '' : 's'} (digits, no letters) ${N === 1 ? 'is' : 'are'} counted as ` +
      `${N === 1 ? 'a word' : 'words'} for sentence length but left out of the per-word terms, because a ` +
      'numeral has no syllables or letters to measure. Counting it as a word with none would make the ' +
      'score read easier the more numbers the text contains.'
    : undefined;
  const warn = (...parts) => parts.filter(Boolean).join(' ') || undefined;

  const basis = {
    words: W,
    numerals: N,
    alphabeticWords: Wa,
    sentences: S,
    syllables: syl,
    letters: L,
    polysyllables: poly,
    complexWords: complex,
    wordsPerSentence: r(wordsPerSentence),
    syllablesPerWord: r(syllablesPerWord, 3),
    lettersPerWord: r(lettersPerWord, 3),
    percentPolysyllabic: r(pctPoly),
    percentComplex: r(pctComplex),
  };

  const terms = {
    wps: { label: 'words per sentence', value: r(wordsPerSentence), detail: `${W} / ${S}` },
    spw: { label: 'syllables per word', value: r(syllablesPerWord, 3), detail: `${syl} / ${Wa}` },
    lpw: { label: 'letters per word', value: r(lettersPerWord, 3), detail: `${L} / ${Wa}` },
    poly: { label: '% words of 3+ syllables', value: r(pctPoly), detail: `${poly} / ${Wa}` },
    complex: {
      label: '% complex words (3+ syllables, minus -ed/-es/-ing forms)',
      value: r(pctComplex),
      detail: `${complex} / ${Wa}`,
    },
  };

  /** @type {Metric[]} */
  const metrics = [];

  // --- Flesch Reading Ease (Flesch 1948) -----------------------------------
  const fre = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  metrics.push({
    id: 'flesch-reading-ease',
    name: 'Flesch Reading Ease',
    value: r(fre, 1),
    unit: 'score',
    expression: '206.835 − 1.015 × (words/sentences) − 84.6 × (syllables/words)',
    substituted: `206.835 − 1.015 × ${r(wordsPerSentence)} − 84.6 × ${r(syllablesPerWord, 3)}`,
    terms: [terms.wps, terms.spw],
    citationId: 'flesch1948',
    interpretation: easeText(fre),
    warning: warn(shortText, numeralNote),
  });

  // --- Flesch-Kincaid Grade Level (Kincaid et al. 1975) --------------------
  const fkg = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
  metrics.push({
    id: 'flesch-kincaid-grade',
    name: 'Flesch–Kincaid Grade Level',
    value: r(fkg, 1),
    unit: 'grade',
    expression: '0.39 × (words/sentences) + 11.8 × (syllables/words) − 15.59',
    substituted: `0.39 × ${r(wordsPerSentence)} + 11.8 × ${r(syllablesPerWord, 3)} − 15.59`,
    terms: [terms.wps, terms.spw],
    citationId: 'kincaid1975',
    interpretation: gradeText(fkg),
    warning: warn(shortText, numeralNote),
  });

  // --- Gunning Fog (Gunning 1952) -----------------------------------------
  const fog = 0.4 * (wordsPerSentence + pctComplex);
  metrics.push({
    id: 'gunning-fog',
    name: 'Gunning Fog Index',
    value: r(fog, 1),
    unit: 'grade',
    expression: '0.4 × [ (words/sentences) + 100 × (complex words/words) ]',
    substituted: `0.4 × ( ${r(wordsPerSentence)} + ${r(pctComplex)} )`,
    terms: [terms.wps, terms.complex],
    citationId: 'gunning1952',
    interpretation: `${gradeText(fog)} Complex words follow Gunning's exclusion for -ed/-es/-ing forms; his exclusions for proper nouns and familiar compounds need a name list and a familiarity list we do not have, so this still runs slightly high on name-heavy text.`,
    warning: warn(shortText, numeralNote),
  });

  // --- SMOG (McLaughlin 1969) ---------------------------------------------
  const smog = 1.0430 * Math.sqrt(poly * (30 / S)) + 3.1291;
  metrics.push({
    id: 'smog',
    name: 'SMOG Grade',
    value: r(smog, 1),
    unit: 'grade',
    expression: '1.0430 × √( polysyllables × 30/sentences ) + 3.1291',
    substituted: `1.0430 × √( ${poly} × 30/${S} ) + 3.1291`,
    terms: [
      { label: 'polysyllabic words', value: poly },
      { label: 'sentences', value: S },
    ],
    citationId: 'mclaughlin1969',
    interpretation: gradeText(smog),
    warning: S < 30
      ? `SMOG was defined for a 30-sentence sample; this text has ${S}. The result is an extrapolation, and small texts inflate it.`
      : shortText,
  });

  // --- Coleman-Liau (Coleman & Liau 1975) ---------------------------------
  const lPer100 = lettersPerWord * 100;
  const sPer100 = (S / W) * 100;
  const cli = 0.0588 * lPer100 - 0.296 * sPer100 - 15.8;
  metrics.push({
    id: 'coleman-liau',
    name: 'Coleman–Liau Index',
    value: r(cli, 1),
    unit: 'grade',
    expression: '0.0588 × L − 0.296 × S − 15.8   (L = letters per 100 words, S = sentences per 100 words)',
    substituted: `0.0588 × ${r(lPer100)} − 0.296 × ${r(sPer100)} − 15.8`,
    terms: [
      { label: 'letters per 100 words', value: r(lPer100), detail: `${L} / ${Wa} × 100` },
      { label: 'sentences per 100 words', value: r(sPer100), detail: `${S} / ${W} × 100` },
    ],
    citationId: 'coleman1975',
    interpretation: `${gradeText(cli)} Uses letters instead of syllables, so it is immune to syllable-counting error -- a useful cross-check on the four formulas above.`,
    warning: warn(shortText, numeralNote),
  });

  // --- Automated Readability Index (Senter & Smith 1967) -------------------
  // ARI counts characters, meaning letters plus digits, excluding whitespace.
  const chars = (doc.text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const ari = 4.71 * (chars / W) + 0.5 * wordsPerSentence - 21.43;
  metrics.push({
    id: 'automated-readability-index',
    name: 'Automated Readability Index',
    value: r(ari, 1),
    unit: 'grade',
    expression: '4.71 × (characters/words) + 0.5 × (words/sentences) − 21.43',
    substituted: `4.71 × ${r(chars / W, 3)} + 0.5 × ${r(wordsPerSentence)} − 21.43`,
    terms: [
      { label: 'characters per word', value: r(chars / W, 3), detail: `${chars} / ${W}` },
      terms.wps,
    ],
    citationId: 'senter1967',
    interpretation: gradeText(ari),
    warning: shortText,
  });

  return { metrics, basis };
}

/**
 * Summarise the grade-level formulas into a single band.
 *
 * Reporting a mean would imply a precision none of these formulas has, so we
 * report the range and the spread. A wide spread is informative in itself: it
 * usually means the text mixes long sentences with short words (or the
 * reverse), which is exactly where the formulas disagree.
 *
 * @param {Metric[]} metrics
 * @returns {{low: number, high: number, median: number, spread: number, note: string}|null}
 */
export function gradeConsensus(metrics) {
  const grades = metrics
    .filter((m) => m.unit === 'grade' && m.value !== null)
    .map((m) => m.value)
    .sort((a, b) => a - b);
  if (grades.length === 0) return null;

  const low = grades[0];
  const high = grades[grades.length - 1];
  const mid = Math.floor(grades.length / 2);
  const median = grades.length % 2 ? grades[mid] : (grades[mid - 1] + grades[mid]) / 2;
  const spread = r(high - low, 1);

  const note = spread > 3
    ? `The formulas disagree by ${spread} grades. That usually means sentence length and word length point in opposite directions, so no single number describes this text well.`
    : `The formulas agree to within ${spread} grades.`;

  return { low, high, median: r(median, 1), spread, note };
}
