# ARE-61: count, total and find rooms by type, tenure and flat

## Outcome
An agent can ask "how many rooms of each type", "how much floor is private against common" or
"which rooms are in flat 3" in one call. A room's `roomType` (the firm's own type, "B2 double
bedroom"), its `tenure`, the flat it is in and that flat's type are fields of `grid_fields`,
`grid_find` and `grid_count`, so they can be found by, counted by and summed by. `grid_areas`
totals net floor by room type and by tenure, per floor and for the building, beside the totals
by use. `grid_compare` shows the same totals for each option. Wet against dry area, front against
back of house, or 120 cabins by type no longer need a guess from areas or names.

## Design
- `quantities/query.ts`: four fields on a room, `room type`, `tenure`, `flat` (the id of the flat
  the room is in, by the plan's flats list: the first flat that holds it) and `flat type` (the
  type's name, else its id). All text; a room with none is "not stated" in a count and meets
  only "is missing". They are `from: 'grid'`, so a fact of the person's own with the same name
  is reached as `properties.<name>`, as for every other field.
- `quantities/areas.ts`: each room row carries `roomType` and `tenure` where the plan states
  them. A floor and the building get `byRoomType` and `byTenure` (net area of the rooms the net
  counts, a room with none under "not said"), with their states, and only on a plan where some
  room states one, so every other answer stays as it was. A zone's floor is its room's, so
  zones add nothing here.
- `quantities/compare.ts` and `mcp/readTools.ts`: an option row carries the same two totals when
  they exist, its line says them and the output schemas list them.
- Decision: rooms in two flats (the plan's check already warns) take the first flat, as the
  flat schedule does.

## Done
- `quantities/__tests__/roomTypes.test.ts`: the four fields in `grid_fields`; find by type,
  tenure and flat; count and sum by each; "is missing"; areas by type and tenure per floor and in
  total, equal to the net; unchanged answers on a plan with none; compare rows.
- `ownWords.test.ts`, `contract.test.ts`, typecheck, lint, scoreboard, `changes/ARE-61.md`,
  `docs/tool-server.md` row.
