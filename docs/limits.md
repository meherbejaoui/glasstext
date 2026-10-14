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

Heuristic, with a hand-audited abbreviation list. Measured against the UD
English Web Treebank (see [validation.md](validation.md)): it almost never
splits where it should not (precision ≈ 99%) but finds about 84% of the true
sentences on web text, so sentences read about 19% too long and scores read
harder than the text is. That figure is for informal text; accuracy on edited
prose was not measured.

Two rules depend on context because what they test is ambiguous by nature:

- **Words that are also abbreviations** (`no`, `max`, `min`, `Mar.`, `Sun.`,
  `hon`, `Al`) count as abbreviations only where the context marks them: before
  a number (`No. 5`), before a date (`Dec. 25`, `Tue. Oct. 3`), capitalised
  (`Rev.`, `Hon.`, `Co.`), lowercase (`ed.`), or after `et` (`et al.`).
- **Initials.** `F. Scott Fitzgerald` continues; `Get vitamin C. It helps.`
  ends. The next word is the only cue: a closed-class sentence opener (`It`,
  `We`, `The`) cannot be a surname, so it ends the sentence. `I` is treated as a
  pronoun unless another initial follows.

Failure modes, all pinned in `test/tokenize.test.js`:

| Input | Behaviour | Effect |
| --- | --- | --- |
| `Meet me at 9 a.m. We can talk.` | Does not split | Undercounts sentences → scores read harder |
| `It rained; we stayed in.` | Does not split | Semicolons are not boundaries |
| `See Section A. Results follow.` | Does not split | A sentence-final capital letter before a word that is not on the opener list reads as an initial |
| `i went home. it was late.` | Does not split | A period before a lowercase word is never a boundary, so lowercase text is not segmented at periods |
| `Ask Messrs. Smith and Jones.` (unlisted abbreviations: `Blvd.`, `Messrs.`) | Splits early | Overcounts sentences → scores read easier |
| Headings without terminal punctuation | Counted as their own sentence | Mitigated by segmenting per paragraph |
| Unterminated lines inside one paragraph (list items, bare lines) | Merge into the next line | About three quarters of everything missed on web text |

A real surname that happens to be on the opener list would be misjudged; the
list was chosen to avoid surnames, and the rate of this error was not measured.
The opposite error, a sentence-final letter followed by a word that is not on the
list, is pinned above.

Every per-sentence metric divides by this count, so sentence-splitting error
propagates into all six readability formulas. When two readability tools
disagree, this is usually why.

## Syllable counting

91.98% exact against CMUdict; see [validation.md](validation.md) for the full
breakdown, the improvement history, and the caveats. Bias is −0.023 syllables
per word, so syllable-based scores run very slightly kind.

## Gunning Fog still runs high on names

Gunning's original definition of a "complex word" excludes proper nouns,
familiar compound words, and verb forms made three syllables by an
`-ed`/`-es`/`-ing` inflection. We approximate the last exclusion
(`complexWordCount()` in `src/syllables.js`): a word is not complex if some
plausible stem has at most two syllables and the suffix added at most one.
There is no lemmatizer, so the stem is tried with and without a restored silent
`e`, an undoubled consonant, and `i` turned back to `y`. It can be wrong in both
directions on unusual words. We do not attempt the other two exclusions, because
each requires knowledge we do not have (a name gazetteer, a familiarity list).
Our Fog is therefore still biased upward, most visibly on text dense with names.

SMOG is unaffected: McLaughlin's definition counts every polysyllable.

## Numerals are missing data, not zero-syllable words

A token like `2026` is a word for sentence length but has no syllables and no
letters. Scoring it as a word with zero of each lets the averages be pulled
down by tokens the formulas cannot measure. Before this was handled, adding
only numbers to a sentence (the same words, `2026`, `12`, `4500`, `2027`
inserted) moved Flesch Reading Ease from 42.6 to **75.5** (reads far easier),
Flesch–Kincaid from 9.1 to **5.0** and Coleman–Liau from 14.4 to **7.7**, though
the sentences had only got longer.

The rule now: every per-word ratio is taken over the words that have the
property, and every per-sentence ratio over all tokens.

| Term | Denominator |
| --- | --- |
| words per sentence | all tokens (numerals are real, and lengthen the sentence) |
| syllables per word, letters per word, % complex words | alphabetic words only |
| sentences per 100 words (Coleman–Liau) | all tokens |
| characters per word (ARI) | all tokens, and digits count as characters, because ARI counts characters |

On the same example the formulas now read 40.6, 9.8 and 15.4: longer sentences
of the same words read slightly harder, as they should. The four affected
formulas say so in their warning; SMOG and ARI do not need to. A text of nothing
but numbers produces no scores.

The alternative, counting numerals as they are spoken, was rejected on
principle: `2026` is five syllables read as a year and six read as a cardinal,
and the text does not say which. That would be an invented measurement. The
original authors' conventions for numerals (Flesch 1948, Kincaid et al. 1975)
could not be checked for this change: the report is hosted on a site that was
unreachable from the build environment and the 1948 article is paywalled. If
they specify a spoken-form count, that is the thing to revisit.

Known gap: the tokenizer splits `3rd` into `3` and `rd`, so an ordinal adds a
numeral and a one-syllable word.

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

## Zipf fitting is least squares, not maximum likelihood

Least squares in log-log space is the fit you can see on the chart, but not the
most defensible estimator; Clauset et al. (2009) recommend maximum likelihood.
One specific flaw is fixed: the once-occurring tail is a plateau of ties at
count 1, and an unweighted fit counts every one of them as much as a head word.
In a short text they are most of the points. By default `zipf()` now fits only
words occurring at least twice (Clauset et al. also fit only above a minimum),
falling back to every word, with a note, if fewer than five repeat. The chart
still plots every word and draws the line across the fitted ranks only.

Measured on the four sample texts, that moved R² from 0.70–0.83 to 0.84–0.95
and α from 0.31–0.50 to 0.45–0.73. On a synthetic series with a steep head the
plateau pushes α the other way (1.45 against a true 1.00), so the direction of
the bias depends on the text. α is still a descriptive number, not an estimate
you would publish, and `minCount = 2` is a choice, not a derived threshold.

## Screening

`src/screening.js` deliberately does not:

- ship a real profanity list (the demo terms are ordinary dictionary fragments
  chosen because they cause documented over-blocking);
- return a verdict of any kind;
- claim its normalisation pipeline is complete. The confusables table is a
  curated subset of [UTS #39](https://www.unicode.org/reports/tr39/), covering
  Cyrillic, Greek and fullwidth lookalikes. The full table has thousands of
  entries and would be a better basis for real use.

What normalising catches and what it does not, measured in
[validation.md](validation.md): all 40 evasions its stages were written for
(leetspeak, homoglyphs, spacing, punctuation, zero-width characters, repeated
letters, diacritics), and **none** of 18 independent ones (single-letter swaps
and insertions, lookalike letters absent from the folding table). Catching
those takes fuzzy matching, which trades the miss for a flood of innocent
words. Phonetic respellings are not covered either.

Two lossy decisions are made at match time rather than in the pipeline, because
making them early destroys information. A leet symbol at the edge of a word
(`hell!`, `a$$`) may be punctuation or a letter, so it is kept and read both
ways. A letter repeated in the text (`hellll`) is not collapsed; each run in a
term matches that many or more. `normalize()` called with no options keeps the
canonical, fully collapsing behaviour, which is what you want for
deduplication or username uniqueness and not what you want for screening.

## Performance

Everything is synchronous and runs on the main thread. Analysis is linear in
document length; measured locally:

| Characters | Time |
| ---: | ---: |
| 22,500 | 20 ms |
| 90,000 | 73 ms |
| 360,000 | 296 ms |

Documents in the megabytes would want a Web Worker; nothing in the library
prevents that, since it has no DOM dependency.

### It was not always linear

Two performance bugs, both found by CI rather than by local testing.

**Segmentation was O(n²).** `isBoundary()` called `s.slice(0, i)` and
`s.slice(after)` to inspect the text around each candidate sentence terminal,
copying the entire document once per sentence. A 180 KB document spent 2.8
seconds inside `sentences()` alone. Replacing both slices with bounded
character scans made a 90 KB document 6.8× faster.

**`Intl.Segmenter` dominated the rest.** `graphemeCount()` walked every
grapheme cluster of the document to count characters. That was ~40% of total
time on Node 22 and roughly an order of magnitude worse on Node 18 and 20,
where it made the whole test suite take 35 seconds instead of 3. It now takes
`String.length` directly for pure-ASCII text, where the two provably agree, and
falls back to full segmentation otherwise.

That fast path was itself wrong on the first attempt, in a way worth recording.
It tried to detect the characters that *make* segmentation necessary —
surrogates, combining marks, joiners — and missed five cases at once: under the
`/u` flag, `[\uD800-\uDFFF]` matches only *lone* surrogates, so every
well-formed emoji took the shortcut and was miscounted, and CRLF (a single
grapheme) was not considered at all. The fix was to invert the condition:
enumerating the safe set (ASCII without CR) is far easier to get right than
enumerating the unsafe one, which would mean handling Hangul jamo, regional
indicators, variation selectors and keycap sequences correctly.

**On the test that was meant to catch this.** It asserted a wall-clock bound of
3000 ms — the wrong instrument twice over, since it fired on a loaded runner
while staying silent about the quadratic complexity it existed to guard. It now
asserts the *shape* of the curve: doubling the input must less than triple the
time. That is machine-independent and tests the property that actually matters.
`graphemeCount` is separately checked for agreement between its fast and slow
paths across emoji, combining marks, flags, skin-tone modifiers and CRLF.
