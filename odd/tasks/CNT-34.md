# CNT-34: wall faces under a stated roof, in the estimate and the wall-type totals

## Outcome

- A wall that a floor's stated roof cuts (a gable end, a knee wall) is measured the same way
  everywhere: by its face under the top the roof leaves it, not as a rectangle at its stated height.
  The room take-off already did this (LVL-6); the estimate's wall lines, its outside face and the
  wall-type totals did not, so a gable end was short or over by its triangle.
- The gable part (the face above the lowest point of the wall's top) is given apart: its own estimate
  lines, and a `gable` figure on each wall-type run and each room's take-off.
- A plan that states no roof answers as before.

## Design

- `wallFaceCut` in `packages/cli/src/quantities/takeoff.ts`: one function from a plan, a wall and a
  stretch along it to `{ face, gable }`, on the core's `wallTopProfile`, `faceUnderTop` and
  `topBetween`. Nothing is computed in the core.
- `roomTakeoff` uses it, and gives `gable` (part of `wallFace`, "of which").
- `estimate.ts`: each wall's face is its length (as before, joined at corners) scaled by the mean
  height under the roof; the gable part is taken out of the kind/type lines into `wall_gable`, and
  the outside face's gable into `external_finish_gable`, so the lines add up to the whole.
- `finishes.ts`: `wallTypeRuns` `face` is under the roof and a run gets `gable` ("of which").
- Openings are still taken off at their own height (clamped to the wall's stated height); an opening
  cut by the roof is left for later. Choice: easiest to undo.

## Done

- Tests for a gable cabin: the end wall's face is a triangle on a rectangle, the estimate lines and
  the wall-type run agree with the take-off's, a plan with no roof is unchanged.
- `npm run typecheck`, `npm run lint`, the cli and rules test folders, `ownWords` and `tolerances`
  tests and `npm run scoreboard`.
