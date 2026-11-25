# VEW-39: opening symbols on the plan

## Outcome
- A door's or window's frame squares in a detailed drawing sit inside the faces of their wall: the
  pen's width no longer pushes a square's edge past either face.
- A sliding door is drawn as two panels, each a thin rectangle with a glass line down it, running in
  their tracks in the wall, and an arrow showing the way a panel slides, not as two loose lines.
- The thin seam along a mitred wall corner is the wall outline showing between two fills; it is the
  walls' drawing, not an opening's, and is left as it is (see the decisions in the report).

## Design
- `packages/floorplan/src/geometry/openingSymbol.ts`: the sliding door's symbol (`doorSymbol`, kind
  `sliding`) keeps its jambs and gains, per panel, the four edges of the panel (`leaf`), a `glass`
  line along its middle and one `arrow` (a new `SymbolPart`: a shaft and two head strokes). The
  panel's depth is a share of its track's offset, so it also works across a dividing line.
  This is the one file outside the viewer the card touches: the core already decides where every line
  of a symbol goes, and the viewer only draws it.
- `packages/viewer/src/picture/scene.ts`: `PIECE_PARTS` and the pen for `arrow` (the thin line pen);
  `detailNode` insets each frame ring by half the frame pen's width, so the stroke stays inside the
  wall's faces and the hole's edges. The inset is a matter of the pen, so it is worked out where the
  pen is known.
- Decision: the arrow is a symbol line of its own part, so the DXF and the pictures carry it without
  new code.

## Done
- A core test: the sliding door has two panels with four edges each, a glass line each and an arrow
  whose head lies on its shaft; a dividing line gives the same.
- A viewer test: frame rings, stroke included, lie inside the wall's thickness and the hole's span;
  a sliding door draws panels, glass and an arrow.
- Snapshots updated only for the sliding symbol. `npm run typecheck`, `npm run lint`, the floorplan
  and viewer test folders, the scoreboard.
