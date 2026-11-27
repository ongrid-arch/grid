# WRT-83: columns and structural grids in rooms text, straight or radial

## Outcome

An agent writes a building's structure in rooms text, in words, and reads it back the same way.
It never writes a script that computes column positions, never draws piers as wall stubs and
never draws a radial grid in a picture of its own:

- `grid <id> ["<name>"] [at x,y] [turn <deg>] x <spacing> ... [names ...] y <spacing> ...
  [names ...] [floors <floor> ...]` is one of the plan's structural grids (CNT-16, C25): the x
  lines numbered 1, 2, 3 and the y lines lettered A, B, C unless `names` says, each set's
  spacings written one by one or as `<n>@<spacing>` (`4@7.5`).
- `grid <id> polar [at <centre>] rings <radius> ... rays <degrees> ... [names ...]` is a radial
  grid: rings round the centre (lettered) and rays out from it (numbered), each list written one
  by one or as `<first> to <last> every <step>`. It is drawn as arcs and lines, with the names in
  their circles, as a straight grid is, and its rings are dimensioned along its first ray.
- `columns <group> <size> on grid <id>` stands a column at every crossing of that grid's lines,
  named `<group>-<x line>-<y line>`; `column [<id>] <size> at grid [<grid>] 7/B` stands one at a
  crossing (named `c-7-B` when no id is written); `columns [<group>] ring <n> radius <r> [at
  <centre>] [start <deg>] <size>` sets out n columns evenly round a circle (round its one radial
  grid's centre when no `at` is written), a square one turned to face the centre. The single
  `column` line, `columns ... count ... every ...` and `raw column` stay as WRT-79 wrote them.
- A column with no floor, in a text whose floors include no `ground`, stands on the floor at
  level 0 (else the lowest) instead of on a floor the plan does not have, where it was left out.
- `module <length>` sets a planning module; any length then written `<n>mod` (`5mod x 4mod`,
  `2mod,3mod`) is that many modules. A `mod` length with no module line is refused, saying so.
- `grid describe --as rooms` writes the plan's grids as `grid` lines (`raw grid` when the words
  would not give one back as it is), so writing the text again gives the same plan; `grid write`
  replaces the file's grids with the grid lines, and keeps the file's when the text has none.

## Design

- `packages/floorplan/src/types/floorplan.ts`: C25 gains a radial form, no new convention: a grid
  MAY state `polar` (`{ radius }`, its first ring). Then `origin` is its centre, `x` its rays (the
  spacing in degrees counter-clockwise, the first at `turn`) and `y` its rings (the spacing in
  metres outwards from `radius`). The rays span less than a full turn. Every existing grid reads
  as before.
- `packages/floorplan/src/geometry/structuralGrid.ts`: `planGrid` gives a radial grid's rays as
  straight lines from inside its first ring to past its last (named past the outer end only) and
  its rings as arcs traced through `path` at `gridArcStep` degrees a piece, a whole circle when
  the rays go all the way round (named once); `gridDimensions` dimensions the rings along the
  first ray. `gridCrossings` gives every crossing of a grid's lines with its two names, for the
  column lines. New table rows: `gridArcStep` (`tolerances.ts`, `docs/tolerances.md`).
- The drawing (viewer `scene.ts`, `markLayout.ts`) draws a line through its `path` when it has
  one and its names where the line says; the DXF export draws a ring as its pieces; the drawing's
  extent takes in the arcs. Small edits, named in the report.
- `packages/floorplan/src/rooms/grids.ts` (new): the `grid` and `raw grid` lines into the plan's
  `grids`, and `gridLines` back.
- `packages/floorplan/src/rooms/columns.ts`: the grid and ring forms. A column line that names a
  grid is kept until the grids are known and set out in `finish`, so a grid may be written after
  its columns; the floor of a column with no floor is settled there too.
- `packages/floorplan/src/rooms/words.ts`: `PlainNumbers` carries the module; `numberOf` reads
  `<n>mod`. `compile.ts` reads the `module` line up front, as it reads `display`, and hooks the
  grid lines in; `read.ts` writes the grid lines after the floors.
- `packages/cli/src/command/write.ts` (one line): the grid lines replace the file's grids, as the
  column lines replace its columns. `packages/cli/src/edit/stretch.ts`: a radial grid is moved
  whole or stays, never stretched by its spacings. `packages/cli/src/mcp/roomsGrammar.ts`: the
  columns topic in the new words, regenerated into `docs/rooms-first.md`.
- Sentences in `messages/en.ts` and `es.ts`; refusals are `rooms/column` and `rooms/grid` notes of
  the rooms text. No new finding code.

## Done

- `rooms/__tests__/grids.test.ts`: straight and radial grid lines land as the file's `grids`,
  with names, repeats, ranges and floors; refusals for each malformed line; columns on a grid, at
  a crossing (either order, with and without the grid's id), in a ring (with a centre and round
  the radial grid), a grid written after its columns; a column with no floor on the level-0
  floor; rooms sized in modules; the read-back writes the grids again and the plan is the same.
- `geometry/__tests__/columns.test.ts` (or a new grid test): a radial grid's rays, rings as arcs,
  a whole ring and its dimensions; the schema refuses rays round more than a full turn.
- Existing rooms, columns and buildings tests pass. `npm run build`, `npm run typecheck`,
  `npm run lint`, vitest on each folder changed, the tolerance test and the scoreboard.
