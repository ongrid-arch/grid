# CNT-25: a curved wall costs about what its chord costs

## Outcome

`grid check`, a floor's drawing, the 3D view and the sheet of a tall building with curved walls
take about as long as the same building with straight walls in their place, and every answer is
the same as before. A forty-floor tower whose plates each have four quarter-circle corners is
checked in a few seconds, not well over a minute, and drawing one of its floors no longer works
out every floor of the building first.

## Design

Measured first, on a tower of rounded-square plates (four straight sides, four 90° arcs of
radius 4 m, one room and six windows a floor): `inspectPlan` took 0.3 s with straight corners
and 6.9 s with curved ones on ten floors, and 1.9 s against 71 s on forty. Two causes:

1. A curved wall is traced as its chords: a 90° arc of radius 4 m is 53 straight pieces, so a
   plate's outline has about 216 corners instead of 8. Every trace of a room's outline
   (`traceRing` in `geometry/room.ts`) runs `selfCrossing` twice, which tests every pair of
   edges (about 23,000 pairs, each four cross products with a table lookup), and one check traces
   each room again and again: about 60 times a room on ten floors, 120 on forty, because each
   reader indexes the plan afresh.
2. Drawing one floor (`buildDrawing` in `geometry/floorplan.ts`) asks which floors the site is
   drawn on (`siteFloors`) for every floor slice, before it knows whether the plan has a site.
   That works out the levels of every floor of the whole building (`floorElevations`), which
   validates every floor. The door-swing check draws each floor, so the check costs floors ×
   floors; the 3D view, the stairs and the parking ask the whole plan's levels per floor too.

The changes, each keeping every answer the same:

- `geometry/wall.ts`: `wallSegments` (a curved wall's chords) is worked out once per wall and
  kept beside it, as `wallCurve` already keeps the curve (`arc.ts`). Each call gets its own list.
- `geometry/room.ts`: `selfCrossing` skips a pair of edges whose boxes do not overlap before the
  cross products. Two edges that properly cross always have overlapping boxes, so the first pair
  found is the same pair. The tolerance is read once per call, not four times per pair.
- `geometry/room.ts`: the traced outline of a ring (a room's outline or one of its holes) is kept
  per room and ring, and used again while the room and every wall it lists are the very same
  objects. A plan is not changed in place once read (every edit writes a new one), as the curve
  kept per wall already relies on. A fault or a refusal is kept and given again. Each caller gets
  its own lists, so one that changes what it got changes nothing kept. Nothing is kept while
  `withTolerances` is in force, as `roomNesting` does.
- `geometry/floorplan.ts`: a floor's drawing works out the site floors only when the plan has a
  site to draw (`planSite` is not null). With no site the answer was null either way.
- `geometry/elevations.ts`: `floorElevations` is kept per plan object, as above, and not while
  `withTolerances` is in force. Each caller gets its own map.

- Found while building (the size guard of `diff-size.test.ts` failed once the tracing was kept):
  two checks that grew with the square of a floor stood out. `geometry/wallFaults.ts`'s
  `crossingFaults` tried every room against every wall of its floor; it now asks a box index
  (`boxIndex`) for the walls near each room, in the same order. `geometry/plausible.ts` sorted the
  floor's other walls' heights once for every wall to find their typical height; it now sorts a
  floor's heights once and takes the median without the wall from that. Same answers.
- Also kept by the same rule: a floor's spaces (`floorSpaces` in `geometry/spaces.ts`), while its
  walls (and a curved wall's pieces, now kept per wall) are the same objects and its rooms the
  same rooms with the same outlines; and in `geometry/exposure.ts` an edge of a room is passed
  over when its box is clear of the wall piece being measured.

Decisions:

- No new convention, no new message code and no new tolerance. The number of pieces a curve is
  followed by is unchanged, so every area, length and drawing is the same to the last digit.
- Kept by object identity in `WeakMap`s, never by a key of the plan's text: identity is free and
  what `wallCurve`, `roomNesting` and `wholePlan` already use. A plan built and then changed in
  place before it is read again (the rooms-text compiler builds one in steps) is never traced
  in between, and a test holds that a new wall object is traced afresh.
- `floorElevations` is in `geometry/elevations.ts`, just outside the curve files the card names;
  it is the "draw one floor without checking every floor" half of the card, one small cache.

## Done

- `packages/floorplan/src/geometry/__tests__/curveCost.test.ts`:
  - the curved tower is checked (`validatePlan` without the spaces, and the door-swing check,
    which draws each floor) on forty floors in less than six times its time on ten; before the
    change it took over ten times as long (6.9 s against 73.6 s here), and the test fails there.
    The spaces are left out of the timing: each floor's join of a curved wall's strips is one
    polygon union that costs what its pieces cost, and since LVL-11 each floor's outline is
    also cut against every floor under it, which grows with the square of the floors (left for
    a change of its own);
  - a floor's drawing of a plan with no site does not work out the building's levels (counted
    through `floorElevations`'s own validation of the floors);
  - the same room traced twice gives equal outlines, a list a caller changes does not change the
    next answer, a wall replaced by a new object is traced afresh, and under `withTolerances` the
    answer is worked out again;
  - `selfCrossing`'s answer is unchanged for crossing and non-crossing rings (through a room
    whose walls are listed out of order).
- The existing floorplan tests (curved walls, curved areas, rooms, elevations) pass unchanged.
- `npm run typecheck`, `npm run lint`, the floorplan, rules and cli test folders,
  `ownWords.test.ts` and `npm run scoreboard` (no count gets worse).
