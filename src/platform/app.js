// The platform: dashboard, session pages and routing. Tests plug in through src/tests/registry.js.
//
// Routes (in the URL hash):
//   #/                      dashboard
//   #/tests/<id>            a test's own setup screen
//   #/tests/<id>?again=<s>  run a test again with the settings of session <s>
//   #/sessions/<id>         results of one finished session

import { tests, testById } from '../tests/registry.js';
import { sessions, profile, exportData, importData } from './store.js';
import { trialChart, progressChart } from './charts.js';

// The PDF code (and the jsPDF library) only loads when someone asks for a report.
const report = () => import('./report.js');

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const escapeHTML = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fmtSeconds = ms => ms == null ? '–' : `${(ms / 1000).toFixed(2)} s`;
const fmtPercent = x => `${Math.round(x * 100)}%`;
const fmtDate = iso => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = iso => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtShort = iso => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// Session with its test and computed summary; sessions of tests that no longer exist are skipped.
function withSummary(session) {
  const test = testById(session.testId);
  return test ? { session, test, sum: test.summarize(session.trials, session.settings) } : null;
}

// ---------- Screens ----------
function show(id) {
  $$('[data-screen]').forEach(el => { el.hidden = el.id !== id; });
  scrollTo(0, 0);
}

const platform = {
  show,
  profileName: () => profile.name(),
  finish({ testId, settings, trials }) {
    const saved = sessions.add({ testId, settings, trials, name: profile.name() });
    location.hash = `#/sessions/${saved.id}`;
  },
};

// ---------- Dashboard ----------
const thumbnails = {};

function renderDashboard() {
  document.title = 'Attitude – pilot aptitude tests';
  const all = sessions.all().map(withSummary).filter(Boolean);
  $('#profileName').value = profile.name();

  // Totals over every test.
  const total = all.reduce((n, x) => n + x.sum.total, 0);
  const correct = all.reduce((n, x) => n + x.sum.correct, 0);
  $('#overview').innerHTML = `
    <div><dt>Sessions</dt><dd>${all.length}</dd></div>
    <div><dt>Trials answered</dt><dd>${total}</dd></div>
    <div><dt>Right overall</dt><dd>${total ? fmtPercent(correct / total) : '–'}</dd></div>`;

  $('#testList').innerHTML = tests.map(test => {
    const own = all.filter(x => x.test.id === test.id);
    const last = own[0], best = own.reduce((b, x) => Math.max(b, x.sum.accuracy), 0);
    const facts = own.length ? `
      <div><dt>Sessions</dt><dd>${own.length}</dd></div>
      <div><dt>Last</dt><dd>${fmtPercent(last.sum.accuracy)}</dd></div>
      <div><dt>Best</dt><dd>${fmtPercent(best)}</dd></div>
      <div><dt>Last median</dt><dd>${fmtSeconds(last.sum.medianRt)}</dd></div>` : '';
    return `<article class="test-card">
      ${thumbnails[test.id] ? `<img src="${thumbnails[test.id]}" alt="">` : ''}
      <div class="test-card-body">
        <h3>${escapeHTML(test.name)}</h3>
        <p>${escapeHTML(test.description)}</p>
        ${facts ? `<dl class="facts">${facts}</dl>` : '<p class="hint">Not taken yet.</p>'}
        <a class="btn btn-primary" href="#/tests/${test.id}">${own.length ? 'Start again' : 'Start test'}</a>
      </div>
    </article>`;
  }).join('');

  $('#sessionRows').innerHTML = all.length ? all.slice(0, 25).map(({ session, test, sum }) => `
    <tr data-href="#/sessions/${session.id}">
      <td><a href="#/sessions/${session.id}">${fmtDate(session.date)}</a></td>
      <td>${escapeHTML(test.name)}<small>${escapeHTML(test.variant(session.settings))}</small></td>
      <td class="num">${sum.correct} / ${sum.total}</td>
      <td class="num">${fmtSeconds(sum.medianRt)}</td>
    </tr>`).join('')
    : '<tr><td colspan="4" class="empty">No sessions yet. Start a test and your results are saved here.</td></tr>';

  $('#csvButtons').innerHTML = tests.filter(t => all.some(x => x.test.id === t.id)).map(t =>
    `<button type="button" class="btn btn-quiet" data-csv-test="${t.id}">${tests.length > 1 ? `${escapeHTML(t.name)} trials` : 'All trials'} (CSV)</button>`).join('');
  $('#exportData').hidden = $('#clearData').hidden = $('#progressPdf').hidden = !all.length;

  show('dashboard');
  renderProgress(all);   // after showing, so the charts can measure their width
}

function renderProgress(all) {
  const picker = $('#progressTest');
  const taken = tests.filter(t => all.some(x => x.test.id === t.id));
  picker.hidden = taken.length < 2;
  if (!taken.some(t => t.id === picker.value)) {
    picker.innerHTML = taken.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join('');
  }
  const own = all.filter(x => x.test.id === (picker.value || taken[0]?.id)).slice(0, 40).reverse();   // oldest first
  $('#progressCharts').hidden = !own.length;
  $('#progressEmpty').hidden = own.length > 0;
  if (!own.length) return;

  const label = ({ session, test, sum }) => `<b>${fmtDateTime(session.date)}</b><br>${escapeHTML(test.variant(session.settings))}<br>
    ${sum.correct} of ${sum.total} right, median ${fmtSeconds(sum.medianRt)}`;
  progressChart($('#accuracyChart'), own.map(x => ({ value: x.sum.accuracy * 100, label: label(x), short: fmtShort(x.session.date) })),
    { yMax: 100, format: v => `${v}%` });
  const slowest = Math.max(...own.map(x => x.sum.medianRt ?? 0), 1000);
  const yMax = Math.ceil(slowest / 1000) * 1000;
  progressChart($('#speedChart'), own.map(x => ({ value: x.sum.medianRt, label: label(x), short: fmtShort(x.session.date) })),
    { yMax, format: v => `${(v / 1000).toFixed(1)} s` });
}

$('#progressTest').addEventListener('change', () => renderProgress(sessions.all().map(withSummary).filter(Boolean)));
$('#profileName').addEventListener('input', e => profile.setName(e.target.value.trim()));
$('#sessionRows').addEventListener('click', e => {
  const row = e.target.closest('tr[data-href]');
  if (row && !e.target.closest('a')) location.hash = row.dataset.href;
});

// ---------- Data: backup, import, CSV, delete ----------
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

const csvCell = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
const today = () => new Date().toISOString().slice(0, 10);

function sessionsCsv(test, list) {
  const head = ['session', 'date', 'name', 'setup', 'trial', 'correct', 'reaction_ms', ...test.csv.columns];
  const rows = list.flatMap(s => s.trials.map(t =>
    [s.id, s.date, s.name ?? '', test.variant(s.settings), t.trial, t.correct, t.rt, ...test.csv.row(t, s)]));
  return [head, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
}

function note(text) {
  $('#dataNote').textContent = text;
  $('#dataNote').hidden = false;
}

// Runs a report job with the button showing that it's working, and reports failures in the interface.
async function withBusy(button, job) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Preparing PDF…';
  try { await job(); }
  catch (err) { console.error(err); alert('The PDF could not be created. Check your internet connection and try again.'); }
  finally { button.disabled = false; button.textContent = label; }
}

$('#progressPdf').addEventListener('click', e => withBusy(e.currentTarget, async () =>
  (await report()).progressReport(sessions.all().map(withSummary).filter(Boolean), profile.name())));

$('#exportData').addEventListener('click', () =>
  download(`attitude-backup_${today()}.json`, JSON.stringify(exportData(), null, 2), 'application/json'));

$('#importData').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const added = importData(JSON.parse(await file.text()));
    renderDashboard();
    note(added ? `Imported ${added} session${added === 1 ? '' : 's'}.` : 'Nothing new in that backup, every session was already here.');
  } catch (err) {
    note(err instanceof SyntaxError ? 'That file is not valid JSON. Pick a backup exported from this dashboard.' : err.message);
  }
});

$('#csvButtons').addEventListener('click', e => {
  const test = testById(e.target.dataset.csvTest);
  if (test) download(`attitude_${test.id}_${today()}.csv`, sessionsCsv(test, sessions.forTest(test.id)), 'text/csv');
});

$('#clearData').addEventListener('click', () => {
  if (!confirm('Delete every saved session in this browser? Export a backup first if you want to keep them.')) return;
  sessions.clear();
  renderDashboard();
  note('All results deleted.');
});

// ---------- One session ----------
function renderSession(session) {
  const { test, sum } = withSummary(session);
  document.title = `${test.name} – Attitude`;
  $('#sessionTitle').textContent = test.name;
  $('#sessionMeta').innerHTML = [test.variant(session.settings), fmtDateTime(session.date), session.name]
    .filter(Boolean).map(part => `<span>${escapeHTML(part)}</span>`).join('');
  $('#accuracy').textContent = fmtPercent(sum.accuracy);
  $('#medianRt').textContent = fmtSeconds(sum.medianRt);
  $('#timeouts').textContent = sum.timeouts;

  $('#breakdowns').innerHTML = sum.breakdowns.map(b => `
    <table>
      <thead><tr><th>${escapeHTML(b.title)}</th><th class="num">Right</th><th class="num">Median</th></tr></thead>
      <tbody>${b.rows.map(r => `<tr><td>${escapeHTML(r.name)}</td><td class="num">${r.correct} / ${r.n}</td>
        <td class="num">${fmtSeconds(r.medianRt)}</td></tr>`).join('')}</tbody>
    </table>`).join('');

  $('#again').onclick = () => { location.hash = `#/tests/${test.id}?again=${session.id}`; };
  $('#sessionPdf').onclick = e => withBusy(e.currentTarget, async () => {
    const others = sessions.forTest(test.id).filter(s => s.id !== session.id).map(withSummary).filter(Boolean);
    (await report()).sessionReport({ session, test, sum }, others, profile.name());
  });
  $('#csv').onclick = () => download(`attitude_${test.id}_${session.date.slice(0, 10)}.csv`, sessionsCsv(test, [session]), 'text/csv');
  $('#deleteSession').onclick = () => {
    if (!confirm('Delete this session?')) return;
    sessions.remove(session.id);
    location.hash = '#/';
  };

  show('session');
  // Drawn after the screen is visible so the chart can measure its width.
  trialChart($('#trialChart'), session.trials, sum.limitMs, sum.medianRt, t => test.describeTrial(t));
}

// ---------- Routing ----------
let activeTest = null;

function route() {
  activeTest?.close();
  activeTest = null;
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const [section, id] = path.split('/').filter(Boolean);

  if (section === 'tests' && testById(id)) {
    activeTest = testById(id);
    const again = sessions.get(new URLSearchParams(query).get('again'));
    if (again) history.replaceState(null, '', `#/tests/${id}`);   // a reload shouldn't start another run
    document.title = `${activeTest.name} – Attitude`;
    activeTest.open({ settings: again?.settings });
  } else if (section === 'sessions' && sessions.get(id)) {
    renderSession(sessions.get(id));
  } else {
    if (location.hash && location.hash !== '#/') history.replaceState(null, '', '#/');
    renderDashboard();
  }
}

let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!$('#dashboard').hidden) renderProgress(sessions.all().map(withSummary).filter(Boolean));
    const id = location.hash.match(/^#\/sessions\/(.+)$/)?.[1];
    if (id && !$('#session').hidden) renderSession(sessions.get(id));
  }, 150);
});

// ---------- Boot ----------
const masthead = $('#masthead').content;
$$('[data-masthead]').forEach(slot => {
  const header = masthead.cloneNode(true);
  if (slot.style.gridArea) header.firstElementChild.style.gridArea = slot.style.gridArea;
  slot.replaceWith(header);
});
for (const test of tests) {
  test.init(platform);
  thumbnails[test.id] = test.thumbnail?.();
}
addEventListener('hashchange', route);
route();
