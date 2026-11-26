# ARE-60: the living area under air and the total under roof

## Outcome

- A room can say whether it is heated or cooled (`conditioned` in the plan file). Unstated, a
  room is conditioned unless it is used for parking; outdoor space and a void never are. Rooms
  text writes `conditioned` or `unconditioned` on a room line, and `grid_rename_room` (and
  `grid edit rename`) takes `conditioned: true|false`, so a lanai, a covered entry or an
  unheated store drawn as a room can be taken out, and a garage turned into a room put in.
- `grid_areas` gives two more figures on every floor and in all, each with its rule in Grid's
  own words: the living area under air, the floor inside the outside face of the walls round the
  conditioned rooms, a wall between a conditioned room and one that is not counted in full with
  the conditioned rooms; and the total under roof, the gross external area with every enclosed
  room in, plus the floor of the outdoor spaces a roof covers. Each room not under air is marked
  so, and a note names those rooms.
- For a plan built in the US (the plan's `site.country`, or `country`), `grid_areas`, the client
  sheet's cover and `grid_compare` lead with these two figures, so a home is never headlined with
  its garage in.

## Design

- `packages/floorplan/src/types/floorplan.ts`: `conditioned` on a room, optional and never
  defaulted, like `void` or `height`: a field with its comment, no new convention.
- `packages/floorplan/src/geometry/areas.ts`: `isConditioned(room)`; `MEASURES.conditioned` and
  `MEASURES.underRoof`, worded in `messages/en.ts` (and a draft in `es.ts`). The area under air
  is measured the way a room named outside already is (ARE-29): the floors are measured a second
  time with the rooms not under air (and their zones) as the outside, and that gross external
  area is the figure. So the wall between the house and its garage faces outside and counts in
  full, the garage's own outer walls drop out, and nothing new is measured. The second pass runs
  only on a plan with a room not under air; otherwise the figure is the gross external area. The
  total under roof is the floor's gross external area plus its roofed outdoor spaces.
  `reader.underAirFirst` says when to lead with them: where the outside face is the usual gross
  measure (the US), the decision already recorded on ARE-8.
- `packages/cli/src/quantities/areas.ts`: the two figures per floor and in all, with their
  states; rooms not under air marked `unconditioned`.
- `packages/cli/src/mcp/readTools.ts`: `grid_areas` text and data, CSV rows; `grid_compare`'s
  option rows and lines. `packages/cli/src/sheet/pages.ts`: the client cover's figures.
- Rooms text (`rooms/compile.ts`, `rooms/read.ts`) and the rename edit (`edit/rename.ts`,
  `mcp/editTools.ts`).
- Decided: `conditioned` on outdoor space or a void is read as nothing, because to the building
  an outdoor space is the outside (C26) and a void has no floor; a room drawn as a room is the way
  to count an enclosed lanai. A zone follows its room. Rooms the caller names outside stay out of
  both figures, as they are out of the gross ones.

## Done

- Area tests: a house with an attached garage: the area under air leaves out the garage and its
  outer walls and keeps the wall between in full; the total under roof is the gross external area
  plus a roofed porch; `conditioned: false` on a store and `true` on a parking room move it; a
  plan with no such room gives the gross external area. The docs table matches `MEASURES`.
- Rooms text: `unconditioned` and `conditioned` written, read back and written again unchanged.
- The rename edit sets and clears it, and refuses a change that changes nothing.
- `grid_areas` leads with the two figures for a US plan; `grid_compare`'s rows carry them; the
  client sheet's cover figures are the two for a US plan.
- Type check of the touched packages, lint, the touched tests, `ownWords.test.ts` and
  `tolerances.test.ts`.
