# CMD-53: find and count fixtures and columns, by kind and room

## Outcome

An agent asks `grid_fields`, `grid_find` and `grid_count` about the plan's columns as it asks
about its walls, rooms and items: "which columns stand in the meeting rooms", "how many columns on
the first floor", "the round columns wider than 400 mm". And it asks about any item, or column,
by the room it stands in without first finding that room's id: "how many basins in the toilets"
is one `grid_count` with `kind=fixture`, `where "item kind = basin"` and `by "room use"`.

## Design

- `packages/cli/src/quantities/query.ts`: `column` becomes a kind of part (`PART_KINDS`), never one
  that carries facts (`FACT_PART_KINDS` is unchanged, and a column has no `properties` in the
  schema). `askPlan` lists the columns only when a tool asks (`columns: true`, as `items: true`
  does), so the GeoJSON plan data and the change of facts read exactly as before. A column the
  drawing's checks leave out (`soundColumns`) is not listed: it is in no view or measure either.
- One part per column of the plan, on its own floor, with the floors it rises through kept on the
  part (`floors`): `floor=<id>` picks a column on every floor it stands on, and the new `floors`
  field lists them.
- A column's fields: `width`, `depth` (its own, else its width), `height` (how high it rises
  above its own floor, `columnRise`), `turn`, `label`, `column shape` (square or round), `room`
  (the room holding its middle on its own floor, `columnRoom`) and `rooms` (every room it stands
  in on any floor it stands on, from `roomColumns`, so a column on a room line is in both). The
  `room` argument then picks the columns standing in that room, as it picks the items.
- New fields for items and columns alike: `room name` and `room use`, the name and use of the room
  `room` gives, so a question by the kind of room needs no ids.
- `packages/cli/src/mcp/readTools.ts`: the kind argument's text, the room argument's text, the
  answer's words for columns and one example each in `grid_find` and `grid_count`. No new tool,
  no new code.
- `compile.ts` is not touched; no convention is added to `types/floorplan.ts`.

## Done

- `packages/cli/src/mcp/__tests__/columnQuery.test.ts`: through the tool server, columns found by
  room and by the room's use, counted by room and by shape, a column rising through two floors
  found on both, `grid_fields kind=column` listing its fields, and basins counted by room use.
  It fails before the change (`column` is not a kind the argument takes) and passes after.
- The query tests already there, the tool list test (its token ceiling), `ownWords.test.ts`,
  typecheck, lint and build.
