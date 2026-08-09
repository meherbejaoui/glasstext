# Validation

Numbers in this file are measured, not claimed. Each section names the command
that reproduces it.

Last run: 2026-08-09, against `src/` at the commit that introduced this file.

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
- **The residual bias is not random.** Mean signed error is −0.028, so the
  counter runs very slightly low. Syllable-based readability scores are
  correspondingly, very slightly, too kind.
- **Initialisms are counted as words, not letters.** CMUdict pronounces `html`
  as four syllables (aitch-tee-em-ell); the heuristic says one. Those cases
  dominate the worst-error list and are arguably not errors for readability
  purposes, since a reader skims them as a unit.

A committed 4,052-word sample (`test/fixtures/cmudict-sample.json`, every 29th
entry, deterministic) enforces an accuracy floor in CI without vendoring 3.6 MB.

## Readability formulas vs textstat

    pip install textstat && node tools/cross-check.mjs

[textstat](https://github.com/textstat/textstat) is an independent Python
implementation of the same published formulas. This catches transposed terms and
mistyped coefficients; it cannot establish that either implementation is
"correct", since both apply the same equations to their own tokenizations.

On the four sample texts, **word and sentence counts match exactly**. Score
differences:

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
   amplifies any syllable-counting difference roughly 85×. A gap of 1.8 points
   on a 100-point scale corresponds to a syllable-rate difference of ~0.02.
2. **Gunning Fog** differs on the definition of a complex word. We count every
   3+ syllable word; Gunning's original excludes proper nouns, familiar
   compounds, and words made polysyllabic by inflection. Ours runs high.
3. **Coleman–Liau and ARI** differ on what counts as a character. We count
   Unicode letters (`\p{L}`) for Coleman–Liau and letters plus digits for ARI.

### A discrepancy worth recording

textstat's docstring gives the Coleman–Liau coefficient as `0.058`. The
published value (Coleman & Liau 1975) is `0.0588`. We implement the published
value. This is exactly the class of drift that cross-checking exists to surface,
and the reason `src/citations.js` records what was verified rather than only
what was cited.

## Test suite

    npm test

101 tests across tokenization, syllables, the six formulas, lexical diversity,
distribution laws, style heuristics, screening, and end-to-end analysis.

Three test groups are unusual and deliberate:

- **Pinned failure modes.** Known-wrong behaviour is asserted as-is
  (`"Meet me at 9 a.m. We can talk then."` does not split; `"the results were
  mixed"` is misread as passive). A future fix shows up as a test change rather
  than a silent behaviour shift.
- **Invariance tests.** Readability scores are asserted to be *unchanged* when a
  sentence's words are shuffled. This is the central educational claim of the
  readability panel, so it is enforced rather than merely asserted in prose.
- **Data integrity.** Every word listed as collateral damage in
  `src/screening.js` is verified to actually contain its trigger substring. This
  caught two wrong entries when first written.
