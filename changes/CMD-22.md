# 2026-11-25: figures in structured data are rounded, and a compact data mode (CMD-22)

## For people

- The figures an agent copies from Grid's structured answers match the text: a room of 27.36 m²
  is no longer 27.359999999999985, a depth is 3.1 and not 3.0999999999999996, and a 20.295 m²
  room is 20.3 in every place it appears (CMD-22). Areas, the take-off and the schedule can also
  be asked for as compact data, with the totals first.

## For agents

- Every number in `structuredContent` is rounded once, at the edge of the answer: lengths to the
  millimetre, areas to 0.01 m², halves away from zero after the arithmetic's noise is taken
  off. Whole numbers, latitude and longitude, and figures under 0.001 are not rounded. The text
  of an answer is unchanged.
- `grid_areas`, `grid_takeoff` and `grid_schedule` take a new argument `data`: `full` (the
  default) or `compact`, which puts the label, single figures and totals first and leaves out
  null and empty values, except keys the output schema requires.
- No new code in the record.
