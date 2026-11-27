# 2026-11-27: curves dimensioned and drawn as curves (VEW-79)

## For people

- A curved plan is dimensioned as a drawing of curves: each circle a curved wall lies on gets one radius, `R 6.00`, from its centre (marked with a cross) to the face that looks at it, and each curve that is not a whole circle its chord once, never one figure per straight piece of the curve. A round room written as many short straight walls gets the same, and no overall size for each piece. On screen, on sheets, in `grid draw` and in the DXF, where the radius is a radial dimension. In a facade and a section a curved wall is one face, its silhouette, so a drum is no longer drawn fluted and a bay no longer as overlapping boxes (VEW-79).

## For agents

- Plan pictures (`grid_view`, `grid draw`, sheets) have two new kinds of dimension, `data-kind="radius"` (its figure written `R 6.00`, with a `centre-mark` where its line reaches the centre) and `data-kind="chord"`; room sizes along a curve and the outside chains of straight walls set out on a curve are gone. `buildDimensions` takes `curves` (on by default), and a radius dimension carries `centre`. The DXF writes a radius as a radial `DIMENSION` (`AcDbRadialDimension`). A facade's `faces` hold one face for each run of a curved wall across the view, and a section's `beyond` one per run of each side. Three new entries in the tolerance table: `curvePieceTurn`, `curveFit`, `radiusLineLongest`. No new code in the check record.
