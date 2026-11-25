# 2026-11-25: a sloped roof drawn in elevation as a roof (VEW-12)

## For people

- A facade draws a sloped roof's plane as a roof, not as a blank face the height of a storey: its
  covering as level courses, its ridge, hips and verges, and a gutter along its eaves, so a
  two-storey house under a gable reads as two storeys (VEW-12).
- A hip roof drawn round a rectangle keeps all four of its planes: two of them were lost where a
  hip ran exactly through a corner of the building, in the facades, the 3D model and the roof's
  areas (VEW-12).

## For agents

- `grid_view` with `kind=facade` and `grid draw --facade` draw each sloped roof plane facing the
  side with its covering, roof lines and gutter; the answer's text and `facade` data are as
  before. In the core, every face of `planFacade` gains `edge` (for a band along a sloped roof's
  edge: `eaves`, `ridge`, `hip`, `verge` or `abutment`; else null) and `roofLines` (for a roof
  plane: its edges as seen, each with its kind; else empty). A hip roof's four planes are all in
  `planEnvelope`'s roof facets. No new code in the record.
