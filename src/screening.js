/**
 * Content screening, and why it does not work the way people expect.
 *
 * This repository began as a script that sent a document to a remote API and
 * printed "Profanity alert!". This module is its descendant, rebuilt to answer
 * the question the original never asked: what does a wordlist filter actually
 * do to text?
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
 * @param {{leet?: boolean, confusables?: boolean, collapse?: boolean}} [opts]
 * @returns {{output: string, steps: NormalizeStep[]}}
 */
export function normalize(text, opts = {}) {
  const { leet = true, confusables = true, collapse = true } = opts;
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
    stage('undo leetspeak substitutions', [...cur].map((ch) => LEET[ch] ?? ch).join(''));
    // Collapse runs of *isolated* letters ("h e l l o", "s.h.o.t") only.
    // A blanket "remove separators between letters" rule would also weld
    // "hello world" into "helloworld", inventing matches that span a real word
    // boundary -- a false positive of our own making.
    stage(
      'join spaced-out letters',
      cur.replace(/(?:\p{L}[\s._\-*+]){2,}\p{L}/gu, (m) => m.replace(/[\s._\-*+]/g, '')),
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
 * Screen text against a term list in one of three modes.
 *
 * - `substring`  match anywhere. What the original Checker.py effectively did.
 *                Maximum recall, catastrophic precision.
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
    const n = normalize(searched, normalizeOpts);
    searched = n.output;
    steps = n.steps;
  }

  const haystack = mode === 'substring' ? searched.toLowerCase() : searched.toLowerCase();
  /** @type {Match[]} */
  const matches = [];

  for (const term of terms) {
    if (!term) continue;
    const pattern = mode === 'substring'
      ? new RegExp(escapeRe(term.toLowerCase()), 'g')
      : new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term.toLowerCase())}(?![\\p{L}\\p{N}])`, 'gu');

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
 * Generate evasions of a term, to demonstrate what whole-word matching misses.
 *
 * These are the standard, decades-old techniques. Showing them is the point:
 * a filter's users discover them within hours, so a filter designer who has
 * not tried them is the only person in the room who does not know.
 *
 * @param {string} term
 * @returns {Array<{technique: string, text: string}>}
 */
export function evasions(term) {
  const t = String(term).toLowerCase();
  const leetFor = { a: '4', e: '3', i: '1', o: '0', s: '$', t: '7', g: '9', b: '8' };
  const homoglyphFor = { a: 'а', e: 'е', o: 'о', c: 'с', p: 'р', x: 'х', y: 'у', i: 'і' };

  return [
    { technique: 'leetspeak', text: [...t].map((c) => leetFor[c] ?? c).join('') },
    { technique: 'Cyrillic homoglyphs', text: [...t].map((c) => homoglyphFor[c] ?? c).join('') },
    { technique: 'internal spacing', text: [...t].join(' ') },
    { technique: 'punctuation infix', text: [...t].join('.') },
    { technique: 'zero-width joiner', text: [...t].join('​') },
    { technique: 'repeated letters', text: [...t].map((c, i) => (i === 1 ? c.repeat(3) : c)).join('') },
    { technique: 'diacritics', text: t.replace(/a/g, 'á').replace(/e/g, 'é').replace(/o/g, 'ø') },
  ];
}
