/**
 * Empirical regularities of word distributions: Zipf's law and Heaps' law.
 *
 * Both are descriptive, not explanatory. Natural language obeys them, but so
 * do many processes with no linguistic content at all -- Piantadosi (2014)
 * shows that a monkey typing randomly with a space key produces a convincing
 * Zipf distribution. Fitting these curves tells you a text behaves like
 * running prose. It does not tell you the text means anything, and a good fit
 * is emphatically not evidence of quality.
 *
 * They earn their place here for two honest reasons. First, they are the
 * clearest way to *see* why type-token ratio is length-dependent: Heaps' law
 * is that dependence, drawn. Second, a badly broken fit is diagnostic -- word
 * lists, generated filler, and heavily templated text visibly depart from the
 * line.
 */

/** Round to `p` decimal places. */
const r = (n, p = 4) => Number(n.toFixed(p));

/**
 * Ordinary least-squares fit of y = m·x + c.
 * @param {number[]} xs
 * @param {number[]} ys
 * @returns {{slope: number, intercept: number, r2: number}}
 */
export function linearFit(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
    sxx += (xs[i] - meanX) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

/**
 * Fit Zipf's rank-frequency law: f(rank) ∝ rank^(−α).
 *
 * Fitted by least squares in log-log space. This is the standard quick method
 * and it is statistically sloppy -- it weights the long, noisy tail of
 * once-occurring words as heavily as the well-estimated head. Clauset et al.
 * (2009) recommend maximum likelihood instead. We use the log-log fit because
 * it is the one the reader can see on the chart, and we say so here rather
 * than quietly presenting α as authoritative.
 *
 * For English running text α is typically near 1.
 *
 * @param {Array<{count: number, rank: number}>} freq output of `frequencies()`
 * @param {number} [maxRank] limit the fit to the head of the distribution
 * @returns {{alpha: number|null, intercept: number|null, r2: number|null,
 *            points: Array<{x: number, y: number}>, fitted: number, note: string}}
 */
export function zipf(freq, maxRank = 0) {
  const used = maxRank > 0 ? freq.slice(0, maxRank) : freq;
  const points = used.map((f) => ({ x: Math.log10(f.rank), y: Math.log10(f.count) }));

  if (points.length < 5) {
    return {
      alpha: null,
      intercept: null,
      r2: null,
      points,
      fitted: points.length,
      note: 'Too few distinct words to fit a distribution.',
    };
  }

  const { slope, intercept, r2 } = linearFit(points.map((p) => p.x), points.map((p) => p.y));
  const alpha = -slope;

  let note;
  if (r2 < 0.7) {
    note =
      `Poor fit (R² = ${r(r2, 2)}). This text does not follow the usual ` +
      'rank-frequency pattern -- common for word lists, tables, and very short texts.';
  } else if (alpha < 0.7 || alpha > 1.5) {
    note =
      `α = ${r(alpha, 2)} is outside the ~0.7-1.5 band typical of English prose, ` +
      'though short texts routinely produce unusual exponents.';
  } else {
    note =
      `α = ${r(alpha, 2)}, within the range typical of English running text. ` +
      'Note that this is a weak test: many non-linguistic processes produce it too.';
  }

  // The intercept is returned so a caller can draw the *actual* fitted line
  // rather than eyeballing one through the first point.
  return { alpha: r(alpha, 3), intercept: r(intercept, 4), r2: r(r2, 3), points, fitted: points.length, note };
}

/**
 * Vocabulary growth curve and Heaps' law fit: V = K · N^β.
 *
 * Walks the text, recording how the distinct-word count grows with the running
 * total. The curve is the direct, visual explanation of why raw TTR cannot
 * compare texts of different lengths: V grows sublinearly in N, so V/N must
 * fall as N rises, for every text, regardless of how varied the writing is.
 *
 * β is typically 0.4-0.6 for English prose.
 *
 * @param {string[]} tokens normalized word list
 * @param {number} [samples] number of points on the returned curve
 * @returns {{beta: number|null, k: number|null, r2: number|null, curve: Array<{n: number, v: number}>, note: string}}
 */
export function heaps(tokens, samples = 200) {
  const n = tokens.length;
  if (n < 20) {
    return { beta: null, k: null, r2: null, curve: [], note: 'Too few words to trace vocabulary growth.' };
  }

  const seen = new Set();
  const curve = [];
  const step = Math.max(1, Math.floor(n / samples));

  for (let i = 0; i < n; i++) {
    seen.add(tokens[i]);
    if ((i + 1) % step === 0 || i === n - 1) curve.push({ n: i + 1, v: seen.size });
  }

  // Fit in log-log space, skipping the first few points where the curve is
  // dominated by the trivial "every word is new" regime.
  const usable = curve.filter((p) => p.n >= 10);
  if (usable.length < 5) {
    return { beta: null, k: null, r2: null, curve, note: 'Too few words to fit Heaps\' law.' };
  }

  const { slope, intercept, r2 } = linearFit(
    usable.map((p) => Math.log10(p.n)),
    usable.map((p) => Math.log10(p.v)),
  );

  const beta = slope;
  const k = 10 ** intercept;
  const note =
    beta >= 0.35 && beta <= 0.75
      ? `β = ${r(beta, 2)}, in the usual range for English prose. Because β < 1, ` +
        'vocabulary grows more slowly than length -- which is exactly why raw TTR ' +
        'falls as a text gets longer.'
      : `β = ${r(beta, 2)}, outside the usual 0.4-0.6 range. Short texts and ` +
        'repetitive or list-like text both push β away from typical values.';

  return { beta: r(beta, 3), k: r(k, 3), r2: r(r2, 3), curve, note };
}
