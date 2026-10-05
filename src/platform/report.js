// PDF reports, drawn with jsPDF as real text and vector graphics (sharp at any zoom, text can be selected).
// Layout rule: every block is measured before it is drawn and moves to the next page if it doesn't fit,
// so nothing is cut in half. Long tables continue on the next page with their header repeated.
//
// progressReport(entries, name)        everything: overview, every test, every session
// sessionReport(entry, others, name)   one session in full, compared with the person's other sessions
// An "entry" is { session, test, sum } as built by the dashboard.

const PAGE = { w: 210, h: 297, left: 16, right: 194, top: 22, bottom: 279 };
const WIDTH = PAGE.right - PAGE.left;
const C = {
  ink: '#1c2226', soft: '#4d575c', rule: '#b3bbb2', faint: '#d7dcd5', panel: '#eef1ec',
  signal: '#f5b700', right: '#17834a', wrong: '#c9322b', timeout: '#b3bbb2', sky: '#93afc4', ground: '#7a5c3c',
};

// ---------- Formatting ----------
const sec = ms => ms == null ? '–' : `${(ms / 1000).toFixed(2)} s`;
const pct = x => x == null ? '–' : `${Math.round(x * 100)}%`;
const date = iso => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTime = iso => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const shortDate = iso => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const duration = ms => {
  const s = Math.round(ms / 1000), m = Math.floor(s / 60);
  return m ? `${m} min ${s % 60} s` : `${s} s`;
};
const ordinal = n => `${n}${[, 'st', 'nd', 'rd'][n % 100 >> 3 ^ 1 && n % 10] || 'th'}`;
const signed = (x, unit, digits = 0) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(digits)}${unit}`;
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const median = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------- Fonts (the site's Barlow, shipped in assets/fonts; Helvetica if they can't be loaded) ----------
const FONT_FILES = [
  ['Barlow-Regular.ttf', 'Barlow', 'normal'],
  ['Barlow-SemiBold.ttf', 'Barlow', 'bold'],
  ['BarlowCondensed-SemiBold.ttf', 'BarlowCondensed', 'normal'],
  ['BarlowCondensed-Bold.ttf', 'BarlowCondensed', 'bold'],
];
let fontData = null;

async function loadFonts() {
  if (fontData) return fontData;
  try {
    fontData = await Promise.all(FONT_FILES.map(async ([file]) => {
      const res = await fetch(new URL(`../../assets/fonts/${file}`, import.meta.url));
      if (!res.ok) throw new Error(file);
      const bytes = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }));
  } catch {
    fontData = [];
  }
  return fontData;
}

// ---------- Page model ----------
class Report {
  constructor(jsPDF, fonts, { kind, name, generated }) {
    this.pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    this.kind = kind;
    this.name = name;
    this.generated = generated;
    this.y = PAGE.top;
    if (fonts.length) {
      FONT_FILES.forEach(([file, family, style], i) => {
        this.pdf.addFileToVFS(file, fonts[i]);
        this.pdf.addFont(file, family, style);
      });
      this.faces = { body: ['Barlow', 'normal'], strong: ['Barlow', 'bold'], display: ['BarlowCondensed', 'normal'], heavy: ['BarlowCondensed', 'bold'] };
    } else {
      this.faces = { body: ['helvetica', 'normal'], strong: ['helvetica', 'bold'], display: ['helvetica', 'bold'], heavy: ['helvetica', 'bold'] };
    }
    this.pdf.setProperties({ title: `Attitude ${kind}${name ? ` – ${name}` : ''}`, author: name || '', creator: 'Attitude' });
    this.pdf.setLineHeightFactor(1.3);
  }

  font(face, size, color = C.ink) {
    this.pdf.setFont(...this.faces[face]);
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(color);
    return this;
  }
  text(str, x, y, opts) { this.pdf.text(Array.isArray(str) ? str : String(str), x, y, opts); }   // arrays = wrapped lines
  textWidth(str) { return this.pdf.getTextWidth(String(str)); }
  // Shorten a string with an ellipsis so it fits in `w` mm with the current font.
  fit(str, w) {
    str = String(str);
    if (this.textWidth(str) <= w) return str;
    while (str.length > 1 && this.textWidth(`${str}…`) > w) str = str.slice(0, -1);
    return `${str}…`;
  }
  // Lines of wrapped text; returns the height used.
  paragraph(str, x, y, w, size = 9.5, color = C.soft) {
    this.font('body', size, color);
    const lines = this.pdf.splitTextToSize(String(str), w);
    this.text(lines, x, y);
    return lines.length * size * 0.3528 * 1.3;
  }
  paragraphHeight(str, w, size = 9.5) {
    this.font('body', size);
    return this.pdf.splitTextToSize(String(str), w).length * size * 0.3528 * 1.3;
  }

  fill(color) { this.pdf.setFillColor(color); return this; }
  stroke(color, width = 0.2) { this.pdf.setDrawColor(color); this.pdf.setLineWidth(width); return this; }
  rule(y, color = C.rule, width = 0.2, x1 = PAGE.left, x2 = PAGE.right) { this.stroke(color, width).pdf.line(x1, y, x2, y); }
  polygon(points, style) {
    const [[x0, y0], ...rest] = points;
    let px = x0, py = y0;
    const deltas = rest.map(([x, y]) => { const d = [x - px, y - py]; px = x; py = y; return d; });
    this.pdf.lines(deltas, x0, y0, [1, 1], style, true);
  }

  // Keep the next `h` mm together: start a new page if they don't fit on this one.
  need(h) { if (this.y + h > PAGE.bottom) this.newPage(); }
  newPage() {
    this.pdf.addPage();
    this.y = PAGE.top + 4;
  }

  // Header on later pages and footer on every page, added at the end when the page count is known.
  finishPages() {
    const n = this.pdf.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      this.pdf.setPage(i);
      if (i > 1) {
        this.font('strong', 8, C.soft).text(`Attitude ${this.kind}`, PAGE.left, 13);
        this.font('body', 8, C.soft).text(this.name || '', PAGE.right, 13, { align: 'right' });
        this.rule(15, C.faint);
      }
      this.rule(PAGE.h - 15, C.faint);
      this.font('body', 7.5, C.soft).text(`Generated ${dateTime(this.generated)}`, PAGE.left, PAGE.h - 10.5);
      this.text(`Page ${i} of ${n}`, PAGE.right, PAGE.h - 10.5, { align: 'right' });
    }
  }
}

// ---------- Building blocks ----------

// Attitude indicator logo: banked sky over ground with the aircraft symbol.
function logo(r, cx, cy, radius) {
  const bank = -18 * Math.PI / 180;
  r.fill(C.sky).pdf.circle(cx, cy, radius, 'F');
  const half = [];
  for (let a = 0; a <= 180; a += 10) {
    const t = a * Math.PI / 180 + bank;
    half.push([cx + Math.cos(t) * radius, cy + Math.sin(t) * radius]);
  }
  r.fill(C.ground).polygon(half, 'F');
  r.stroke(C.ink, 0.5).pdf.circle(cx, cy, radius, 'S');
  const s = radius / 15;
  r.stroke(C.signal, 0.9);
  r.pdf.lines([[7 * s, 0], [3 * s, 3 * s], [3 * s, -3 * s], [7 * s, 0]], cx - 10 * s, cy, [1, 1], 'S', false);
}

function masthead(r, title) {
  logo(r, PAGE.left + 6, 19, 6);
  r.font('heavy', 24).text('Attitude', PAGE.left + 15, 22.2);
  r.font('display', 14).text(title, PAGE.right, 18.5, { align: 'right' });
  r.font('body', 8.5, C.soft).text(dateTime(r.generated), PAGE.right, 23.5, { align: 'right' });
  r.rule(28, C.ink, 0.6);
  r.y = 37;
}

function heading(r, text, keepWith = 30) {
  r.need(14 + keepWith);
  r.y += 4;
  r.font('heavy', 16).text(text, PAGE.left, r.y + 4);
  r.y += 10;
}

function subheading(r, text, keepWith = 20) {
  r.need(9 + keepWith);
  r.font('strong', 10.5).text(text, PAGE.left, r.y + 4);
  r.y += 8;
}

// A row of figures, each a small label above a big number.
function figures(r, items) {
  const h = 19, gap = 3, w = (WIDTH - gap * (items.length - 1)) / items.length;
  r.need(h + 4);
  items.forEach(([label, value, note], i) => {
    const x = PAGE.left + i * (w + gap);
    r.fill(C.panel).pdf.roundedRect(x, r.y, w, h, 1.5, 1.5, 'F');
    r.font('body', 7.5, C.soft).text(r.fit(label, w - 6), x + 3, r.y + 5.5);
    r.font('heavy', 15).text(r.fit(value, w - 6), x + 3, r.y + 13.2);
    if (note) r.font('body', 6.8, C.soft).text(r.fit(note, w - 6), x + 3, r.y + 17);
  });
  r.y += h + 5;
}

/**
 * Table with a header that repeats on every page it spans. Rows are never split.
 * columns: [{ title, w, align, bar }]   rows: arrays of cells; a cell is text or { text, color, bar (0..1) }
 */
function table(r, columns, rows, { rowH = 6.2, size = 8.5, after = 0 } = {}) {
  const totalW = columns.reduce((s, c) => s + c.w, 0);
  const scale = WIDTH / totalW;
  const cols = columns.map(c => ({ ...c, w: c.w * scale }));
  const header = () => {
    r.font('strong', size - 0.5);
    let x = PAGE.left;
    for (const c of cols) {
      const tx = c.align === 'right' ? x + c.w - 1.5 : x;
      r.text(r.fit(c.title, c.w - 2), tx, r.y + 4.5, { align: c.align === 'right' ? 'right' : 'left' });
      x += c.w;
    }
    r.rule(r.y + 6.6, C.ink, 0.35);
    r.y += 7.2;
  };
  // Short tables (up to half a page) are kept whole, together with `after` mm of text below them;
  // longer ones start once at least three rows fit and continue on the next page.
  const whole = 7.2 + rowH * rows.length + after;
  r.need(whole <= (PAGE.bottom - PAGE.top) / 2 ? whole : 7.2 + rowH * Math.min(rows.length, 3));
  header();
  for (const row of rows) {
    if (r.y + rowH > PAGE.bottom) { r.newPage(); header(); }
    let x = PAGE.left;
    row.forEach((cell, i) => {
      const c = cols[i], v = cell && typeof cell === 'object' ? cell : { text: cell };
      if (v.bar != null) {
        const bw = c.w - 3;
        r.fill(C.faint).pdf.roundedRect(x, r.y + rowH / 2 - 1.3, bw, 2.6, 1.3, 1.3, 'F');
        if (v.bar > 0) r.fill(v.color ?? C.ink).pdf.roundedRect(x, r.y + rowH / 2 - 1.3, Math.max(2.6, bw * v.bar), 2.6, 1.3, 1.3, 'F');
      } else {
        r.font(v.strong ? 'strong' : 'body', size, v.color ?? C.ink);
        const str = r.fit(v.text ?? '', c.w - 2);
        r.text(str, c.align === 'right' ? x + c.w - 1.5 : x, r.y + rowH / 2 + size * 0.3528 * 0.36,
          { align: c.align === 'right' ? 'right' : 'left' });
      }
      x += c.w;
    });
    r.rule(r.y + rowH, C.faint, 0.15);
    r.y += rowH;
  }
  r.y += 5;
}

// Line chart over sessions. points: [{ value, date }]
function lineChart(r, x, y, w, h, title, points, yMax, format) {
  r.fill(C.panel).pdf.roundedRect(x, y, w, h, 1.5, 1.5, 'F');
  r.font('strong', 8.5).text(title, x + 3, y + 5.5);
  const p = { l: x + 13, r: x + w - 4, t: y + 10, b: y + h - 7 };
  const px = i => points.length === 1 ? (p.l + p.r) / 2 : p.l + (i / (points.length - 1)) * (p.r - p.l);
  const py = v => p.b - (v / yMax) * (p.b - p.t);
  for (const v of [0, yMax / 2, yMax]) {
    r.rule(py(v), C.faint, 0.15, p.l, p.r);
    r.font('body', 6.5, C.soft).text(format(v), p.l - 1.5, py(v) + 0.9, { align: 'right' });
  }
  const valid = points.map((pt, i) => [pt, i]).filter(([pt]) => pt.value != null);
  r.stroke(C.ink, 0.45);
  for (let k = 1; k < valid.length; k++) {
    const [a, i] = valid[k - 1], [b, j] = valid[k];
    r.pdf.line(px(i), py(a.value), px(j), py(b.value));
  }
  for (const [pt, i] of valid) {
    r.fill('#ffffff').pdf.circle(px(i), py(pt.value), 1.15, 'F');
    r.fill(C.ink).pdf.circle(px(i), py(pt.value), 0.8, 'F');
  }
  if (points.length) {
    r.font('body', 6.5, C.soft);
    r.text(shortDate(points[0].date), p.l, y + h - 2.5);
    if (points.length > 1) r.text(shortDate(points.at(-1).date), p.r, y + h - 2.5, { align: 'right' });
  }
}

// One bar per trial: height = reaction time, colour = right / wrong / too slow; dashed line = median.
function trialBars(r, x, y, w, h, trials, limitMs, medianRt) {
  r.fill(C.panel).pdf.roundedRect(x, y, w, h, 1.5, 1.5, 'F');
  const p = { l: x + 11, r: x + w - 3, t: y + 4, b: y + h - 5 };
  const py = ms => p.b - (Math.min(ms, limitMs) / limitMs) * (p.b - p.t);
  for (const v of [0, limitMs]) {
    r.rule(py(v), C.faint, 0.15, p.l, p.r);
    r.font('body', 6.3, C.soft).text(`${(v / 1000).toFixed(0)} s`, p.l - 1.5, py(v) + 0.9, { align: 'right' });
  }
  const step = (p.r - p.l) / Math.max(trials.length, 1), bw = Math.max(0.6, Math.min(6, step - 0.6));
  trials.forEach((t, i) => {
    const top = t.response === null ? py(limitMs) : py(t.rt);
    const color = t.response === null ? C.timeout : t.correct ? C.right : C.wrong;
    r.fill(color).pdf.rect(p.l + i * step + (step - bw) / 2, top, bw, Math.max(0.5, p.b - top), 'F');
  });
  if (medianRt != null) {
    r.stroke(C.ink, 0.3);
    r.pdf.setLineDashPattern([1.2, 0.9], 0);
    r.pdf.line(p.l, py(medianRt), p.r, py(medianRt));
    r.pdf.setLineDashPattern([], 0);
  }
  r.font('body', 6.3, C.soft);
  if (trials.length) {
    r.text('1', p.l + step / 2, y + h - 1.6, { align: 'center' });
    r.text(String(trials.length), p.l + (trials.length - 0.5) * step, y + h - 1.6, { align: 'center' });
  }
}

function legend(r, y) {
  let x = PAGE.left;
  r.font('body', 7.5, C.soft);
  for (const [label, color, dashed] of [['Right', C.right], ['Wrong', C.wrong], ['Too slow', C.timeout], ['Median', C.ink, true]]) {
    if (dashed) {
      r.stroke(color, 0.35).pdf.setLineDashPattern([1, 0.7], 0);
      r.pdf.line(x, y - 1, x + 4, y - 1);
      r.pdf.setLineDashPattern([], 0);
    } else {
      r.fill(color).pdf.roundedRect(x, y - 2.4, 2.8, 2.8, 0.5, 0.5, 'F');
    }
    r.text(label, x + 5, y);
    x += 7 + r.textWidth(label) + 4;
  }
}

function breakdownTable(r, b, size = 8.5, after = 0) {
  const rows = b.rows.map(row => {
    const acc = row.n ? row.correct / row.n : 0;
    return [row.name, String(row.n), `${row.correct}`, { text: pct(acc), strong: true }, { bar: acc }, sec(row.medianRt)];
  });
  table(r, [
    { title: b.title, w: 50 }, { title: 'Trials', w: 14, align: 'right' }, { title: 'Right', w: 14, align: 'right' },
    { title: 'Accuracy', w: 18, align: 'right' }, { title: '', w: 40, bar: true }, { title: 'Median', w: 18, align: 'right' },
  ], rows, { size, after });
}

// Height of a breakdown table plus its strongest/weakest line, so headings can stay with it.
const breakdownHeight = b => 7.2 + 6.2 * b.rows.length + 5 + (extremes(b) ? 6 : 0);

// Strongest and weakest group of a breakdown, ignoring groups with a single trial.
function extremes(b) {
  const rows = b.rows.filter(x => x.n >= 2).map(x => ({ ...x, acc: x.correct / x.n }));
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((a, c) => a.acc - c.acc || (c.medianRt ?? 0) - (a.medianRt ?? 0));
  const weak = sorted[0], strong = sorted.at(-1);
  return weak.acc === strong.acc ? null : { weak, strong };
}

function settingsTable(r, test, settings) {
  const pairs = test.settingsSummary?.(settings) ?? Object.entries(settings).map(([k, v]) => [k, String(v)]);
  table(r, [{ title: 'Setting', w: 60 }, { title: 'Value', w: 118 }], pairs, { size: 8.5 });
}

function trialTable(r, test, session) {
  const extra = (typeof test.trialColumns === 'function' ? test.trialColumns(session.settings) : test.trialColumns) ?? test.csv.columns.map((c, i) => ({ title: c, w: 22, value: t => test.csv.row(t, session)[i] }));
  const result = t => t.response === null ? { text: 'Too slow', color: C.soft } : t.correct ? { text: 'Right', color: C.right } : { text: 'Wrong', color: C.wrong };
  table(r,
    [{ title: '#', w: 8, align: 'right' }, { title: '', w: 3 }, ...extra.map(c => ({ title: c.title, w: c.w })),
     { title: 'Result', w: 16 }, { title: 'Time', w: 14, align: 'right' }],
    session.trials.map(t => [String(t.trial), '', ...extra.map(c => c.value(t)), result(t), sec(t.rt)]),
    { rowH: 5.6, size: 8 });
}

// ---------- Session block (used in the progress report's appendix) ----------
function sessionBlock(r, entry, index) {
  const { session, test, sum } = entry;
  const tables = sum.breakdowns.slice(0, 2);
  const tableRows = Math.max(...tables.map(b => b.rows.length), 0);
  const h = 9 + 34 + 4 + 6 + tableRows * 4.6 + 6;
  r.need(h);
  const top = r.y;
  r.font('heavy', 12).text(`Session ${index}`, PAGE.left, top + 4.5);
  r.font('body', 8.5, C.soft).text(`${dateTime(session.date)}   ${test.name}, ${test.variant(session.settings).toLowerCase()}`,
    PAGE.left + 24, top + 4.5);
  r.font('strong', 8.5).text(`${sum.correct}/${sum.total} right (${pct(sum.accuracy)}), median ${sec(sum.medianRt)}, ${sum.timeouts} too slow`,
    PAGE.right, top + 4.5, { align: 'right' });
  trialBars(r, PAGE.left, top + 8, WIDTH, 32, session.trials, sum.limitMs, sum.medianRt);

  // Two compact breakdown tables side by side.
  const colW = (WIDTH - 8) / 2;
  tables.forEach((b, k) => {
    const x = PAGE.left + k * (colW + 8);
    let y = top + 46;
    r.font('strong', 7.8).text(b.title, x, y);
    r.text('Right', x + colW - 16, y, { align: 'right' });
    r.text('Median', x + colW, y, { align: 'right' });
    r.rule(y + 1.4, C.ink, 0.25, x, x + colW);
    y += 5.2;
    for (const row of b.rows) {
      r.font('body', 7.8).text(r.fit(row.name, colW - 34), x, y);
      r.text(`${row.correct}/${row.n}`, x + colW - 16, y, { align: 'right' });
      r.text(sec(row.medianRt), x + colW, y, { align: 'right' });
      r.rule(y + 1.4, C.faint, 0.12, x, x + colW);
      y += 4.6;
    }
  });
  r.y = top + h;
  r.rule(r.y - 3, C.rule, 0.2);
}

// ---------- Progress report ----------
function drawProgressReport(r, entries) {
  const chrono = [...entries].sort((a, b) => a.session.date.localeCompare(b.session.date));
  masthead(r, 'Progress report');

  r.font('heavy', 22).text(r.name || 'Unnamed candidate', PAGE.left, r.y + 6);
  r.y += 12;
  const days = new Set(chrono.map(e => e.session.date.slice(0, 10))).size;
  const period = chrono.length
    ? `${date(chrono[0].session.date)} to ${date(chrono.at(-1).session.date)}, ${chrono.length} session${chrono.length === 1 ? '' : 's'} on ${days} day${days === 1 ? '' : 's'}.`
    : 'No sessions yet.';
  r.y += r.paragraph(period, PAGE.left, r.y, WIDTH, 10.5);
  r.y += 4;
  if (!chrono.length) return;

  const allTrials = chrono.flatMap(e => e.session.trials);
  const right = allTrials.filter(t => t.correct);
  heading(r, 'Overview', 24);
  figures(r, [
    ['Sessions', String(chrono.length)],
    ['Trials answered', String(allTrials.length)],
    ['Correct overall', pct(right.length / allTrials.length), `${right.length} of ${allTrials.length}`],
    ['Median reaction', sec(median(right.map(t => t.rt))), 'correct answers'],
    ['Time answering', duration(allTrials.reduce((s, t) => s + t.rt, 0))],
  ]);

  // One row per test.
  const byTest = new Map();
  for (const e of chrono) byTest.set(e.test.id, [...(byTest.get(e.test.id) ?? []), e]);
  subheading(r, 'Tests taken');
  table(r, [
    { title: 'Test', w: 46 }, { title: 'Sessions', w: 16, align: 'right' }, { title: 'Trials', w: 14, align: 'right' },
    { title: 'Latest', w: 16, align: 'right' }, { title: 'Best', w: 14, align: 'right' }, { title: 'Average', w: 16, align: 'right' },
    { title: 'Last median', w: 20, align: 'right' }, { title: 'Last taken', w: 26, align: 'right' },
  ], [...byTest.values()].map(list => {
    const last = list.at(-1);
    return [last.test.name, String(list.length), String(list.reduce((s, e) => s + e.sum.total, 0)),
      pct(last.sum.accuracy), pct(Math.max(...list.map(e => e.sum.accuracy))), pct(mean(list.map(e => e.sum.accuracy))),
      sec(last.sum.medianRt), date(last.session.date)];
  }));

  [...byTest.values()].forEach((list, i) => testSection(r, list, i === 0));

  // Appendix: every session, oldest first.
  r.newPage();
  heading(r, 'Session details', 60);
  r.y += r.paragraph('Every session in the order it was taken. Bars show the reaction time of each trial; the dashed line is the median of the correct answers.',
    PAGE.left, r.y, WIDTH, 9);
  legend(r, r.y + 2);
  r.y += 8;
  chrono.forEach((e, i) => sessionBlock(r, e, i + 1));
}

function testSection(r, list, first) {
  const test = list[0].test;
  // The first test may continue on the overview page if there is room for its title, figures and charts.
  if (first && r.y + 110 <= PAGE.bottom) r.y += 8;
  else r.newPage();
  r.font('heavy', 20).text(test.name, PAGE.left, r.y + 6);
  r.y += 11;
  r.y += r.paragraph(test.description, PAGE.left, r.y, WIDTH, 9.5) + 3;

  const accs = list.map(e => e.sum.accuracy);
  const best = list.reduce((b, e) => (e.sum.accuracy >= b.sum.accuracy ? e : b));
  const withRt = list.filter(e => e.sum.medianRt != null);
  const fastest = withRt.length ? withRt.reduce((b, e) => (e.sum.medianRt <= b.sum.medianRt ? e : b)) : null;
  const last = list.at(-1);
  figures(r, [
    ['Sessions', String(list.length)],
    ['Latest', pct(last.sum.accuracy), date(last.session.date)],
    ['Best', pct(best.sum.accuracy), date(best.session.date)],
    ['Average', pct(mean(accs))],
    ['Fastest median', sec(fastest?.sum.medianRt), fastest ? date(fastest.session.date) : ''],
  ]);

  // Progress charts side by side.
  r.need(58);
  const w = (WIDTH - 6) / 2;
  const recent = list.slice(-40);
  lineChart(r, PAGE.left, r.y, w, 52, 'Correct answers per session',
    recent.map(e => ({ value: e.sum.accuracy * 100, date: e.session.date })), 100, v => `${v}%`);
  const yMax = Math.ceil(Math.max(1000, ...recent.map(e => e.sum.medianRt ?? 0)) / 1000) * 1000;
  lineChart(r, PAGE.left + w + 6, r.y, w, 52, 'Median reaction time per session',
    recent.map(e => ({ value: e.sum.medianRt, date: e.session.date })), yMax, v => `${(v / 1000).toFixed(1)} s`);
  r.y += 52 + 3;
  if (list.length > recent.length) {
    r.y += r.paragraph(`Charts show the latest ${recent.length} of ${list.length} sessions.`, PAGE.left, r.y + 2, WIDTH, 8) + 2;
  }
  r.y += 3;

  // Comparison: first, latest, best, averages.
  heading(r, 'Comparison', 40);
  const row = (label, e) => [{ text: label, strong: true }, date(e.session.date), e.test.variant(e.session.settings),
    `${e.sum.correct}/${e.sum.total}`, pct(e.sum.accuracy), sec(e.sum.medianRt), String(e.sum.timeouts)];
  const avgRow = (label, group) => [{ text: label, strong: true }, group.length > 1 ? `${shortDate(group[0].session.date)} – ${shortDate(group.at(-1).session.date)}` : date(group[0].session.date),
    `${group.length} session${group.length === 1 ? '' : 's'}`, `${group.reduce((s, e) => s + e.sum.correct, 0)}/${group.reduce((s, e) => s + e.sum.total, 0)}`,
    pct(mean(group.map(e => e.sum.accuracy))), sec(median(group.map(e => e.sum.medianRt).filter(v => v != null))),
    String(group.reduce((s, e) => s + e.sum.timeouts, 0))];
  const rows = [row('First session', list[0])];
  if (list.length > 1) rows.push(row('Latest session', last), row('Best session', best));
  if (fastest && list.length > 1) rows.push(row('Fastest session', fastest));
  rows.push(avgRow('All sessions', list));
  const k = Math.min(3, Math.floor(list.length / 2));
  if (k >= 2) rows.push(avgRow(`First ${k}`, list.slice(0, k)), avgRow(`Last ${k}`, list.slice(-k)));
  table(r, [
    { title: '', w: 30 }, { title: 'Date', w: 30 }, { title: 'Setup', w: 34 }, { title: 'Right', w: 16, align: 'right' },
    { title: 'Accuracy', w: 18, align: 'right' }, { title: 'Median', w: 18, align: 'right' }, { title: 'Too slow', w: 16, align: 'right' },
  ], rows);

  if (list.length > 1) {
    const [a, b] = k >= 2 ? [list.slice(0, k), list.slice(-k)] : [[list[0]], [last]];
    const accDelta = (mean(b.map(e => e.sum.accuracy)) - mean(a.map(e => e.sum.accuracy))) * 100;
    const rtA = median(a.map(e => e.sum.medianRt).filter(v => v != null)), rtB = median(b.map(e => e.sum.medianRt).filter(v => v != null));
    const what = k >= 2 ? `From the first ${k} to the last ${k} sessions` : 'From the first to the latest session';
    let sentence = `${what}, correct answers changed by ${signed(accDelta, ' points')}`;
    if (rtA != null && rtB != null) sentence += ` and the median reaction time by ${signed((rtB - rtA) / 1000, ' s', 2)} (${rtB < rtA ? 'faster' : rtB > rtA ? 'slower' : 'no change'})`;
    const hgt = r.paragraphHeight(`${sentence}.`, WIDTH, 9.5);
    r.need(hgt + 4);
    r.y += r.paragraph(`${sentence}.`, PAGE.left, r.y, WIDTH, 9.5, C.ink) + 4;
  }

  // Strengths and weaknesses, per setup (different setups have different groupings).
  const bySetup = new Map();
  for (const e of list) {
    const key = test.variant(e.session.settings);
    bySetup.set(key, [...(bySetup.get(key) ?? []), e]);
  }
  for (const [setup, group] of bySetup) {
    const trials = group.flatMap(e => e.session.trials);
    const combined = test.summarize(trials, group[0].session.settings);
    heading(r, `Strengths and weaknesses: ${setup.toLowerCase()}`, 10 + breakdownHeight(combined.breakdowns[0] ?? { rows: [] }));
    r.y += r.paragraph(`${group.length} session${group.length === 1 ? '' : 's'}, ${trials.length} trials. Accuracy and median reaction time for each group of trials.`,
      PAGE.left, r.y, WIDTH, 9) + 2;
    for (const b of combined.breakdowns) {
      const ex = extremes(b);
      breakdownTable(r, b, 8.5, ex ? 6 : 0);
      if (ex) {
        const line = `Strongest: ${ex.strong.name} (${pct(ex.strong.correct / ex.strong.n)}). Weakest: ${ex.weak.name} (${pct(ex.weak.correct / ex.weak.n)}).`;
        r.need(8);
        r.y += r.paragraph(line, PAGE.left, r.y - 2, WIDTH, 8.5, C.ink) + 3;
      }
    }
  }

  heading(r, 'All sessions', 30);
  table(r, [
    { title: 'Date', w: 36 }, { title: 'Setup', w: 38 }, { title: 'Trials', w: 14, align: 'right' }, { title: 'Right', w: 14, align: 'right' },
    { title: 'Accuracy', w: 18, align: 'right' }, { title: 'Median', w: 18, align: 'right' }, { title: 'Too slow', w: 16, align: 'right' },
  ], [...list].reverse().map(e => [dateTime(e.session.date), test.variant(e.session.settings), String(e.sum.total),
    String(e.sum.correct), pct(e.sum.accuracy), sec(e.sum.medianRt), String(e.sum.timeouts)]));
}

// ---------- Session report ----------
function drawSessionReport(r, entry, others) {
  const { session, test, sum } = entry;
  masthead(r, 'Session report');
  r.font('heavy', 22).text(test.name, PAGE.left, r.y + 6);
  r.y += 12;
  r.y += r.paragraph([test.variant(session.settings), dateTime(session.date), session.name].filter(Boolean).join('   '),
    PAGE.left, r.y, WIDTH, 10.5) + 4;

  const right = session.trials.filter(t => t.correct).map(t => t.rt);
  figures(r, [
    ['Correct answers', pct(sum.accuracy), `${sum.correct} of ${sum.total}`],
    ['Median reaction', sec(sum.medianRt), 'correct answers'],
    ['Fastest correct', sec(right.length ? Math.min(...right) : null)],
    ['Slowest correct', sec(right.length ? Math.max(...right) : null)],
    ['Too slow', String(sum.timeouts), `limit ${sec(sum.limitMs)}`],
  ]);

  heading(r, 'Reaction time per trial', 50);
  r.need(56);
  trialBars(r, PAGE.left, r.y, WIDTH, 46, session.trials, sum.limitMs, sum.medianRt);
  r.y += 51;
  legend(r, r.y);
  r.y += 7;

  // Compared with the person's other sessions of this test (same setup if there are enough of them).
  const sameSetup = others.filter(e => e.test.variant(e.session.settings) === test.variant(session.settings));
  const pool = sameSetup.length >= 1 ? sameSetup : others;
  if (pool.length) {
    const scope = pool === sameSetup ? `your other ${test.name.toLowerCase()} sessions with the same setup` : `your other ${test.name.toLowerCase()} sessions`;
    heading(r, 'Compared with your other sessions', 40);
    const everyone = [...pool, entry];
    const rank = [...everyone].sort((a, b) => b.sum.accuracy - a.sum.accuracy || (a.sum.medianRt ?? 1e9) - (b.sum.medianRt ?? 1e9)).indexOf(entry) + 1;
    const previous = [...pool].filter(e => e.session.date < session.date).sort((a, b) => b.session.date.localeCompare(a.session.date))[0];
    const best = pool.reduce((b, e) => (e.sum.accuracy >= b.sum.accuracy ? e : b));
    const rows = [
      [{ text: 'This session', strong: true }, date(session.date), pct(sum.accuracy), sec(sum.medianRt), String(sum.timeouts)],
    ];
    if (previous) rows.push([{ text: 'Previous session', strong: true }, date(previous.session.date), pct(previous.sum.accuracy), sec(previous.sum.medianRt), String(previous.sum.timeouts)]);
    rows.push([{ text: 'Best other session', strong: true }, date(best.session.date), pct(best.sum.accuracy), sec(best.sum.medianRt), String(best.sum.timeouts)]);
    rows.push([{ text: 'Average of other sessions', strong: true }, `${pool.length} session${pool.length === 1 ? '' : 's'}`, pct(mean(pool.map(e => e.sum.accuracy))),
      sec(median(pool.map(e => e.sum.medianRt).filter(v => v != null))), (mean(pool.map(e => e.sum.timeouts))).toFixed(1)]);
    table(r, [{ title: '', w: 48 }, { title: 'Date', w: 36 }, { title: 'Accuracy', w: 30, align: 'right' },
      { title: 'Median', w: 30, align: 'right' }, { title: 'Too slow', w: 30, align: 'right' }], rows);
    const avgAcc = mean(pool.map(e => e.sum.accuracy));
    const place = rank === 1 ? 'your best' : `your ${ordinal(rank)} best`;
    const text = `This is ${place} of ${everyone.length} sessions, counting ${scope}. ` +
      `Correct answers are ${signed((sum.accuracy - avgAcc) * 100, ' points')} against your average.`;
    r.need(r.paragraphHeight(text, WIDTH) + 4);
    r.y += r.paragraph(text, PAGE.left, r.y - 1, WIDTH, 9.5, C.ink) + 4;
  }

  heading(r, 'Breakdown', breakdownHeight(sum.breakdowns[0] ?? { rows: [] }));
  for (const b of sum.breakdowns) {
    const ex = extremes(b);
    breakdownTable(r, b, 8.5, ex ? 6 : 0);
    if (ex) {
      r.need(8);
      r.y += r.paragraph(`Strongest: ${ex.strong.name} (${pct(ex.strong.correct / ex.strong.n)}). Weakest: ${ex.weak.name} (${pct(ex.weak.correct / ex.weak.n)}).`,
        PAGE.left, r.y - 2, WIDTH, 8.5, C.ink) + 3;
    }
  }

  heading(r, 'Settings used', 30);
  settingsTable(r, test, session.settings);

  heading(r, 'Every trial', 30);
  trialTable(r, test, session);
}

// ---------- Public ----------
async function build(kind, name, draw) {
  const [{ jsPDF }, fonts] = await Promise.all([import('jspdf'), loadFonts()]);
  const r = new Report(jsPDF, fonts, { kind, name, generated: new Date().toISOString() });
  draw(r);
  r.finishPages();
  return r.pdf;
}

const slug = s => (s || 'candidate').normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

export async function progressReport(entries, name) {
  const pdf = await build('progress report', name, r => drawProgressReport(r, entries));
  pdf.save(`attitude-progress-report_${slug(name)}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function sessionReport(entry, others, name) {
  const pdf = await build('session report', name || entry.session.name, r => drawSessionReport(r, entry, others));
  pdf.save(`attitude-session_${slug(entry.test.id)}_${entry.session.date.slice(0, 16).replace(/[:T]/g, '-')}.pdf`);
}
