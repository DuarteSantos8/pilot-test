// Every test the dashboard knows about. To add a test, create src/tests/<id>/index.js and list it here.
//
// A test module's default export is an object with:
//   id, name, description         shown on the dashboard
//   init(platform)                called once at startup; keep `platform` to call platform.finish(...)
//   open(options)                 show the test's own setup screen; options.settings starts a run right away
//   close()                       stop anything running (called when the user navigates away)
//   thumbnail()                   optional: an image URL for the dashboard card
//   variant(settings)             short label for how the test was set up, e.g. "Corner, two keys"
//   summarize(trials, settings)   -> { total, correct, accuracy, medianRt, timeouts, limitMs,
//                                      breakdowns: [{ title, rows: [{ name, n, correct, medianRt }] }] }
//   describeTrial(trial)          tooltip text for one trial in the results chart
//   csv                           { columns: [...], row(trial, session) -> [...] }
//   settingsSummary(settings)     optional, for PDF reports: [[label, value], ...] in plain words
//   trialColumns(settings)        optional, for PDF reports: [{ title, w, value(trial) -> text }]
//
// Each trial a test saves must have at least { trial, correct, rt, response } (response null = too slow).
// When a run is done the test calls platform.finish({ testId, settings, trials }).

import orientation from './orientation/index.js';

export const tests = [orientation];

export const testById = id => tests.find(t => t.id === id) ?? null;
