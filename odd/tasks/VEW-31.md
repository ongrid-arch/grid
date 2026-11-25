# VEW-31: dimension chains, grid bubbles and view marks keep clear of each other

## Outcome

On a plan picture (and the app's 2D view), a structural grid's names in their circles sit past
the outermost dimension chain on their side, never over a figure. The grid's own spacing chain
moves out beside them. Two chains of one side never share a line. A side prints its overall size
once. A figure whose own ticks or a neighbour's extension lines would cross it waits for a zoom
in, as one with no room already does. An elevation mark and the head of a section keep off the
bubbles and chains.

## Design

- `packages/viewer/src/picture/markLayout.ts` (new, pure, in metres, no DOM):
  - `layoutDimensions(drawing, dimensions)` returns the dimensions as they are drawn. It is
    idempotent. (1) An overall size that repeats another on the same side (same figure, spans
    that overlap) is dropped. (2) Chains outside the plan on one side that are closer than 0.4 m
    and run over the same stretch are pushed out one chain spacing (0.5 m) at a time, in order from
    the building. (3) A grid's spacing chain at an end of its lines whose lane meets an outside
    chain moves out past the outermost one, a chain spacing beyond it.
  - `gridEndReach(drawing, dimensions)` gives, per grid, set and end, how far past the line's end
    its bubbles start (0 when nothing is in the way, so a plan without a clash draws as before).
  - `markObstacles` gives the boxes (chain lines, ticks, extension lines, figures, bubbles) a
    view mark keeps off, and `clearMarks` moves an elevation mark outward until it is clear.
- `scene.ts` draws the layout's dimensions, puts each bubble and its line's end at the reach,
  and keeps a figure off every tick and extension line (`placeDimensionLabel` blocks).
- `planSvg.ts`: `framingOf` frames the layout's dimensions; `framePicture` clears the marks
  against the layout (two passes, as the scale depends on the frame); `drawingMarkNodes` takes the
  boxes a section head keeps off and slides a head outward along its cut line.
- Decision: the geometry core's chain building (`geometry/dimensions.ts`) is not touched; the
  viewer lays out what it gives. Metre gaps (0.5 m) match the core's chain spacing; pixel gaps use
  the picture's scale. No new convention, no new message code.

## Done

- `picture/__tests__/markLayout.test.ts` fails before: bubbles' centres inside chain lines of the
  warehouse plan, the grid chain on a facade chain, a repeated overall, two chains on one line, a
  figure under a tick, an elevation mark touching a bubble. It passes after.
- Existing viewer tests and the snapshots stay as they are, or change only where a clash was fixed.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/viewer`, `ownWords.test.ts`,
  `npm run scoreboard`.
