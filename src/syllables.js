/**
 * English syllable counting.
 *
 * Four of the six readability formulas here (Flesch, Flesch-Kincaid, Gunning
 * Fog, SMOG) take syllables as input, so this file's error rate propagates
 * into all of them. English orthography does not determine syllable count --
 * "wind" is one syllable, "winded" is two, and no rule derived from spelling
 * alone settles "fire", "hour", or "real". So this is a heuristic, and the
 * honest way to ship a heuristic is to measure it.
 *
 * `npm run validate:syllables` scores this counter against the CMU
 * Pronouncing Dictionary (~117k scorable words; ground truth = number of
 * stress-bearing vowel phonemes). The measured result is recorded in
 * docs/validation.md and asserted in test/syllables.test.js so it cannot
 * silently regress.
 *
 * Every rule below was added in response to a specific error cluster found in
 * that scoring run, not from intuition. The comments name the cluster and its
 * size, so a future reader can judge whether a rule still earns its place.
 */

/**
 * Words whose spelling defeats the rules entirely. Values are CMUdict counts.
 * Kept small on purpose: a large exception list is a lookup table wearing an
 * algorithm's clothes, and it does nothing for the unseen words that matter.
 */
export const EXCEPTIONS = new Map(Object.entries({
  // Final -e that is pronounced (mostly loanwords).
  simile: 3, recipe: 3, epitome: 4, hyperbole: 4, apostrophe: 4, catastrophe: 4,
  sesame: 3, karate: 3, machete: 3, adobe: 3, maybe: 2, acne: 2, anemone: 4,
  finale: 3, forte: 2, cafe: 2, naive: 2, ukulele: 4, abalone: 4, minestrone: 4,
  // -ed pronounced as its own syllable (adjectival forms).
  aged: 2, blessed: 2, cursed: 2, learned: 2, beloved: 3, wicked: 2, naked: 2,
  rugged: 2, ragged: 2, jagged: 2, crooked: 2, sacred: 2, wretched: 2,
  // Hiatus the vowel rules collapse, or diphthongs they wrongly split.
  being: 2, doing: 2, going: 2, seeing: 2, fluid: 2, ruin: 2, poem: 2, poet: 2,
  quiet: 2, diet: 2, riot: 2, science: 2, client: 2, giant: 2, liar: 2, dial: 2,
  trial: 2, denial: 3, area: 3, idea: 3, museum: 3, real: 1, really: 2,
  friend: 1, friendly: 2, business: 2, busy: 2,
  // Simply irregular.
  every: 2, everyone: 3, everything: 3, evening: 2, chocolate: 3, favorite: 3,
  different: 3, interesting: 4, comfortable: 4, vegetable: 4, wednesday: 2,
  february: 4, colonel: 2, restaurant: 3, camera: 3, family: 3, general: 3,
  several: 3, natural: 3, average: 3, beautiful: 3, temperature: 4, people: 2,
}));

/**
 * A protected vowel nucleus. Substituted for the -tion/-cial/-cious spans so
 * the hiatus rule cannot split them. Uppercase, so the lowercase-only vowel
 * patterns below never match it.
 */
const NUCLEUS = 'A';

/** A syllable break inserted between two vowels in hiatus. */
const BREAK = '-';

/**
 * Suffixes before which a preceding 'e' is silent: "abate" + "ment" is three
 * syllables, not four; "love" + "ly" is two, not three. Only applies when the
 * 'e' follows a consonant, so "agreement" and "freely" keep their vowel run.
 * (Error cluster: -ment 77, -ely 227, -ness 78.)
 */
const SILENT_E_BEFORE = /([^aeiou])e(?=(?:ment|ness|less|ful|ly|ty)s?$)/g;

/**
 * The -tion/-cial/-cious families, where two adjacent vowel letters spell a
 * single syllable: "na-tion", "spe-cial", "gor-geous", "pre-cious".
 * Matched and collapsed before HIATUS gets a chance to split them.
 */
const HIATUS_EXEMPT = /[tcsx]io(?=n)|[tc]ia(?=[ln])|[cst]iou|[gd]eou|[gd]iou|[tc]ie(?=nt)/g;

/**
 * Vowel pairs pronounced as two nuclei rather than one diphthong:
 * "ac-cor-di-on", "a-ca-de-mi-a", "ac-cru-al".
 * (Error cluster: -ian 331, -ier 366, -ion 172, plus -ia/-io/-iu/-ua ~500.)
 * Deliberately excludes "ea" and "ie", which are single far more often than
 * not ("beach", "field"); their genuine hiatus cases live in EXCEPTIONS.
 * "oe" was tried and removed: it cost 0.43 percentage points, because
 * "toe"/"foe"/"shoe" outnumber the words where it splits.
 */
const HIATUS = /ia|io|iu|eo|ua|uo|ao/g;

/**
 * Terminal 'e' is silent unless it carries a syllabic /l/ or /r/: "ta-ble",
 * "a-cre", "cen-tre". Requires a consonant before the l/r, which is what
 * separates syllabic "acre" (2) from silent "figure" (2, not 3) and "whale"
 * (1, not 2). (Error cluster: -ure 153, -ore 186, -ile 127, -ale 125.)
 */
const SYLLABIC_LE = /[^aeiou][lr]e$/;

/**
 * ...but a doubled 'l' takes a silent e after all: "belle", "gazelle" and
 * "michelle" are not "bel-le". (Error cluster: -lle 290.)
 */
const DOUBLE_LE = /lle$/;

/** Sibilants after which "-es" is a full syllable: "watches", "abolishes". */
const SIBILANT_ES = /(?:[sxz]|ch|sh|ce|ge)es$/;

/**
 * Count syllables in a single English word.
 *
 * @param {string} word a bare word; non-letters are stripped
 * @returns {number} syllable count, minimum 1 for any word containing a letter
 */
export function syllables(word) {
  const raw = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (!raw) return 0;
  if (EXCEPTIONS.has(raw)) return EXCEPTIONS.get(raw);

  const w = raw.replace(SILENT_E_BEFORE, '$1');

  const marked = w
    .replace(HIATUS_EXEMPT, (m) => m[0] + NUCLEUS)
    .replace(HIATUS, (m) => m[0] + BREAK + m[1]);

  let count = countGroups(marked);

  // Terminal silent 'e' -- but only after a consonant. A final 'e' preceded by
  // another vowel is a digraph carrying its own nucleus: "committee" is three
  // syllables, "free" is one, and subtracting there loses a real syllable.
  if (w.endsWith('e') && count > 1 && !/[aeiou]e$/.test(w)) {
    if (!SYLLABIC_LE.test(w) || DOUBLE_LE.test(w)) count--;
  }

  // Terminal "-es" / "-ed" are usually not syllables ("makes", "walked"), but
  // are after a sibilant ("watches"), after t/d ("wanted"), and after a
  // syllabic l/r ("tables", "acres", "addled").
  // 'y' counts as a consonant here, so "played" and "eyes" lose the -ed/-es
  // ("pleyed" is one syllable), while "died" and "denied" keep it.
  if (count > 1 && /[^aeiou]es$/.test(w) && !SIBILANT_ES.test(w) && !/[^aeiou][lr]es$/.test(w)) {
    count--;
  }
  if (count > 1 && /[^aeiou]ed$/.test(w) && !/[td]ed$/.test(w) && !/[^aeiou][lr]ed$/.test(w)) {
    count--;
  }

  // Syllabic consonants: the "-ism" of "prism" and the "-thm" of "rhythm" each
  // carry a vowel-less syllable that no letter marks. "-thm" is unconditional
  // (the 'm' is syllabic in "rhythm" and "algorithm" alike); "-ism" requires a
  // consonant before it, so "truism" is not double-counted.
  if (/[^aeiou]ism$/.test(w) || /thm$/.test(w)) count++;

  return Math.max(1, count);
}

/**
 * Count vowel groups. 'y' counts as a vowel except when it glides onto a
 * following vowel ("yellow" no; "happy" and "rhythm" yes). NUCLEUS counts as
 * a vowel; BREAK counts as a consonant, which is how it forces a split.
 * @param {string} w
 * @returns {number}
 */
function countGroups(w) {
  let count = 0;
  let prevVowel = false;

  for (let i = 0; i < w.length; i++) {
    const ch = w[i];
    let isVowel = ch === NUCLEUS || 'aeiou'.includes(ch);
    if (ch === 'y') isVowel = i > 0 && !(w[i + 1] && 'aeiou'.includes(w[i + 1]));

    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }
  return count;
}

/**
 * Total syllables across a list of words.
 * @param {string[]} wordList
 * @returns {number}
 */
export function totalSyllables(wordList) {
  let total = 0;
  for (const w of wordList) total += syllables(w);
  return total;
}

/**
 * Count words with three or more syllables.
 *
 * Gunning Fog calls these "complex words", SMOG calls them "polysyllables";
 * both use the same 3+ threshold. Gunning's original additionally excludes
 * proper nouns, familiar compounds, and words made three syllables by an
 * -ed/-es inflection. We do not apply those exclusions, which biases Fog
 * slightly upward. See docs/limits.md.
 *
 * @param {string[]} wordList
 * @returns {number}
 */
export function polysyllableCount(wordList) {
  let n = 0;
  for (const w of wordList) if (syllables(w) >= 3) n++;
  return n;
}

/**
 * Count single-syllable words.
 * @param {string[]} wordList
 * @returns {number}
 */
export function monosyllableCount(wordList) {
  let n = 0;
  for (const w of wordList) if (syllables(w) === 1) n++;
  return n;
}
