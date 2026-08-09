/**
 * Single source of truth for every source this project relies on.
 *
 * The app renders these next to the metric they justify, and
 * `npm run gen:references` renders the same records into REFERENCES.md, so a
 * citation can never drift between the UI and the docs.
 *
 * Rule for this file: if a number appears anywhere in `src/`, its origin
 * appears here. If we could not verify a primary source, `verified` says so
 * and `note` explains what we actually checked.
 */

/**
 * @typedef {object} Citation
 * @property {string} id            stable key referenced from metric code
 * @property {string} authors
 * @property {number} year
 * @property {string} title
 * @property {string} source        journal, publisher or report series
 * @property {string} [locator]     volume/issue/pages or report number
 * @property {string} [url]         a stable link where one exists
 * @property {'primary'|'secondary'} verified  whether we read the original
 * @property {string} [note]        what we checked, and any discrepancy found
 */

/** @type {Record<string, Citation>} */
export const CITATIONS = {
  flesch1948: {
    id: 'flesch1948',
    authors: 'Flesch, R.',
    year: 1948,
    title: 'A new readability yardstick',
    source: 'Journal of Applied Psychology',
    locator: '32(3), 221-233',
    verified: 'secondary',
    note:
      'Constants (206.835, 1.015, 84.6) cross-checked against the textstat ' +
      'reference implementation and multiple independent restatements. The ' +
      'original 1948 article is paywalled and was not read directly.',
  },
  kincaid1975: {
    id: 'kincaid1975',
    authors: 'Kincaid, J. P., Fishburne, R. P., Rogers, R. L., & Chissom, B. S.',
    year: 1975,
    title:
      'Derivation of new readability formulas (Automated Readability Index, ' +
      'Fog Count and Flesch Reading Ease Formula) for Navy enlisted personnel',
    source: 'Naval Technical Training Command, Millington TN',
    locator: 'Research Branch Report 8-75',
    verified: 'secondary',
    note:
      'Grade-level recalibration of Flesch, commissioned by the US Navy. ' +
      'Constants (0.39, 11.8, 15.59) cross-checked against textstat.',
  },
  gunning1952: {
    id: 'gunning1952',
    authors: 'Gunning, R.',
    year: 1952,
    title: 'The Technique of Clear Writing',
    source: 'McGraw-Hill',
    verified: 'secondary',
    note:
      'Gunning excludes proper nouns, familiar compound words, and words made ' +
      'polysyllabic only by inflection. This implementation applies none of ' +
      'those exclusions, so our Fog runs slightly high. See docs/limits.md.',
  },
  mclaughlin1969: {
    id: 'mclaughlin1969',
    authors: 'McLaughlin, G. H.',
    year: 1969,
    title: 'SMOG grading: A new readability formula',
    source: 'Journal of Reading',
    locator: '12(8), 639-646',
    verified: 'secondary',
    note:
      'Designed for a 30-sentence sample (10 each from start, middle, end). ' +
      'Applying it to shorter texts, as every online calculator does, is an ' +
      'extrapolation the author did not license.',
  },
  coleman1975: {
    id: 'coleman1975',
    authors: 'Coleman, M., & Liau, T. L.',
    year: 1975,
    title: 'A computer readability formula designed for machine scoring',
    source: 'Journal of Applied Psychology',
    locator: '60(2), 283-284',
    verified: 'secondary',
    note:
      'Uses letters rather than syllables, specifically so a machine could ' +
      'score text without a pronunciation dictionary. We use the published ' +
      'coefficient 0.0588; note that textstat\'s docstring prints 0.058, an ' +
      'imprecision worth knowing about when comparing tools.',
  },
  senter1967: {
    id: 'senter1967',
    authors: 'Senter, R. J., & Smith, E. A.',
    year: 1967,
    title: 'Automated Readability Index',
    source: 'Aerospace Medical Research Laboratories, Wright-Patterson AFB',
    locator: 'AMRL-TR-66-220',
    url: 'https://apps.dtic.mil/sti/citations/AD0667273',
    verified: 'secondary',
    note: 'Constants (4.71, 0.5, 21.43) cross-checked against textstat.',
  },
  dubay2004: {
    id: 'dubay2004',
    authors: 'DuBay, W. H.',
    year: 2004,
    title: 'The Principles of Readability',
    source: 'Impact Information',
    verified: 'secondary',
    note:
      'Survey of the readability literature; the standard source for the ' +
      'observation that these formulas correlate with comprehension but do ' +
      'not measure it, and that rewriting to hit a score can hurt the reader.',
  },
  bailin2016: {
    id: 'bailin2016',
    authors: 'Bailin, A., & Grafstein, A.',
    year: 2016,
    title: 'Readability: Text and Context',
    source: 'Palgrave Macmillan',
    verified: 'secondary',
    note:
      'Book-length critique of readability formulas: sentence length and word ' +
      'length are proxies for syntactic and lexical difficulty, and optimising ' +
      'the proxy can leave the text harder to understand.',
  },
  covington2010: {
    id: 'covington2010',
    authors: 'Covington, M. A., & McFall, J. D.',
    year: 2010,
    title: 'Cutting the Gordian knot: The moving-average type-token ratio (MATTR)',
    source: 'Journal of Quantitative Linguistics',
    locator: '17(2), 94-100',
    verified: 'secondary',
    note: 'Defines MATTR; window length is a free parameter, commonly 50 or 100.',
  },
  mccarthy2010: {
    id: 'mccarthy2010',
    authors: 'McCarthy, P. M., & Jarvis, S.',
    year: 2010,
    title:
      'MTLD, vocd-D, and HD-D: A validation study of sophisticated approaches ' +
      'to lexical diversity assessment',
    source: 'Behavior Research Methods',
    locator: '42(2), 381-392',
    verified: 'secondary',
    note:
      'Defines MTLD with the 0.720 TTR factor threshold, derived empirically ' +
      'as the point where TTR curves stabilise. Bidirectional mean.',
  },
  herdan1960: {
    id: 'herdan1960',
    authors: 'Herdan, G.',
    year: 1960,
    title: 'Type-Token Mathematics: A Textbook of Mathematical Linguistics',
    source: 'Mouton',
    verified: 'secondary',
    note: "Herdan's C = log(types)/log(tokens); the logarithmic form of TTR.",
  },
  zipf1949: {
    id: 'zipf1949',
    authors: 'Zipf, G. K.',
    year: 1949,
    title: 'Human Behavior and the Principle of Least Effort',
    source: 'Addison-Wesley',
    verified: 'secondary',
    note:
      'Rank-frequency law. Later work (notably Piantadosi 2014) shows the ' +
      'law is weaker than often claimed and that many random processes ' +
      'produce it, so it is a sanity check, not evidence of meaning.',
  },
  heaps1978: {
    id: 'heaps1978',
    authors: 'Heaps, H. S.',
    year: 1978,
    title: 'Information Retrieval: Computational and Theoretical Aspects',
    source: 'Academic Press',
    verified: 'secondary',
    note:
      'Vocabulary growth V = K * N^b, with b typically 0.4-0.6 for English ' +
      'prose. Also known as Herdan\'s law.',
  },
  piantadosi2014: {
    id: 'piantadosi2014',
    authors: 'Piantadosi, S. T.',
    year: 2014,
    title: "Zipf's word frequency law in natural language: A critical review and future directions",
    source: 'Psychonomic Bulletin & Review',
    locator: '21(5), 1112-1130',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4176592/',
    verified: 'secondary',
    note:
      'Shows that Zipf-like distributions arise from processes with no ' +
      'linguistic content, so fitting one proves much less than it appears to.',
  },
  williams1981: {
    id: 'williams1981',
    authors: 'Williams, J. M.',
    year: 1981,
    title: 'Style: Ten Lessons in Clarity and Grace',
    source: 'Scott, Foresman',
    verified: 'secondary',
    note:
      'Source of the character/action principle behind the nominalisation and ' +
      'passive-voice panels: prose reads clearly when subjects name characters ' +
      'and verbs name their actions. Williams explicitly defends the passive ' +
      'where the passive puts old information first.',
  },
  brysbaert2019: {
    id: 'brysbaert2019',
    authors: 'Brysbaert, M.',
    year: 2019,
    title: 'How many words do we read per minute? A review and meta-analysis of reading rate',
    source: 'Journal of Memory and Language',
    locator: '109, 104047',
    url: 'https://biblio.ugent.be/publication/8647789',
    verified: 'secondary',
    note:
      'Source of the 238 wpm silent-reading figure (English non-fiction, 190 ' +
      'studies, 18,573 participants), 260 wpm for fiction, and 183 wpm for ' +
      'reading aloud (77 studies). Population means with wide individual spread.',
  },
  cmudict: {
    id: 'cmudict',
    authors: 'Carnegie Mellon University Speech Group',
    year: 2014,
    title: 'The CMU Pronouncing Dictionary (cmudict 0.7b)',
    source: 'Carnegie Mellon University',
    url: 'https://github.com/cmusphinx/cmudict',
    verified: 'primary',
    note:
      'Ground truth for the syllable-counter validation in docs/validation.md. ' +
      'BSD-style licence. Downloaded and scored directly; see ' +
      'tools/validate-syllables.mjs.',
  },
  unicodeTr39: {
    id: 'unicodeTr39',
    authors: 'Davis, M., & Suignard, M. (eds.)',
    year: 2023,
    title: 'Unicode Technical Standard #39: Unicode Security Mechanisms',
    source: 'The Unicode Consortium',
    url: 'https://www.unicode.org/reports/tr39/',
    verified: 'primary',
    note:
      'Defines confusable detection and skeleton mapping -- the standardised ' +
      'answer to homoglyph evasion demonstrated in the screening module.',
  },
  unicodeTr15: {
    id: 'unicodeTr15',
    authors: 'Davis, M., & Whistler, K. (eds.)',
    year: 2023,
    title: 'Unicode Standard Annex #15: Unicode Normalization Forms',
    source: 'The Unicode Consortium',
    url: 'https://www.unicode.org/reports/tr15/',
    verified: 'primary',
    note: 'NFKC/NFD, the first step of any serious text-matching pipeline.',
  },
  hosseini2017: {
    id: 'hosseini2017',
    authors: 'Hosseini, H., Kannan, S., Zhang, B., & Poovendran, R.',
    year: 2017,
    title: 'Deceiving Google\'s Perspective API built for detecting toxic comments',
    source: 'arXiv preprint',
    locator: 'arXiv:1702.08138',
    url: 'https://arxiv.org/abs/1702.08138',
    verified: 'primary',
    note:
      'Demonstrates that trivial character-level perturbations defeat a ' +
      'production toxicity classifier -- evidence that the evasion problem is ' +
      'not solved by replacing wordlists with machine learning.',
  },
  sap2019: {
    id: 'sap2019',
    authors: 'Sap, M., Card, D., Gabriel, S., Choi, Y., & Smith, N. A.',
    year: 2019,
    title: 'The risk of racial bias in hate speech detection',
    source: 'Proceedings of ACL 2019',
    locator: '1668-1678',
    url: 'https://aclanthology.org/P19-1163/',
    verified: 'primary',
    note:
      'Finds that toxicity classifiers flag African-American English at ' +
      'substantially higher rates. The central reason the screening module ' +
      'refuses to present a verdict.',
  },
  gorwa2020: {
    id: 'gorwa2020',
    authors: 'Gorwa, R., Binns, R., & Katzenbach, C.',
    year: 2020,
    title:
      'Algorithmic content moderation: Technical and political challenges in ' +
      'the automation of platform governance',
    source: 'Big Data & Society',
    locator: '7(1)',
    url: 'https://journals.sagepub.com/doi/10.1177/2053951719897945',
    verified: 'primary',
    note:
      'Situates matching and classification approaches in the wider ' +
      'governance problem: the hard part is not detection, it is deciding.',
  },
};

/**
 * Format a citation as a compact reference string.
 * @param {string} id key of {@link CITATIONS}
 * @returns {string} e.g. "Flesch, R. (1948). A new readability yardstick..."
 */
export function formatCitation(id) {
  const c = CITATIONS[id];
  if (!c) return String(id);
  const bits = [`${c.authors} (${c.year}). ${c.title}.`, c.source];
  if (c.locator) bits.push(c.locator);
  return `${bits.join(', ')}.`;
}

/**
 * Look up one or more citations.
 * @param {...string} ids
 * @returns {Citation[]}
 */
export function cite(...ids) {
  return ids.map((id) => CITATIONS[id]).filter(Boolean);
}
