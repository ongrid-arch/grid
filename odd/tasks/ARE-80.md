# ARE-80: columns in openings and partitions, and columns in every clearance measure

## Outcome

- `grid check` and `grid_check` name a column that stands in a door or a window (its footprint
  reaches into the opening's place in its wall), so a perimeter column drawn through the glass
  gets a note, and a column that stands in a partition, which carries nothing. A column in an
  item already has its note (`plan/column-in-item`); a column in any other wall is ordinary
  building and stays unnamed.
- Every clearance measure keeps clear of the columns on its floor as it keeps clear of the
  fixtures: each corridor's narrowest point and each room's turning space in
  `grid_measure what=access`, the doorway clear width, the way through and the floor beside a
  fixture in `what=use`, a wide route, the activity zones and the firm's standards. A boxed riser
  in a corridor narrows the corridor's narrowest point to what is left beside it, and no turning
  circle is centred on it. A line that names what narrows a way names the column too.

## Design

- `packages/floorplan/src/geometry/columnClash.ts`: two new warnings beside the ones CNT-21 made.
  `plan/column-in-opening`: a sound column whose footprint reaches into an opening's hole (the
  slice of its wall along the opening's span, `wallSlicePolygon`) by more than `itemOverlap`, on a
  floor both stand on. `plan/column-in-partition`: a column reaching into a wall of kind
  `partition` (by the wall's whole footprint, `wallPolygon`) by more than `itemOverlap`, unless the
  reach is all inside an opening of that wall (then the opening note says it). The same tolerance
  as the clashes already there, so no new tolerance. Straight walls only: a curved wall's chords
  are close enough to its faces at this depth, and its slices are read the same way.
  Codes in `messages/en.ts` and `es.ts`, the catalogue, the plan-file doc and the fragment.
- `packages/cli/src/quantities/use.ts` (`fixturesOf`): the obstacles on a floor are the fixtures
  and then the sound columns standing on that floor, each by its footprint. `rows`, `items` and
  their lookups stay fixtures only, so a count of fixtures and a fixture's own lines are as they
  were. The few places that read an obstacle as a fixture by its id are made to know a column:
  the window cover takes a column's height as reaching past any sill, the names in a sentence
  name a column by `columnSaid`, and the activity zones count fixtures by the rows.
- Decision: a column that is taken off a room's area but is not a hole in its outline was never
  an obstacle; now it is one in every measure that keeps clear of fixtures, so the figures move
  only on plans with a column in a room's free floor.

## Done

- Tests: `columnClash` notes for a column in a window, in a door, in a partition, and none for a
  column in an exterior wall clear of its openings; the access measure on a 1.2 m corridor with a
  0.8 x 0.25 m column on one side gives 0.95 m as the narrowest point and centres no turning
  circle in it; the use measure names the column beside the way.
- `npm run build`, `typecheck`, `lint`, vitest on the touched folders and the mcp, command and
  rules folders, `npm run scoreboard`.
