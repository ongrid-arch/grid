# CNT-26: garden and boundary walls are landscape, not building

## Outcome

A wall that stands apart from the building, with no room on either side of it, is read as a
garden or boundary wall: landscape. On a floor that has rooms, such a wall is never part of the
floor's outline, slab or roof, adds nothing to the gross internal or gross external area, sets no
storey height and is not taken off as outside wall. A closed ring of them round a plot encloses a
garden, not floor: a house drawn with a 1.8 m wall round its plot measures as the house alone. The
drawing draws such a wall lighter than an outside wall and keys it "Garden or boundary wall", the
3D view and the exports read it as standing in the open (`detached`), and the take-off lists its
metres on a line of their own (`garden`), apart from the outside walls.

## Design

- `packages/floorplan/src/geometry/landscape.ts` (new): `landscapeWalls(plan, index?)`, the ids of
  the walls that are landscape, worked out once per plan. A wall is landscape when:
  - its floor has at least one room that is not outdoor space (a plan drawn as walls alone, with
    no rooms yet, reads exactly as before: its walls are the building);
  - no room lists it, indoor or outdoor (a wall a room lists is the building's, or an outdoor
    space's edge, which CNT-7 already reads as outside, unchanged);
  - it rises through no other floor (LVL-5: a wall through floors is the building's by statement);
  - no room lies just past either face of it, at its middle and its quarters (so a low wall
    standing inside a room, or one inside a courtyard a room wraps, stays the building's); and
  - it stands in no outdoor space (that is CNT-7's fence, unchanged).
  Such loose walls that touch are one group, and a group is landscape when it touches no wall of
  the building, touches it at one place only and closes no ring of its own, or closes a ring
  round rooms (the boundary wall). A group that meets the building at two places or more without
  going round it closes a space against the building (a landing or a porch not drawn as a room,
  which the route checks and `floor/unclaimed` rely on) and stays the building's. (Added while
  building: the first, simpler rule read those landings as landscape and broke the checks of a
  door into a space not drawn.)
  It reads only the rooms' shapes, never the spaces or the exposure, so the spaces and the
  exposure can both read it without a loop.
- `spaces.ts` and `areas.ts` (`floorWalls`): leave the landscape walls out, so the spaces, the
  unclaimed floor, the outline (`outline.ts` reads `areas.floorWalls`), the slab, the roof, the
  gross areas, the outer wall band and the section all lose them at the one place they gather walls.
- `exposure.ts`: a landscape wall's exposure is `detached`, whatever kind it states (a garden wall
  written `exterior` was an outside wall before); `WallSides.landscape` says so. Its stretches are
  unchanged.
- `elevations.ts`: a landscape wall sets no storey height, as a fence round outdoor space does.
- `floorplan.ts` (drawing record): `PlanWall.landscape`, and `detail.ts`'s `wallDrawnKind` draws
  it as the lighter partition weight; the viewer's key (`writing.ts`) lists it as
  "Garden or boundary wall" (`drawing.key.gardenWall`, English and Spanish) and keeps it out of the
  outside and inside wall entries.
- `packages/cli/src/quantities/takeoff.ts`: the landscape walls are taken off on their own run,
  kind `garden`, and not under their stated kind.

Decisions:
- "Marked boundary or free-standing" needs a word in the plan file to mark a wall that a room
  lists (a house wall that runs on as a boundary). That is a new convention in
  `types/floorplan.ts` and is left out, as the brief says; the report names it. A wall with no room
  on either side needs no mark.
- A forgotten room or landing drawn against the house (walls, no room) stays the building's, as
  above. One drawn standing apart from the house, a closed ring of walls with no room in it, is
  read as a walled garden.
- The garden wall is drawn in the partition's weight rather than a new drawn kind, so no look or
  pen set changes.
- No new message code and no new convention.

## Done

- `packages/floorplan/src/geometry/__tests__/landscape.test.ts`: the lab's G house alone, then
  with a 1.8 m boundary wall round its 15 x 30 m plot and free-standing garden walls (one apart,
  one off the house's corner): the same net, gross internal and gross external area, the same
  slab, roof and outline, the same storey height; the garden walls `detached` and landscape; a
  plan of walls alone unchanged; a low wall inside a room still the building's; a ring that a room
  lists still the building's.
- The drawing: the key has "Garden or boundary wall" and the wall is drawn in the partition weight.
- The take-off: a `garden` run with the garden walls' metres, the outside walls' run the house's
  alone.
- `npm run typecheck`, `npm run lint`, the floorplan, viewer and cli test folders,
  `ownWords.test.ts`, the contract test and `npm run scoreboard`.
