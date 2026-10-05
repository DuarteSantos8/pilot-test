// Small SVG charts drawn at the element's real pixel size (so text and markers never stretch).
// Each chart has a hover layer: move over it and the nearest value is shown in a tooltip.

const tip = document.createElement('div');
tip.className = 'tooltip';
tip.hidden = true;
document.body.append(tip);

function showTip(event, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  const pad = 14, { innerWidth: w } = window;
  const r = tip.getBoundingClientRect();
  const x = event.clientX + pad + r.width > w ? event.clientX - pad - r.width : event.clientX + pad;
  tip.style.transform = `translate(${x}px, ${event.clientY - r.height - pad}px)`;
}
const hideTip = () => { tip.hidden = true; };

// Index of the item whose x is closest to the pointer.
function nearest(svg, event, xs) {
  const px = event.clientX - svg.getBoundingClientRect().left;
  let best = 0;
  xs.forEach((x, i) => { if (Math.abs(x - px) < Math.abs(xs[best] - px)) best = i; });
  return best;
}

function size(svg, height) {
  const w = Math.max(240, Math.round(svg.clientWidth || svg.parentElement.clientWidth));
  svg.setAttribute('viewBox', `0 0 ${w} ${height}`);
  svg.setAttribute('height', height);
  return w;
}

// Bar with a rounded top, anchored to the baseline.
const bar = (x, y, w, h, r = 3) => {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

/**
 * One bar per trial: height = reaction time (capped at the time limit), colour = right / wrong / too slow.
 * trials: [{ trial, rt, correct, response }]
 */
export function trialChart(svg, trials, limitMs, medianRt, describe) {
  const h = 180, m = { top: 10, right: 8, bottom: 22, left: 40 };
  const w = size(svg, h);
  const plotW = w - m.left - m.right, plotH = h - m.top - m.bottom;
  const step = plotW / Math.max(trials.length, 1), bw = Math.max(2, Math.min(28, step - 2));
  const y = ms => m.top + plotH - (Math.min(ms, limitMs) / limitMs) * plotH;
  const xs = trials.map((_, i) => m.left + i * step + step / 2);

  const ticks = [0, limitMs / 2, limitMs].map(v =>
    `<line class="grid" x1="${m.left}" x2="${w - m.right}" y1="${y(v)}" y2="${y(v)}"/>
     <text class="axis" x="${m.left - 6}" y="${y(v) + 4}" text-anchor="end">${(v / 1000).toFixed(1)} s</text>`).join('');
  const bars = trials.map((t, i) => {
    const cls = t.response === null ? 'timeout' : t.correct ? 'right' : 'wrong';
    const top = t.response === null ? y(limitMs) : y(t.rt);
    return `<path class="${cls}" d="${bar(xs[i] - bw / 2, top, bw, Math.max(2, m.top + plotH - top))}"/>`;
  }).join('');
  const med = medianRt == null ? '' :
    `<line class="median" x1="${m.left}" x2="${w - m.right}" y1="${y(medianRt)}" y2="${y(medianRt)}"/>`;
  const firstLast = trials.length ? `<text class="axis" x="${xs[0]}" y="${h - 6}" text-anchor="middle">1</text>
    <text class="axis" x="${xs.at(-1)}" y="${h - 6}" text-anchor="middle">${trials.length}</text>` : '';
  svg.innerHTML = ticks + bars + med + firstLast + `<line class="cursor" y1="${m.top}" y2="${m.top + plotH}" hidden/>`;

  const cursor = svg.querySelector('.cursor');
  svg.onpointermove = e => {
    if (!trials.length) return;
    const i = nearest(svg, e, xs);
    cursor.setAttribute('x1', xs[i]); cursor.setAttribute('x2', xs[i]); cursor.removeAttribute('hidden');
    showTip(e, describe(trials[i]));
  };
  svg.onpointerleave = () => { cursor.setAttribute('hidden', ''); hideTip(); };
}

/**
 * Line over sessions in date order. points: [{ value, label }] where label is the tooltip HTML.
 * yMax: top of the scale; format: value -> axis text.
 */
export function progressChart(svg, points, { yMax, format, height = 170 }) {
  const h = height, m = { top: 12, right: 14, bottom: 22, left: 44 };
  const w = size(svg, h);
  const plotW = w - m.left - m.right, plotH = h - m.top - m.bottom;
  const x = i => points.length === 1 ? m.left + plotW / 2 : m.left + (i / (points.length - 1)) * plotW;
  const y = v => m.top + plotH - (v / yMax) * plotH;
  const xs = points.map((_, i) => x(i));

  const ticks = [0, yMax / 2, yMax].map(v =>
    `<line class="grid" x1="${m.left}" x2="${w - m.right}" y1="${y(v)}" y2="${y(v)}"/>
     <text class="axis" x="${m.left - 6}" y="${y(v) + 4}" text-anchor="end">${format(v)}</text>`).join('');
  const valid = points.map((p, i) => [p, i]).filter(([p]) => p.value != null);
  const line = valid.length > 1
    ? `<polyline class="line" points="${valid.map(([p, i]) => `${x(i)},${y(p.value)}`).join(' ')}"/>` : '';
  const dots = valid.map(([p, i]) => `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="4.5"/>`).join('');
  const ends = points.length > 1 ? `<text class="axis" x="${m.left}" y="${h - 6}">${points[0].short}</text>
    <text class="axis" x="${w - m.right}" y="${h - 6}" text-anchor="end">${points.at(-1).short}</text>` : '';
  svg.innerHTML = ticks + line + dots + ends + `<line class="cursor" y1="${m.top}" y2="${m.top + plotH}" hidden/>`;

  const cursor = svg.querySelector('.cursor');
  svg.onpointermove = e => {
    if (!points.length) return;
    const i = nearest(svg, e, xs);
    cursor.setAttribute('x1', xs[i]); cursor.setAttribute('x2', xs[i]); cursor.removeAttribute('hidden');
    showTip(e, points[i].label);
  };
  svg.onpointerleave = () => { cursor.setAttribute('hidden', ''); hideTip(); };
}
