# VEW-79: draw curves as curves: one radius dimension and smooth elevations

## Outcome

A plan with a round room, an apse, a bowed side or a band between two radii reads like a
drawing of curves, not of the short straight pieces Grid traces them by:

- Each curved wall is dimensioned once: its radius, `R 6.00`, from its centre to the face that
  looks at the centre (a dividing line's own line), with a cross at the centre, and, for a curve
  that is not a whole circle, its chord once, pushed out past its bulge. Two curved walls on one
  circle (the halves of a round room, a shared curve) give one radius.
- A room's sides along a curve get no dimension one piece at a time: no stack of `1.88` labels.
  A room whose side is a run of short straight walls set out on a circle (written without `arc`)
  gets that run's one radius and chord in the same way, and those walls are not dimensioned
  outside the plan one way each, so no overall frame measures a single piece.
- A very large radius is drawn as its last few metres to the curve, so its centre does not drag
  the drawing's frame out; the dimension still says the whole radius.
- The same dimensions are on screen, on sheets and in `grid draw` (one drawing function), and in
  the DXF, where the radius is a radial dimension entity.
- In a facade and in a section, a curved wall is one face with one outline, its silhouette, not
  one rectangle per piece, so a drum is no longer fluted and a bay is no longer boxes laid over
  each other. Its windows stay where they are, narrower as the curve turns away.

## Design

- `packages/floorplan/src/geometry/dimensions.ts` (the plan's dimensions, which every picture and
  the DXF read; the viewer computes no geometry of its own, so this is where it must go):
  - two new kinds, `radius` and `chord`. A radius dimension runs from where its line starts (the
    centre, or a point `radiusLineLongest` from the face when the radius is longer than that) to
    the face, and carries `centre`; `value` is the whole radius. A chord dimension is an ordinary
    offset dimension between the ends of the curve's face, pushed out on the bulge's side by the
    bulge (its sagitta) and `BASE_OFFSET`.
  - `curveDimensions(drawing)`: one radius per circle (curved walls grouped by centre and face
    radius within `chainSliver`, the longest wall drawing it), at the middle of its sweep (45
    degrees, north-east, for a whole circle), and one chord per open curve.
  - `curveRuns(room)`: consecutive sides of a room's outline that turn the same way by no more
    than `curvePieceTurn` each, three or more of them, whose corners all lie within `curveFit`
    of one circle. A side on such a run, or along a curved wall, gets no room dimension. A run
    that lies along no curved wall gets its own radius and chord. Straight outside walls lying
    along such a run are left out of the ways the outside chains are grouped by.
  - New figures go into the table (`curvePieceTurn`, `curveFit`, `radiusLineLongest`) and
    `docs/tolerances.md`.
- `packages/viewer/src/picture/scene.ts` and `canvas2d/labelPlacement.ts`: a radius is drawn as a
  line with a tick at the curve only, a centre cross where the line reaches the centre, and its
  number written `R 6.00`; a chord as any other dimension outside the plan.
- `packages/floorplan/src/geometry/export/dxf.ts`: a radius is a DIMENSION of the radial type
  (AcDbRadialDimension) with its own block (line, tick, cross, `R` text); a chord the aligned
  dimension it already writes.
- `packages/floorplan/src/geometry/facade.ts`: after the faces are found and ordered, the faces
  of one curved wall on one floor that follow each other across the view are joined into one
  face (the union of their outlines, their openings, the nearest depth). The viewer's
  `picture/facade.ts` draws it unchanged.
- `packages/floorplan/src/geometry/section.ts`: a curved wall's faces beyond the cut, on each of
  its two sides, are joined the same way where the chords follow each other.
- Not here: the rooms-text compiler, the GLB writer and the 3D stills (other changes own them);
  the 3D view draws the wall's mesh as it does.

## Done

- `packages/floorplan/src/geometry/__tests__/curveDimensions.test.ts`: the rooms-first curves
  example (a nave with an apse and a bowed side, a round pavilion and a band) has one radius per
  circle at the face radius (6.00, 9.00, 14.00 and the apse's), chords for the open curves, no
  room dimension along a curve, and a centre on each; a 24-sided room of straight walls has one
  radius and no outside chain per piece; a radius of 40 m starts its line near the curve and
  keeps the frame.
- `packages/viewer/src/picture/__tests__/`: the plan picture writes `R 6.00` once and a centre
  cross; no dimension text along the pavilion's pieces.
- DXF test: a radial dimension entity with the centre and the point on the curve.
- Facade and section tests: a round pavilion's facade has one wall face for its curved wall, and
  a section beyond it one face per side.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, the
  tolerance table test, and `npm run scoreboard` no worse.
