/**
 * Segmentation: text -> paragraphs -> sentences -> words -> characters.
 *
 * Every metric in this project is a ratio of counts produced here, so the
 * tokenizer is the single largest source of disagreement between tools. Two
 * implementations of "Flesch Reading Ease" differ not because they disagree
 * about Flesch's 1948 regression but because they disagree about what a
 * sentence is. We therefore make the rules explicit and testable rather than
 * burying them.
 *
 * Scope: designed for English prose. The word regex is Unicode-aware and will
 * tokenize most alphabetic scripts, but the sentence heuristics, the syllable
 * counter, and every readability formula are English-specific.
 */

/**
 * Abbreviations that end in a period without ending a sentence.
 * Kept deliberately short: each entry is a hand-audited English convention.
 * A longer list buys accuracy on formal prose and costs it on informal text.
 */
export const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'rev', 'hon', 'st', 'sr', 'jr',
  'inc', 'ltd', 'co', 'corp', 'dept', 'est', 'fig', 'vol', 'no', 'op',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun',
  'vs', 'etc', 'al', 'ca', 'cf', 'ed', 'eds', 'pp', 'approx', 'min', 'max',
  'e.g', 'i.e', 'a.m', 'p.m', 'u.s', 'u.k', 'ph.d', 'm.d', 'b.a', 'm.a',
]);

/**
 * A word: a run of letters/digits that may contain internal apostrophes or
 * hyphens. "don't" is one word; "state-of-the-art" is one word; "hello—world"
 * is two (em dash is not a hyphen).
 *
 * \p{L} covers all Unicode letters, so accented and non-Latin text survives.
 * U+2019 (right single quotation mark) is accepted because word processors
 * silently substitute it for the ASCII apostrophe.
 */
const WORD_RE = /\p{L}[\p{L}\p{N}]*(?:['’\-][\p{L}\p{N}]+)*|\p{N}+(?:[.,]\p{N}+)*/gu;

/** Characters that can terminate a sentence. */
const TERMINALS = new Set(['.', '!', '?', '…']);

/** Closing punctuation allowed to trail a terminal: he said "Stop!" (Really.) */
const CLOSERS = new Set(['"', "'", '’', '”', ')', ']', '}', '»']);

/**
 * Split text into paragraphs on blank lines.
 * @param {string} text
 * @returns {string[]} non-empty, trimmed paragraphs
 */
export function paragraphs(text) {
  return String(text)
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Split text into sentences.
 *
 * The rule: a terminal character ends a sentence unless it is (a) part of a
 * known abbreviation, (b) a decimal point between digits, (c) a single letter
 * initial such as the "J." in "J. R. R. Tolkien", or (d) not followed by
 * whitespace and something that can begin a sentence.
 *
 * Known failure modes, all of which inflate or deflate every per-sentence
 * metric downstream:
 *   - Unlisted abbreviations ("Blvd.", "Messrs.") split early.
 *   - A sentence ending in an abbreviation ("...at 9 a.m.") does not split.
 *   - Semicolon-joined independent clauses count as one sentence.
 *   - Headings and list items without terminal punctuation merge into the
 *     following paragraph. `analyze()` mitigates this by segmenting each
 *     paragraph separately.
 *
 * @param {string} text
 * @returns {string[]} trimmed, non-empty sentences
 */
export function sentences(text) {
  const s = String(text);
  const out = [];
  let start = 0;

  for (let i = 0; i < s.length; i++) {
    if (!TERMINALS.has(s[i])) continue;

    // Consume a run of terminals ("?!", "...") and any closing punctuation.
    let end = i;
    while (end + 1 < s.length && TERMINALS.has(s[end + 1])) end++;
    let after = end + 1;
    while (after < s.length && CLOSERS.has(s[after])) after++;

    if (!isBoundary(s, i, end, after)) {
      i = end;
      continue;
    }

    const chunk = s.slice(start, after).trim();
    if (chunk) out.push(chunk);
    start = after;
    i = after - 1;
  }

  const tail = s.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * Decide whether the terminal run ending at `end` closes a sentence.
 * @param {string} s full text
 * @param {number} i index of the first terminal character
 * @param {number} end index of the last terminal character in the run
 * @param {number} after index just past any trailing closing punctuation
 * @returns {boolean}
 */
function isBoundary(s, i, end, after) {
  // End of input always closes.
  if (after >= s.length) return true;

  // A terminal must be followed by whitespace. "3.5" and "e.g" fail here,
  // which is why decimals and mid-abbreviation periods survive.
  if (!/\s/.test(s[after])) return false;

  // What follows must be able to start a sentence: an opening quote/bracket,
  // a digit, or an uppercase letter. Lowercase implies we split mid-sentence.
  const rest = s.slice(after);
  const next = rest.match(/\s+(\S)/);
  if (next && !/[\p{Lu}\p{N}"'‘“(\[«—-]/u.test(next[1])) return false;

  if (s[i] === '.') {
    const before = s.slice(0, i);
    // Single-letter initial: "J. R. R. Tolkien", "F. Scott Fitzgerald".
    if (/(^|[\s("'‘“])\p{L}$/u.test(before)) return false;

    // Known abbreviation. Match the longest trailing token so that the "g" of
    // "e.g." is tested as "e.g" and not just "g".
    const token = before.match(/[\p{L}.]+$/u);
    if (token) {
      const t = token[0].toLowerCase().replace(/^\.+/, '');
      if (ABBREVIATIONS.has(t)) return false;
      const lastSegment = t.split('.').pop();
      if (lastSegment && ABBREVIATIONS.has(lastSegment) && !t.includes('.')) return false;
    }
  }

  return true;
}

/**
 * Extract words.
 * @param {string} text
 * @returns {string[]}
 */
export function words(text) {
  return String(text).match(WORD_RE) ?? [];
}

/**
 * Normalize a word for type/frequency counting: lowercase, strip surrounding
 * punctuation, fold the typographic apostrophe onto the ASCII one.
 *
 * Note what this does NOT do: it does not lemmatize. "run" and "running" are
 * two distinct types. Every lexical-diversity figure in this project is
 * therefore a diversity of surface forms, which is the convention in the MTLD
 * and MATTR literature but is worth stating aloud.
 *
 * @param {string} w
 * @returns {string}
 */
export function normalizeWord(w) {
  return String(w).toLowerCase().replace(/’/g, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu, '');
}

/**
 * Count user-perceived characters (grapheme clusters), so that an emoji with a
 * skin-tone modifier counts as one character rather than four code units.
 * Falls back to code points where Intl.Segmenter is unavailable.
 * @param {string} text
 * @returns {number}
 */
export function graphemeCount(text) {
  const s = String(text);
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    let n = 0;
    for (const _ of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)) n++;
    return n;
  }
  return [...s].length;
}

/**
 * Count letters only (no digits, spaces or punctuation). Used by Coleman-Liau
 * and the Automated Readability Index, which are character-based rather than
 * syllable-based.
 * @param {string} text
 * @returns {number}
 */
export function letterCount(text) {
  return (String(text).match(/\p{L}/gu) ?? []).length;
}

/**
 * Full segmentation of a document, computed once and passed to every metric.
 *
 * Sentences are found per paragraph so that an unterminated heading cannot
 * swallow the paragraph beneath it.
 *
 * @param {string} text
 * @returns {{
 *   text: string,
 *   paragraphs: string[],
 *   sentences: string[],
 *   words: string[],
 *   types: string[],
 *   wordCount: number,
 *   sentenceCount: number,
 *   letters: number,
 *   graphemes: number
 * }}
 */
export function segment(text) {
  const src = String(text ?? '');
  const paras = paragraphs(src);
  const sents = paras.flatMap((p) => sentences(p));
  const ws = words(src);
  const normalized = ws.map(normalizeWord).filter(Boolean);

  return {
    text: src,
    paragraphs: paras,
    sentences: sents,
    words: ws,
    types: [...new Set(normalized)],
    wordCount: ws.length,
    sentenceCount: sents.length,
    letters: letterCount(src),
    graphemes: graphemeCount(src),
  };
}
