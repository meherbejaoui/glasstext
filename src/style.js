/**
 * Style heuristics: passive voice, nominalisation, hedging, sentence rhythm.
 *
 * A warning that applies to this entire file. These are pattern matches, not
 * grammar. Real passive-voice detection needs a part-of-speech tagger, and
 * even then "the door was locked" is ambiguous between a passive (someone
 * locked it) and a predicate adjective (it was in a locked state). We use
 * surface patterns because they run in a millisecond with no model download,
 * and we label every result a *candidate* because that is what it is.
 *
 * The deeper point, which the UI makes explicitly: none of these are errors.
 * Williams (1981) defends the passive whenever it puts familiar information at
 * the start of a sentence, which is often. "The vaccine was developed in
 * 1955" is better than naming a laboratory nobody has heard of. A tool that
 * reports passives as mistakes is teaching a superstition. This one reports
 * them as a distribution, for the writer to judge.
 */

/** Forms of "to be" that can head a passive construction. */
const BE = new Set([
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  "isn't", "aren't", "wasn't", "weren't",
]);

/** Adverbs and negators that may sit between the auxiliary and the participle. */
const INTERVENING = new Set([
  'not', 'never', 'always', 'often', 'sometimes', 'usually', 'rarely', 'seldom',
  'also', 'still', 'already', 'only', 'just', 'now', 'then', 'thus', 'therefore',
  'generally', 'typically', 'largely', 'widely', 'commonly', 'currently',
  'recently', 'previously', 'subsequently', 'clearly', 'obviously', 'simply',
  'merely', 'largely', 'partly', 'fully', 'completely', 'entirely', 'quickly',
]);

/**
 * Irregular past participles. Regular ones are caught by the -ed rule, so this
 * list only needs the forms that do not end in -ed.
 */
const IRREGULAR_PARTICIPLES = new Set([
  'been', 'begun', 'blown', 'broken', 'brought', 'built', 'bought', 'caught',
  'chosen', 'come', 'cost', 'cut', 'done', 'drawn', 'driven', 'drunk', 'eaten',
  'fallen', 'felt', 'fought', 'found', 'flown', 'forgotten', 'frozen', 'given',
  'gone', 'grown', 'held', 'hidden', 'hit', 'hurt', 'kept', 'known', 'laid',
  'led', 'left', 'lent', 'let', 'lost', 'made', 'meant', 'met', 'paid', 'put',
  'read', 'ridden', 'risen', 'run', 'said', 'seen', 'sold', 'sent', 'set',
  'shaken', 'shot', 'shown', 'shut', 'sung', 'sunk', 'sat', 'slept', 'spoken',
  'spent', 'split', 'spread', 'stolen', 'stuck', 'struck', 'sworn', 'swept',
  'swum', 'taken', 'taught', 'torn', 'told', 'thought', 'thrown', 'understood',
  'woken', 'worn', 'won', 'written', 'lain', 'bound', 'burnt', 'dealt', 'dug',
]);

/**
 * Suffixes that turn verbs and adjectives into abstract nouns. Williams'
 * central diagnostic: when the action of a sentence hides inside a noun, the
 * verb left over is usually weak ("make", "provide", "conduct", "is").
 */
const NOMINALISATION = /(?:tion|sion|ment|ance|ence|ity|ness|ancy|ency|ism|ure|al)s?$/;

/** Nominalisation-shaped words that are simply nouns, not hidden verbs. */
const NOT_NOMINALISATIONS = new Set([
  'nation', 'station', 'question', 'mention', 'condition', 'position', 'section',
  'function', 'option', 'portion', 'fiction', 'motion', 'notion', 'ration',
  'moment', 'element', 'document', 'instrument', 'comment', 'segment', 'cement',
  'chance', 'dance', 'distance', 'balance', 'finance', 'romance', 'science',
  'sentence', 'audience', 'experience', 'evidence', 'difference', 'reference',
  'city', 'quality', 'quantity', 'majority', 'minority', 'university', 'facility',
  'business', 'witness', 'illness', 'darkness', 'wilderness',
  'nature', 'future', 'picture', 'culture', 'structure', 'feature', 'measure',
  'figure', 'pressure', 'temperature', 'literature', 'signal', 'animal', 'total',
  'material', 'capital', 'metal', 'general', 'several', 'local', 'final', 'normal',
]);

/** Hedges and intensifiers that usually cost more than they earn. */
const HEDGES = new Set([
  'very', 'really', 'quite', 'rather', 'somewhat', 'fairly', 'pretty',
  'basically', 'essentially', 'actually', 'literally', 'virtually', 'arguably',
  'perhaps', 'maybe', 'possibly', 'probably', 'seemingly', 'apparently',
  'relatively', 'slightly', 'largely', 'mostly', 'generally', 'typically',
  'clearly', 'obviously', 'certainly', 'definitely', 'undoubtedly', 'truly',
  'simply', 'just', 'somehow', 'kind', 'sort',
]);

/**
 * Detect passive-voice candidates in a sentence.
 *
 * Pattern: a form of "be", then up to two intervening adverbs, then a word
 * that looks like a past participle. Known false positives, all real and all
 * unavoidable without a tagger:
 *   - Predicate adjectives: "the results were mixed", "she was tired".
 *   - "-ed" nouns and adjectives: "he was a talented cook".
 *   - "be" + noun ending in -ed is rare but possible.
 * Known false negatives:
 *   - Passives with "get": "the window got broken".
 *   - Participles more than two adverbs away from the auxiliary.
 *
 * @param {string[]} words words of one sentence, in order
 * @returns {Array<{index: number, auxiliary: string, participle: string}>}
 */
export function passiveCandidates(words) {
  const hits = [];
  const lower = words.map((w) => w.toLowerCase().replace(/’/g, "'"));

  for (let i = 0; i < lower.length; i++) {
    if (!BE.has(lower[i])) continue;

    for (let j = i + 1; j < Math.min(i + 4, lower.length); j++) {
      const w = lower[j];
      if (j > i + 1 && !INTERVENING.has(lower[j - 1])) break;
      if (INTERVENING.has(w)) continue;

      const looksParticiple = IRREGULAR_PARTICIPLES.has(w) || (/ed$/.test(w) && w.length > 3);
      if (looksParticiple) {
        hits.push({ index: i, auxiliary: words[i], participle: words[j] });
        break;
      }
      break;
    }
  }
  return hits;
}

/**
 * Analyse sentence-length rhythm.
 *
 * Mean length is what readability formulas use; the spread is what readers
 * feel. A text whose sentences are all 22 words long reads as monotonous even
 * though its Flesch score is unremarkable, which is a good illustration of
 * what those formulas cannot see.
 *
 * @param {string[]} sentences
 * @param {(s: string) => string[]} wordsOf tokenizer
 * @returns {object}
 */
export function rhythm(sentences, wordsOf) {
  const lengths = sentences.map((s) => wordsOf(s).length).filter((n) => n > 0);
  if (lengths.length === 0) return { count: 0, lengths: [] };

  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
  const sd = Math.sqrt(variance);
  const sorted = [...lengths].sort((a, b) => a - b);
  const median = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const longest = lengths.reduce((best, n, i) => (n > lengths[best] ? i : best), 0);

  let note;
  if (lengths.length < 4) {
    note = 'Too few sentences to say anything about rhythm.';
  } else if (sd < 4) {
    note =
      `Sentence lengths are very uniform (σ = ${sd.toFixed(1)} words). Uniform ` +
      'rhythm reads as flat regardless of how the readability score comes out.';
  } else if (sd > 14) {
    note =
      `Sentence lengths vary a lot (σ = ${sd.toFixed(1)} words). Often a good sign, ` +
      'but check that the longest sentences are deliberate rather than run-ons.';
  } else {
    note = `Sentence lengths vary normally (σ = ${sd.toFixed(1)} words).`;
  }

  return {
    count: lengths.length,
    lengths,
    mean: Number(mean.toFixed(1)),
    median,
    sd: Number(sd.toFixed(1)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    longestIndex: longest,
    longestSentence: sentences[longest],
    note,
  };
}

/**
 * Full style profile.
 *
 * @param {object} doc output of `segment()`
 * @param {(s: string) => string[]} wordsOf tokenizer
 * @returns {object}
 */
export function style(doc, wordsOf) {
  const perSentence = doc.sentences.map((s) => {
    const ws = wordsOf(s);
    return { sentence: s, words: ws, passives: passiveCandidates(ws) };
  });

  const passiveSentences = perSentence.filter((s) => s.passives.length > 0);
  const passiveTotal = perSentence.reduce((a, s) => a + s.passives.length, 0);

  const lowerWords = doc.words.map((w) => w.toLowerCase());

  const nominalisations = lowerWords.filter(
    (w) => w.length > 5 && NOMINALISATION.test(w) && !NOT_NOMINALISATIONS.has(w),
  );
  const nominalCounts = new Map();
  for (const w of nominalisations) nominalCounts.set(w, (nominalCounts.get(w) ?? 0) + 1);

  const hedges = lowerWords.filter((w) => HEDGES.has(w));
  const hedgeCounts = new Map();
  for (const w of hedges) hedgeCounts.set(w, (hedgeCounts.get(w) ?? 0) + 1);

  const adverbs = lowerWords.filter((w) => /ly$/.test(w) && w.length > 4);

  const pct = (n) => (doc.wordCount ? Number(((n / doc.wordCount) * 100).toFixed(1)) : 0);

  return {
    passive: {
      sentences: passiveSentences.length,
      total: passiveTotal,
      shareOfSentences: doc.sentenceCount
        ? Number(((passiveSentences.length / doc.sentenceCount) * 100).toFixed(1))
        : 0,
      examples: passiveSentences.slice(0, 8).map((s) => ({
        sentence: s.sentence,
        hits: s.passives,
      })),
      note:
        'Candidates, not errors. Surface patterns cannot separate a true passive ' +
        'from a predicate adjective ("the results were mixed"), and the passive ' +
        'is often the right choice. Read them; do not simply remove them.',
    },
    nominalisations: {
      count: nominalisations.length,
      percent: pct(nominalisations.length),
      top: [...nominalCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 12)
        .map(([word, count]) => ({ word, count })),
      note:
        'Abstract nouns built from verbs ("investigation", "implementation"). ' +
        'Williams\' test: if the real action of the sentence is inside one of ' +
        'these, the sentence usually shortens when you turn it back into a verb.',
    },
    hedges: {
      count: hedges.length,
      percent: pct(hedges.length),
      top: [...hedgeCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 12)
        .map(([word, count]) => ({ word, count })),
      note: 'Intensifiers and hedges. A few are fine; a cluster usually signals an unsure claim.',
    },
    adverbs: {
      count: adverbs.length,
      percent: pct(adverbs.length),
      note: '-ly adverbs. Counted for information only; there is no correct rate.',
    },
    rhythm: rhythm(doc.sentences, wordsOf),
  };
}
