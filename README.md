# glasstext

**A glass box for text.** Readability, lexical diversity, style and
content-screening metrics for English prose — computed entirely in your browser,
with every number showing its arithmetic, its source paper, and the cases where
it breaks.

🔗 **[www.meherbejaoui.com/glasstext](https://www.meherbejaoui.com/glasstext/)**

---

## Why

Text tools tend to hand you a number and stop. *Grade level: 11.4.* Where did
that come from? Which equation, whose paper, computed from what counts, and
under what circumstances is it wrong?

Almost always, you cannot tell. The number arrives with the authority of
precision and none of the substance. And often it is worse than useless: people
rewrite prose to move a score that was never measuring what they think it
measures.

glasstext is built on the opposite premise. **Every metric can be expanded to
show the exact arithmetic that produced it**, the counts that went in, the
citation it comes from, and a plain statement of its failure mode. Where a
component is a heuristic, its accuracy is *measured* and published rather than
asserted. Where a formula is being extrapolated past its design range, the tool
says so instead of quietly printing a number.

The name is the thesis: not a black box.

## What it does

| | |
| --- | --- |
| **Readability** | Flesch Reading Ease, Flesch–Kincaid, Gunning Fog, SMOG, Coleman–Liau, ARI — with a grade-range consensus that flags when the formulas disagree, and why |
| **Vocabulary** | Type-token ratio, MATTR, MTLD, Herdan's C, hapax legomena, frequency table |
| **Style** | Sentence-length rhythm and spread, passive-voice candidates, nominalisations, hedges |
| **Distribution** | Zipf rank-frequency fit and Heaps' vocabulary-growth curve, drawn as the explanation of why TTR is length-dependent |
| **Filter lab** | The Scunthorpe problem made measurable: substring vs whole-word vs normalised matching, live evasion testing, and a stage-by-stage Unicode normalisation pipeline |

Every panel teaches the concept it measures. That is the point of the project as
much as the measurement is.

## Privacy is enforced, not promised

The page ships this Content-Security-Policy:

```
connect-src 'none'
```

`fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` are blocked by the
browser itself. Not "we promise not to" — *cannot*. There is no analytics, no
telemetry, no font CDN, no third-party script, and no build step that could
smuggle one in. Sample texts are embedded in a module rather than fetched,
because fetching them would have required an exception to the rule.

Open the Network tab. After load, it stays empty.

## Honesty ledger

Things this project does that similar tools usually skip:

- **The syllable counter is measured against ground truth.** 91.98% exact,
  99.77% within ±1, scored against 117,486 words of the CMU Pronouncing
  Dictionary. Full breakdown, bias, and caveats in
  [`docs/validation.md`](docs/validation.md). Reproduce with
  `npm run validate:syllables`.
- **The formulas are cross-checked against an independent implementation.**
  Word and sentence counts match [textstat](https://github.com/textstat/textstat)
  exactly on the sample texts; score gaps are ≤1.8 and each one is explained.
  This surfaced a real discrepancy: textstat's docstring prints the Coleman–Liau
  coefficient as `0.058` where the published value is `0.0588`.
- **Known-wrong behaviour is pinned in tests**, not hidden. `"Meet me at 9 a.m.
  We can talk."` fails to split; `"the results were mixed"` is misread as
  passive. Both are asserted as-is so a future fix is visible.
- **Dale–Chall is deliberately absent** because we could not source its word
  list with confidence, and an approximation under a published formula's name
  would look authoritative while being wrong.
- **The screening panel returns no verdict.** Matching is mechanical; deciding
  is a policy question. See [`docs/limits.md`](docs/limits.md).
- **Every citation records what was actually verified** — primary source read,
  or constants cross-checked — in [`src/citations.js`](src/citations.js),
  rendered to [`REFERENCES.md`](REFERENCES.md) so the two cannot drift.

The [Learn page](https://www.meherbejaoui.com/glasstext/learn.html) is written
around the limits rather than around the features, including the most important
one: **optimising a readability score can make writing worse**, and the score is
a symptom rather than a target.

## Use it as a library

No dependencies, no build. Pure ES modules that run in browsers and Node ≥18.

```js
import { analyze } from './src/index.js';

const p = analyze('The committee approved the revised budget proposal yesterday.');

p.readability.metrics[0].value;        // 18.9
p.readability.metrics[0].substituted;  // "206.835 − 1.015 × 8 − 84.6 × 2.125"
p.readability.metrics[0].citationId;   // "flesch1948"
p.readability.metrics[0].warning;      // "Fewer than 100 words. These formulas were…"
p.lexical.mtld.note;                   // "Only 8 words. MTLD is unreliable below…"
p.style.rhythm.max;                    // 8
```

Every export is a pure function: same input, same output, no I/O, no global
state. Individual modules import cleanly on their own:

```js
import { syllables } from './src/syllables.js';
import { compareModes } from './src/screening.js';
```

## Develop

```bash
npm test                      # 101 tests, no dependencies (files live flat in test/)
npm run serve                 # http://localhost:8080
npm run validate:syllables    # score the counter against CMUdict
npm run gen:references        # regenerate REFERENCES.md from src/citations.js
node tools/cross-check.mjs    # compare against textstat (needs pip install textstat)
```

The site is static and served from the repository root — no bundler, no
framework, nothing to compile. `assets/app.js` is presentation only; all
measurement lives in `src/` and is covered by the test suite.

Deployment is a *project* Pages site sitting under the user site at
`meherbejaoui.com`, so it is served from the subpath `/glasstext/`. Every path
in the site is relative and nothing assumes a domain root, so it runs unchanged
from any prefix — the deployed subpath, or `npm run serve` locally. (It needs a
server rather than `file://`, because browsers block ES module loads over the
file protocol.) For the same reason there is deliberately no `CNAME` file:
adding one would claim a separate hostname and break the subpath.

```
src/          the library: tokenize, syllables, readability, lexical, laws, style, screening
assets/       the web UI (app.js, app.css, samples.js)
test/         node:test suite
tools/        validation and generation scripts
docs/         validation.md, limits.md
```

## Contributing

The most valuable contribution is a correction. If a number is wrong, a source
is mischaracterised, or a limitation is understated,
[open an issue](https://github.com/meherbejaoui/glasstext/issues) — that is the
kind of report this project is built to accept.

Two conventions worth knowing before submitting a change:

- **Citations live in code.** Add sources to [`src/citations.js`](src/citations.js)
  and run `npm run gen:references`; CI fails if `REFERENCES.md` is out of date.
- **Known-wrong behaviour is pinned, not hidden.** If you find a case the
  tokenizer or a heuristic gets wrong, a failing-by-design test that documents
  it is a perfectly good contribution on its own.

## Licence

Code is [GPLv3](LICENSE). Prose — the Learn page, `docs/`, and the explanatory
text in the UI — is [CC BY-NC-SA 4.0](LICENSE-CONTENT), matching the licence on
[meherbejaoui.com](https://www.meherbejaoui.com).
