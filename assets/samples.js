/**
 * Sample texts, embedded rather than fetched.
 *
 * The page sets `connect-src 'none'`, so it cannot fetch anything at runtime --
 * not even its own files. Embedding the samples keeps that guarantee absolute
 * rather than making an exception for "our own" requests.
 *
 * These are original texts written for this project, not quotations, so their
 * provenance cannot be misattributed. Each was written to sit at a different
 * point on the readability scale, which is what makes them useful for showing
 * the formulas agreeing and disagreeing.
 *
 * This module is the single source of truth: the test suite and
 * tools/cross-check.mjs import it rather than keeping parallel copies.
 */

/** @type {Record<string, {label: string, blurb: string, text: string}>} */
export const SAMPLES = {
  academic: {
    label: "Academic abstract",
    blurb: "Dense noun phrases and hedged claims.",
    text: "Contemporary approaches to automated readability assessment have increasingly\nemphasised the limitations inherent in traditional surface-level metrics,\nparticularly with respect to their insensitivity to discourse-level phenomena\nsuch as referential cohesion and rhetorical organisation. While\nsentence-length and word-length proxies demonstrate robust correlations with\ncomprehension outcomes across heterogeneous populations, these correlations\nare substantially attenuated when the evaluated materials deviate from the\nexpository prose on which the original regressions were calibrated.\n\nSubsequent investigations have demonstrated that interventions targeting\nsuperficial characteristics, such as the systematic substitution of\npolysyllabic terminology with monosyllabic alternatives, frequently produce\nnegligible improvements in measured comprehension, and may in certain\ncircumstances impair understanding by eliminating the precise terminology upon\nwhich the reader's existing schematic knowledge depends.\n",
  },
  bureaucratic: {
    label: "Bureaucratic prose",
    blurb: "Long sentences, nominalisations, buried agents.",
    text: "Notwithstanding any provision to the contrary contained elsewhere within this\nagreement, it is hereby acknowledged and agreed by and between the parties\nthat the aforementioned obligations shall be deemed to have been satisfied\nonly upon the delivery of documentation sufficient to establish, to the\nreasonable satisfaction of the receiving party, that all applicable\nprerequisites enumerated in Schedule B have been fulfilled in their entirety.\n\nIn the event that any determination is made by an appropriate regulatory\nauthority that the implementation of the aforementioned provisions constitutes\na material modification of the underlying arrangement, the parties shall\nundertake commercially reasonable efforts to effectuate such amendments as may\nbe necessary to preserve the essential economic characteristics of the\ntransaction, provided, however, that no such amendment shall be construed to\nimpose additional financial obligations upon either party without prior\nwritten authorization.\n",
  },
  plain: {
    label: "Plain narrative",
    blurb: "Short sentences, common words, concrete nouns.",
    text: "The kettle boiled at six. She poured the water, watched the steam curl up, and\ntook the cup to the window. Rain had come in the night. The street below was\ndark and slick, and a single car moved through it without much hurry.\n\nShe had lived on this street for eleven years. In that time the bakery had\nclosed, and then opened again under a new name, and then closed for good. The\ntree outside her door had grown tall enough to block the light from the corner\nlamp. Small things, all of them. But she had watched each one happen, and that\nfelt like a kind of work.\n\nHer tea went cold while she stood there. She drank it anyway. Then she washed\nthe cup, set it on the rack, and went to find her coat. The day would not wait,\nand there was bread to buy before the shop filled up.\n",
  },
  technical: {
    label: "Technical writing",
    blurb: "Precise and multisyllabic, but plainly built.",
    text: "The allocator maintains a free list per size class. When a request arrives, it\nrounds the requested size up to the nearest class and pops the head of that\nlist. If the list is empty, it requests a fresh span from the page heap and\ncarves it into equal blocks.\n\nThis design trades a small amount of internal fragmentation for a large\nreduction in search time. Because every block within a class is\ninterchangeable, allocation and deallocation are both constant time, and\nneither operation needs to inspect neighbouring blocks. The cost appears in\nmemory: a program that allocates many objects just above a class boundary will\nwaste the difference on every one of them.\n\nMeasurements on the benchmark suite showed a median allocation latency of\nforty nanoseconds, with a ninety-ninth percentile of three hundred and ten.\nThe tail is dominated by page-heap refills, which acquire a global lock.\n",
  },
};

/** Sample keys in the order the UI should offer them. */
export const SAMPLE_ORDER = ['plain', 'technical', 'academic', 'bureaucratic'];
