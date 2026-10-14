# Validation

Numbers in this file are measured, not claimed. Each section names the command
that reproduces it.

Last run: 2026-10-14 for the syllable, sentence and screening sections. The textstat
table was recorded earlier and is annotated below.

## Syllable counter vs CMUdict

    npm run validate:syllables

Ground truth is the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict).
CMUdict records a phoneme sequence per word; vowel phonemes carry a stress digit,
so the syllable count is the number of digit-bearing phonemes. Words with several
recorded pronunciations of differing length (`fire` is 1 or 2) are scored against
whichever is closest, because no speller-based heuristic could resolve them.

| Measure | Result |
| --- | --- |
| Words scored | 117,486 |
| Exact match | **91.98%** |
| Within ±1 syllable | **99.77%** |
| Mean absolute error | 0.083 |
| Mean signed error | −0.023 |

### Accuracy by true syllable count

| Syllables | Words | Exact |
| --- | ---: | ---: |
| 1 | 15,143 | 97.3% |
| 2 | 54,446 | 94.5% |
| 3 | 32,053 | 87.7% |
| 4 | 11,672 | 86.7% |
| 5 | 3,331 | 87.8% |
| 6 | 713 | 86.8% |
| 7 | 110 | 91.8% |

### Error distribution

| Predicted − actual | Words | Share |
| ---: | ---: | ---: |
| −2 or worse | 237 | 0.20% |
| −1 | 5,665 | 4.82% |
| 0 | 108,075 | 91.98% |
| +1 | 3,479 | 2.96% |
| +2 or worse | 30 | 0.03% |

### How this improved

Each step was measured, not assumed.

| Version | Exact | Change |
| --- | ---: | --- |
| First working version | 87.70% | vowel groups + silent `e` |
| +4 rules from `-1` error analysis | 90.76% | syllabic `l`/`r` before `-es`/`-ed`; sibilant `-es`; vowel hiatus outside the `-tion` family; unconditional `-thm` |
| +vowel-guarded silent `e` | 91.55% | `committee` and `free` end in a digraph, not a silent `e` |
| −`oe` from the hiatus set | **91.98%** | tried and reverted: `toe`/`foe`/`shoe` outnumber the split cases |

Long words gained most from the hiatus rules, because that is where hiatus lives:

| True syllables | First version | Now |
| --- | ---: | ---: |
| 4 | 72.9% | 86.7% |
| 5 | 65.3% | 87.8% |
| 7 | 48.1% | 91.8% |

The `oe` row is worth keeping in the record: it is a plausible-sounding rule
that made things worse, and only measurement caught it.

### Caveats

- **CMUdict is name-heavy.** It is a speech-recognition dictionary containing
  large numbers of surnames and place names, which are harder than ordinary
  vocabulary. The figure above is therefore pessimistic for running prose.
- **The residual bias is not random.** Mean signed error is −0.023, so the
  counter runs very slightly low. Syllable-based readability scores are
  correspondingly, very slightly, too kind.
- **Initialisms are counted as words, not letters.** CMUdict pronounces `html`
  as four syllables (aitch-tee-em-ell); the heuristic says one. Those cases
  dominate the worst-error list and are arguably not errors for readability
  purposes, since a reader skims them as a unit.

A committed 4,052-word sample (`test/fixtures/cmudict-sample.json`, every 29th
entry, deterministic) enforces an accuracy floor in CI without vendoring 3.6 MB.

## Sentence splitter vs UD English EWT

    npm run validate:sentences            # held-out test split
    npm run validate:sentences -- --split dev

Every readability formula divides by the sentence count, so the splitter's error
reaches all six. It is at least as large an error source as the syllable counter
above: at 18 words per sentence, the 19% sentence-length error below moves
Flesch Reading Ease by about 3.5 points (1.015 × 3.4), against about 1.9 for the
−0.023 syllable bias (84.6 × 0.023). It had no measurement until now.

Ground truth is the [Universal Dependencies English Web Treebank](https://github.com/UniversalDependencies/UD_English-EWT)
(EWT, CC BY-SA 4.0): human-annotated sentence boundaries over blogs, e-mail,
reviews, answers and newsgroup posts. It is downloaded and cached, not
vendored. Gold sentences within one paragraph are joined with a space, the
splitter segments the result, and boundaries are compared by their position in
non-whitespace characters. The last boundary of each paragraph is trivially
right and is excluded.

The heuristics were developed against the **dev** split. The **test** split was
scored on the original splitter and once on the final one.

| Measure | Test: before | Test: after | Dev: before | Dev: after |
| --- | ---: | ---: | ---: | ---: |
| Gold sentences | 2,077 | 2,077 | 2,001 | 2,001 |
| Sentences found | 1,718 (0.827×) | 1,747 (0.841×) | 1,703 (0.851×) | 1,744 (0.872×) |
| Boundary precision | 98.61% | **98.88%** | 97.59% | 97.79% |
| Boundary recall | 69.66% | **72.20%** | 74.34% | 77.70% |
| Boundary F1 | 81.65% | **83.46%** | 84.39% | 86.59% |
| Paragraphs split exactly | 77.87% | 79.16% | 77.07% | 79.87% |

What the numbers say:

- **The splitter is conservative.** It almost never splits where it should not
  (precision ≈ 99%) but finds only about 84% of the true sentences on this
  text. Every per-sentence metric therefore sees sentences about 1/0.84 ≈ 19%
  too long, and words-per-sentence terms read too high, so scores read
  *harder* than the text is.
- **Most of what is missed cannot be found by punctuation rules.** On the test
  split 249 of the 340 missed boundaries (73%) are gold sentences with no
  terminal punctuation at all: bare lines, headings, list items. Dev is the
  same (208 of 279). The rest are mostly lowercase text, where a period before
  a lowercase word is never a boundary.
- **Precision went up with recall.** The changes were: words that are also
  abbreviations (`no`, `sat`, `max`, `Mar.`) count as abbreviations only before
  a number or date; a sentence-final capital letter followed by a sentence
  opener (`vitamin C. It helps.`) is no longer an initial; dotted initial
  clusters (`J.M.`) are treated like single initials; and `?`/`!` before a
  lowercase word split unless a closing quote intervened.
- **Tried and not adopted.** Letting a sentence opener end a sentence after
  *any* abbreviation (which would fix `at 9 a.m. We can talk`) moved dev F1 by
  +0.05, one boundary, and risks `vs. The Who`. Keeping `etc` as an
  abbreviation cost 0.1. Neither effect is distinguishable from noise on this
  data, so the more conservative choice was kept.

Caveats:

- **This is web text.** EWT is informal and hostile to a heuristic splitter, so
  the recall figure is pessimistic for edited prose in the way CMUdict is for
  vocabulary. Accuracy on edited prose was **not measured**; the UD English
  treebanks with news or academic text would be the way to do it.
- The sample texts in `assets/samples.js` segment identically before and after
  (word and sentence counts match textstat exactly, as below).

## Readability formulas vs textstat

    pip install textstat && node tools/cross-check.mjs

[textstat](https://github.com/textstat/textstat) is an independent Python
implementation of the same published formulas. This catches transposed terms and
mistyped coefficients; it cannot establish that either implementation is
"correct", since both apply the same equations to their own tokenizations.

On the four sample texts, **word and sentence counts match exactly**. Score
differences, as last recorded:

| Formula | Mean abs. diff | Max |
| --- | ---: | ---: |
| Flesch–Kincaid Grade | 0.26 | 0.61 |
| SMOG | 0.25 | 0.88 |
| Coleman–Liau | 0.44 | 0.60 |
| Automated Readability Index | 0.52 | 0.69 |
| Gunning Fog | 0.70 | 1.18 |
| Flesch Reading Ease | 1.84 | 4.41 |

Sources of the residual, in order of size:

1. **Flesch Reading Ease** multiplies syllables-per-word by 84.6, so it
   amplifies any syllable-counting difference roughly 85×. The mean gap of 1.84
   points (4.41 at worst) on a 100-point scale corresponds to a syllable-rate
   difference of ~0.02 on average.
2. **Gunning Fog** differs on the definition of a complex word. Gunning's
   original excludes proper nouns, familiar compounds, and verb forms made
   polysyllabic by an `-ed`/`-es`/`-ing` inflection. We now approximate the last
   exclusion and not the other two, so ours still runs high on name-heavy text.
   **The Fog row above predates that change** and is stale: on the four sample
   texts our Fog fell by 0.6 to 1.2 (35.6 → 34.5, 42.3 → 41.1, 13.9 → 13.3; the
   plain sample is unchanged) and re-running the cross-check will move it.
3. **Coleman–Liau and ARI** differ on what counts as a character. We count
   Unicode letters (`\p{L}`) for Coleman–Liau and letters plus digits for ARI.

### Reproducing this table

The table above was recorded with a textstat release that was not written down,
which turned out to matter. Re-run on 2026-10-14 against textstat 0.7.13 and
0.7.3 it does **not** reproduce: against 0.7.13 Coleman–Liau and ARI do (0.44,
0.52), but the syllable-based rows differ by tens of points, because textstat's
own syllable counting changed between releases. This is a property of the comparison tool,
not of this repository. Of our own six scores on the sample texts, only Fog
changed between that recording and now (above); the other five are bit-identical
and word and sentence counts are unchanged. `tools/cross-check.mjs` now prints
the textstat version, so the next recording is attributable.

### A discrepancy worth recording

textstat's docstring gives the Coleman–Liau coefficient as `0.058`. The
published value (Coleman & Liau 1975) is `0.0588`. We implement the published
value. This is exactly the class of drift that cross-checking exists to surface,
and the reason `src/citations.js` records what was verified rather than only
what was cited.

## Screening vs generated evasions

    npm run validate:screening

`evasions(term)` generates variants of a term; each is dropped into a sentence
(`you are … today`) and screened. They fall into two families, and the
distinction is the point:

- **designed-for:** techniques some stage of `normalize()` was written to undo,
  generated from the same tables that stage reverses. A high catch rate
  measures the pipeline's consistency with itself.
- **independent:** edit-distance-one typos and lookalike letters absent from the
  folding table. Nothing was written for these, so this is the robustness figure.

| Family | Evasions | Whole-word catches | Normalised catches |
| --- | ---: | ---: | ---: |
| designed-for | 40 | 0 | **40** |
| independent | 18 | 0 | **0** |

(Six demo terms; techniques that cannot alter a term, such as leetspeak on
`cum`, are not counted as evasions.)

What this replaced. The earlier headline was "normalising catches 41 of 42
generated evasions", which was true only when each evasion was screened as a
bare token. Inside a sentence it caught **29 of 42**: the spaced-letter stage
had no word boundaries and welded `you are h e l l today` into
`you arehelltoday`, missing every spaced and dotted evasion. The same defect
corrupted ordinary text: `Plan B or C will work.` normalised to
`planborcwill work.`. The test that should have caught it asserted only
`caught.length >= 5` and passed with 5 of 7. Two further defects were fixed at
the same time, each reproduced first:

- a leet symbol at the edge of a word was substituted, so `hell!` became
  `helli` and stopped matching (whole-word matching found it; normalising lost
  it), as did `(hell)` and `hell+`. Edge symbols are now read both ways at
  match time, so `a$$` and `@ss` still match;
- repeated letters were collapsed to one, so `hellll` became `hel` and
  `asssss` became `as`. The matcher now accepts a letter-run of that length or
  longer instead, which cannot make `as` match `ass`.

Caveats:

- The independent family is small and hand-picked. 0 of 18 shows that the
  pipeline was not built for typos and unlisted lookalikes, not how it would do
  on the attacks a real adversary tries next.
- Phonetic respellings (`fuk`) are not in either family because they cannot be
  generated from a term without a pronunciation model.

## Test suite

    npm test

128 tests across tokenization, syllables, the six formulas, lexical diversity,
distribution laws, style heuristics, screening, and end-to-end analysis.

Three test groups are unusual and deliberate:

- **Pinned failure modes.** Known-wrong behaviour is asserted as-is
  (`"Meet me at 9 a.m. We can talk then."` does not split; `"the results were
  mixed"` is misread as passive; no pipeline stage catches a typo). A future fix
  shows up as a test change rather than a silent behaviour shift.
- **Invariance tests.** Readability scores are asserted to be *unchanged* when a
  sentence's words are shuffled. This is the central educational claim of the
  readability panel, so it is enforced rather than merely asserted in prose.
- **Data integrity.** Every word listed as collateral damage in
  `src/screening.js` is verified to actually contain its trigger substring. This
  caught two wrong entries when first written.
