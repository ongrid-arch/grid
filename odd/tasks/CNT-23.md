# CNT-23: measure a room's use indicators quickly on plans with thousands of items

## Outcome

`grid_measure what=use` on a plan with about 2,000 chairs answers in about a second of work,
where it used to run for minutes without an answer. Asked about a small room on a plan whose
other rooms hold the chairs, it looks only at the items that stand in or against that room, so
the 2,000 chairs next door cost it nothing. Asked about the crowded room itself, it still answers
in a few seconds, not minutes. Every figure and every line is exactly what it was.

## Design

- The cost was in three places, all growing with the number of items on the floor: every
  measure of a room was given every fixture on its floor, not the room's; the way through a room
  (`passageWidth`) measured each of up to 250,000 grid points against every edge of every
  fixture; and the floor round each fixture (`fixtureSpace`) tried every ray against every
  other fixture's edges, rebuilding that list for each fixture.
- `packages/cli/src/quantities/use.ts`: `fixturesOf` keeps each fixture's box and gives
  `near(floor, box, margin)`; `roomIndicators` works with the fixtures whose box meets its
  room's box widened by `reachOf`: the approach depth beyond the thickest wall, two steps of the
  way-through grid (the furthest a fixture can be and still be listed as standing beside the
  narrowest point) and half the length of the room's doorways and dividing lines (where the
  outline is open, a fixture just outside can be the nearest thing to a point inside).
  Anything farther cannot change a figure. The floor round each fixture is the exception: a
  ray can leave through a doorway and meet a fixture in the next room, as it always has, so
  `fixtureSpace` is given every fixture on the floor, kept in one bucket grid made once. Lookups by id use maps,
  not scans. The other callers of `obstacles(floor)` (access measures, firm standards) are not
  changed.
- `packages/floorplan/src/geometry/spatialIndex.ts`: a bucket grid over boxes, exact: it
  returns the least of the same distances a plain loop gives, because it only stops when nothing
  it has not looked at can be nearer. Below `INDEX_FROM` things a plain loop is used, so small
  plans run the code they ran before.
- `geometry/use.ts`: `passageWidth` takes each point's clearance and the fixture it stands in
  from the index (squared distances find the nearest edges; the figure that is said is still
  worked out as before for every edge as near as that). `fixtureSpace` tries the room's own
  edges first, then only the fixtures whose box meets the ray as far as the nearest edge, from
  a grid built once per list of fixtures.
- Decision: no cap or approximation. The answer was asked to stay exactly as it is, so the
  speed comes from not looking at what cannot matter.
- Decision: the speed test counts the process's CPU time, not the clock, so a loaded machine
  does not fail it.
- No new convention and no new message code.

## Done

- `packages/cli/src/mcp/__tests__/useSpeed.test.ts`: a plan with 2,022 chairs in one hall and a
  small office with one: `what=use` for the office and for the hall each stay inside a CPU-time
  limit far above what they take now and far below what they took.
- `packages/floorplan/src/geometry/__tests__/spatialIndex.test.ts`: the index gives the same
  nearest distance, and the same holders of a point, as a plain loop, on random boxes.
- The answers are the same as before: checked once, while building, by running the previous
  `roomIndicators` and geometry beside the new ones on random plans of 20 to 260 mixed fixtures
  (two rooms, two doors, a window) and comparing every line and indicator. The comparison needed
  the old code beside the new, so it is not kept.
- The existing use-indicator, access, firm-standard and zone tests pass unchanged.
- `geometry/__tests__/tolerances.test.ts` still holds: the new code reads its limits from the table.
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders and `npm run scoreboard`.
