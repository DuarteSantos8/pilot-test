import * as THREE from 'three';
import { buildAircraft, buildArrow, disposeGroup } from './aircraft.js';
import { VIEWS, DIRECTIONS, PRESETS, MODES, keyFor, keysFor, answerName, directionFor, makeTrials, summarize } from './trials.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

// localStorage can be unavailable (private mode, blocked storage); the app works without it.
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not persisted */ } },
};

const DEFAULTS = {
  candidate: '', mode: 'corner', cornerFlip: true, preset: 'standard', views: PRESETS.standard.views, roll: 'any', oblique: false,
  trials: 20, limit: 5, feedback: true, sound: false, invertPitch: false,
};
const KEYS = { w: 'w', a: 'a', s: 's', d: 'd', arrowup: 'w', arrowleft: 'a', arrowdown: 's', arrowright: 'd' };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 3D scene, shared by every canvas ----------
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x8a949c, 2.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(4, 10, 6);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xc4d6e6, 0.9);
fill.position.set(-6, -5, -4);
scene.add(fill);
scene.add(buildAircraft());
let arrow = null;

function setArrow(dirVec) {
  if (arrow) { scene.remove(arrow); disposeGroup(arrow); arrow = null; }
  if (dirVec) { arrow = buildArrow(dirVec); scene.add(arrow); }
}

function makeRenderer(canvas, extra = {}) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, ...extra });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.toneMapping = THREE.ACESFilmicToneMapping;
  return r;
}

// Resize a renderer to its canvas' CSS box, only when it actually changed.
function fit(renderer, camera) {
  const c = renderer.domElement;
  const w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return;
  const size = renderer.getSize(new THREE.Vector2());
  if (size.x !== w || size.y !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

function aim(camera, target, viewDir, up, distance) {
  camera.position.copy(target).addScaledVector(viewDir, distance);
  camera.up.copy(up);
  camera.lookAt(target);
}

// ---------- Hero viewer: slowly turning aircraft, drag to orbit ----------
const hero = makeRenderer($('#hero'));
const heroCam = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
const orbit = { yaw: 0.85, pitch: 0.38, drag: null };

$('#viewer').addEventListener('pointerdown', e => {
  orbit.drag = { x: e.clientX, y: e.clientY };
  e.currentTarget.setPointerCapture(e.pointerId);
});
$('#viewer').addEventListener('pointermove', e => {
  if (!orbit.drag) return;
  orbit.yaw -= (e.clientX - orbit.drag.x) * 0.008;
  orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + (e.clientY - orbit.drag.y) * 0.006, -1.45, 1.45);
  orbit.drag = { x: e.clientX, y: e.clientY };
});
$('#viewer').addEventListener('pointerup', () => { orbit.drag = null; });

function heroFrame() {
  if ($('#setup').hidden) return;
  if (!orbit.drag && !reducedMotion) orbit.yaw += 0.0025;
  fit(hero, heroCam);
  const dir = new THREE.Vector3(
    Math.cos(orbit.pitch) * Math.sin(orbit.yaw), Math.sin(orbit.pitch), Math.cos(orbit.pitch) * Math.cos(orbit.yaw));
  const distance = 20 * Math.max(1, 1.3 / heroCam.aspect);   // back off on narrow screens
  aim(heroCam, new THREE.Vector3(0, 0.2, 0.3), dir, new THREE.Vector3(0, 1, 0), distance);
  hero.render(scene, heroCam);
  requestAnimationFrame(heroFrame);
}

// Still pictures of each side for the briefing, rendered once.
function renderSides() {
  const r = makeRenderer(document.createElement('canvas'), { preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(360, 240);
  const cam = new THREE.PerspectiveCamera(36, 1.5, 0.1, 100);
  $('#sides').innerHTML = VIEWS.map(view => {
    const distance = { top: 15, bottom: 15, left: 13, right: 13 }[view.id] ?? 11;
    aim(cam, new THREE.Vector3(0, 0.3, 0.3), view.dir, view.up, distance);
    r.render(scene, cam);
    return `<li><img src="${r.domElement.toDataURL()}" alt="Aircraft seen from the ${view.name.toLowerCase()}"><span>${view.name}</span></li>`;
  }).join('');
  r.dispose();
}

// ---------- Settings form ----------
const form = $('#settings');
let settings = { ...DEFAULTS, ...store.get('attitude.settings', {}) };

$('#viewChips').innerHTML = VIEWS.map(v =>
  `<label><input type="checkbox" name="views" value="${v.id}"><span>${v.name}</span></label>`).join('');

function keypadHTML(invert) {
  const order = ['w', 'a', 's', 'd'];
  return order.map(key => {
    const dir = DIRECTIONS.find(d => keyFor(d.id, invert) === key);
    return `<div class="key"><span class="cap" data-key="${key}">${key.toUpperCase()}</span><small>${dir.name}</small></div>`;
  }).join('');
}

function writeForm() {
  form.candidate.value = settings.candidate;
  form.cornerFlip.checked = settings.cornerFlip;
  form.roll.value = settings.roll;
  form.oblique.checked = settings.oblique;
  form.trials.value = settings.trials;
  form.limit.value = settings.limit;
  form.feedback.checked = settings.feedback;
  form.sound.checked = settings.sound;
  form.invertPitch.checked = settings.invertPitch;
  $$('#viewChips input').forEach(i => { i.checked = settings.views.includes(i.value); });
  refreshForm();
}

function readForm() {
  settings = {
    ...settings,
    candidate: form.candidate.value.trim(),
    cornerFlip: form.cornerFlip.checked,
    views: $$('#viewChips input:checked').map(i => i.value),
    roll: form.roll.value,
    oblique: form.oblique.checked,
    trials: +form.trials.value,
    limit: +form.limit.value,
    feedback: form.feedback.checked,
    sound: form.sound.checked,
    invertPitch: form.invertPitch.checked,
  };
  store.set('attitude.settings', settings);
}

function refreshForm() {
  $$('#modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === settings.mode));
  $('#modeAbout').textContent = MODES[settings.mode];
  $('#cornerOptions').hidden = settings.mode !== 'corner';
  $('#arrowOptions').hidden = settings.mode !== 'arrow';
  $$('[data-mode-text]').forEach(p => { p.hidden = p.dataset.modeText !== settings.mode; });
  $$('#presets button').forEach(b => b.setAttribute('aria-pressed', b.dataset.preset === settings.preset));
  $('#presetAbout').textContent = PRESETS[settings.preset].about;
  $('#custom').hidden = settings.preset !== 'custom';
  $('output[data-for="trials"]').textContent = settings.trials;
  $('output[data-for="limit"]').textContent = `${settings.limit} s`;
  $$('[data-keypad]').forEach(k => { k.innerHTML = keypadHTML(settings.invertPitch); });
}

function applyPreset(name) {
  settings.preset = name;
  if (name !== 'custom') Object.assign(settings, { views: PRESETS[name].views, roll: PRESETS[name].roll, oblique: PRESETS[name].oblique });
  writeForm();
  readForm();
}

$('#modes').addEventListener('click', e => {
  const mode = e.target.dataset?.mode;
  if (!mode) return;
  settings.mode = mode;
  store.set('attitude.settings', settings);
  refreshForm();
});
$('#presets').addEventListener('click', e => {
  const name = e.target.dataset?.preset;
  if (name) applyPreset(name);
});
form.addEventListener('input', e => {
  // Touching the custom controls means the mix is no longer one of the presets.
  if (e.target.closest('#custom')) settings.preset = 'custom';
  readForm();
  refreshForm();
  $('#formError').hidden = true;
});
form.addEventListener('submit', e => { e.preventDefault(); startSession(false); });
$('#practice').addEventListener('click', () => startSession(true));

// ---------- Sound ----------
let audio = null;
function beep(freq, ms) {
  if (!settings.sound) return;
  audio ??= new AudioContext();
  const osc = audio.createOscillator(), gain = audio.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.12, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + ms / 1000);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + ms / 1000);
}

// ---------- Test session ----------
const sky = makeRenderer($('#sky'));
const skyCam = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
let session = null;   // { practice, settings, trials, results, index }
let pending = null;   // the trial waiting for an answer: { start, timeout, raf }

// The keypad covers the bottom of the screen, so the picture is centred in the space above it.
function fitSky() {
  const w = innerWidth, h = innerHeight, lift = Math.min(90, h * 0.1);
  sky.setSize(w, h, false);
  skyCam.aspect = w / (h + 2 * lift);
  skyCam.setViewOffset(w, h + 2 * lift, 0, 2 * lift, w, h);
}

// `progress` (0..1) is how much of the time limit has passed; the corner test uses it to move the aircraft.
function renderTrial(trial, mode, progress = 0) {
  if (mode === 'corner') return renderCornerTrial(trial, progress);
  drawGuide(null);
  fitSky();
  setArrow(trial.dirVec);
  const target = new THREE.Vector3(0, 0, 2.2).addScaledVector(trial.dirVec, 1.5);
  aim(skyCam, target, trial.viewDir, trial.up, 38 * Math.max(1, 0.8 / skyCam.aspect));
  sky.render(scene, skyCam);
}

// Corner test: the aircraft starts in one corner and flies along a dashed line to the opposite corner,
// arriving at the arrow tip exactly when the time runs out.
function renderCornerTrial(trial, progress) {
  const w = innerWidth, h = innerHeight;
  const mx = Math.min(w * 0.2, 280), top = Math.min(h * 0.22, 190), bottom = h - Math.min(h * 0.3, 250);
  const spots = { tl: [mx, top], tr: [w - mx, top], bl: [mx, bottom], br: [w - mx, bottom] };
  const opposite = { tl: 'br', tr: 'bl', bl: 'tr', br: 'tl' };
  const [sx, sy] = spots[trial.corner];
  const [ex, ey] = spots[opposite[trial.corner]];
  const px = sx + (ex - sx) * progress, py = sy + (ey - sy) * progress;
  const span = THREE.MathUtils.clamp(Math.min(w, h) * 0.36, 140, 380);   // wingspan on screen, px

  // Shift the camera's centre onto (px, py) with a view offset inside a larger virtual frame.
  const a = Math.abs(px - w / 2), b = Math.abs(py - h / 2);
  const fw = w + 2 * a, fh = h + 2 * b;
  sky.setSize(w, h, false);
  skyCam.aspect = fw / fh;
  skyCam.setViewOffset(fw, fh, w / 2 + a - px, h / 2 + b - py, w, h);
  const distance = (10.5 * fh / span) / (2 * Math.tan(THREE.MathUtils.degToRad(skyCam.fov / 2)));
  setArrow(null);
  aim(skyCam, new THREE.Vector3(0, 0.3, 0), trial.viewDir, trial.up, distance);
  sky.render(scene, skyCam);

  // The line shows the path still ahead, starting just outside the aircraft.
  const len = Math.hypot(ex - sx, ey - sy), ux = (ex - sx) / len, uy = (ey - sy) / len;
  const remaining = Math.hypot(ex - px, ey - py) - span * 0.55;
  const from = remaining > 40 ? { x: px + ux * span * 0.55, y: py + uy * span * 0.55 }
                              : { x: ex - ux * 27, y: ey - uy * 27 };   // only the arrowhead is left
  drawGuide(from, { x: ex, y: ey });
}

function drawGuide(from, to) {
  const g = $('#guide');
  if (!from) { g.innerHTML = ''; return; }
  g.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const ux = (to.x - from.x) / len, uy = (to.y - from.y) / len;
  const base = { x: to.x - ux * 26, y: to.y - uy * 26 };
  const head = [[to.x, to.y], [base.x - uy * 14, base.y + ux * 14], [base.x + uy * 14, base.y - ux * 14]].join(' ');
  const line = (color, width) => `<line x1="${from.x}" y1="${from.y}" x2="${base.x}" y2="${base.y}"
    stroke="${color}" stroke-width="${width}" stroke-dasharray="22 16" stroke-linecap="round"/>`;
  g.innerHTML = line('#2a2100', 9) + line('#ffc21a', 5) +
    `<polygon points="${head}" fill="#ffc21a" stroke="#2a2100" stroke-width="2.5" stroke-linejoin="round"/>`;
}

function show(id) {
  for (const s of ['setup', 'test', 'results']) $('#' + s).hidden = s !== id;
  if (id === 'setup') { setArrow(null); drawGuide(null); requestAnimationFrame(heroFrame); }
}

function startSession(practice) {
  readForm();
  if (settings.mode === 'arrow' && !settings.views.length) {
    $('#formError').textContent = 'Pick at least one side to show.';
    $('#formError').hidden = false;
    return;
  }
  const s = { ...settings, feedback: practice || settings.feedback };
  const count = practice ? 5 : s.trials;
  session = { practice, settings: s, trials: makeTrials(s, count), results: [], index: -1 };
  $('#testTitle').textContent = practice ? 'Practice' : (s.candidate || 'Test');
  $('#keyHint').hidden = s.mode !== 'corner';
  $('#progress').innerHTML = '<li></li>'.repeat(count);
  $('#practiceNote').hidden = true;
  show('test');
  nextTrial();
}

function nextTrial() {
  if (!session) return;   // stopped with Esc while feedback was showing
  const { trials, settings: s } = session;
  session.index++;
  if (session.index >= trials.length) return finish();

  $$('#progress li')[session.index].className = 'now';
  $('#verdict').textContent = '';
  held.clear();
  $$('.test-keys .cap').forEach(c => { c.className = 'cap'; });
  $('#sky').style.visibility = 'hidden';
  drawGuide(null);
  $('#crosshair').hidden = false;
  $('#timer').style.transform = 'scaleX(1)';

  setTimeout(() => {
    if (!session) return;
    $('#crosshair').hidden = true;
    renderTrial(trials[session.index], s.mode);
    $('#sky').style.visibility = 'visible';

    pending = { start: performance.now() };
    pending.timeout = setTimeout(() => answer(null), s.limit * 1000);
    const trial = trials[session.index];
    const tick = () => {
      if (!pending) return;
      const done = Math.min(1, (performance.now() - pending.start) / (s.limit * 1000));
      $('#timer').style.transform = `scaleX(${1 - done})`;
      if (s.mode === 'corner') renderCornerTrial(trial, done);
      pending.raf = requestAnimationFrame(tick);
    };
    tick();
  }, 450);
}

function answer(response) {
  if (!pending) return;
  clearTimeout(pending.timeout);
  cancelAnimationFrame(pending.raf);
  const rt = Math.round(performance.now() - pending.start);
  pending = null;
  held.clear();

  const { settings: s, trials, index } = session;
  const trial = trials[index];
  const correct = response === trial.dir;
  session.results.push({ trial: index + 1, view: trial.view, roll: trial.roll, corner: trial.corner ?? '',
    expected: trial.dir, response, correct, rt });

  const tick = $$('#progress li')[index];
  if (s.feedback) {
    tick.className = correct ? 'right' : 'wrong';
    const cap = key => $(`.test-keys .cap[data-key="${key}"]`);
    const expectedKeys = keysFor(trial.dir, s.invertPitch);
    $$('.test-keys .cap').forEach(c => c.classList.remove('held'));
    if (!correct) expectedKeys.forEach(k => cap(k).classList.add('expected'));
    for (const k of response ? keysFor(response, s.invertPitch) : []) {
      if (correct) cap(k).classList.add('hit-right');
      else if (!expectedKeys.includes(k)) cap(k).classList.add('hit-wrong');
    }
    const keys = expectedKeys.map(k => k.toUpperCase()).join(' + ');
    $('#verdict').textContent = correct ? `${rt} ms`
      : `${response ? 'Wrong' : 'Too slow'}, it was ${answerName(trial.dir).toLowerCase()} (${keys})`;
    beep(correct ? 880 : 200, correct ? 90 : 220);
  } else {
    tick.className = 'done';
    beep(520, 60);
  }
  setTimeout(nextTrial, !s.feedback ? 250 : correct ? 550 : 1400);
}

function stopSession() {
  if (pending) { clearTimeout(pending.timeout); cancelAnimationFrame(pending.raf); pending = null; }
  session = null;
  show('setup');
}

// Answer keys currently held (keyboard) or tapped (touch). The arrow test answers on the first key;
// the corner test waits for one up/down key plus one left/right key.
const held = new Set();

function press(key) {
  if (!pending) return;
  const s = session.settings;
  const dir = directionFor(key, s.invertPitch);
  if (s.mode !== 'corner') return answer(dir);

  held.add(dir);
  $(`.test-keys .cap[data-key="${key}"]`).classList.add('held');
  const vertical = [...held].filter(d => d === 'up' || d === 'down');
  const horizontal = [...held].filter(d => d === 'left' || d === 'right');
  if (vertical.length > 1 || horizontal.length > 1) answer([...held].join('+'));   // W+S or A+D
  else if (vertical.length && horizontal.length) answer(`${vertical[0]}-${horizontal[0]}`);
}

// Letting go of a lone key before pressing its partner counts as that single answer.
function release(key) {
  const dir = directionFor(key, session?.settings.invertPitch);
  if (pending && session.settings.mode === 'corner' && held.size === 1 && held.has(dir)) answer(dir);
}

addEventListener('keydown', e => {
  if ($('#test').hidden) return;
  if (e.key === 'Escape') return stopSession();
  const key = KEYS[e.key.toLowerCase()];
  if (!key) return;
  e.preventDefault();
  if (!e.repeat) press(key);
});
addEventListener('keyup', e => {
  const key = KEYS[e.key.toLowerCase()];
  if (key && !$('#test').hidden) release(key);
});
// Touch screens: the keycaps on the test screen can be tapped (two taps for the corner test).
$('.test-keys').addEventListener('pointerdown', e => {
  const key = e.target.closest('.cap')?.dataset.key;
  if (key) press(key);
});
addEventListener('resize', () => {
  if (!pending) return;
  const done = Math.min(1, (performance.now() - pending.start) / (session.settings.limit * 1000));
  renderTrial(session.trials[session.index], session.settings.mode, done);
});

// ---------- Results ----------
const fmtMs = ms => ms == null ? '–' : `${(ms / 1000).toFixed(2)} s`;

function finish() {
  const { practice, results, settings: s } = session;
  const sum = summarize(results, s.mode);
  if (practice) {
    session = null;
    show('setup');
    $('#practiceNote').textContent = `Practice done: ${sum.correct} of ${sum.total} right. Start the test when ready.`;
    $('#practiceNote').hidden = false;
    return;
  }

  const history = store.get('attitude.history', []);
  history.unshift({ date: new Date().toISOString(), candidate: s.candidate || 'Unnamed', mode: s.mode, preset: s.preset,
    correct: sum.correct, total: sum.total, medianRt: sum.medianRt });
  store.set('attitude.history', history.slice(0, 50));

  $('#resultsTitle').textContent = `${s.candidate || 'Unnamed candidate'}, ${s.mode === 'corner' ? 'corner test' : `${s.preset} difficulty`}`;
  $('#accuracy').textContent = `${Math.round(sum.accuracy * 100)}%`;
  $('#medianRt').textContent = fmtMs(sum.medianRt);
  $('#timeouts').textContent = sum.timeouts;
  drawChart(results, s.limit * 1000, sum.medianRt);

  const rows = groups => groups.map(g =>
    `<tr><td>${g.name}</td><td class="num">${g.correct} / ${g.n}</td><td class="num">${fmtMs(g.medianRt)}</td></tr>`).join('');
  $('#byView').innerHTML = rows(sum.byView);
  $('#byDirection').innerHTML = rows(sum.byDirection);
  renderHistory();
  show('results');
}

// One bar per trial, height = reaction time relative to the time limit.
function drawChart(results, limitMs, medianRt) {
  const w = results.length * 10, h = 100;
  const bars = results.map((r, i) => {
    const cls = r.response === null ? 'timeout' : r.correct ? 'right' : 'wrong';
    const bh = Math.max(2, (Math.min(r.rt, limitMs) / limitMs) * h);
    return `<rect class="${cls}" x="${i * 10 + 1.5}" y="${h - bh}" width="7" height="${bh}"><title>Trial ${r.trial}: ${r.rt} ms</title></rect>`;
  }).join('');
  const med = medianRt == null ? '' : `<line x1="0" x2="${w}" y1="${h - (medianRt / limitMs) * h}" y2="${h - (medianRt / limitMs) * h}"/>`;
  $('#chart').setAttribute('viewBox', `0 0 ${w} ${h}`);
  $('#chart').innerHTML = bars + med;
  $('#chartScale').textContent = `Bar height up to ${limitMs / 1000} s, dashed line is the median`;
}

function renderHistory() {
  const history = store.get('attitude.history', []);
  $('#history').innerHTML = history.length
    ? history.slice(0, 10).map(h => `<tr><td>${new Date(h.date).toLocaleDateString()}</td><td>${escapeHTML(h.candidate)}</td>
        <td class="num">${h.correct} / ${h.total}</td><td class="num">${fmtMs(h.medianRt)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">Finished tests show up here.</td></tr>';
}

const escapeHTML = s => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

function downloadCsv() {
  const s = session.settings;
  const head = 'candidate,test,trial,side,picture_rotation_deg,corner,answer,response,correct,reaction_ms';
  const test = s.mode === 'corner' ? 'corner' : s.preset;
  const lines = session.results.map(r =>
    [JSON.stringify(s.candidate), test, r.trial, r.view, r.roll, r.corner, r.expected, r.response ?? 'timeout', r.correct, r.rt].join(','));
  const url = URL.createObjectURL(new Blob([[head, ...lines].join('\n')], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), {
    href: url, download: `attitude_${(s.candidate || 'candidate').replace(/\W+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

$('#again').addEventListener('click', () => startSession(false));
$('#toSetup').addEventListener('click', () => { session = null; show('setup'); });
$('#csv').addEventListener('click', downloadCsv);
$('#clearHistory').addEventListener('click', () => { store.set('attitude.history', []); renderHistory(); });

// ---------- Boot ----------
const masthead = $('#masthead').content;
$$('[data-masthead]').forEach(slot => slot.replaceWith(masthead.cloneNode(true)));
writeForm();
renderSides();
show('setup');

// Lets scripts (used to record the README demo) read the current trial: open with ?demo.
if (new URLSearchParams(location.search).has('demo')) {
  window.attitude = {
    get trial() { return session?.trials[session.index]; },
    get waiting() { return pending !== null; },
    get settings() { return session?.settings; },
    get answerKeys() { return session && keysFor(session.trials[session.index].dir, session.settings.invertPitch); },
  };
}
