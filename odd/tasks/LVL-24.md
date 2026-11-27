# LVL-24: floor-to-floor heights, and a warning when heights conflict

## Outcome

An agent that writes a building of many storeys (a tower, a block of flats, an office whose
facility manager knows both the floor-to-floor and the room heights) can give the distance from
one floor level to the next, once for every floor or floor by floor, and Grid stacks the floors by
it, so the building's height is the storeys' floor-to-floor summed and no agent has to add up
elevations by hand:

- `grid_set_levels` sets the floor-to-floor of every floor of the plan, of one building, or of the
  floors listed (`floorToFloor`, with `floors` and `building`), and may set their clear height
  (`clear`) in the same call. Each floor's floor-to-floor is written as the elevation of the floor
  over it (the plan's own `elevation`, C5): the lowest floor at or above level 0 keeps its level,
  each floor above stands its floor-to-floor over the one under it, and each basement stands its
  floor-to-floor under the one over it. A floor that states no clear height gets its floor-to-floor
  less the slab over it (the next floor's slab, or the roof's), so its walls meet that slab; a
  floor that states one keeps it.
- The answer lists every floor with its level and its floor-to-floor (the top floor's to the top of
  its roof slab), and the building's height with the datum it is measured from.
- `grid_write_rooms` (and `grid write`) say the same list of levels for a plan of more than one
  level, so the height a text writes is read back before anyone builds on it.
- `grid check` warns when a floor's stated clear height and the slab of the floor over it run past
  that floor's level (`floor/height-past-next`): a clear height written as if it were the
  floor-to-floor. It names both floors, the clear height, the slab, where they reach and the level
  of the floor over it, and says the height is the clear height.
- `grid check` warns when the walls of a floor and the floor's own height disagree
  (`floor/wall-heights-differ`): walls that state their own height taller than the floor's clear
  height, or a floor whose every solid wall states its own height and none is the floor's. It says
  which won: each wall stands at its own height, and the floor's figure stacks the storey.

A plan that states no floor-to-floor reads and stacks exactly as before.

## Design

- No new field and no new convention: floor-to-floor is the distance between two floors'
  levels, which the plan already holds as `elevation` (C5, LVL-1). Storing it as elevations keeps
  rooms text writing and reading it back unchanged (`floor ... elevation <m>`), and every reader
  (3D, IFC, sections, the height) already stacks by it.
- `packages/floorplan/src/geometry/levels.ts` (new): `planLevels(plan)`, each floor's level, clear
  height, slab and floor-to-floor (the next level's minus its own, the top one's to its roof slab's
  top), by building, from `floorElevations`; and `levelsSetTo`, the elevations and clear heights a
  floor-to-floor gives, used by the tool.
- `packages/floorplan/src/geometry/stacking.ts`: the two checks beside VEW-33's `storeyTops`, which
  pair each floor with the floor over it already. `floor/walls-past-floor` is said first: the new
  line is not said for a floor that line already names.
- `packages/floorplan/src/messages/en.ts`, `es.ts`: the new sentences; `packages/rules/src/result/catalogue.ts`:
  the two codes.
- `packages/cli/src/edit/levels.ts` (new), `packages/cli/src/mcp/levelsTool.ts` (new): the change and
  `grid_set_levels`, through `writeChange`; registered after the buildings' tools. One more tool
  (64): floor-to-floor could be written only as hand-summed elevations.
- `packages/cli/src/command/write.ts`: the levels lines in the write answer.
- Docs: `docs/plan-file.md` (floor-to-floor and the two warnings), `docs/tool-server.md`.

Left undone, because the rooms-text compiler (`packages/floorplan/src/rooms/compile.ts`) belongs to
another change: the `floor-to-floor <m>` word on a floor line, a default line for every floor, a
`walls` line that holds only from where it is written or for its floor, and a floor's height above
the ground (a trailer's deck) in rooms text.

## Done

- `packages/floorplan/src/geometry/__tests__/levels.test.ts`: floor-to-floor worked out from stated
  and stacked levels, by building; the elevations and clear heights a floor-to-floor gives,
  basements included; the two warnings, and none on a plan whose heights agree, and none where
  `floor/walls-past-floor` is said.
- `packages/cli/src/edit/__tests__/levels.test.ts`: `grid_set_levels` writes the elevations, keeps a
  stated clear height, lists each floor's level and floor-to-floor and the height with its datum;
  a forty-storey tower at 3.9 m is 156 m high to its roof slab's top; refusals by name.
- The tool list and order test, the server's tool count, the code table and catalogue contract,
  `ownWords.test.ts`.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, `npm run scoreboard`.
