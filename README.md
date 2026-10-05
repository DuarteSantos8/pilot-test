<h1>
  <img src="docs/logo.svg" width="40" align="top" alt="">
  Attitude
</h1>

Aptitude tests for pilot candidates. It runs in the browser.
A dashboard keeps every session, so you can see how you're doing over time. Spatial orientation is the first test, and more are planned.

In the spatial orientation test, an aircraft appears in a corner of the screen, seen from the front or the back and sometimes upside down.
It starts in any of the four corners, flies along a dashed line to the opposite corner, and reaches the arrow tip when the time is up (5 seconds by default).
Before then, the candidate presses the two keys that would fly it along that line, as the pilot sitting inside would.
For example W + A for nose down and left.

**[Try it online](https://duartesantos8.github.io/pilot-test/)**

![From the dashboard into a test run, then the session results](docs/demo.gif)

## Why

Aircrew selection tests check whether someone can tell how an aircraft is oriented, even when they see it from outside and rotated,
and can work out which control input it needs. This project does that one task with a keyboard instead of a joystick.
Every answer is timed and recorded.

## Dashboard

![Dashboard with the test list, progress charts, past sessions and data tools](docs/dashboard.png)

- **Tests**: every available test, with your number of sessions, last and best score. Start a test from here.
- **Progress**: correct answers and median reaction time for each session, oldest to newest. Hover a point for details.
- **Sessions**: every finished run. Click one to open its full results again.
- **Your name**: saved once and attached to every session.
- **Your data**: results are stored in this browser only.
  - **Export backup** saves everything as a JSON file, and **Import backup** loads it back on another device or browser (sessions that are already there are skipped).
  - **All trials (CSV)** gives one row per trial over all sessions, ready for a spreadsheet.
  - **Delete all results** clears everything.

## Spatial orientation

There are two test types.

### Corner, two keys (default)

![Four corner trials: front and back views, upright and upside down](docs/corner.png)

1. A crosshair shows for a moment so every trial starts the same way.
2. The aircraft appears in one of the four corners, seen from the **front or the back**, upright or **upside down**.
   A dashed line runs to the opposite corner, and the aircraft flies along it, reaching the arrow tip as the time runs out.
3. The candidate presses **one up/down key and one left/right key together**. The answer and the reaction time are recorded.

The trick is that the screen and the aircraft disagree. Seen from the front, the aircraft's left is on your right.
Upside down, its "up" is your "down". A line going down and left on screen can mean nose up and right for the pilot.

Letting go of a single key before pressing the second one counts as an answer, and it is wrong.
So is pressing W + S or A + D. On touch screens, tap the two keys one after the other.

The line can go up or down, left or right. Upside-down pictures can be turned off in the settings.

### Arrow, one key

![Three arrow trials: seen from below, from the side at an angle, and from above](docs/trials.png)

The aircraft appears from any of the six sides, rotated, with a curved yellow arrow leaving its nose. The candidate presses the one key for that direction.
This type has its own difficulty levels (see below).

### Reading the aircraft

- The **canopy** is on top. **Top surfaces are light** and the **belly is dark**.
- **Red** light on the **left** wingtip, **green** on the **right**, like real navigation lights.
- Directions are always relative to the aircraft, not the screen.

## Controls

| Key | Stick | Aircraft |
| --- | --- | --- |
| <kbd>W</kbd> / <kbd>↑</kbd> | forward | nose down |
| <kbd>S</kbd> / <kbd>↓</kbd> | back | nose up |
| <kbd>A</kbd> / <kbd>←</kbd> | left | turn left |
| <kbd>D</kbd> / <kbd>→</kbd> | right | turn right |

<kbd>Esc</kbd> stops the test. On a touch screen, tap the keys shown at the bottom of the screen.
Pitch can be inverted in the settings for people who think "W = up".

## Difficulty (arrow test)

| Level | Sides shown | Picture |
| --- | --- | --- |
| Easy | front and back | upright or upside down |
| Standard | all six sides | rotated to any angle |
| Advanced | angled views in between the sides | rotated to any angle |
| Custom | pick any sides | upright, upside down or any angle, angled views on or off |

Each level only shows trials where the arrow is clearly visible. "Nose up" is never shown from straight above, because the arrow would point straight at the screen.

## Spatial orientation settings

![Setup screen with the 3D aircraft, the six reference views and the settings](docs/setup.png)

- **Trials**: 5 to 60.
- **Time per trial**: 1 to 10 seconds, 5 by default. In the corner test this is also how long the aircraft takes to reach the arrow tip.
  If no answer comes in time, the trial counts as too slow.
- **Show right or wrong**: turn it off for a formal test, so the candidate gets no hints.
- **Sound**: short tones for right, wrong and recorded.
- **Practice 5 trials**: a warm-up with feedback that is not saved.

Settings are remembered in the browser.

## Session results

![Session results: accuracy, median reaction time, per-trial chart and breakdowns](docs/results.png)

Every finished run is saved and gets its own page:

- Accuracy, median reaction time (correct answers only) and the number of slow answers.
- One bar per trial: height is reaction time, colour is right, wrong or too slow. Hover a bar to see that trial.
- Breakdown by side shown (and upright or upside down in the corner test) and by direction, which shows where a candidate struggles.
- **Run again** starts the same test with the same settings. **Download CSV** gives this session's trials. **Delete session** removes it.

## Run it locally

It's a static site with no build step. Any static file server works:

```sh
git clone https://github.com/DuarteSantos8/pilot-test.git
cd pilot-test
python3 -m http.server 8765
# open http://localhost:8765
```

Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`.
Three.js and the fonts load from a CDN, so the first load needs an internet connection.

## How it works

```
index.html                     all screens: dashboard, each test's setup and run screens, session results
src/style.css                  all styling
src/platform/app.js            routing, dashboard, session pages, backup / import / CSV
src/platform/store.js          sessions and profile in localStorage
src/platform/charts.js         progress and per-trial charts with hover tooltips
src/tests/registry.js          the list of tests and the contract each test follows
src/tests/orientation/         the spatial orientation test
  index.js                     settings form, running a test, what it reports to the dashboard
  trials.js                    sides, directions, presets, trial generation, scoring
  aircraft.js                  the jet, built from three.js primitives, and the curved arrow
```

Pages are addressed in the URL hash: `#/` is the dashboard, `#/tests/orientation` a test, `#/sessions/<id>` one session.

- The aircraft has its own axes: nose `+Z`, top `+Y`, pilot's left `+X`. Each answer is one of these directions: left `+X`, right `−X`, nose up `+Y`, nose down `−Y`.
- Corner test: the line's screen direction is converted into the aircraft's axes. Its left/right part becomes A or D, and its up/down part becomes W or S.
- A trial picks a camera direction (one of the six sides, nudged at random in Advanced) and a rotation of the picture around that direction.
- A trial is thrown away if the arrow points within 60° of straight at the camera or straight away from it, where it would be hard to read.
- The arrow is drawn on top of everything with a dark outline, so it stays readable against both the sky and the aircraft.

## Adding a test

1. Create `src/tests/<id>/index.js`. Its default export describes the test: name, description, how to open and close it,
   how to summarise a session and which CSV columns it adds. The full list is at the top of `src/tests/registry.js`.
2. Add the test's setup and run screens to `index.html` as elements with `data-screen` (see the orientation test's for an example).
3. When a run is finished, call `platform.finish({ testId, settings, trials })`. Each trial needs at least `trial`, `correct`, `rt` and `response`.
4. Import it in `src/tests/registry.js` and add it to the `tests` list.

The dashboard, progress charts, session pages, backup and CSV export then work for the new test without further changes.

## Limitations

This is a training and screening tool, not a validated psychometric instrument. Treat the results as an indication, not a selection decision.
Reaction times depend on the keyboard and display, so compare candidates only on the same machine.
