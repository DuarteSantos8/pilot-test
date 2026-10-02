<h1>
  <img src="docs/logo.svg" width="40" align="top" alt="">
  Attitude
</h1>

A spatial orientation test for pilot candidates. It runs in the browser.

An aircraft appears from a random side (above, below, front, back, either side), sometimes upside down or at an angle.
A yellow arrow leaves its nose. The candidate steers the way the arrow points, as the pilot sitting inside would, using W A S D as a stick.

**[Try it online](https://duartesantos8.github.io/pilot-test/)**

![A candidate running through a ten-trial test](docs/demo.gif)

## Why

Aircrew selection tests check whether someone can tell how an aircraft is oriented, even when they see it from outside and rotated,
and can work out which control input it needs. This project does that one task with a keyboard instead of a joystick.
Every answer is timed and recorded.

## A trial

![Three trials: seen from below, from the side at an angle, and from above](docs/trials.png)

1. A crosshair shows for a moment so every trial starts the same way.
2. The aircraft appears with the arrow. The timer bar starts shrinking.
3. The candidate presses a key. The answer and the reaction time are recorded.

How to read the picture:

- The **canopy** is on top. **Top surfaces are light** and the **belly is dark**.
- **Red** light on the **left** wingtip, **green** on the **right**, like real navigation lights.
- The arrow is always drawn relative to the aircraft, not the screen. If you see the aircraft from the front, its left is on your right.

## Controls

| Key | Stick | Aircraft |
| --- | --- | --- |
| <kbd>W</kbd> / <kbd>↑</kbd> | forward | nose down |
| <kbd>S</kbd> / <kbd>↓</kbd> | back | nose up |
| <kbd>A</kbd> / <kbd>←</kbd> | left | turn left |
| <kbd>D</kbd> / <kbd>→</kbd> | right | turn right |

<kbd>Esc</kbd> stops the test. On a touch screen, tap the keys shown at the bottom of the screen.
Pitch can be inverted in the settings for people who think "W = up".

## Difficulty

| Level | Sides shown | Picture |
| --- | --- | --- |
| Easy | front and back | upright or upside down |
| Standard | all six sides | rotated to any angle |
| Advanced | angled views in between the sides | rotated to any angle |
| Custom | pick any sides | upright, upside down or any angle, angled views on or off |

Each level only shows trials where the arrow is clearly visible. "Nose up" is never shown from straight above, because the arrow would point straight at the screen.

## Settings

![Setup screen with the 3D aircraft, the six reference views and the settings](docs/setup.png)

- **Candidate**: a name or service number, saved with the results.
- **Trials**: 5 to 60.
- **Time per trial**: 1 to 10 seconds. If no key is pressed in time, the trial counts as too slow.
- **Show right or wrong**: turn it off for a formal test, so the candidate gets no hints.
- **Sound**: short tones for right, wrong and recorded.
- **Practice 5 trials**: a warm-up with feedback that is not saved.

Settings are remembered in the browser.

## Results

![Results: accuracy, median reaction time, per-trial chart and breakdowns](docs/results.png)

- Accuracy, median reaction time (correct answers only) and the number of slow answers.
- One bar per trial: height is reaction time, colour is right, wrong or too slow.
- Breakdown by side shown and by arrow direction, which shows where a candidate struggles.
- **Download CSV** gives one row per trial (`candidate, difficulty, trial, side, picture_rotation_deg, arrow, response, correct, reaction_ms`), ready for a spreadsheet.
- The last sessions are listed under *Previous sessions*. This list is stored in the browser only, never sent anywhere.

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
index.html        page structure: setup, test and results screens
src/aircraft.js   the jet, built from three.js primitives, and the curved arrow
src/trials.js     sides, directions, presets, trial generation, scoring
src/app.js        rendering, settings form, test flow, results, CSV
src/style.css     all styling
```

- The aircraft has its own axes: nose `+Z`, top `+Y`, pilot's left `+X`. Each answer is one of these directions: left `+X`, right `−X`, nose up `+Y`, nose down `−Y`.
- A trial picks a camera direction (one of the six sides, nudged at random in Advanced) and a rotation of the picture around that direction.
- A trial is thrown away if the arrow points within 60° of straight at the camera or straight away from it, where it would be hard to read.
- The arrow is drawn on top of everything with a dark outline, so it stays readable against both the sky and the aircraft.

## Limitations

This is a training and screening tool, not a validated psychometric instrument. Treat the results as an indication, not a selection decision.
Reaction times depend on the keyboard and display, so compare candidates only on the same machine.
