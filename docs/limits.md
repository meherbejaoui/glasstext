# Known limits

Developer-facing companion to the [Learn page](https://www.meherbejaoui.com/glasstext/learn.html#limits),
which covers the same ground for readers. This file is about implementation
behaviour: what the code does wrong, and where it is pinned in the test suite.

## Scope

English prose. The word tokenizer is Unicode-aware and will happily tokenize
Greek, Cyrillic or CJK text, but the sentence splitter, syllable counter, all
six readability formulas, and every style heuristic are English-specific. Fed
non-English text, glasstext produces confident, meaningless numbers. There is no
language detection; adding one would be a genuine improvement.

## Sentence splitting

Heuristic, with a hand-audited abbreviation list. Failure modes, all pinned in
`test/tokenize.test.js`:

| Input | Behaviour | Effect |
| --- | --- | --- |
| `Meet me at 9 a.m. We can talk.` | Does not split | Undercounts sentences → scores read harder |
| `It rained; we stayed in.` | Does not split | Semicolons are not boundaries |
| `Blvd.`, `Messrs.` (unlisted abbreviations) | Splits early | Overcounts sentences → scores read easier |
| Headings without terminal punctuation | Counted as their own sentence | Mitigated by segmenting per paragraph |

Every per-sentence metric divides by this count, so sentence-splitting error
propagates into all six readability formulas. When two readability tools
disagree, this is usually why.

## Syllable counting

91.98% exact against CMUdict; see [validation.md](validation.md) for the full
breakdown, the improvement history, and the caveats. Bias is −0.023 syllables
per word, so syllable-based scores run very slightly kind.

## Gunning Fog runs high

Gunning's original definition of a "complex word" excludes proper nouns,
familiar compound words, and words made three syllables by an `-ed`/`-es`
inflection. We apply none of those exclusions, because each requires knowledge
we do not have (a name gazetteer, a familiarity list, a morphological analyser).
Our Fog is therefore biased upward, most visibly on text dense with names.

## Dale–Chall is absent

Deliberately. It requires the Dale–Chall list of 3,000 words familiar to
fourth-graders. We could not source a copy whose provenance and licensing we
were confident about, and shipping an approximation of a word list under the
name of a published formula would produce a number that looks authoritative and
is not. Better to omit it and say why.

## Style heuristics are pattern matches

No part-of-speech tagger, so:

- **Passive voice.** Pattern is `be` + up to two adverbs + participle-shaped
  word. False positives on predicate adjectives (`the results were mixed`).
  False negatives on `get`-passives (`the window got broken`). Both pinned in
  `test/style.test.js`.
- **Nominalisations.** Suffix matching with a stop-list of ordinary nouns
  (`nation`, `question`, `moment`…). The stop-list is necessarily incomplete;
  expect occasional noise.
- **Hedges.** A closed word list. Purely indicative — there is no correct rate.

These are surfaced as *candidates* everywhere in the UI, never as errors.

## Lexical diversity measures surface forms

No lemmatizer: `run`, `runs` and `running` are three types. This is the
convention in the MTLD and MATTR literature, but it means diversity figures
partly reflect morphological richness rather than vocabulary breadth.

MTLD is unstable below ~100 tokens and returns `null` when no factor completes.
MATTR degenerates to plain TTR when the text is shorter than the window, and
says so in its `note` field.

## Zipf fitting is sloppy on purpose

Least squares in log-log space over-weights the noisy tail of hapax legomena.
Clauset et al. (2009) recommend maximum likelihood for power-law exponents. We
fit the visible line rather than the defensible one, and disclose it in both the
UI and the module docstring. Treat α as descriptive, not as an estimate you
would publish.

## Screening

`src/screening.js` deliberately does not:

- ship a real profanity list (the demo terms are ordinary dictionary fragments
  chosen because they cause documented over-blocking);
- return a verdict of any kind;
- claim its normalisation pipeline is complete. The confusables table is a
  curated subset of [UTS #39](https://www.unicode.org/reports/tr39/), covering
  Cyrillic, Greek and fullwidth lookalikes. The full table has thousands of
  entries and would be a better basis for real use.

## Performance

Everything is synchronous and runs on the main thread. Analysis is linear in
document length; measured locally:

| Characters | Time |
| ---: | ---: |
| 22,500 | 34 ms |
| 90,000 | 114 ms |
| 360,000 | 457 ms |

Documents in the megabytes would want a Web Worker; nothing in the library
prevents that, since it has no DOM dependency.

### It was not always linear

Segmentation was originally O(n²). `isBoundary()` called `s.slice(0, i)` and
`s.slice(after)` to inspect the text around each candidate sentence terminal,
copying the entire document once per sentence. A 180 KB document spent 2.8
seconds inside `sentences()` alone.

It was caught by a flaky CI failure rather than by the test that was supposed
to cover it: that test asserted a wall-clock bound of 3000 ms, which fired on a
loaded runner and said nothing about complexity. Fixing the slicing made a
90 KB document 6.8× faster.

The test now asserts the *shape* of the curve — doubling the input must less
than triple the time — which is machine-independent and actually tests the
property that matters. The lesson is worth keeping: an absolute timing
threshold is simultaneously flaky and blind.
