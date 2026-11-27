# WRT-79: roofs, roof lights, columns and a plinth in rooms text

## Outcome

An agent writes a building's roof, its roof lights, its columns and the plinth it stands on in
rooms text, in words, and reads them back the same way. It never has to find the plan file's
`roof`, `columns` or `site.ground` fields in Grid's source, nor write them as JSON:

- `roof gable pitch 45 eaves 2.7` under a floor line is that floor's roof (LVL-6's `roof`):
  `flat|gable|hip|mono-pitch`, its slope as `pitch <degrees>` or `ridge <m>`, its `eaves`, and
  for a gable `ridge runs east-west|north-south`, for a mono-pitch `high <side>`. A roof that
  cannot be (a flat roof with a pitch, a ridge under the eaves) is refused on its line with what
  to write.
- `rooflight <id> over <room>, <w> x <l>` places a roof light over the middle of a named room of
  that floor; `rooflight <id> at x,y, <w> x <l>` at a point.
- `column <id> [square|round] <w> [x <d>] at x,y [turn <deg>] [height <m>] [through <floor>]
  [on <floor>] ["<label>"]` is one of the plan's columns (CNT-16); `columns <group> ... at x,y,
  count <nx> [x <ny>], every <sx> [x <sy>]` sets out a grid of them, `<group>-1`, `<group>-2`
  and on.
- `plinth <m>`: the ground floor stands that far above the ground outside, the same level
  `ground <m> below` writes (`site.ground`).
- `grid describe --as rooms` writes a floor's roof as a `roof` line and its roof lights as
  `rooflight` lines (a roof with dormers stays in `raw floor`), and the plan's columns as `column`
  lines on their floor, so writing the text again gives the same plan.
- `grid_set` takes `roof`, the words of a roof line, for the floors it names: "make the roof a
  45-degree gable" is one call, with no JSON.
- The grammar served to agents (the `rooms` argument, `grid://guide/rooms`, `docs/rooms-first.md`)
  has a roofs topic and a columns topic in these words.

## Design

- `packages/floorplan/src/rooms/roofs.ts` (new): `roofOfWords` reads a roof line's words into a
  `Roof` checked by `RoofSchema`; `rooflightOfWords` reads a rooflight line; `RoofLines` keeps
  each floor's roof and roof lights and puts them on the floors once the rooms are drawn (a roof
  light over a room takes the middle of the room's box); `roofLines` writes a roof back.
- `packages/floorplan/src/rooms/columns.ts` (new): `column`, `columns` and `raw column` lines,
  their floor (the `on` floor, else the floor line they are under, left unstated on the ground
  floor as an item is), their ids checked against the plan's other parts; `columnLines` writes
  them back.
- `rooms/compile.ts`, hook lines only: the line words, `raw column`, the floor's roof, and
  `emitColumns`; a floor that writes both a roof line and `raw floor {"roof"}` is refused.
- `rooms/read.ts`: the roof as a line instead of in `raw floor` when it has no dormers, and the
  column lines in each floor's block.
- `plinth` is read by the ground line's reader (`ground.ts`), so it is the same field, written once.
- `packages/cli/src/command/write.ts` (one line, outside the rooms area): the column lines
  replace the file's columns; a text that writes none keeps the file's, as for stairs and items.
- `packages/cli/src/mcp/setTool.ts` (outside the rooms area, small): the `roof` argument, read by
  `roofOfWords`; with one floor named, its roof lights and dormers stay on the new roof.
- `packages/cli/src/mcp/roomsGrammar.ts`: the roofs topic in words (it named `mono` where the file
  says `mono-pitch`), a columns topic, and `plinth` in the site topic; `docs/rooms-first.md` is
  regenerated from it. The compiler's header lists the new lines.
- Sentences in `messages/en.ts` and `es.ts`; no new finding code (refusals are `rooms/roof`,
  `rooms/column` and `rooms/duplicate-id` notes of the rooms text, as `rooms/stair` is). No new
  convention: LVL-6 and CNT-16 already hold the roof and the columns.

## Done

- `rooms/__tests__/roofs.test.ts`: each roof shape written, with pitch or ridge, ridge runs and
  high side, lands as the file's `roof`; refusals for a flat roof with a pitch, a sloped one with
  neither or both, a missing eaves, an unknown shape (with the nearest); roof lights over a room
  and at a point; a roof line and a raw roof on one floor refused; the read-back writes `roof` and
  `rooflight` lines and writing them again gives the same floors.
- `rooms/__tests__/columns.test.ts`: a square, a round and a turned column; a grid of columns;
  the floor they stand on; duplicate ids refused; read back as lines and written again unchanged.
- `plinth 0.6` writes `site.ground` -0.6, and with a `ground` line too is refused as written twice.
- `grid_set` with `roof` sets a gable roof on a floor and keeps its roof lights.
- `roomsGrammar.test.ts` writes every example; `npm run build`, `npm run typecheck`, `npm run
  lint`, the floorplan and cli test folders, `ownWords.test.ts`, `contract.test.ts` and
  `npm run scoreboard` (no count worse).
