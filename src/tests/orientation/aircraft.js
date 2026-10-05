import * as THREE from 'three';

// A small jet trainer built from primitives. Body frame: nose = +Z, top = +Y, pilot's left = +X.
// Top surfaces are light and the belly is dark, so top and bottom views can't be confused.

const TOP = new THREE.MeshStandardMaterial({ color: 0xe3e6e8, roughness: 0.45, metalness: 0.1 });
const BELLY = new THREE.MeshStandardMaterial({ color: 0x5f6b76, roughness: 0.6, metalness: 0.1 });
const METAL = new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.35, metalness: 0.7 });
const VOID = new THREE.MeshBasicMaterial({ color: 0x111417 });
const GLASS = new THREE.MeshStandardMaterial({ color: 0x35648a, roughness: 0.12, metalness: 0.1, emissive: 0x0c2236 });
const STRIPE = new THREE.MeshStandardMaterial({ color: 0xf2b200, roughness: 0.5 });

export const ARROW_COLOR = 0xffc21a;

// Lathe profile (radius, position along the body), tail to nose.
const FUSELAGE_PROFILE = [
  [0.34, -4.3], [0.46, -3.8], [0.6, -2.6], [0.68, -1], [0.68, 0.8],
  [0.62, 2.2], [0.5, 3.3], [0.32, 4.3], [0.12, 5.0], [0, 5.15],
].map(([r, z]) => new THREE.Vector2(r, z));

// Half of a lathe, rotated so the lathe axis becomes +Z. `top` picks the upper or lower half.
function fuselageHalf(top) {
  const geo = new THREE.LatheGeometry(FUSELAGE_PROFILE, 40, top ? Math.PI / 2 : -Math.PI / 2, Math.PI);
  geo.rotateX(Math.PI / 2);
  return new THREE.Mesh(geo, top ? TOP : BELLY);
}

// A flat lifting surface (wing / stabiliser) from a planform outline in (x, z).
// Two thin layers: light on top, dark underneath.
function planform(points, thickness) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const group = new THREE.Group();
  for (const [mat, offset] of [[TOP, thickness], [BELLY, 0]]) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);           // shape y -> world z, extrusion -> world -y
    geo.translate(0, offset, 0);
    group.add(new THREE.Mesh(geo, mat));
  }
  return group;
}

const mirror = pts => [...pts, ...pts.slice().reverse().map(([x, z]) => [-x, z])];

function navLight(color, x, z) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshBasicMaterial({ color })));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
  group.add(halo);
  group.position.set(x, -0.12, z);
  return group;
}

export function buildAircraft() {
  const plane = new THREE.Group();
  plane.add(fuselageHalf(true), fuselageHalf(false));

  // Canopy: stretched glass dome with a thin frame line.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), GLASS);
  canopy.scale.set(0.36, 0.42, 1.3);
  canopy.position.set(0, 0.52, 2.1);
  plane.add(canopy);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.03, 8, 24, Math.PI), METAL);
  frame.position.set(0, 0.52, 1.85);
  plane.add(frame);

  // Low swept wing, root to tip.
  const wing = planform(mirror([[0.5, 1.7], [4.9, -0.15], [4.9, -0.75], [0.5, -1.15]]), 0.06);
  wing.position.set(0, -0.2, 0);
  plane.add(wing);

  // Tailplane and fin.
  const tail = planform(mirror([[0.3, 0.45], [1.9, -0.45], [1.9, -0.9], [0.3, -1.0]]), 0.05);
  tail.position.set(0, 0.05, -3.2);
  plane.add(tail);

  const finShape = new THREE.Shape([[0.9, 0], [-0.35, 1.75], [-0.95, 1.75], [-1.3, 0]].map(([z, y]) => new THREE.Vector2(z, y)));
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.08, bevelEnabled: false });
  finGeo.rotateY(-Math.PI / 2);         // shape x -> world z, extrusion -> world -x
  finGeo.translate(0.04, 0, 0);
  const fin = new THREE.Mesh(finGeo, TOP);
  fin.position.set(0, 0.45, -3.0);
  plane.add(fin);
  const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.62), STRIPE);
  finTip.position.set(0, 2.08, -3.97);
  plane.add(finTip);

  // Side intakes and exhaust nozzle.
  for (const side of [1, -1]) {
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.4, 20), TOP);
    intake.rotation.x = Math.PI / 2;
    intake.position.set(0.55 * side, -0.05, 0.85);
    plane.add(intake);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.19, 20), VOID);
    mouth.position.set(0.55 * side, -0.05, 1.56);
    plane.add(mouth);
  }
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.45, 24, 1, true), METAL);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = -4.45;
  plane.add(nozzle);
  const exhaust = new THREE.Mesh(new THREE.CircleGeometry(0.31, 24), VOID);
  exhaust.rotation.y = Math.PI;
  exhaust.position.z = -4.5;
  plane.add(exhaust);

  // Navigation lights: red on the left wingtip (+X), green on the right.
  plane.add(navLight(0xff2a2a, 4.95, -0.45), navLight(0x22ff6a, -4.95, -0.45));
  return plane;
}

// Curved arrow leaving the nose and bending toward `dir` (a unit vector in the body frame).
// Drawn on top of everything with a dark outline so it reads against sky and aircraft alike.
export function buildArrow(dir) {
  const start = new THREE.Vector3(0, 0, 5.5);
  const ctrl = new THREE.Vector3(0, 0, 8.6);
  const end = ctrl.clone().addScaledVector(dir, 4.6);
  const curve = new THREE.QuadraticBezierCurve3(start, ctrl, end);
  const group = new THREE.Group();

  const layers = [[0x2a2100, 0.24, 0.62, 9], [ARROW_COLOR, 0.15, 0.48, 10]];
  for (const [color, radius, headRadius, order] of layers) {
    const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, radius, 12), mat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(headRadius, 1.3, 20), mat);
    head.position.copy(end).addScaledVector(dir, 0.55);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    for (const m of [tube, head]) { m.renderOrder = order; group.add(m); }
  }
  return group;
}

export function disposeGroup(group) {
  group.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
}
