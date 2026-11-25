# CMD-22: round figures in structured data

## Outcome
- An agent that copies a figure from a tool's structured data gets the figure the text shows:
  27.36, never 27.359999999999985; 3.1, never 3.0999999999999996. A length is to the millimetre,
  an area to 0.01 m², rounded once from a value cleaned of noise, halves away from zero, so a
  20.295 m² room is 20.3 in every place it appears.
- The areas, take-off and schedule tools take `data=compact`: the label, single figures and
  totals first, then the lists, with empty values left out, so a long answer is shorter to read.
- Text answers are unchanged.

## Design
- `packages/cli/src/mcp/figures.ts`: `roundedData` walks the data once and rounds with the core's
  `rounded` (ARE-7), so one rule serves the text and the data. Areas are told by name
  (`area`, m2, net, gross, circulation, ceiling, wall face, slab, roof); under the take-off's
  walls, wall types and columns a `net` or `gross` is a length. Whole numbers, places on the
  globe (`lat`, `lon`) and figures under 0.001 (tolerances, ratios) are not rounded.
- `compactData` moves the label, single figures and `totals` / `cost` first and drops null and
  empty values, except a key the tool's output schema requires anywhere, so the data still
  matches its schema.
- Applied once at the edge, `answer` in `serveTools.ts`, so no tool changes its own data; the
  `data` argument (`full` or `compact`) is declared by `grid_areas`, `grid_takeoff` and
  `grid_schedule`, the tools whose data is long.
- Decision: no new convention, no new message code.

## Done
- `mcp/__tests__/figures.test.ts`: noise taken off, half up (20.295 is 20.3, 15.75 stays 15.75),
  lengths and areas, walls' net as a length, compact order and required keys kept, and a call
  through the server returns rounded `structuredContent`.
- typecheck, lint, `packages/cli` tests, ownWords, contract, scoreboard.
