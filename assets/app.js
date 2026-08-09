/**
 * glasstext -- browser UI.
 *
 * This file is presentation only. Every number it displays comes from the
 * pure functions in ../src/, which have no DOM dependency and are covered by
 * the test suite. Keeping the split strict is what lets the same library run
 * in Node, in a build script, or in someone else's page.
 *
 * Rendering rule: user text is never interpolated into innerHTML without
 * passing through esc(). The input is arbitrary text from the clipboard, and
 * the tool exists to be pointed at hostile strings.
 */

import { analyze } from '../src/analyze.js';
import { CITATIONS, formatCitation } from '../src/citations.js';
import { screen, normalize, evasions, DEMO_TERMS, COLLATERAL } from '../src/screening.js';
import { words as wordsOf } from '../src/tokenize.js';
import { SAMPLES, SAMPLE_ORDER } from './samples.js';

// ------------------------------------------------------------------ helpers

/**
 * Escape text for safe interpolation into HTML.
 * @param {unknown} s
 * @returns {string}
 */
const esc = (s) => String(s)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

/** @param {string} sel @returns {HTMLElement} */
const $ = (sel) => document.querySelector(sel);

/**
 * Trailing debounce.
 * @template {(...a: any[]) => void} F
 * @param {F} fn
 * @param {number} ms
 * @returns {F}
 */
function debounce(fn, ms) {
  let t;
  return /** @type {F} */ ((...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  });
}

/** Format a number for display, or an em dash when absent. */
const num = (n, digits = 1) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toFixed(digits);

/**
 * Render a citation block.
 * @param {string} id
 * @returns {string} HTML
 */
function citationHtml(id) {
  const c = CITATIONS[id];
  if (!c) return '';
  const link = c.url ? ` <a href="${esc(c.url)}" rel="noopener">link</a>` : '';
  const badge = c.verified === 'primary' ? 'source read' : 'cross-checked';
  return `<div class="cite">${esc(formatCitation(id))}${link}
    <span class="verified" title="${esc(c.note)}">${badge}</span>
    <div class="cite-note">${esc(c.note)}</div></div>`;
}

// ------------------------------------------------------------------- charts

/**
 * Build an SVG scatter plot with an optional fitted line.
 * All charts are hand-built SVG: no chart library, so nothing to download.
 *
 * @param {{points: Array<{x:number,y:number}>, fit?: {slope:number,intercept:number},
 *          xLabel: string, yLabel: string, width?: number, height?: number}} cfg
 * @returns {string} SVG markup
 */
function scatterSvg({ points, fit, xLabel, yLabel, width = 560, height = 260 }) {
  if (!points.length) return '';
  const pad = { l: 46, r: 14, t: 12, b: 34 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs) || 1;
  const y0 = Math.min(0, ...ys);
  const y1 = Math.max(...ys) || 1;

  const sx = (x) => pad.l + ((x - x0) / (x1 - x0 || 1)) * w;
  const sy = (y) => pad.t + h - ((y - y0) / (y1 - y0 || 1)) * h;

  const dots = points
    .map((p) => `<circle class="dot" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2.4"/>`)
    .join('');

  let fitLine = '';
  if (fit) {
    const fy0 = fit.slope * x0 + fit.intercept;
    const fy1 = fit.slope * x1 + fit.intercept;
    fitLine = `<line class="fit" x1="${sx(x0)}" y1="${sy(fy0)}" x2="${sx(x1)}" y2="${sy(fy1)}"/>`;
  }

  const ticks = (lo, hi, n = 4) =>
    Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);

  const gridY = ticks(y0, y1)
    .map((t) => `<line class="grid" x1="${pad.l}" y1="${sy(t)}" x2="${pad.l + w}" y2="${sy(t)}"/>
      <text x="${pad.l - 6}" y="${sy(t) + 3}" text-anchor="end">${t.toFixed(1)}</text>`)
    .join('');
  const gridX = ticks(x0, x1)
    .map((t) => `<text x="${sx(t)}" y="${pad.t + h + 15}" text-anchor="middle">${t.toFixed(1)}</text>`)
    .join('');

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img"
    aria-label="${esc(yLabel)} against ${esc(xLabel)}">
    ${gridY}${gridX}
    <line class="axis" x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + h}"/>
    <line class="axis" x1="${pad.l}" y1="${pad.t + h}" x2="${pad.l + w}" y2="${pad.t + h}"/>
    ${dots}${fitLine}
    <text x="${pad.l + w / 2}" y="${height - 2}" text-anchor="middle">${esc(xLabel)}</text>
    <text x="10" y="${pad.t + h / 2}" text-anchor="middle"
      transform="rotate(-90 10 ${pad.t + h / 2})">${esc(yLabel)}</text>
  </svg>`;
}

/**
 * Build a histogram of sentence lengths.
 * @param {number[]} values
 * @returns {string} SVG markup
 */
function histogramSvg(values, { width = 560, height = 200, xLabel = 'words per sentence' } = {}) {
  if (!values.length) return '';
  const pad = { l: 34, r: 12, t: 10, b: 32 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;

  const max = Math.max(...values);
  const binSize = Math.max(1, Math.ceil(max / 14));
  const bins = [];
  for (const v of values) {
    const i = Math.floor(v / binSize);
    bins[i] = (bins[i] ?? 0) + 1;
  }
  for (let i = 0; i < bins.length; i++) bins[i] = bins[i] ?? 0;

  const peak = Math.max(...bins, 1);
  const bw = w / bins.length;

  const bars = bins
    .map((c, i) => {
      const bh = (c / peak) * h;
      return `<rect class="bar" x="${(pad.l + i * bw + 1).toFixed(1)}" y="${(pad.t + h - bh).toFixed(1)}"
        width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh.toFixed(1)}">
        <title>${c} sentence${c === 1 ? '' : 's'} of ${i * binSize}-${(i + 1) * binSize - 1} words</title></rect>`;
    })
    .join('');

  const labels = bins
    .map((_, i) => (i % 3 === 0
      ? `<text x="${pad.l + i * bw + bw / 2}" y="${pad.t + h + 14}" text-anchor="middle">${i * binSize}</text>`
      : ''))
    .join('');

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img"
    aria-label="Distribution of sentence lengths">
    <line class="axis" x1="${pad.l}" y1="${pad.t + h}" x2="${pad.l + w}" y2="${pad.t + h}"/>
    <line class="axis" x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + h}"/>
    <text x="${pad.l - 6}" y="${pad.t + 8}" text-anchor="end">${peak}</text>
    ${bars}${labels}
    <text x="${pad.l + w / 2}" y="${height - 2}" text-anchor="middle">${esc(xLabel)}</text>
  </svg>`;
}

/**
 * Line chart for a monotone curve (vocabulary growth).
 * @param {Array<{n:number,v:number}>} curve
 * @returns {string}
 */
function curveSvg(curve, { width = 560, height = 220 } = {}) {
  if (curve.length < 2) return '';
  const pad = { l: 44, r: 12, t: 10, b: 32 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;

  const maxN = curve[curve.length - 1].n;
  const maxV = curve[curve.length - 1].v;
  const sx = (n) => pad.l + (n / maxN) * w;
  const sy = (v) => pad.t + h - (v / maxV) * h;

  const d = curve.map((p, i) => `${i ? 'L' : 'M'}${sx(p.n).toFixed(1)},${sy(p.v).toFixed(1)}`).join('');
  // A straight line from origin shows what linear growth would look like.
  const linear = `<line class="fit" x1="${sx(0)}" y1="${sy(0)}" x2="${sx(maxN)}" y2="${sy(maxN)}"/>`;

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img"
    aria-label="Distinct words against total words">
    <line class="axis" x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + h}"/>
    <line class="axis" x1="${pad.l}" y1="${pad.t + h}" x2="${pad.l + w}" y2="${pad.t + h}"/>
    <text x="${pad.l - 6}" y="${pad.t + 8}" text-anchor="end">${maxV}</text>
    <text x="${pad.l + w}" y="${pad.t + h + 15}" text-anchor="end">${maxN}</text>
    ${linear}
    <path class="line" d="${d}"/>
    <text x="${pad.l + w / 2}" y="${height - 2}" text-anchor="middle">total words</text>
    <text x="10" y="${pad.t + h / 2}" text-anchor="middle"
      transform="rotate(-90 10 ${pad.t + h / 2})">distinct words</text>
  </svg>`;
}

// ------------------------------------------------------------------ panels

/**
 * Readability panel: the six formulas, each with its arithmetic on demand.
 * @param {ReturnType<typeof analyze>} p
 * @returns {string}
 */
function renderReadability(p) {
  if (p.empty) return emptyState();

  const { metrics, basis, consensus } = p.readability;

  const cards = metrics.map((m) => `
    <details class="metric">
      <summary>
        <span class="m-name">${esc(m.name)}</span>
        <span class="m-value">${num(m.value, 1)}</span>
        <span class="m-interp">${esc(m.interpretation)}</span>
      </summary>
      <div class="m-body">
        ${m.warning ? `<div class="note warn">${esc(m.warning)}</div>` : ''}
        <div class="formula"><span class="lbl">formula</span>${esc(m.expression)}</div>
        <div class="formula"><span class="lbl">with this text's numbers</span>${esc(m.substituted)} = ${num(m.value, 2)}</div>
        <ul class="terms">
          ${m.terms.map((t) => `<li><span>${esc(t.label)}</span>
            <span><span class="t-val">${esc(String(t.value))}</span>
            ${t.detail ? ` <span class="t-detail">(${esc(t.detail)})</span>` : ''}</span></li>`).join('')}
        </ul>
        ${citationHtml(m.citationId)}
      </div>
    </details>`).join('');

  const consensusHtml = consensus ? `
    <div class="note ${consensus.spread > 3 ? 'warn' : 'info'}">
      <strong>Grade-level range: ${num(consensus.low, 1)} to ${num(consensus.high, 1)}</strong>
      (median ${num(consensus.median, 1)}). ${esc(consensus.note)}
    </div>` : '';

  return `
    <p class="section-intro">Six formulas, all fitted between 1948 and 1975, all built from
    the same two ingredients: how long your sentences are, and how long your words are.
    They are useful for spotting where prose has got heavy. They cannot tell you whether
    it is <em>understandable</em> — see <a href="learn.html#limits">what these numbers cannot do</a>.</p>

    <div class="stats">
      <div class="stat"><span class="value">${basis.wordsPerSentence}</span><span class="label">words / sentence</span></div>
      <div class="stat"><span class="value">${basis.syllablesPerWord}</span><span class="label">syllables / word</span></div>
      <div class="stat"><span class="value">${basis.percentPolysyllabic}%</span><span class="label">3+ syllable words</span></div>
      <div class="stat"><span class="value">${basis.lettersPerWord}</span><span class="label">letters / word</span></div>
    </div>

    ${consensusHtml}
    ${cards}

    <div class="note info">
      <strong>A demonstration worth trying.</strong> Take a sentence from your text and
      shuffle its words into nonsense, then paste it back. Every score above stays
      identical, because none of these formulas can see word order. That is the clearest
      possible statement of what they do and do not measure.
    </div>`;
}

/**
 * Vocabulary panel.
 * @param {ReturnType<typeof analyze>} p
 * @returns {string}
 */
function renderVocabulary(p) {
  if (p.empty) return emptyState();
  const lex = p.lexical;

  const topWords = lex.frequencies.slice(0, 40)
    .map((f) => `<span class="chip">${esc(f.word)} <b>${f.count}</b></span>`).join('');

  return `
    <p class="section-intro">How much of your vocabulary repeats. The plain type-token ratio
    is the obvious measure and the misleading one: it falls as text gets longer no matter how
    varied the writing is. MATTR and MTLD are the standard fixes.</p>

    <div class="stats">
      <div class="stat"><span class="value">${lex.types}</span><span class="label">distinct words</span></div>
      <div class="stat"><span class="value">${num(lex.ttr, 3)}</span><span class="label">type-token ratio</span></div>
      <div class="stat"><span class="value">${num(lex.mattr.value, 3)}</span><span class="label">MATTR (w=${lex.mattr.window})</span></div>
      <div class="stat"><span class="value">${num(lex.mtld.value, 1)}</span><span class="label">MTLD</span></div>
      <div class="stat"><span class="value">${num(lex.herdanC, 3)}</span><span class="label">Herdan's C</span></div>
      <div class="stat"><span class="value">${lex.hapax.count}</span><span class="label">used exactly once</span></div>
    </div>

    ${lex.mattr.note ? `<div class="note warn">${esc(lex.mattr.note)}</div>` : ''}
    ${lex.mtld.note ? `<div class="note warn">${esc(lex.mtld.note)}</div>` : ''}

    <details class="metric">
      <summary>
        <span class="m-name">Why not just use the type-token ratio?</span>
        <span class="m-value">${num(lex.ttr, 3)}</span>
        <span class="m-interp">Because it measures your text's length as much as its variety.</span>
      </summary>
      <div class="m-body">
        <p>TTR is ${lex.types} distinct words ÷ ${lex.tokens} total words. The problem is
        structural: function words like <em>the</em> and <em>of</em> recur regardless of how
        rich the writing is, so the denominator grows faster than the numerator. Double the
        length of any text and its TTR falls. The Distribution tab draws this directly.</p>
        <p><strong>MATTR</strong> averages TTR over a sliding window of fixed size, so length
        cancels out. <strong>MTLD</strong> measures how many words it takes for TTR to fall to
        0.720, then averages that run length forwards and backwards.</p>
        ${citationHtml('covington2010')}
        ${citationHtml('mccarthy2010')}
      </div>
    </details>

    <details class="metric">
      <summary>
        <span class="m-name">Hapax legomena</span>
        <span class="m-value">${lex.hapax.count}</span>
        <span class="m-interp">${esc(lex.hapax.note)}</span>
      </summary>
      <div class="m-body">
        <p>${lex.hapax.count} of your ${lex.types} distinct words
        (${num((lex.hapax.ratio ?? 0) * 100, 0)}%) appear exactly once; ${lex.disLegomena}
        appear exactly twice. This ratio is remarkably stable across texts and authors,
        which is a consequence of the frequency distribution rather than a property of
        the writer.</p>
        ${citationHtml('herdan1960')}
      </div>
    </details>

    <h3>Most frequent words</h3>
    <div class="chips">${topWords}</div>`;
}

/**
 * Style panel.
 * @param {ReturnType<typeof analyze>} p
 * @returns {string}
 */
function renderStyle(p) {
  if (p.empty) return emptyState();
  const s = p.style;

  const passiveExamples = s.passive.examples.length
    ? `<div class="table-wrap"><table>
        <thead><tr><th>Sentence</th><th>Matched</th></tr></thead>
        <tbody>${s.passive.examples.map((e) => `<tr>
          <td>${esc(e.sentence.slice(0, 180))}${e.sentence.length > 180 ? '…' : ''}</td>
          <td><code>${esc(e.hits.map((h) => `${h.auxiliary} ${h.participle}`).join(', '))}</code></td>
        </tr>`).join('')}</tbody></table></div>`
    : '<p class="footnote">No passive-voice candidates found.</p>';

  const chipList = (items) => items.length
    ? `<div class="chips">${items.map((t) => `<span class="chip">${esc(t.word)} <b>${t.count}</b></span>`).join('')}</div>`
    : '<p class="footnote">None found.</p>';

  return `
    <p class="section-intro">Patterns worth a second look. None of these are errors, and a
    tool that called them errors would be teaching superstition. They are places where
    prose <em>often</em> gets heavier than the writer intended.</p>

    <div class="stats">
      <div class="stat"><span class="value">${s.passive.shareOfSentences}%</span><span class="label">sentences w/ passive</span></div>
      <div class="stat"><span class="value">${s.nominalisations.percent}%</span><span class="label">nominalisations</span></div>
      <div class="stat"><span class="value">${s.hedges.percent}%</span><span class="label">hedges</span></div>
      <div class="stat"><span class="value">${s.rhythm.mean ?? '—'}</span><span class="label">mean sentence</span></div>
      <div class="stat"><span class="value">${s.rhythm.sd ?? '—'}</span><span class="label">σ sentence length</span></div>
      <div class="stat"><span class="value">${s.rhythm.max ?? '—'}</span><span class="label">longest sentence</span></div>
    </div>

    <h3>Sentence rhythm</h3>
    <div class="chart-wrap">
      ${histogramSvg(s.rhythm.lengths)}
      <p class="chart-caption">${esc(s.rhythm.note ?? '')}
      Readability formulas use only the <em>mean</em> of this distribution, so two texts with
      identical scores can read completely differently.</p>
    </div>
    ${s.rhythm.longestSentence ? `<div class="note ${s.rhythm.max > 45 ? 'warn' : 'info'}">
      <strong>Longest sentence (${s.rhythm.max} words):</strong>
      ${esc(s.rhythm.longestSentence.slice(0, 400))}${s.rhythm.longestSentence.length > 400 ? '…' : ''}
    </div>` : ''}

    <h3>Passive-voice candidates
      <span class="footnote">— ${s.passive.sentences} of ${p.counts.sentences} sentences</span></h3>
    <div class="note info">${esc(s.passive.note)}</div>
    ${passiveExamples}

    <h3>Nominalisations <span class="footnote">— ${s.nominalisations.count} words</span></h3>
    <div class="note info">${esc(s.nominalisations.note)}</div>
    ${chipList(s.nominalisations.top)}
    ${citationHtml('williams1981')}

    <h3>Hedges and intensifiers <span class="footnote">— ${s.hedges.count} words</span></h3>
    <div class="note info">${esc(s.hedges.note)}</div>
    ${chipList(s.hedges.top)}`;
}

/**
 * Distribution panel: Zipf and Heaps.
 * @param {ReturnType<typeof analyze>} p
 * @returns {string}
 */
function renderLaws(p) {
  if (p.empty) return emptyState();
  const { zipf: z, heaps: h } = p.laws;

  // The real least-squares line, not one eyeballed through the first point --
  // drawing a "fit" that is not the fit would undercut the whole premise.
  const fit = z.alpha !== null ? { slope: -z.alpha, intercept: z.intercept } : undefined;

  return `
    <p class="section-intro">Two empirical regularities that almost all running prose obeys.
    They are worth seeing because they explain the vocabulary numbers on the previous tab —
    and worth distrusting, because processes with no language in them produce the same curves.</p>

    <h3>Zipf's law — rank against frequency</h3>
    <div class="chart-wrap">
      ${z.points.length ? scatterSvg({
        points: z.points, fit,
        xLabel: 'log₁₀ rank', yLabel: 'log₁₀ frequency',
      }) : '<p class="footnote">Not enough distinct words to plot.</p>'}
      <p class="chart-caption">
        ${z.alpha !== null ? `Fitted exponent α = <strong>${num(z.alpha, 2)}</strong>, R² = ${num(z.r2, 3)}. ` : ''}
        ${esc(z.note)}
      </p>
    </div>
    <details class="metric">
      <summary>
        <span class="m-name">Why a good fit proves less than it looks</span>
        <span class="m-value">α ${num(z.alpha, 2)}</span>
        <span class="m-interp">Random text with a space key produces this curve too.</span>
      </summary>
      <div class="m-body">
        <p>The straight line on a log-log plot is genuinely striking, and for decades it was
        read as evidence of deep structure in language. Piantadosi's review shows that many
        processes with no linguistic content generate the same distribution, so the fit alone
        cannot distinguish prose from a well-shaped random string.</p>
        <p>We also fit by least squares in log-log space, which over-weights the noisy tail of
        once-occurring words. It is the fit you can see on the chart, not the most defensible
        estimator.</p>
        ${citationHtml('zipf1949')}
        ${citationHtml('piantadosi2014')}
      </div>
    </details>

    <h3>Heaps' law — vocabulary growth</h3>
    <div class="chart-wrap">
      ${curveSvg(h.curve)}
      <p class="chart-caption">
        ${h.beta !== null ? `V ≈ ${num(h.k, 1)} · N<sup>${num(h.beta, 2)}</sup>, R² = ${num(h.r2, 3)}. ` : ''}
        ${esc(h.note)} The dashed line is what linear growth would look like — every new word
        being one you had not used before.
      </p>
    </div>
    <div class="note info">
      <strong>This curve is why the type-token ratio misleads.</strong> TTR is exactly the
      height of this curve divided by its horizontal position. Because the curve bends,
      that ratio must fall as the text gets longer — for every text ever written. Comparing
      two documents by TTR therefore compares their lengths as much as their vocabularies.
      ${citationHtml('heaps1978')}
    </div>`;
}

/** Placeholder shown before any text is entered. */
function emptyState() {
  return `<div class="note info">
    <strong>Paste some prose to begin.</strong> Or load one of the samples above — they are
    written to sit at deliberately different points on the readability scale, so you can watch
    the formulas agree and disagree.
  </div>
  <p class="section-intro">glasstext measures English prose and shows its working. Every number
  it reports can be expanded to reveal the exact arithmetic that produced it, the paper it comes
  from, and the cases where it breaks. It makes no network requests — the page's own security
  policy forbids them.</p>`;
}

// ------------------------------------------------------------- filter lab

/** Current state of the filter lab, which has its own controls. */
const filterState = { mode: 'substring', terms: [...DEMO_TERMS], probe: 'hello' };

/**
 * Highlight matches inside the searched string.
 * @param {string} text
 * @param {Array<{index:number, matched:string, wholeWord:boolean}>} matches
 * @returns {string} HTML
 */
function highlight(text, matches) {
  if (!matches.length) return esc(text);
  const sorted = [...matches].sort((a, b) => a.index - b.index);
  let out = '';
  let cursor = 0;
  for (const m of sorted) {
    if (m.index < cursor) continue;
    out += esc(text.slice(cursor, m.index));
    out += `<mark class="hit${m.wholeWord ? ' whole' : ''}" title="matched list entry: ${esc(m.term)}">${esc(m.matched)}</mark>`;
    cursor = m.index + m.matched.length;
  }
  out += esc(text.slice(cursor));
  return out;
}

/**
 * Filter lab panel: the Scunthorpe problem, made measurable.
 * @param {ReturnType<typeof analyze>} p
 * @returns {string}
 */
function renderFilter(p) {
  const text = $('#input').value || SAMPLES.plain.text;
  const terms = filterState.terms.filter(Boolean);

  const sub = screen(text, { terms, mode: 'substring' });
  const word = screen(text, { terms, mode: 'word' });
  const norm = screen(text, { terms, mode: 'normalized' });

  const subCollateral = sub.matches.filter((m) => !m.wholeWord);
  const active = { substring: sub, word, normalized: norm }[filterState.mode];

  const collateralTable = Object.entries(COLLATERAL)
    .filter(([term]) => terms.includes(term))
    .map(([term, victims]) => `<tr>
      <td><code>${esc(term)}</code></td>
      <td>${victims.map((v) => `<span class="chip">${esc(v)}</span>`).join(' ')}</td>
    </tr>`).join('');

  const probe = filterState.probe || 'hello';
  const evasionRows = evasions(probe).map((e) => {
    const w = screen(e.text, { terms: [probe], mode: 'word' }).matches.length > 0;
    const n = screen(e.text, { terms: [probe], mode: 'normalized' }).matches.length > 0;
    return `<tr>
      <td>${esc(e.technique)}</td>
      <td><code>${esc(e.text)}</code></td>
      <td class="num">${w ? '✅' : '❌'}</td>
      <td class="num">${n ? '✅' : '❌'}</td>
    </tr>`;
  }).join('');

  const pipeline = normalize(probe === 'hello' ? 'Ｈ３𝘭l0  w०rld' : probe).steps
    .map((s, i) => `<li class="${s.changed ? 'changed' : ''}">
      <span class="step-no">${i + 1}</span>
      <span><span class="step-name">${esc(s.name)}</span><br>
      <span class="step-out">${esc(s.output)}</span></span>
    </li>`).join('');

  return `
    <p class="section-intro">Filtering text against a list of banned words is one of the most
    reimplemented ideas in software, and one of the most consistently broken. This tab lets you
    run the mechanism yourself and watch it fail in both directions at once — flagging innocent
    words while missing the ones it was built to catch.</p>

    <div class="mode-grid">
      <div class="mode-card bad">
        <h4>Substring matching</h4>
        <span class="big">${sub.matches.length}</span>
        <span class="sub">${subCollateral.length} of them inside innocent words</span>
      </div>
      <div class="mode-card ok">
        <h4>Whole-word matching</h4>
        <span class="big">${word.matches.length}</span>
        <span class="sub">no false positives — but trivially evaded</span>
      </div>
      <div class="mode-card">
        <h4>Normalise, then match</h4>
        <span class="big">${norm.matches.length}</span>
        <span class="sub">catches evasion, reintroduces some noise</span>
      </div>
    </div>

    <div class="note ${subCollateral.length ? 'danger' : 'info'}">
      <strong>The Scunthorpe problem.</strong> In 1996 AOL's filter refused to let residents of
      Scunthorpe, England register accounts, because their town's name contains a banned
      substring. The same bug is still shipped regularly. With your current text and term
      list, substring matching produces <strong>${subCollateral.length}</strong>
      false positive${subCollateral.length === 1 ? '' : 's'}.
    </div>

    <div class="field-row">
      <label for="terms-input">Term list</label>
      <input type="text" id="terms-input" value="${esc(terms.join(', '))}"
        aria-describedby="terms-help">
    </div>
    <p class="footnote" id="terms-help">These defaults are ordinary English words —
    <code>hell</code>, <code>ass</code>, <code>anal</code>, <code>sex</code> — chosen because
    they are the documented causes of famous over-blocking. glasstext ships no profanity list;
    the mechanism and its failures are identical whatever words you put in.</p>

    <div class="mode-row" role="group" aria-label="Matching mode">
      ${['substring', 'word', 'normalized'].map((m) => `
        <button class="btn" type="button" data-mode="${m}"
          aria-pressed="${filterState.mode === m}">${m === 'word' ? 'whole word' : m}</button>`).join('')}
    </div>

    <h3>Your text, as the filter sees it</h3>
    <div class="chart-wrap text-preview">${
      highlight(active.searched.slice(0, 4000), active.matches.filter((m) => m.index < 4000))
    }</div>
    <p class="footnote">Red = matched inside a larger word (a false positive).
    Amber = matched a complete word. Neither is a verdict: a whole-word match may be a
    quotation, a place name, or a discussion of the word itself.</p>

    ${collateralTable ? `<h3>Innocent words each term breaks</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Term</th><th>Collateral damage</th></tr></thead>
      <tbody>${collateralTable}</tbody></table></div>` : ''}

    <h3>...and whole-word matching loses to this</h3>
    <div class="field-row">
      <label for="probe-input">Try evading the term</label>
      <input type="text" id="probe-input" value="${esc(probe)}">
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Technique</th><th>Input</th><th class="num">Whole word</th><th class="num">Normalised</th></tr></thead>
      <tbody>${evasionRows}</tbody>
    </table></div>
    <p class="footnote">✅ = caught, ❌ = slipped through. Every one of these techniques is
    decades old, and a filter's users find them within hours of deployment.
    The Cyrillic row looks identical to the plain word on purpose — that is the whole
    attack. Those characters are U+0430, U+0435, U+043E and friends, which are different
    letters that happen to share a glyph, so no amount of Unicode normalisation will fold
    them for you. You have to do it deliberately.</p>

    <h3>The normalisation pipeline, stage by stage</h3>
    <ul class="pipeline">${pipeline}</ul>
    <p class="footnote">Highlighted rows changed the string. Order matters: strip invisible
    characters first or they block every later rule; leave the lossy steps
    (leetspeak, letter-collapsing) until last.</p>
    ${citationHtml('unicodeTr39')}
    ${citationHtml('unicodeTr15')}

    <div class="note warn">
      <strong>Why glasstext will not tell you whether text is “clean”.</strong>
      Replacing the wordlist with a machine-learning classifier moves the problem rather than
      solving it. Hosseini et al. defeated a production toxicity model with typos alone. Sap
      et al. found that these classifiers flag African-American English at substantially
      higher rates, so deploying one silently penalises the people who already get moderated
      most. Matching is the easy part; deciding is the part that needs a human and a policy.
      ${citationHtml('hosseini2017')}
      ${citationHtml('sap2019')}
      ${citationHtml('gorwa2020')}
    </div>`;
}

// -------------------------------------------------------------- controller

const panels = {
  readability: { el: $('#panel-readability'), render: renderReadability },
  vocabulary: { el: $('#panel-vocabulary'), render: renderVocabulary },
  style: { el: $('#panel-style'), render: renderStyle },
  laws: { el: $('#panel-laws'), render: renderLaws },
  filter: { el: $('#panel-filter'), render: renderFilter },
};

let current = null;
let activeTab = 'readability';

/** Recompute and repaint the active panel. */
function update() {
  const text = $('#input').value;
  current = analyze(text, { screening: false });

  $('#c-words').textContent = current.counts.words.toLocaleString();
  $('#c-sentences').textContent = current.counts.sentences.toLocaleString();
  $('#c-chars').textContent = current.counts.characters.toLocaleString();
  $('#c-time').textContent = current.counts.readingTimeMinutes < 1
    ? '<1' : String(Math.round(current.counts.readingTimeMinutes));

  panels[activeTab].el.innerHTML = panels[activeTab].render(current);
}

const debouncedUpdate = debounce(update, 140);

/**
 * Switch tabs.
 * @param {string} name
 */
function selectTab(name) {
  activeTab = name;
  for (const [key, { el }] of Object.entries(panels)) {
    const tab = $(`#tab-${key}`);
    const selected = key === name;
    tab.setAttribute('aria-selected', String(selected));
    el.hidden = !selected;
  }
  update();
}

// --- events -----------------------------------------------------------------

$('#input').addEventListener('input', debouncedUpdate);

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => selectTab(tab.id.replace('tab-', '')));
}

// Arrow-key navigation between tabs, per the WAI-ARIA tabs pattern.
$('.tabs').addEventListener('keydown', (e) => {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  e.preventDefault();
  const names = Object.keys(panels);
  const i = names.indexOf(activeTab);
  const next = {
    ArrowLeft: names[(i - 1 + names.length) % names.length],
    ArrowRight: names[(i + 1) % names.length],
    Home: names[0],
    End: names[names.length - 1],
  }[e.key];
  selectTab(next);
  $(`#tab-${next}`).focus();
});

// Filter-lab controls live inside re-rendered HTML, so they are delegated.
$('#panel-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-mode]');
  if (!btn) return;
  filterState.mode = btn.dataset.mode;
  update();
});

// Re-rendering the panel replaces these inputs, so the caret has to be put
// back by hand or typing in them becomes impossible.
$('#panel-filter').addEventListener('input', debounce((e) => {
  const id = e.target.id;
  if (id !== 'terms-input' && id !== 'probe-input') return;
  const caret = e.target.selectionStart;

  if (id === 'terms-input') {
    filterState.terms = e.target.value.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
  } else {
    filterState.probe = e.target.value.trim();
  }
  update();

  const el = $(`#${id}`);
  if (el) {
    el.focus();
    const pos = Math.min(caret ?? el.value.length, el.value.length);
    el.setSelectionRange(pos, pos);
  }
}, 300));

for (const btn of document.querySelectorAll('[data-sample]')) {
  btn.addEventListener('click', () => {
    $('#input').value = SAMPLES[btn.dataset.sample].text;
    update();
  });
}

$('#clear').addEventListener('click', () => {
  $('#input').value = '';
  $('#input').focus();
  update();
});

$('#file-input').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  // FileReader is local: the file is read from disk, never uploaded.
  const reader = new FileReader();
  reader.onload = () => { $('#input').value = String(reader.result); update(); };
  reader.readAsText(file);
});

$('#copy-report').addEventListener('click', async () => {
  if (!current || current.empty) return;
  const lines = [
    'glasstext report',
    `${current.counts.words} words, ${current.counts.sentences} sentences, ${current.counts.paragraphs} paragraphs`,
    '',
    'Readability',
    ...current.readability.metrics.map((m) => `  ${m.name}: ${m.value}  [${m.substituted}]`),
    '',
    'Vocabulary',
    `  distinct words: ${current.lexical.types}`,
    `  TTR: ${current.lexical.ttr}   MATTR: ${current.lexical.mattr.value}   MTLD: ${current.lexical.mtld.value}`,
    '',
    'Style',
    `  passive candidates: ${current.style.passive.sentences} sentences`,
    `  nominalisations: ${current.style.nominalisations.percent}%`,
    `  sentence length: mean ${current.style.rhythm.mean}, sd ${current.style.rhythm.sd}, max ${current.style.rhythm.max}`,
  ].join('\n');

  const btn = $('#copy-report');
  try {
    await navigator.clipboard.writeText(lines);
    btn.textContent = 'Copied';
  } catch {
    btn.textContent = 'Copy blocked';
  }
  setTimeout(() => { btn.textContent = 'Copy report'; }, 1600);
});

// Theme: follow the system by default, remember an explicit choice.
const THEME_KEY = 'glasstext-theme';
const savedTheme = localStorage.getItem(THEME_KEY);
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

$('#theme-toggle').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme
        && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
});

// Offer the samples the UI advertises, in the documented order.
const sampleButtons = document.querySelectorAll('[data-sample]');
SAMPLE_ORDER.slice(0, sampleButtons.length).forEach((key, i) => {
  const btn = sampleButtons[i];
  btn.dataset.sample = key;
  btn.textContent = SAMPLES[key].label.split(' ')[0];
  btn.title = SAMPLES[key].blurb;
});

selectTab('readability');
