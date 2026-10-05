// Everything is kept in this browser's localStorage. Storage can be unavailable (private mode,
// blocked site data); then the app still works, it just forgets on reload.

const SESSIONS = 'attitude.sessions';
const PROFILE = 'attitude.profile';

export function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

const newId = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

// A session: { id, testId, date, name, settings, trials: [{ trial, correct, rt, response, ... }] }
export const sessions = {
  all: () => load(SESSIONS, []),
  forTest: testId => sessions.all().filter(s => s.testId === testId),
  get: id => sessions.all().find(s => s.id === id) ?? null,
  add(session) {
    const full = { id: newId(), date: new Date().toISOString(), ...session };
    save(SESSIONS, [full, ...sessions.all()]);
    return full;
  },
  remove: id => save(SESSIONS, sessions.all().filter(s => s.id !== id)),
  clear: () => save(SESSIONS, []),
};

export const profile = {
  name: () => load(PROFILE, {}).name ?? '',
  setName: name => save(PROFILE, { ...load(PROFILE, {}), name }),
};

// Backup file: everything needed to move results to another browser.
export function exportData() {
  return { app: 'attitude', version: 1, exported: new Date().toISOString(), profile: load(PROFILE, {}), sessions: sessions.all() };
}

// Merges a backup into what is already here; sessions with the same id are not duplicated.
export function importData(data) {
  if (data?.app !== 'attitude' || !Array.isArray(data.sessions)) throw new Error('This file is not an Attitude backup.');
  const known = new Set(sessions.all().map(s => s.id));
  const added = data.sessions.filter(s => s.id && s.testId && Array.isArray(s.trials) && !known.has(s.id));
  const merged = [...sessions.all(), ...added].sort((a, b) => b.date.localeCompare(a.date));
  save(SESSIONS, merged);
  if (data.profile?.name && !profile.name()) profile.setName(data.profile.name);
  return added.length;
}
