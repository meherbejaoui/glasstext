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
 * Abbreviations that end in a period without ending a sentence, whatever
 * follows them. Kept deliberately short: each entry is a hand-audited English
 * convention, and every entry must not also be an ordinary word, because an
 * ordinary word in this list silently merges the sentence it ends with the
 * next one ("I said no. Then he left." is one sentence if `no` is here).
 * A longer list buys accuracy on formal prose and costs it on informal text.
 */
export const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st',
  'inc', 'ltd', 'corp', 'dept', 'est',
  'vs', 'cf', 'approx',
  'e.g', 'i.e', 'a.m', 'p.m', 'u.s', 'u.k', 'ph.d', 'm.d', 'b.a', 'm.a',
]);

/**
 * Abbreviations that are also ordinary words, so they only count as
 * abbreviations when the context says so. Each table is a separate, testable
 * claim about English rather than one more entry in a flat list.
 */

/** "No. 5", "Fig. 3", "min. 10": an abbreviation only when a number follows. */
export const BEFORE_NUMBER = new Set(['no', 'fig', 'vol', 'pp', 'op', 'min', 'max', 'ca']);

/**
 * Month and day names: "Dec. 25", "Tue. Oct. 3". An abbreviation only when a
 * digit or another date word follows. "The Sun. Moon is next." and "We met in
 * Mar. Then we left." are sentences.
 */
export const DATE_ABBREVIATIONS = new Set([
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun',
]);
const DATE_WORDS = new Set([
  ...DATE_ABBREVIATIONS,
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
]);

/** "Rev. Smith", "Hon. Justice", "Acme Co.": titles, never the lowercase word. */
const CAPITALIZED_ONLY = new Set(['hon', 'rev', 'co']);

/** "2nd ed. Oxford", "(eds.)": the abbreviation is lowercase; "Hi, Ed. Then" is a name. */
const LOWERCASE_ONLY = new Set(['ed', 'eds']);

/**
 * Closed-class words that begin sentences and are not surnames. After a
 * single-letter initial they are the one cue that separates "Vitamin C. It
 * helps." (a sentence ends) from "F. Scott Fitzgerald" (a name continues):
 * a surname never follows an initial as "It", "We" or "The" do.
 */
export const SENTENCE_STARTERS = new Set([
  'the', 'a', 'an', 'it', 'its', 'this', 'that', 'these', 'those', 'then',
  'there', 'here', 'he', 'she', 'we', 'they', 'you', 'i', 'and', 'but', 'or',
  'so', 'if', 'in', 'on', 'at', 'by', 'to', 'for', 'of', 'as', 'my', 'our',
  'your', 'his', 'her', 'their', 'what', 'when', 'where', 'who', 'why', 'how',
  'not', 'no', 'yes', 'now', 'also', 'however', 'one', 'some', 'all', 'many',
  'most', 'each', 'every', 'after', 'before', 'because', 'although', 'while',
  'since', 'until', 'with', 'without', 'from', 'thus', 'therefore', 'still',
  'yet', 'maybe', 'perhaps', 'please', 'both', 'such', 'other', 'another',
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
 * known abbreviation, (b) a decimal point between digits, (c) an initial such
 * as the "J." in "J. R. R. Tolkien" or the "J.M." in "J.M. Barrie", or (d) not
 * followed by whitespace and something that can begin a sentence.
 *
 * Two rules need context, because the thing they test is ambiguous by nature:
 *   - Words that are also abbreviations ("no", "sat", "max", "Mar") count as
 *     abbreviations only in the contexts that distinguish them: before a
 *     number or another date word (see BEFORE_NUMBER, DATE_ABBREVIATIONS).
 *   - An initial is followed by a surname ("F. Scott Fitzgerald") or ends a
 *     sentence ("Get vitamin C. It helps."). Nothing in the spelling tells
 *     them apart; the next word does. A closed-class sentence opener ("It",
 *     "We", "The") cannot be a surname, so it ends the sentence
 *     (SENTENCE_STARTERS). A real surname that is also on that list, or a
 *     sentence-final letter followed by a non-listed word ("See Section A.
 *     Results follow."), will be misjudged; both are pinned in the tests.
 *
 * Known failure modes, all of which inflate or deflate every per-sentence
 * metric downstream, and all measured by `npm run validate:sentences`:
 *   - Unlisted abbreviations ("Blvd.", "Messrs.") split early.
 *   - A sentence ending in an abbreviation ("...at 9 a.m.") does not split.
 *   - Semicolon-joined independent clauses count as one sentence.
 *   - A period followed by a lowercase word never splits, so text typed
 *     entirely in lowercase is not segmented at periods.
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
  if (!WS.test(s[after])) return false;

  // What follows must be able to start a sentence: an opening quote/bracket,
  // a digit, or an uppercase letter. Lowercase implies we split mid-sentence,
  // with one exception: "?" and "!" are never abbreviation marks, so after a
  // bare run of them ("where did you grow up? india?") a lowercase word is a
  // new sentence. Not when a closing quote intervened, which keeps dialogue
  // tags attached: "Stop!" he said.
  //
  // Scanned character by character rather than with s.slice(after).match(...).
  // Slicing here copies the remainder of the document at every sentence
  // terminal, which made segmentation quadratic: a 180 KB document spent 2.8s
  // in this function alone. See docs/limits.md.
  let k = after;
  while (k < s.length && WS.test(s[k])) k++;
  if (k >= s.length) return true;
  if (!SENTENCE_START.test(s[k])) {
    return after === end + 1 && LOWER.test(s[k]) && BANG_RUN.test(s.slice(i, end + 1));
  }

  if (s[i] === '.') {
    // Walk back over the longest run of letters and dots so the "g" of
    // "e.g." is tested as "e.g" rather than just "g". Bounded by token length,
    // so this stays linear over the whole document.
    let start = i;
    while (start > 0 && TOKEN_CHAR.test(s[start - 1])) start--;
    const raw = s.slice(start, i).replace(/^\.+/, '');

    if (raw) {
      // Initial: "J. R. R. Tolkien", "F. Scott Fitzgerald", "J.M. Barrie".
      // A single capital letter or a cluster of them, standing alone (the
      // character before is the start of the text, whitespace or an opening
      // delimiter). It is a name unless the next word is a sentence opener.
      // "I" is a pronoun far more often than an initial, so it needs a
      // following initial ("I. M. Pei") to count.
      const standsAlone = start === 0 || BEFORE_INITIAL.test(s[start - 1]);
      if (standsAlone && INITIALS.test(raw)) {
        if (nextIsInitial(s, k)) return false;
        if (raw !== 'I' && !SENTENCE_STARTERS.has(nextWord(s, k))) return false;
      }

      if (isAbbreviation(raw, s, start, k)) return false;
    }
  }

  return true;
}

/**
 * Whether `raw` (the token before a period, leading dots removed) is an
 * abbreviation in this context.
 * @param {string} raw token as written
 * @param {string} s full text
 * @param {number} start index where the token begins
 * @param {number} k index of the first non-whitespace character after the period
 * @returns {boolean}
 */
function isAbbreviation(raw, s, start, k) {
  const t = raw.toLowerCase();
  if (ABBREVIATIONS.has(t)) return true;
  if (BEFORE_NUMBER.has(t)) return startsWithDigit(s, k);
  if (DATE_ABBREVIATIONS.has(t)) return startsWithDigit(s, k) || DATE_WORDS.has(nextWord(s, k));
  if (CAPITALIZED_ONLY.has(t)) return UPPER.test(raw[0]);
  if (LOWERCASE_ONLY.has(t)) return LOWER.test(raw[0]);
  if (t === 'al') return followsEt(s, start);
  return false;
}

/** Index of the first character after any opening quotes or brackets from `k`. */
function skipOpeners(s, k) {
  while (k < s.length && OPENER.test(s[k])) k++;
  return k;
}

/** Whether the next token starts with a digit ("Fig. 3", "Dec. 25"). */
function startsWithDigit(s, k) {
  const j = skipOpeners(s, k);
  return j < s.length && DIGIT.test(s[j]);
}

/** The next word, lowercased: letters only, so a digit or symbol yields "". */
function nextWord(s, k) {
  const j = skipOpeners(s, k);
  let e = j;
  while (e < s.length && LETTER.test(s[e])) e++;
  return s.slice(j, e).toLowerCase();
}

/** Whether the next token is itself an initial: one capital letter and a period. */
function nextIsInitial(s, k) {
  const j = skipOpeners(s, k);
  return j + 1 < s.length && UPPER.test(s[j]) && s[j + 1] === '.';
}

/** "et al.": 'al' is an abbreviation only after 'et', otherwise it is a name. */
function followsEt(s, start) {
  let j = start - 1;
  while (j >= 0 && s[j] === ' ') j--;
  return j >= 1 && s.slice(j - 1, j + 1).toLowerCase() === 'et' && (j === 1 || !LETTER.test(s[j - 2]));
}

/**
 * Single-character tests, hoisted so they are compiled once rather than on
 * every call. None carry the /g flag, so none hold `lastIndex` state.
 */
const WS = /\s/;
const LETTER = /\p{L}/u;
const TOKEN_CHAR = /[\p{L}.]/u;
const SENTENCE_START = /[\p{Lu}\p{N}"'‘“(\[«—-]/u;
const BEFORE_INITIAL = /[\s("'‘“]/u;
const UPPER = /\p{Lu}/u;
const LOWER = /\p{Ll}/u;
const DIGIT = /\p{N}/u;
const OPENER = /["'‘“(\[«]/u;
/** A run made only of "?" and "!": the terminals that are never abbreviation marks. */
const BANG_RUN = /^[?!]+$/;
/** One capital letter, or a cluster of dotted ones ("J", "J.M", "W.H.S"). */
const INITIALS = /^\p{Lu}(?:\.\p{Lu})*$/u;

/**
 * Extract words.
 * @param {string} text
 * @returns {string[]}
 */
export function words(text) {
  return String(text).match(WORD_RE) ?? [];
}

/**
 * Whether a token from `words()` is a numeral: digits with optional internal
 * decimal or thousands separators ("2026", "3.14", "1,000").
 *
 * A numeral is a token with no letters and, as far as the readability
 * formulas are concerned, no syllables. See `readability()` for how that is
 * handled; the short version is that it is missing data, not a zero.
 *
 * @param {string} token
 * @returns {boolean}
 */
export function isNumeral(token) {
  return NUMERAL_RE.test(token);
}

const NUMERAL_RE = /^\p{N}+(?:[.,]\p{N}+)*$/u;

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

  // Fast path for pure ASCII, where every code unit is provably its own
  // grapheme and the count is just the length.
  //
  // The condition is deliberately conservative rather than clever. An earlier
  // attempt tried to detect the *interesting* characters -- surrogates,
  // combining marks, joiners -- and got it wrong in five ways at once: under
  // the /u flag `[\uD800-\uDFFF]` matches only *lone* surrogates, so every
  // well-formed emoji slipped through, and CRLF (a single grapheme) was not
  // considered at all. Enumerating everything that makes a grapheme cluster
  // non-trivial means enumerating Hangul jamo, regional indicators, variation
  // selectors and keycaps correctly; getting the safe set right is far easier
  // than getting the unsafe set right.
  //
  // CR is excluded because "\r\n" is one grapheme, not two.
  //
  // This matters: Intl.Segmenter was ~40% of total analysis time on modern V8
  // and roughly an order of magnitude worse on Node 18/20, where it made the
  // test suite take 35s instead of 3s.
  if (PURE_ASCII.test(s)) return s.length;

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    let n = 0;
    for (const _ of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)) n++;
    return n;
  }
  return [...s].length;
}

/**
 * ASCII without carriage return. Within this set, grapheme clusters and code
 * units correspond exactly, so `String.length` is the right answer.
 */
const PURE_ASCII = /^[\n\t\x20-\x7E]*$/;

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
 *   numerals: number,
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
    numerals: ws.filter(isNumeral).length,
    sentenceCount: sents.length,
    letters: letterCount(src),
    graphemes: graphemeCount(src),
  };
}
