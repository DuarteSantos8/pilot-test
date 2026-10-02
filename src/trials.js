import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

// Body frame of the aircraft: nose = +Z, top = +Y, pilot's left = +X.
// `up` is the screen-up direction used when the picture is not rotated.
export const VIEWS = [
  { id: 'top',    name: 'Top',        dir: v(0, 1, 0),  up: v(0, 0, 1) },
  { id: 'bottom', name: 'Bottom',     dir: v(0, -1, 0), up: v(0, 0, 1) },
  { id: 'front',  name: 'Front',      dir: v(0, 0, 1),  up: v(0, 1, 0) },
  { id: 'back',   name: 'Back',       dir: v(0, 0, -1), up: v(0, 1, 0) },
  { id: 'left',   name: 'Left side',  dir: v(1, 0, 0),  up: v(0, 1, 0) },
  { id: 'right',  name: 'Right side', dir: v(-1, 0, 0), up: v(0, 1, 0) },
];

export const DIRECTIONS = [
  { id: 'down',  name: 'Nose down',  vec: v(0, -1, 0) },
  { id: 'up',    name: 'Nose up',    vec: v(0, 1, 0) },
  { id: 'left',  name: 'Turn left',  vec: v(1, 0, 0) },
  { id: 'right', name: 'Turn right', vec: v(-1, 0, 0) },
];

// Corner test answers: two keys at once.
export const DIAGONALS = [
  { id: 'up-left',    name: 'Nose up and left',    v: 'up',   h: 'left' },
  { id: 'up-right',   name: 'Nose up and right',   v: 'up',   h: 'right' },
  { id: 'down-left',  name: 'Nose down and left',  v: 'down', h: 'left' },
  { id: 'down-right', name: 'Nose down and right', v: 'down', h: 'right' },
];

export const MODES = {
  corner: 'The aircraft sits in a corner, seen from the front or back. Fly it along the line with two keys.',
  arrow: 'The aircraft is seen from any side with an arrow off its nose. Answer with one key.',
};

export const PRESETS = {
  easy:     { views: ['front', 'back'], roll: 'flip', oblique: false,
              about: 'Front and back only. The picture may be upside down.' },
  standard: { views: VIEWS.map(v => v.id), roll: 'any', oblique: false,
              about: 'All six sides, with the picture rotated at random.' },
  advanced: { views: VIEWS.map(v => v.id), roll: 'any', oblique: true,
              about: 'Angled views in between the sides, any rotation.' },
  custom:   { about: 'Your own mix of sides and rotation, set below.' },
};

// Like a real stick: pushing forward (W) lowers the nose, unless pitch is inverted.
export function keyFor(dirId, invertPitch) {
  if (dirId === 'left') return 'a';
  if (dirId === 'right') return 'd';
  const forward = (dirId === 'down') !== invertPitch;
  return forward ? 'w' : 's';
}

export function directionFor(key, invertPitch) {
  return DIRECTIONS.find(d => keyFor(d.id, invertPitch) === key)?.id ?? null;
}

// Keys for any answer id: 'left', 'down-left' (diagonal) or 'up+down' (an invalid pair).
export function keysFor(id, invertPitch) {
  const diagonal = DIAGONALS.find(d => d.id === id);
  const parts = diagonal ? [diagonal.v, diagonal.h] : id.split('+');
  return parts.map(part => keyFor(part, invertPitch));
}

export const answerName = id => (DIAGONALS.find(d => d.id === id) ?? DIRECTIONS.find(d => d.id === id))?.name ?? id;

const pick = list => list[Math.floor(Math.random() * list.length)];

// One trial = a camera direction + picture rotation + the direction the arrow points.
// Combinations where the arrow would point into or out of the screen are skipped.
function makeTrial(settings) {
  const views = VIEWS.filter(view => settings.views.includes(view.id));
  for (;;) {
    const view = pick(views);
    const dir = pick(DIRECTIONS);
    const viewDir = view.dir.clone();
    if (settings.oblique) {
      viewDir.add(new THREE.Vector3().randomDirection().multiplyScalar(0.45)).normalize();
    }
    if (Math.abs(viewDir.dot(dir.vec)) > 0.5) continue;

    const roll = settings.roll === 'any' ? Math.random() * 360
               : settings.roll === 'flip' ? pick([0, 180]) : 0;
    const up = view.up.clone().addScaledVector(viewDir, -view.up.dot(viewDir)).normalize();
    up.applyAxisAngle(viewDir, THREE.MathUtils.degToRad(roll));
    return { view: view.id, dir: dir.id, dirVec: dir.vec, viewDir, up, roll: Math.round(roll) };
  }
}

// Screen corners as (x right, y up) signs.
const CORNERS = { tl: [-1, 1], tr: [1, 1], bl: [-1, -1], br: [1, -1] };

// Corner trial: seen from the front or back (maybe upside down), placed in a corner of the screen,
// with a line to the opposite corner. The answer is that line's direction in the aircraft's own axes.
function makeCornerTrial(settings) {
  const view = pick(VIEWS.filter(view => view.id === 'front' || view.id === 'back'));
  const roll = settings.cornerFlip ? pick([0, 180]) : 0;
  const corner = pick(settings.corners === 'any' ? Object.keys(CORNERS) : ['tl', 'tr']);
  const viewDir = view.dir.clone();
  const up = view.up.clone().applyAxisAngle(viewDir, THREE.MathUtils.degToRad(roll));

  const [cx, cy] = CORNERS[corner];
  const right = viewDir.clone().negate().cross(up);          // screen-right for this camera
  const alongLine = vec => -cx * vec.dot(right) - cy * vec.dot(up);
  const h = alongLine(v(1, 0, 0)) > 0 ? 'left' : 'right';     // pilot's left is +X
  const vert = alongLine(v(0, 1, 0)) > 0 ? 'up' : 'down';     // top of the aircraft is +Y
  return { view: view.id, viewDir, up, roll, corner, dir: `${vert}-${h}` };
}

export function makeTrials(settings, count) {
  const make = settings.mode === 'corner' ? makeCornerTrial : makeTrial;
  const trials = [];
  while (trials.length < count) {
    let trial = make(settings);
    const prev = trials.at(-1);
    // Avoid showing the same side + answer twice in a row.
    for (let i = 0; i < 10 && prev && prev.view === trial.view && prev.dir === trial.dir; i++) {
      trial = make(settings);
    }
    trials.push(trial);
  }
  return trials;
}

export const median = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function summarize(results, mode = 'arrow') {
  const correct = results.filter(r => r.correct);
  const group = (keyOf, items) => items.map(item => {
    const rs = results.filter(r => keyOf(r) === item.id);
    const ok = rs.filter(r => r.correct);
    return { name: item.name, n: rs.length, correct: ok.length, medianRt: median(ok.map(r => r.rt)) };
  }).filter(g => g.n > 0);

  return {
    total: results.length,
    correct: correct.length,
    accuracy: results.length ? correct.length / results.length : 0,
    medianRt: median(correct.map(r => r.rt)),
    timeouts: results.filter(r => r.response === null).length,
    byView: mode === 'corner'
      ? group(r => `${r.view}:${r.roll}`, ['front', 'back'].flatMap(id => [0, 180].map(roll => ({
          id: `${id}:${roll}`, name: `${id === 'front' ? 'Front' : 'Back'}, ${roll ? 'upside down' : 'upright'}` }))))
      : group(r => r.view, VIEWS),
    byDirection: group(r => r.expected, mode === 'corner' ? DIAGONALS : DIRECTIONS),
  };
}
