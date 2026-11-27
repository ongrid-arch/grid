# ARE-68: lettable area, efficiency, the core, frontage zones and area per person

## Outcome

An agent asked how much of a building can be let or sold, or how efficient its floors are, gets
the figure from Grid instead of working it out by hand. `grid_areas` gives a lettable area (the
floor a tenant or buyer has the use of, in Grid's own words), the core (stair, lift and plant
rooms) as a named group with its share of each floor plate, and the efficiency, lettable over
gross internal, per floor, per floor type (the floors whose main lettable use is the same) and in
all. Net to gross stays as it was, and now says beside it that the core and corridors are in the
net, so nobody quotes it as a lettable figure. A tower whose lift rooms all count as net, or a
storage scheme whose loading bay counts as storage, no longer reads as 89% or 95% efficient.

The rooms counted as lettable follow the plan: a room's stated tenure first (private, shared or
commercial is lettable, common is not), else its use (stair, lift, plant, corridor and parking are
not). The person can choose instead: the uses, or the tenures, that are lettable.

The people a building or a room is for (pupils, covers, keys, beds, capacity) can be given, in the
call or in the brief beside the plan, and the area answer and `grid_compare` give the ratios: gross
internal, gross external, net and lettable per pupil, per key, per cover. With no figure given, the
covers and desks counted from the furniture (ARE-67) give theirs.

A shop's floor is given by depth bands from its frontage, in m² and sq ft (`grid_measure
what=frontage`): the first band, the second, the third and the rest, at a depth the person gives or
Grid's default. And a room's area to the middle of its walls, the size it was written at, is given
beside its net area (`grid_areas as_written`), for stands and modules sold by their nominal size.

## Design

- `packages/cli/src/quantities/lettable.ts` (new, pure): `lettableFigures(areas, request)` reads
  the rooms `planAreas` already counts (CNT-27's one rule: no zone, void, outdoor space, room named
  outside, nor a shaft room counted below). A room is lettable by its tenure, else its use, or by
  the uses and tenures chosen. The core is the rooms used as stair, lift or plant on each plate,
  a shaft room counted with the one below included: the core's share of a plate is what stands on
  it, though its floor is counted once in the net. Per floor: lettable, core, the rooms of each,
  efficiency and core share over that floor's gross internal area (null, with why, without one).
  Floor type is the floor's main lettable use. Each figure has a state from its rooms (MSG-2).
- Ratios: `peopleRatios(areas, lettable, people)` for each figure: the count and the area per
  one; a figure given for named rooms is measured on their net only. Kinds: pupils, covers, keys,
  beds, capacity. Where none is given, covers and desks counted from the furniture are used, said
  as counted.
- The brief (`packages/cli/src/brief/brief.ts`) takes `people`, the person's figures for who the
  building is for, each with its value and, optionally, the rooms it is for; it is a fact, not a
  wish, so no line measures it. `grid_write_brief` takes it.
- Frontage zones: `packages/cli/src/quantities/frontage.ts` cuts a room's floor into bands parallel
  to its frontage (the wall named, else the side of the room with the most door width on it, else
  its longest side on an outside wall), each band's area by clipping the room's outline and holes,
  in m² and sq ft. The default band depth is Grid's own, 6.1 m (20 ft), the depth shops are often
  zoned by, said as Grid's default; the person gives `depth` and `bands` for another. No weighting
  is applied: the bands are measured, not valued.
- Area to the centre lines: `packages/floorplan/src/geometry/partyWalls.ts` gains a push to the
  middle of every wall (`toWallMiddles`), the same edge by edge reach the party wall figure uses,
  so a room is measured to its walls' centre lines whatever lies beyond them.
- Words in `packages/floorplan/src/messages/en.ts` and `es.ts` (draft); tool descriptions in the
  tools' files. The measures are described in `docs/areas.md` in a new section, not in the measures
  table, since they are read from the net, not a new way of measuring floor.
- `rooms/compile.ts` is not touched. No new plan field: a plan-level figure for who a building is
  for would be a new convention, and is left for one to be given.

## Done

- Tests in `packages/cli/src/quantities/__tests__/lettable.test.ts`: a tower floor whose lift,
  stair, plant and corridor rooms are out of the lettable area and in the core, with efficiency and
  core share per floor and floor type; tenure overriding use; chosen uses; a shaft room counted
  once in the net and on each plate in the core; people ratios from a figure and from counted
  covers; frontage bands of a shop summing to its area, in m² and sq ft, with a wall named and found;
  a room's area to its centre lines against hand-worked figures.
- The tool tests: `grid_areas` text and data carry the lettable area and ratios, `grid_compare`
  rows carry them, `grid_measure what=frontage` answers, the brief takes `people`.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed,
  `ownWords.test.ts`, and `npm run scoreboard` no worse.
