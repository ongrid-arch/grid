# 2026-11-25: DXF walls drawn as one outline per run, and one wall dimension for walls that touch (VEW-54)

## For people

- In the DXF, walls that touch on one layer are now one outline and one hatch, as a drafter draws them: no diagonal line across a corner or a junction when the file is opened in CAD, and a run that closes round a courtyard is an outline with a hole (VEW-54).
- In the walls chain outside the plan, walls that meet a facade side by side and touch, such as an extension built against an old wall, are dimensioned as one wall (0.3 m), no longer as two 0.15 m pieces printed over each other (VEW-54).

## For agents

- `grid export --format dxf` and `grid_export`: the straight walls of one layer are written as joined outlines (one closed polyline and one hatch per piece, holes as further loops of the same hatch); a curved wall keeps its own runs. The walls chain of `grid_dimensions` and the PDF sheet merges thick walls that meet a facade and touch within `chainSliver` into one stretch, so its marks are the stretch's two outer faces. No new code in the record.
