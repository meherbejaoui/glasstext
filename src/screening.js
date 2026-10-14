/**
 * Content screening, and why it does not work the way people expect.
 *
 * Wordlist filters are the most-reimplemented idea in text processing, and
 * almost every implementation asks the wrong question. "Does this text contain
 * a banned word?" is easy and useless. The useful question is: what does a
 * wordlist filter actually do to text?
 *
 * The answer has been known since the 1990s and gets rediscovered every few
 * years. Matching a banned substring inside a larger word produces the
 * Scunthorpe problem, named for the English town whose residents could not
 * register with AOL. Matching only whole words fixes that and immediately
 * fails against a user who types one character differently. Normalising away
 * those tricks catches the evasions and drags the false positives back in.
 *
 * You cannot have all three. This module makes that trade-off measurable
 * rather than arguable: run the same text through all three modes and watch
 * precision and recall move in opposite directions.
 *
 * Two things it deliberately refuses to do:
 *   1. Ship a real profanity list. The demonstration terms below are ordinary
 *      dictionary words chosen because they are the documented causes of
 *      famous false positives. Bring your own list if you want to screen for
 *      real; the mechanism is identical and so are the failures.
 *   2. Return a verdict. Toxicity classifiers flag African-American English
 *      at markedly higher rates (Sap et al. 2019), and character-level noise
 *      defeats production classifiers outright (Hosseini et al. 2017).
 *      A tool that prints "clean" or "unsafe" is making a claim it cannot
 *      support. This one shows you what matched, and why.
 */

/**
 * Demonstration term list.
 *
 * Every entry is an innocuous English word or fragment that has caused
 * documented over-blocking. They are here to be matched against innocent text,
 * not because they are offensive.
 */
export const DEMO_TERMS = ['hell', 'ass', 'cum', 'anal', 'sex', 'shot'];

/**
 * Innocent words each demonstration term appears inside. Used by the UI to
 * show the failure immediately, without the user having to invent examples.
 */
export const COLLATERAL = {
  hell: ['hello', 'shell', 'seashell', 'Michelle', 'Mitchell', 'shellfish'],
  ass: ['class', 'assassin', 'passage', 'assessment', 'embarrass', 'grass', 'Cassandra'],
  cum: ['circumstance', 'document', 'accumulate', 'cucumber', 'incumbent'],
  anal: ['analysis', 'analogy', 'canal', 'banal', 'analytical'],
  sex: ['Sussex', 'Essex', 'sexton', 'homosexual', 'Middlesex'],
  shot: ['shotgun', 'snapshot', 'gunshot', 'buckshot', 'earshot', 'slingshot'],
};

/** Zero-width and invisible formatting characters used to break up words. */
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿­]/g;

/**
 * Homoglyph folding: characters that render like ASCII letters but are not.
 *
 * A curated subset of the Unicode confusables data (UTS #39). The full table
 * has thousands of entries; these are the ones that matter for Latin-script
 * evasion -- Cyrillic and Greek lookalikes, plus fullwidth forms.
 */
export const CONFUSABLES = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', ѕ: 's', і: 'i', ј: 'j',
  А: 'a', В: 'b', Е: 'e', К: 'k', М: 'm', Н: 'h', О: 'o', Р: 'p', С: 'c', Т: 't',
  Х: 'x', У: 'y',
  ο: 'o', Ο: 'o', α: 'a', Α: 'a', ν: 'v', Ν: 'n', ρ: 'p', Ρ: 'p', τ: 't', Τ: 't',
  Ι: 'i', Κ: 'k', Μ: 'm', Ε: 'e', Ζ: 'z', Η: 'h', Β: 'b',
  ａ: 'a', ｂ: 'b', ｃ: 'c', ｄ: 'd', ｅ: 'e', ｆ: 'f', ｇ: 'g', ｈ: 'h', ｉ: 'i',
  ｌ: 'l', ｎ: 'n', ｏ: 'o', ｐ: 'p', ｒ: 'r', ｓ: 's', ｔ: 't', ｕ: 'u', ｘ: 'x',
  ı: 'i', ł: 'l', ø: 'o', đ: 'd', ƒ: 'f',
};

/** Digit and symbol substitutions ("leetspeak"). */
export const LEET = {
  '4': 'a', '@': 'a', '8': 'b', '(': 'c', '3': 'e', '6': 'g', '9': 'g',
  '1': 'i', '!': 'i', '|': 'i', '0': 'o', '5': 's', '$': 's', '7': 't', '+': 't',
  '2': 'z', '€': 'e', '£': 'l',
};

/**
 * @typedef {object} NormalizeStep
 * @property {string} name    what this stage does
 * @property {string} output  the text after the stage
 * @property {boolean} changed whether the stage altered anything
 */

/** Characters a word is made of; a symbol is anything else that LEET maps. */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * The options `screen()` uses for its `normalized` mode, and the pipeline the
 * UI displays. Two of the stages are lossy in a way that creates misses:
 *
 *   - `symbols: 'inner'` leaves a leet *symbol* alone when it sits at the edge
 *     of a word. "hell!" would otherwise become "helli", whose trailing "i"
 *     hides the word boundary the "!" was providing. Edge symbols are instead
 *     resolved at match time, where both readings are available.
 *   - `collapse: false` keeps repeated letters. Collapsing "hellll" gives
 *     "hel", which no term matches. The matcher instead lets each run of
 *     letters in a term match that many or more.
 *
 * `normalize()` called with no options keeps the full, canonical behaviour:
 * every leet symbol substituted, every run collapsed. That is the right thing
 * for deduplication or username uniqueness, where one canonical string matters
 * more than preserving word boundaries.
 */
export const SCREEN_NORMALIZE = Object.freeze({ symbols: 'inner', collapse: false });

/**
 * Apply the leet table. In `inner` mode a symbol (as opposed to a digit) is
 * substituted only when letters or digits sit on both sides of it.
 * @param {string} text
 * @param {'all'|'inner'} symbols
 * @returns {string}
 */
function undoLeet(text, symbols) {
  const chars = [...text];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const sub = LEET[ch];
    if (sub === undefined) {
      out += ch;
    } else if (symbols === 'inner' && !WORD_CHAR.test(ch)
      && !(WORD_CHAR.test(chars[i - 1] ?? ' ') && WORD_CHAR.test(chars[i + 1] ?? ' '))) {
      out += ch;
    } else {
      out += sub;
    }
  }
  return out;
}

/**
 * Normalise text for matching, recording each stage so the pipeline can be
 * displayed rather than trusted.
 *
 * Order matters and is not arbitrary:
 *   1. Strip invisibles first, or they block every later pattern.
 *   2. NFKC folds fullwidth and compatibility forms to their ASCII shapes.
 *   3. Homoglyph folding handles lookalikes NFKC deliberately leaves alone
 *      (Cyrillic "а" is a genuinely different letter, not a compatibility
 *      variant, so Unicode will never fold it for you).
 *   4. NFD + combining-mark removal strips diacritics.
 *   5. Leet substitution, then run-collapsing, last -- both are lossy and
 *      would corrupt the earlier stages' inputs.
 *
 * @param {string} text
 * @param {{leet?: boolean, confusables?: boolean, collapse?: boolean, symbols?: 'all'|'inner'}} [opts]
 *   `symbols` is `'all'` (default) or `'inner'`; see SCREEN_NORMALIZE.
 * @returns {{output: string, steps: NormalizeStep[]}}
 */
export function normalize(text, opts = {}) {
  const { leet = true, confusables = true, collapse = true, symbols = 'all' } = opts;
  const steps = [];
  let cur = String(text);

  const stage = (name, next) => {
    steps.push({ name, output: next, changed: next !== cur });
    cur = next;
  };

  stage('strip invisible characters', cur.replace(INVISIBLE, ''));
  stage('Unicode NFKC normalisation', cur.normalize('NFKC'));

  if (confusables) {
    stage(
      'fold homoglyphs (Cyrillic/Greek lookalikes)',
      [...cur].map((ch) => CONFUSABLES[ch] ?? ch).join(''),
    );
  }

  stage('lowercase', cur.toLowerCase());
  stage('strip diacritics', cur.normalize('NFD').replace(/\p{M}/gu, ''));

  if (leet) {
    stage(
      symbols === 'inner'
        ? 'undo leetspeak substitutions (symbols only inside words)'
        : 'undo leetspeak substitutions',
      undoLeet(cur, symbols),
    );
    // Collapse runs of *isolated* letters ("h e l l", "s.h.o.t") only. A
    // blanket "remove separators between letters" rule would also weld
    // "hello world" into "helloworld", inventing matches that span a real word
    // boundary -- a false positive of our own making.
    //
    // The run must be bounded by non-letters on both sides. Without that, the
    // pattern starts on the last letter of the preceding word and ends on the
    // first letter of the following one: "you are h e l l today" became
    // "you arehelltoday", and "Plan B or C" became "planborc".
    stage(
      'join spaced-out letters',
      cur.replace(
        /(?<![\p{L}\p{N}])(?:\p{L}[\s._\-*+]){2,}\p{L}(?![\p{L}\p{N}])/gu,
        (m) => m.replace(/[\s._\-*+]/g, ''),
      ),
    );
  }

  if (collapse) {
    stage('collapse repeated letters', cur.replace(/(\p{L})\1{2,}/gu, '$1'));
  }

  return { output: cur, steps };
}

/**
 * @typedef {object} Match
 * @property {string} term    the list entry that matched
 * @property {string} matched the text that matched it
 * @property {number} index   offset into the searched string
 * @property {boolean} wholeWord whether the match covers a complete word
 * @property {string} context surrounding characters, for display
 */

/**
 * Escape a string for literal use in a regular expression.
 * @param {string} s
 * @returns {string}
 */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * For each letter, the leet *symbols* that can stand for it ("s" -> "$").
 * Digits are excluded: they are already substituted before matching.
 * @type {Record<string, string[]>}
 */
const SYMBOLS_FOR = {};
for (const [ch, letter] of Object.entries(LEET)) {
  if (!WORD_CHAR.test(ch)) (SYMBOLS_FOR[letter] ??= []).push(ch);
}

/**
 * Build the regular expression source for a term in `normalized` mode.
 *
 * Two things the normaliser cannot safely do up front are done here, where
 * the haystack's real word boundaries are still visible:
 *
 *   - A symbol at the edge of a word was left alone, so it may be punctuation
 *     ("hell!") or a letter ("a$$"). Each letter of the term therefore
 *     accepts the symbols that can stand for it, while the boundary tests
 *     still treat a symbol as a boundary.
 *   - A run of k identical letters in the term matches k or more in the text,
 *     so "hell" matches "hellll" and "ass" matches "asssss". Collapsing the
 *     haystack instead would turn "hellll" into "hel" and lose the match.
 *     "Or more" never matches fewer, so "ass" still does not match "as".
 *
 * @param {string} term lowercased term
 * @returns {string} regex source, without lookarounds
 */
function tolerantPattern(term) {
  const chars = [...term];
  let out = '';
  for (let i = 0; i < chars.length;) {
    let j = i;
    while (j < chars.length && chars[j] === chars[i]) j++;
    const ch = chars[i];
    const n = j - i;
    if (/\p{L}/u.test(ch)) {
      const alts = SYMBOLS_FOR[ch] ?? [];
      const cls = alts.length ? `[${ch}${alts.map((a) => a.replace(/[\\\]^-]/g, '\\$&')).join('')}]` : escapeRe(ch);
      out += `${cls}${n === 1 ? '+' : `{${n},}`}`;
    } else {
      out += escapeRe(ch).repeat(n);
    }
    i = j;
  }
  return out;
}

/**
 * Screen text against a term list in one of three modes.
 *
 * - `substring`  match anywhere. The naive implementation, and the one most
 *                often shipped. Maximum recall, catastrophic precision.
 * - `word`       match only complete words. Fixes Scunthorpe; loses to "h e l l".
 * - `normalized` normalise first, then match whole words. Catches evasion;
 *                reintroduces some false positives, because normalisation
 *                collapses distinctions that were carrying meaning.
 *
 * @param {string} text
 * @param {{terms?: string[], mode?: 'substring'|'word'|'normalized', normalizeOpts?: object}} [opts]
 * @returns {{mode: string, matches: Match[], searched: string, steps: NormalizeStep[]}}
 */
export function screen(text, opts = {}) {
  const { terms = DEMO_TERMS, mode = 'substring', normalizeOpts } = opts;

  let searched = String(text);
  let steps = [];
  if (mode === 'normalized') {
    const n = normalize(searched, { ...SCREEN_NORMALIZE, ...normalizeOpts });
    searched = n.output;
    steps = n.steps;
  }

  const haystack = mode === 'substring' ? searched.toLowerCase() : searched.toLowerCase();
  /** @type {Match[]} */
  const matches = [];

  for (const term of terms) {
    if (!term) continue;
    const lower = term.toLowerCase();
    const body = mode === 'normalized' ? tolerantPattern(lower) : escapeRe(lower);
    const pattern = mode === 'substring'
      ? new RegExp(body, 'g')
      : new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'gu');

    let m;
    while ((m = pattern.exec(haystack)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      const before = haystack[start - 1];
      const after = haystack[end];
      const wholeWord = !/[\p{L}\p{N}]/u.test(before ?? ' ') && !/[\p{L}\p{N}]/u.test(after ?? ' ');

      matches.push({
        term,
        matched: searched.slice(start, end),
        index: start,
        wholeWord,
        context: searched.slice(Math.max(0, start - 24), end + 24),
      });
      if (m[0].length === 0) pattern.lastIndex++;
    }
  }

  matches.sort((a, b) => a.index - b.index);
  return { mode, matches, searched, steps };
}

/**
 * Run all three modes over the same text and quantify the trade-off.
 *
 * `collateral` counts matches that sit inside a larger word -- the Scunthorpe
 * cases. `whole` counts matches on complete words. Neither count is a verdict:
 * a whole-word match on a term list is still just a string match, and the word
 * may be a quotation, a discussion of the term, or a place name.
 *
 * @param {string} text
 * @param {string[]} [terms]
 * @returns {object}
 */
export function compareModes(text, terms = DEMO_TERMS) {
  /** @type {Array<'substring'|'word'|'normalized'>} */
  const modes = ['substring', 'word', 'normalized'];
  const results = {};

  for (const mode of modes) {
    const res = screen(text, { terms, mode });
    const collateral = res.matches.filter((m) => !m.wholeWord);
    results[mode] = {
      total: res.matches.length,
      whole: res.matches.length - collateral.length,
      collateral: collateral.length,
      collateralExamples: collateral.slice(0, 10).map((m) => m.context.trim()),
      matches: res.matches,
    };
  }

  return {
    ...results,
    summary:
      `Substring matching found ${results.substring.total} hits, of which ` +
      `${results.substring.collateral} are inside innocent words. Whole-word ` +
      `matching found ${results.word.total}. Normalising first found ` +
      `${results.normalized.total}. The gap between the first two is the ` +
      'Scunthorpe problem; the gap between the last two is evasion.',
  };
}

/**
 * Letters whose lookalike glyph is deliberately absent from CONFUSABLES.
 * CONFUSABLES is a curated subset of UTS #39, so any lookalike outside it
 * defeats the folding stage: the real table has thousands of entries and no
 * short list can be complete. Each glyph here is verified, in the tests, to
 * be missing from CONFUSABLES and untouched by NFKC.
 */
export const UNLISTED_LOOKALIKES = {
  a: 'ɑ', d: 'ԁ', g: 'ɡ', h: 'һ', k: 'κ', l: 'ӏ', m: 'м', n: 'ո', q: 'ԛ', s: 'ꜱ', u: 'υ', w: 'ԝ',
};

/**
 * @typedef {object} Evasion
 * @property {string} technique
 * @property {string} text
 * @property {'designed-for'|'independent'} family
 *   `designed-for`: some stage of `normalize()` was written to undo exactly
 *   this, and the generator draws on the same tables that stage reverses, so a
 *   catch measures internal consistency. `independent`: no stage was written
 *   for it and no table is shared, so a catch (or a miss) is evidence.
 */

/**
 * Generate evasions of a term, to demonstrate what whole-word matching misses
 * and what normalising does and does not recover.
 *
 * These are the standard, decades-old techniques. Showing them is the point:
 * a filter's users discover them within hours, so a filter designer who has
 * not tried them is the only person in the room who does not know.
 *
 * The first seven are `designed-for`: `leetspeak` and `Cyrillic homoglyphs` are
 * generated from the same tables `normalize()` reverses, and the other five are
 * undone by a stage written for exactly that. Their near-perfect catch rate is
 * therefore expected, and says the pipeline is consistent with itself. The
 * last three are `independent` -- edit-distance-one typos and lookalikes the
 * table does not list -- and are the honest test of robustness.
 *
 * @param {string} term
 * @returns {Evasion[]} only techniques that actually change the term
 */
export function evasions(term) {
  const t = String(term).toLowerCase();
  const chars = [...t];
  const leetFor = { a: '4', e: '3', i: '1', o: '0', s: '$', t: '7', g: '9', b: '8' };
  const homoglyphFor = { a: 'а', e: 'е', o: 'о', c: 'с', p: 'р', x: 'х', y: 'у', i: 'і' };

  // First adjacent pair of different letters, preferring one after the first
  // letter (first letters are the ones people keep), swapped. Always differs
  // from the term unless every letter is the same.
  const differs = (c, i) => i + 1 < chars.length && c !== chars[i + 1];
  let swapAt = chars.findIndex((c, i) => i >= 1 && differs(c, i));
  if (swapAt < 0) swapAt = chars.findIndex(differs);
  const swapped = swapAt < 0 ? chars : chars.map((c, i) => (
    i === swapAt ? chars[swapAt + 1] : i === swapAt + 1 ? chars[swapAt] : c
  ));
  // An extra letter after the second one. Chosen to differ from its neighbours,
  // since a doubled letter is an elongation, which the matcher tolerates.
  const filler = ['x', 'z', 'q'].find((f) => f !== chars[1] && f !== chars[2]);
  const inserted = chars.map((c, i) => (i === 1 ? `${c}${filler}` : c));
  const lookalike = chars.map((c) => UNLISTED_LOOKALIKES[c] ?? c);

  const designed = [
    { technique: 'leetspeak', text: chars.map((c) => leetFor[c] ?? c).join('') },
    { technique: 'Cyrillic homoglyphs', text: chars.map((c) => homoglyphFor[c] ?? c).join('') },
    { technique: 'internal spacing', text: chars.join(' ') },
    { technique: 'punctuation infix', text: chars.join('.') },
    { technique: 'zero-width joiner', text: chars.join('\u200b') },
    { technique: 'repeated letters', text: chars.map((c, i) => (i === 1 ? c.repeat(3) : c)).join('') },
    { technique: 'diacritics', text: t.replace(/a/g, 'á').replace(/e/g, 'é').replace(/o/g, 'ø') },
  ].map((e) => ({ ...e, family: 'designed-for' }));

  const independent = [
    { technique: 'adjacent swap', text: swapped.join('') },
    { technique: 'inserted letter', text: inserted.join('') },
    { technique: 'unlisted homoglyphs', text: lookalike.join('') },
  ].map((e) => ({ ...e, family: 'independent' }));

  // A technique that cannot alter this term ("cum" has no leet or accented
  // letters) produces the plain term, which is not an evasion and would only
  // flatter whole-word matching.
  return [...designed, ...independent].filter((e) => e.text !== t);
}

/** The sentence an evasion is dropped into when it is scored. */
export const EVASION_CARRIER = (text) => `you are ${text} today`;

/**
 * Score every evasion of `term` against whole-word and normalised matching.
 *
 * Evasions are scored inside a sentence, as they would appear in practice. A
 * standalone token is a friendlier test than real text: the pipeline once
 * welded "you are h e l l today" into "you arehelltoday", which a standalone
 * test cannot show.
 *
 * @param {string} term
 * @returns {Array<Evasion & {word: boolean, normalized: boolean}>}
 */
export function evasionReport(term) {
  return evasions(term).map((e) => {
    const text = EVASION_CARRIER(e.text);
    const hit = (mode) => screen(text, { terms: [term], mode }).matches.length > 0;
    return { ...e, word: hit('word'), normalized: hit('normalized') };
  });
}
