# ARE-67: seats, desks and covers counted from the furniture, and held to the brief

## Outcome

An agent asks Grid how many seats, desks and covers the plan holds, and gets them counted from
the furniture as drawn, per room, per zone, per floor and for the whole plan, each piece's share
said by the rule it was read by. Nobody adds up rows of a schedule or counts symbols by hand, and
two agents asking of the same plan get the same figure.

The brief takes the person's targets for them: a room's (or a zone's, or the rooms of a use's)
`seats`, `desks` and `covers`, exactly, at least or at most, and the plan's own under `figures`.
Each line is met or missed against the count, with the count beside it. A room wish whose quote
says a number of seats, covers or desks and gives no target is counted against that number, not
answered as met because the room is there. A wish for numbered rooms ("Phone booths", six of
them) finds rooms named "Phone booth 1" to "Phone booth 6", or rooms whose room type is the name.

## Design

- `packages/cli/src/quantities/seats.ts` (new, pure): `planSeating(survey)` reads every item of
  the plan once. A chair, stool, armchair or fixed seat is one seat; a sofa or pew is one seat per
  `SEATING.seatWidth` (0.6 m) of its width, at least one; a label that states seats ("3-seat",
  "4 seats", "for 6") is read before either. A desk is one desk (its chair is the seat). A seat
  is a cover when its footprint stands within `SEATING.atTable` (0.5 m) of a table's on the same
  floor: a cover is a place at a table. Each item's room is the one holding the middle of its
  footprint (as every count of items reads it, `itemRoom`); its zone (CNT-8) the zone of that
  room holding the same point. Totals per room (its zones' items included), per zone, per floor
  and for the plan. The figures are Grid's own readings, said in every answer (`SEATING_RULE`),
  never a code's and never occupancy.
- `packages/cli/src/quantities/query.ts`: fields `seats`, `desks` and `covers` on fixtures,
  furniture, rooms and floors, and `zone` on items, so `grid_count kind=furniture by=zone
  sum=seats` and `grid_count kind=room by=department sum=desks` answer from the same count.
  `packages/cli/src/mcp/readTools.ts`: `kind` of the query tools also takes `item` (every
  fixture and piece of furniture), which they refused; and `grid_measure what=seats` gives the
  whole count, by floor, room and zone, with the rule (optionally one room).
- `packages/cli/src/brief/brief.ts`: room wishes take `seats`, `seats_at_least`,
  `seats_at_most`, and the same for `desks` and `covers`; `figures` take `seats`, `desks` and
  `covers`, the plan's total, at least. `packages/cli/src/brief/lines.ts` measures them through
  `planSeating`; a wish over several rooms is the sum of them, each room's count listed. A room
  wish with none of them whose quote says "24 seats" (covers, desks) is read against at least
  that many, and the line says it was read from the quote. `roomsNamed` also takes a wish's name
  in the plural and a room's room type.
- `packages/cli/src/mcp/briefTool.ts`: the schema and description name the new keys.
- Decisions: no new field on an item, so no new convention in `types/floorplan.ts`; the seats a
  piece gives come from its kind, size and label. No floor-by-floor target in the brief yet: a
  room wish covers a room or zone and `figures` the whole plan. No message code.

## Done

- `packages/cli/src/quantities/__tests__/seats.test.ts`: chairs, a sofa by width and by label,
  desks, covers at a table and not away from one, totals per room, zone, floor and plan.
- `packages/cli/src/brief/__tests__/seating.test.ts`: room and zone targets met and missed,
  at least and at most, the plan's figures, the quote read as a target, plural and room-type
  names counting numbered rooms.
- `packages/cli/src/mcp/__tests__/seating.test.ts`: `grid_measure what=seats`, `grid_count` with
  `kind=item` and `sum=seats` by zone.
- Type check, lint, the cli and floorplan test folders, `ownWords`, `contract` and the scoreboard.
